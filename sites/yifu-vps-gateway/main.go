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
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type gateConfig struct {
	maxActive   int
	maxPerKey   int
	maxPerIP    int
	maxQueue    int
	waitTimeout time.Duration
}

func defaultGateConfig() gateConfig {
	return gateConfig{
		maxActive:   20,
		maxPerKey:   4,
		maxPerIP:    4,
		maxQueue:    20,
		waitTimeout: 10 * time.Second,
	}
}

func envInt(name string, fallback int, minVal int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < minVal {
		return fallback
	}
	return v
}

func envDuration(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	if d, err := time.ParseDuration(raw); err == nil && d > 0 {
		return d
	}
	if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	return fallback
}

func loadGateConfig() gateConfig {
	cfg := defaultGateConfig()
	cfg.maxActive = envInt("YIFU_GATEWAY_MAX_ACTIVE", cfg.maxActive, 1)
	cfg.maxPerKey = envInt("YIFU_GATEWAY_MAX_PER_KEY", cfg.maxPerKey, 1)
	cfg.maxPerIP = envInt("YIFU_GATEWAY_MAX_PER_IP", cfg.maxPerIP, 1)
	if cfg.maxPerKey > cfg.maxActive {
		cfg.maxPerKey = cfg.maxActive
	}
	if cfg.maxPerIP > cfg.maxActive {
		cfg.maxPerIP = cfg.maxActive
	}
	cfg.maxQueue = envInt("YIFU_GATEWAY_MAX_QUEUE", cfg.maxQueue, 0)
	cfg.waitTimeout = envDuration("YIFU_GATEWAY_WAIT_TIMEOUT", cfg.waitTimeout)
	return cfg
}

type gate struct {
	mu              sync.Mutex
	active, waiting int
	maxActive       int
	maxPerKey       int
	maxPerIP        int
	maxQueue        int
	waitTimeout     time.Duration
	keys            map[string]int
	ips             map[string]int
	notify          chan struct{}
	draining        bool
	streams         sync.WaitGroup
}

func newGate() *gate { return newGateWithConfig(defaultGateConfig()) }

func newGateWithConfig(cfg gateConfig) *gate {
	if cfg.maxActive < 1 {
		cfg.maxActive = defaultGateConfig().maxActive
	}
	if cfg.maxPerKey < 1 {
		cfg.maxPerKey = defaultGateConfig().maxPerKey
	}
	if cfg.maxPerIP < 1 {
		cfg.maxPerIP = defaultGateConfig().maxPerIP
	}
	if cfg.maxPerKey > cfg.maxActive {
		cfg.maxPerKey = cfg.maxActive
	}
	if cfg.maxPerIP > cfg.maxActive {
		cfg.maxPerIP = cfg.maxActive
	}
	if cfg.maxQueue < 0 {
		cfg.maxQueue = defaultGateConfig().maxQueue
	}
	if cfg.waitTimeout <= 0 {
		cfg.waitTimeout = defaultGateConfig().waitTimeout
	}
	return &gate{
		maxActive:   cfg.maxActive,
		maxPerKey:   cfg.maxPerKey,
		maxPerIP:    cfg.maxPerIP,
		maxQueue:    cfg.maxQueue,
		waitTimeout: cfg.waitTimeout,
		keys:        make(map[string]int),
		ips:         make(map[string]int),
		notify:      make(chan struct{}),
	}
}

// These counters track live requests only. Daily fair-use quotas stay in FairUseGuard/CF.
func (g *gate) acquire(ctx context.Context, key string) (func(), bool) {
	return g.acquireWithIP(ctx, key, "")
}

