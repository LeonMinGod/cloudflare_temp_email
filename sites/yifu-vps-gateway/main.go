package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

type gate struct {
	mu              sync.Mutex
	active, waiting int
	keys            map[string]int
	notify          chan struct{}
	draining        bool
	streams         sync.WaitGroup
}

func newGate() *gate { return &gate{keys: make(map[string]int), notify: make(chan struct{})} }

// These counters track live requests only. Existing persistent key quotas stay in CPA/CF.
func (g *gate) acquire(ctx context.Context, key string) (func(), bool) {
	g.mu.Lock()
	if g.draining {
		g.mu.Unlock()
		return nil, false
	}
	queued := false
	timer := time.NewTimer(2 * time.Second)
	defer timer.Stop()
	for {
		if !g.draining && g.active < 4 && g.keys[key] < 2 {
			if queued {
				g.waiting--
			}
			g.active++
			g.keys[key]++
			g.streams.Add(1)
			g.mu.Unlock()
			var once sync.Once
			return func() {
				once.Do(func() {
					g.mu.Lock()
					g.active--
					g.keys[key]--
					if g.keys[key] == 0 {
						delete(g.keys, key)
					}
					close(g.notify)
					g.notify = make(chan struct{})
					g.mu.Unlock()
					g.streams.Done()
				})
			}, true
		}
		if !queued {
			if g.waiting >= 4 {
				g.mu.Unlock()
				return nil, false
			}
			g.waiting++
			queued = true
		}
		notify := g.notify
		g.mu.Unlock()
		select {
		case <-ctx.Done():
			g.mu.Lock()
			g.waiting--
			g.mu.Unlock()
			return nil, false
		case <-timer.C:
			g.mu.Lock()
			g.waiting--
			g.mu.Unlock()
			return nil, false
		case <-notify:
			g.mu.Lock()
			if g.draining {
				g.waiting--
				g.mu.Unlock()
				return nil, false
			}
		}
	}
}

func inference(r *http.Request) bool {
	p := r.URL.Path
	api := strings.HasPrefix(p, "/v1/") || strings.HasPrefix(p, "/v1beta/") || strings.HasPrefix(p, "/v1alpha/")
	return api && (r.Method == http.MethodPost || strings.EqualFold(r.Header.Get("Upgrade"), "websocket"))
}

func identity(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if fields := strings.Fields(value); len(fields) == 2 && strings.EqualFold(fields[0], "Bearer") {
		value = fields[1]
	}
	if value == "" {
		value = r.Header.Get("X-Api-Key")
	}
	if value == "" {
		value = r.Header.Get("X-Goog-Api-Key")
	}
	if value == "" {
		value = r.URL.Query().Get("key")
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])
}

func reply(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if status == 429 || status == 503 {
		w.Header().Set("Retry-After", "2")
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"message": message, "type": "gateway_capacity", "code": http.StatusText(status)}})
}

func handler(target *url.URL, g *gate) http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.Host = r.In.Host
			r.SetXForwarded()
			if proto := r.In.Header.Get("X-Forwarded-Proto"); proto == "https" || proto == "http" {
				r.Out.Header.Set("X-Forwarded-Proto", proto)
			}
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			var maximum *http.MaxBytesError
			if errors.As(err, &maximum) {
				reply(w, 413, "Request body exceeds 16 MiB")
				return
			}
			log.Printf("upstream request failed: %T", err)
			reply(w, 502, "Upstream temporarily unavailable")
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Yifu-Admission", "v1")
		if r.URL.Path == "/_gateway/healthz" && r.Method == http.MethodGet {
			g.mu.Lock()
			data := map[string]any{"ok": !g.draining, "active": g.active, "queued": g.waiting, "maximum": 4, "per_key": 2}
			g.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(data)
			return
		}
		if inference(r) {
			if r.ContentLength > 16<<20 {
				reply(w, 413, "Request body exceeds 16 MiB")
				return
			}
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, 16<<20)
			}
			release, ok := g.acquire(r.Context(), identity(r))
			if !ok {
				reply(w, 429, "Server busy; retry in 2 seconds")
				return
			}
			defer release()
		}
		proxy.ServeHTTP(w, r)
	})
}

func main() {
	target, _ := url.Parse("http://127.0.0.1:8317")
	g := newGate()
	server := &http.Server{Addr: "127.0.0.1:8319", Handler: handler(target, g), ReadHeaderTimeout: 10 * time.Second, MaxHeaderBytes: 1 << 20}
	stopped := make(chan os.Signal, 1)
	signal.Notify(stopped, syscall.SIGTERM, syscall.SIGINT)
	drained := make(chan struct{})
	go func() {
		<-stopped
		g.mu.Lock()
		g.draining = true
		close(g.notify)
		g.notify = make(chan struct{})
		g.mu.Unlock()
		_ = server.Shutdown(context.Background())
		g.streams.Wait()
		close(drained)
	}()
	log.Print("admission gateway listening on loopback; global=4 per_key=2 queue=4")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("listen failed: %T", err)
		os.Exit(1)
	}
	// Shutdown also waits for upgraded connections tracked by the gate.
	<-drained
}
