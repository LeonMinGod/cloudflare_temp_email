package main

import (
	"bufio"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func until(t *testing.T, fn func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !fn() {
		if time.Now().After(deadline) {
			t.Fatal("condition not reached")
		}
		runtime.Gosched()
	}
}

func TestAdmissionBoundsCancellationAndReuse(t *testing.T) {
	g := newGate()
	releases := []func(){}
	for _, key := range []string{"a", "a", "b", "b"} {
		release, ok := g.acquire(context.Background(), key)
		if !ok {
			t.Fatal("admission failed")
		}
		releases = append(releases, release)
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan bool, 1)
	go func() { _, ok := g.acquire(ctx, "c"); result <- ok }()
	until(t, func() bool { g.mu.Lock(); defer g.mu.Unlock(); return g.waiting == 1 })
	cancel()
	if <-result {
		t.Fatal("canceled waiter admitted")
	}
	for _, release := range releases {
		release()
		release()
	}
	if g.active != 0 || g.waiting != 0 || len(g.keys) != 0 {
		t.Fatal("capacity leaked")
	}
	release, ok := g.acquire(context.Background(), "c")
	if !ok {
		t.Fatal("capacity not reusable")
	}
	release()
}

func TestPerKeyLimitAndBoundedQueue(t *testing.T) {
	g := newGate()
	a, _ := g.acquire(context.Background(), "same")
	b, _ := g.acquire(context.Background(), "same")
	defer a()
	defer b()
	cancelers := []context.CancelFunc{}
	done := make(chan struct{}, 4)
	for i := 0; i < 4; i++ {
		ctx, cancel := context.WithCancel(context.Background())
		cancelers = append(cancelers, cancel)
		go func() {
			_, ok := g.acquire(ctx, "same")
			if ok {
				t.Error("per-key limit bypassed")
			}
			done <- struct{}{}
		}()
	}
	until(t, func() bool { g.mu.Lock(); defer g.mu.Unlock(); return g.waiting == 4 })
	if _, ok := g.acquire(context.Background(), "same"); ok {
		t.Fatal("unbounded queue")
	}
	other, ok := g.acquire(context.Background(), "other")
	if !ok {
		t.Fatal("one key blocked others")
	}
	other()
	for _, cancel := range cancelers {
		cancel()
	}
	for range cancelers {
		<-done
	}
}

func TestQueuedRequestContinuesAfterCompletion(t *testing.T) {
	g := newGate()
	a, _ := g.acquire(context.Background(), "k")
	b, _ := g.acquire(context.Background(), "k")
	defer b()
	done := make(chan struct{})
	go func() {
		release, ok := g.acquire(context.Background(), "k")
		if !ok {
			t.Error("waiter rejected")
		} else {
			release()
		}
		close(done)
	}()
	until(t, func() bool { g.mu.Lock(); defer g.mu.Unlock(); return g.waiting == 1 })
	a()
	<-done
}

func TestStreamingHoldsSlotAndDoesNotBuffer(t *testing.T) {
	finish := make(chan struct{})
	defer close(finish)
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			io.WriteString(w, "models")
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, "data: first\n\n")
		w.(http.Flusher).Flush()
		select {
		case <-finish:
			io.WriteString(w, "data: [DONE]\n\n")
		case <-r.Context().Done():
		}
	}))
	defer up.Close()
	target, _ := url.Parse(up.URL)
	g := newGate()
	proxy := httptest.NewServer(handler(target, g))
	defer proxy.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "POST", proxy.URL+"/v1/chat/completions", strings.NewReader("{}"))
	req.Header.Set("Authorization", "Bearer test")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	line, err := bufio.NewReader(response.Body).ReadString('\n')
	if err != nil || line != "data: first\n" {
		t.Fatal("stream buffered or changed")
	}
	g.mu.Lock()
	active := g.active
	g.mu.Unlock()
	if active != 1 {
		t.Fatal("stream slot released early")
	}
	models, err := http.Get(proxy.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	models.Body.Close()
	if models.StatusCode != 200 {
		t.Fatal("model reads throttled")
	}
	cancel()
	response.Body.Close()
	until(t, func() bool { g.mu.Lock(); defer g.mu.Unlock(); return g.active == 0 })
}