func (g *gate) acquireWithIP(ctx context.Context, key string, ipBucket string) (func(), bool) {
	g.mu.Lock()
	if g.draining {
		g.mu.Unlock()
		return nil, false
	}
	queued := false
	timer := time.NewTimer(g.waitTimeout)
	defer timer.Stop()
	for {
		ipAllowed := ipBucket == "" || g.ips[ipBucket] < g.maxPerIP
		if !g.draining && g.active < g.maxActive && g.keys[key] < g.maxPerKey && ipAllowed {
			if queued {
				g.waiting--
			}
			g.active++
			g.keys[key]++
			if ipBucket != "" {
				g.ips[ipBucket]++
			}
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
					if ipBucket != "" {
						g.ips[ipBucket]--
						if g.ips[ipBucket] <= 0 {
							delete(g.ips, ipBucket)
						}
					}
					close(g.notify)
					g.notify = make(chan struct{})
					g.mu.Unlock()
					g.streams.Done()
				})
			}, true
		}
		if !queued {
			if g.waiting >= g.maxQueue {
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
	api := strings.HasPrefix(p, "/v1/") || strings.HasPrefix(p, "/v1beta/") || strings.HasPrefix(p, "/v1alpha/") || strings.HasPrefix(p, "/backend-api/codex/responses")
	return api && (r.Method == http.MethodPost || strings.EqualFold(r.Header.Get("Upgrade"), "websocket"))
}

func countsTowardFairUse(r *http.Request) bool {
	p := r.URL.Path
	if p == "/v1/messages/count_tokens" || strings.HasSuffix(p, ":countTokens") {
		return false
	}
	return inference(r)
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

func replyFairUse(w http.ResponseWriter, dec FairUseDecision) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if dec.RetryAfterSec > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(dec.RetryAfterSec))
	}
	if dec.Code != "" {
		w.Header().Set("X-Yifu-FairUse-Limit", dec.Code)
	}
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"message": dec.Message,
			"type":    "fair_use_limit",
			"code":    dec.Code,
		},
	})
}

func handler(target *url.URL, g *gate) http.Handler {
	return handlerWithFairUse(target, g, nil)
}

func handlerWithFairUse(target *url.URL, g *gate, fu *FairUseGuard) http.Handler {
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
		w.Header().Set("X-Yifu-Admission", "v2")
		if r.URL.Path == "/_gateway/healthz" && r.Method == http.MethodGet {
			g.mu.Lock()
			data := map[string]any{
				"ok":           !g.draining,
				"active":       g.active,
				"queued":       g.waiting,
				"maximum":      g.maxActive,
				"per_key":      g.maxPerKey,
				"per_ip":       g.maxPerIP,
				"max_queue":    g.maxQueue,
				"wait_seconds": int(g.waitTimeout / time.Second),
			}
			g.mu.Unlock()
			if fu != nil {
				data["fair_use"] = fu.HealthSummary()
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(data)
			return
		}
		if inference(r) {
			if r.ContentLength > 16<<20 {
				reply(w, 413, "Request body exceeds 16 MiB")
				return
			}
			var bodyCounter *countingReadCloser
			if r.Body != nil {
				limited := http.MaxBytesReader(w, r.Body, 16<<20)
				bodyCounter = &countingReadCloser{rc: limited}
				r.Body = bodyCounter
			}

			ipInfo := resolveClientIP(r)
			applyFairUse := fu != nil && countsTowardFairUse(r)
			var fuReq FairUseRequest
			if applyFairUse {
				fuReq = fu.BuildRequest(r)
				if dec := fu.Admit(fuReq); !dec.Allowed {
					replyFairUse(w, dec)
					return
				}
			}

			release, ok := g.acquireWithIP(r.Context(), identity(r), ipInfo.IPBucket)
			if !ok {
				if applyFairUse {
					fu.RecordOutcome(fuReq, UsageReport{StatusCode: http.StatusServiceUnavailable})
				}
				reply(w, 429, "Server busy; retry in 2 seconds")
				return
			}
			defer release()

			isWS := strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
			if applyFairUse && !fuReq.Exempt && !isWS {
				tap := newUsageTapResponseWriter(w)
				proxy.ServeHTTP(tap, r)
				reqBytes := r.ContentLength
				if bodyCounter != nil && bodyCounter.count > reqBytes {
					reqBytes = bodyCounter.count
				}
				if reqBytes < 0 {
					reqBytes = 0
				}
				fu.RecordOutcome(fuReq, tap.Finish(reqBytes))
				return
			}
		}
		proxy.ServeHTTP(w, r)
	})
}

func main() {
	target, _ := url.Parse("http://127.0.0.1:8317")
	g := newGateWithConfig(loadGateConfig())
	fu := newFairUseGuard(loadFairUseConfig(), time.Now)
	server := &http.Server{Addr: "127.0.0.1:8319", Handler: handlerWithFairUse(target, g, fu), ReadHeaderTimeout: 10 * time.Second, MaxHeaderBytes: 1 << 20}
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
		fu.Close()
		close(drained)
	}()
	log.Printf("admission gateway v2 listening on loopback; global=%d per_key=%d per_ip=%d queue=%d wait=%s fairuse=%v", g.maxActive, g.maxPerKey, g.maxPerIP, g.maxQueue, g.waitTimeout, fu.cfg.enabled)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("listen failed: %T", err)
		os.Exit(1)
	}
	// Shutdown also waits for upgraded connections tracked by the gate.
	<-drained
}