func TestResponseAuthenticationAndForwardedHeadersPreserved(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sample" || r.Header.Get("CF-Connecting-IP") != "203.0.113.5" || r.Header.Get("X-Forwarded-Proto") != "https" || r.Host != "yifu.leonmingod.com" {
			t.Error("request semantics changed")
		}
		w.Header().Set("X-Upstream", "present")
		w.WriteHeader(401)
		io.WriteString(w, `{"error":"invalid"}`)
	}))
	defer up.Close()
	target, _ := url.Parse(up.URL)
	proxy := httptest.NewServer(handler(target, newGate()))
	defer proxy.Close()
	req, _ := http.NewRequest("POST", proxy.URL+"/v1/responses", strings.NewReader("{}"))
	req.Host = "yifu.leonmingod.com"
	req.Header.Set("Authorization", "Bearer sample")
	req.Header.Set("CF-Connecting-IP", "203.0.113.5")
	req.Header.Set("X-Forwarded-Proto", "https")
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	body, _ := io.ReadAll(r.Body)
	if r.StatusCode != 401 || string(body) != `{"error":"invalid"}` || r.Header.Get("X-Upstream") != "present" {
		t.Fatal("response changed")
	}
}

func TestOversizeRejectedBeforeUpstream(t *testing.T) {
	var calls atomic.Int32
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer up.Close()
	target, _ := url.Parse(up.URL)
	req := httptest.NewRequest("POST", "http://gateway/v1/chat/completions", nil)
	req.ContentLength = (16 << 20) + 1
	w := httptest.NewRecorder()
	handler(target, newGate()).ServeHTTP(w, req)
	if w.Code != 413 || calls.Load() != 0 {
		t.Fatal("large body reached CPA")
	}
}

func TestWebsocketSlotLivesUntilSocketClose(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		io.WriteString(conn, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
		io.Copy(conn, conn)
	}))
	defer up.Close()
	target, _ := url.Parse(up.URL)
	g := newGate()
	proxy := httptest.NewServer(handler(target, g))
	defer proxy.Close()
	conn, err := net.Dial("tcp", strings.TrimPrefix(proxy.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, "GET /v1/responses HTTP/1.1\r\nHost: gateway\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nAuthorization: Bearer test\r\n\r\n")
	r, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil || r.StatusCode != 101 {
		t.Fatal("upgrade failed")
	}
	g.mu.Lock()
	active := g.active
	g.mu.Unlock()
	if active != 1 {
		t.Fatal("upgrade lost its slot")
	}
	io.WriteString(conn, "echo")
	data := make([]byte, 4)
	if _, err := io.ReadFull(conn, data); err != nil || string(data) != "echo" {
		t.Fatal("upgrade transport changed")
	}
	conn.Close()
	until(t, func() bool { g.mu.Lock(); defer g.mu.Unlock(); return g.active == 0 })
}

func TestCredentialHeaderVariantsShareIdentity(t *testing.T) {
	a := httptest.NewRequest("POST", "http://gateway/v1/responses", nil)
	b := a.Clone(context.Background())
	a.Header.Set("Authorization", "Bearer test-key")
	b.Header.Set("Authorization", "bearer   test-key")
	if identity(a) != identity(b) {
		t.Fatal("header formatting bypasses per-key capacity")
	}
	for _, path := range []string{"/v8/management/credentials", "/healthz"} {
		r := httptest.NewRequest("POST", "http://gateway"+path, nil)
		if inference(r) {
			t.Fatal("control plane throttled")
		}
	}
}

func TestBusyResponseIsRetryableAndModelsRemainReachable(t *testing.T) {
	g := newGate()
	for _, key := range []string{"a", "a", "b", "b"} {
		release, _ := g.acquire(context.Background(), key)
		defer release()
	}
	done := make(chan struct{}, 4)
	cancels := []context.CancelFunc{}
	for i := 0; i < 4; i++ {
		ctx, cancel := context.WithCancel(context.Background())
		cancels = append(cancels, cancel)
		go func() { _, _ = g.acquire(ctx, "blocked"); done <- struct{}{} }()
	}
	until(t, func() bool { g.mu.Lock(); defer g.mu.Unlock(); return g.waiting == 4 })
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") }))
	defer up.Close()
	target, _ := url.Parse(up.URL)
	h := handler(target, g)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "http://gateway/v1/responses", strings.NewReader("{}")))
	if w.Code != 429 || w.Header().Get("Retry-After") != "2" {
		t.Fatal("busy response is not retryable")
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "http://gateway/v1/models", nil))
	if w.Code != 200 {
		t.Fatal("control read consumed inference capacity")
	}
	for _, cancel := range cancels {
		cancel()
	}
	for range cancels {
		<-done
	}
}
