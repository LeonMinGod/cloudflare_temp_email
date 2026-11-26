package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func testFairUseConfig(t *testing.T) fairUseConfig {
	t.Helper()
	dir := t.TempDir()
	cfg := defaultFairUseConfig()
	cfg.stateFile = filepath.Join(dir, "fairuse_state.json")
	cfg.alertsFile = filepath.Join(dir, "fairuse_alerts.json")
	cfg.flushInterval = 0
	return cfg
}

func makeTestReq(ip, key, ua, path string) *http.Request {
	r := httptest.NewRequest("POST", "http://gateway"+path, strings.NewReader(`{"model":"test"}`))
	if ip != "" {
		r.Header.Set("CF-Connecting-IP", ip)
	}
	if key != "" {
		r.Header.Set("Authorization", "Bearer "+key)
	}
	if ua != "" {
		r.Header.Set("User-Agent", ua)
	}
	return r
}

func TestNormalizeUAFamilyAndIPv6Prefix(t *testing.T) {
	if got := normalizeUAFamily("LinguaGacha/v0.142.3 (https://github.com/neavo/LinguaGacha)"); got != "linguagacha" {
		t.Fatalf("got %q want linguagacha", got)
	}
	if got := normalizeUAFamily("LinguaGacha/v0.141.3"); got != "linguagacha" {
		t.Fatalf("version upgrade should stay in same family, got %q", got)
	}
	if got := normalizeUAFamily("AsyncOpenAI/Python 2.16.0"); got != "asyncopenai/python" {
		t.Fatalf("got %q want asyncopenai/python", got)
	}
	if got := normalizeUAFamily("deepseek-harness/0.2.2-rc.5 (+https://github.com/deepseek-ai/deepseek-harness) dsh-profile/desktop"); got != "deepseek-harness" {
		t.Fatalf("got %q want deepseek-harness", got)
	}
	if got := normalizeUAFamily("codex-tui/0.118.0 (Ubuntu 24.4.0; x86_64)"); got != "codex-tui" {
		t.Fatalf("got %q want codex-tui", got)
	}

	r1 := makeTestReq("2a0e:6a80:3:11e::1", "k1", "AsyncOpenAI/Python 2.16.0", "/v1/chat/completions")
	r2 := makeTestReq("2a0e:6a80:3:11e::abcd", "k2", "AsyncOpenAI/Python 2.16.0", "/v1/chat/completions")
	ip1, ip2 := resolveClientIP(r1), resolveClientIP(r2)
	if !ip1.Trackable || ip1.IPBucket != "2a0e:6a80:3:11e::/64" || ip1.IPBucket != ip2.IPBucket {
		t.Fatalf("IPv6 /64 normalization mismatch: %+v vs %+v", ip1, ip2)
	}

	local := resolveClientIP(makeTestReq("127.0.0.1", "k1", "curl/8.0", "/v1/chat/completions"))
	if local.Trackable {
		t.Fatal("loopback must not be trackable")
	}
}

func TestPersonClusteringBlocks4KeyLinguaGachaWithoutHurtingSharedNodeStrangers(t *testing.T) {
	cfg := testFairUseConfig(t)
	cfg.personDailyReqs = 4
	cfg.keyDailyReqs = 4
	cfg.ipDailyReqs = 10
	cfg.sameUAMultiKeyCount = 10 // isolate pure person-bucket request quota first

	now := time.Date(2026, 11, 26, 14, 0, 0, 0, beijingLoc)
	fg := newFairUseGuard(cfg, func() time.Time { return now })
	defer fg.Close()

	// 1 abuser rotating 4 keys with LinguaGacha on the SAME IP shares ONE 4-req person bucket!
	for i, key := range []string{"sk-k1", "sk-k2", "sk-k3", "sk-k4"} {
		dec := fg.Admit(fg.BuildRequest(makeTestReq("103.151.173.99", key, "LinguaGacha/v0.142.3", "/v1/messages")))
		if !dec.Allowed {
			t.Fatalf("req %d should be allowed: %+v", i, dec)
		}
	}
	blocked := fg.Admit(fg.BuildRequest(makeTestReq("103.151.173.99", "sk-k5", "LinguaGacha/v0.142.2", "/v1/messages")))
	if blocked.Allowed || blocked.Code != "person_daily_requests" {
		t.Fatalf("5th key with same IP+UA must be blocked by person_daily_requests, got %+v", blocked)
	}

	// An innocent stranger on the SAME shared proxy IP using a DIFFERENT app (opencode) is NOT blocked!
	stranger := fg.Admit(fg.BuildRequest(makeTestReq("103.151.173.99", "sk-stranger", "opencode/v1.16.0", "/v1/chat/completions")))
	if !stranger.Allowed {
		t.Fatalf("innocent user with different UA on shared IP must be allowed, got %+v", stranger)
	}
}

func TestWeightedEqTokensProtectsCachedCodingAndStopsUncachedTranslation(t *testing.T) {
	// Heavy coding turn: 100k input with 95k prompt cache read + 500 output
	// eq = 5,000 uncached + 4*500 output + 9,500 (10% cache) = 16,500 eq tokens!
	codingEq, _, _, _ := ComputeEqTokens(UsageReport{
		StatusCode:      200,
		HasExactUsage:   true,
		InputTokens:     100_000,
		CacheReadTokens: 95_000,
		OutputTokens:    500,
	})
	if codingEq != 16_500 {
		t.Fatalf("coding eq = %d, want 16500", codingEq)
	}

	// LinguaGacha translation turn: 35k uncached input + 10k output -> 35k + 40k = 75k eq tokens (~4.5x cost!)
	transEq, _, _, _ := ComputeEqTokens(UsageReport{
		StatusCode:    200,
		HasExactUsage: true,
		InputTokens:   35_000,
		OutputTokens:  10_000,
	})
	if transEq != 75_000 {
		t.Fatalf("translation eq = %d, want 75000", transEq)
	}

	// Failed 402/500 responses charge 0 tokens
	failedEq, _, _, _ := ComputeEqTokens(UsageReport{
		StatusCode:    402,
		HasExactUsage: true,
		InputTokens:   50_000,
		OutputTokens:  10_000,
	})
	if failedEq != 0 {
		t.Fatalf("failed eq = %d, want 0", failedEq)
	}
}

func TestBeijingMidnightRolloverResetsDailyQuota(t *testing.T) {
	cfg := testFairUseConfig(t)
	cfg.personDailyReqs = 2
	cfg.keyDailyReqs = 2
	now := time.Date(2026, 11, 26, 23, 59, 30, 0, beijingLoc)
	fg := newFairUseGuard(cfg, func() time.Time { return now })
	defer fg.Close()

	req := fg.BuildRequest(makeTestReq("45.82.122.187", "sk-1", "AsyncOpenAI/Python 2.16.0", "/v1/chat/completions"))
	if !fg.Admit(req).Allowed || !fg.Admit(req).Allowed {
		t.Fatal("first 2 reqs should pass")
	}
	denied := fg.Admit(req)
	if denied.Allowed || denied.RetryAfterSec < 25 || denied.RetryAfterSec > 35 {
		t.Fatalf("expected ~30s retry_after before midnight, got %+v", denied)
	}

	// Cross Beijing 00:00:00 -> fresh day!
	now = time.Date(2026, 11, 27, 0, 0, 1, 0, beijingLoc)
	if !fg.Admit(req).Allowed {
		t.Fatal("quota must reset at Beijing midnight")
	}
}

func TestAnomalyDetectorsCatchRelayMultiUAAndSameUAMultiKeyRotation(t *testing.T) {
	cfg := testFairUseConfig(t)
	cfg.relayDistinctUAs = 5
	cfg.relayMinReqs = 5
	cfg.sameUAMultiKeyCount = 3
	cfg.sameUAMultiKeyReqs = 6

	now := time.Date(2026, 11, 26, 20, 0, 0, 0, beijingLoc)
	fg := newFairUseGuard(cfg, func() time.Time { return now })
	defer fg.Close()

	// 1. Relay abuse: 1 key mixing 5 distinct app families in 1h
	uas := []string{"codex-tui/0.1", "opencode/1.0", "CherryStudio/1.2", "OpenAI/Python 2.1", "Go-http-client/2.0"}
	for i, ua := range uas {
		dec := fg.Admit(fg.BuildRequest(makeTestReq("154.219.121.102", "sk-windking", ua, "/v1/chat/completions")))
		if i < 4 && !dec.Allowed {
			t.Fatalf("req %d should pass before threshold, got %+v", i, dec)
		}
		if i == 4 && (dec.Allowed || dec.Code != "relay_ua_quarantine") {
			t.Fatalf("5th distinct UA should trigger relay_ua_quarantine, got %+v", dec)
		}
	}

	// 2. Same-UA multi-key rotation: 3 keys rotating LinguaGacha on 1 IP
	for i := 0; i < 6; i++ {
		k := fmt.Sprintf("sk-lg-%d", i%3)
		dec := fg.Admit(fg.BuildRequest(makeTestReq("103.151.173.99", k, "LinguaGacha/v0.142.3", "/v1/messages")))
		if i < 5 && !dec.Allowed {
			t.Fatalf("rotation req %d should pass before threshold, got %+v", i, dec)
		}
		if i == 5 && (dec.Allowed || dec.Code != "multi_key_cooldown") {
			t.Fatalf("6th req across 3 keys with same UA should trigger multi_key_cooldown, got %+v", dec)
		}
	}

	fg.FlushNow()
	raw, err := os.ReadFile(cfg.alertsFile)
	if err != nil {
		t.Fatalf("alerts file not written: %v", err)
	}
	if !strings.Contains(string(raw), "relay_multi_ua") || !strings.Contains(string(raw), "same_ua_multi_key") {
		t.Fatalf("expected both alert kinds persisted, got:\n%s", string(raw))
	}
	// Privacy check: raw IP octets must not appear in persisted alerts!
	if strings.Contains(string(raw), "121.102") || strings.Contains(string(raw), "173.99") {
		t.Fatalf("raw IP leaked into alerts file: %s", string(raw))
	}
}

func TestPerIPConcurrencyLimitPreventsMultiKeySlotHogging(t *testing.T) {
	g := newGateWithConfig(gateConfig{
		maxActive:   10,
		maxPerKey:   4,
		maxPerIP:    2,
		maxQueue:    0,
		waitTimeout: 50 * time.Millisecond,
	})
	r1, ok1 := g.acquireWithIP(context.Background(), "key-a", "103.151.173.99")
	r2, ok2 := g.acquireWithIP(context.Background(), "key-b", "103.151.173.99")
	if !ok1 || !ok2 {
		t.Fatal("first 2 concurrent slots on IP should succeed")
	}
	defer r1()
	defer r2()

	// 3rd different key on SAME IP must be rejected by maxPerIP=2!
	if _, ok3 := g.acquireWithIP(context.Background(), "key-c", "103.151.173.99"); ok3 {
		t.Fatal("per-IP concurrency limit bypassed via key rotation")
	}
	// Different IP can still acquire slots cleanly
	rOther, okOther := g.acquireWithIP(context.Background(), "key-d", "8.8.8.8")
	if !okOther {
		t.Fatal("other IP should not be blocked")
	}
	rOther()
}

func TestStreamingUsageTapExtractsOpenAIAnthropicGeminiAndEnforcesEndToEnd(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/chat/completions":
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n")
			w.(http.Flusher).Flush()
			io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":60000,\"completion_tokens\":10000,\"prompt_tokens_details\":{\"cached_tokens\":10000}}}\n\n")
			io.WriteString(w, "data: [DONE]\n\n")
		case "/v1/messages":
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":1000,\"cache_read_input_tokens\":40000,\"output_tokens\":1}}}\n\n")
			w.(http.Flusher).Flush()
			io.WriteString(w, "event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":5000}}\n\n")
		case "/v1/messages/count_tokens":
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"input_tokens":123}`)
		case "/v1beta/models/gemini-4:generateContent":
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, "{\n  \"candidates\": [],\n  \"usageMetadata\": {\n    \"promptTokenCount\": 20000,\n    \"candidatesTokenCount\": 2500,\n    \"thoughtsTokenCount\": 500,\n    \"cachedContentTokenCount\": 10000\n  }\n}\n")
		}
	}))
	defer up.Close()

	cfg := testFairUseConfig(t)
	cfg.personDailyReqs = 100
	cfg.keyDailyReqs = 100
	cfg.personDailyEqTokens = 100_000
	cfg.keyDailyEqTokens = 100_000
	now := time.Date(2026, 11, 26, 18, 0, 0, 0, beijingLoc)
	fg := newFairUseGuard(cfg, func() time.Time { return now })
	defer fg.Close()

	target, _ := url.Parse(up.URL)
	proxy := httptest.NewServer(handlerWithFairUse(target, newGate(), fg))
	defer proxy.Close()

	doPost := func(path, key string) *http.Response {
		req, _ := http.NewRequest("POST", proxy.URL+path, strings.NewReader(`{"model":"x"}`))
		req.Header.Set("CF-Connecting-IP", "203.0.113.42")
		req.Header.Set("Authorization", "Bearer "+key)
		req.Header.Set("User-Agent", "LinguaGacha/v0.142.3")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.ReadAll(res.Body)
		res.Body.Close()
		return res
	}

	// 1. OpenAI SSE: 50k uncached + 4*10k out + 1k cache = 91,000 eq tokens
	if res := doPost("/v1/chat/completions", "sk-a"); res.StatusCode != 200 {
		t.Fatalf("openai req status = %d", res.StatusCode)
	}
	// 2. count_tokens must NOT consume daily quota
	if res := doPost("/v1/messages/count_tokens", "sk-a"); res.StatusCode != 200 {
		t.Fatalf("count_tokens status = %d", res.StatusCode)
	}
	// 3. Anthropic SSE with DIFFERENT key sk-b on same IP+UA: 1k uncached + 4*5k out + 4k cache = 25,000 eq tokens -> total 116,000 >= 100,000!
	if res := doPost("/v1/messages", "sk-b"); res.StatusCode != 200 {
		t.Fatalf("anthropic req status = %d", res.StatusCode)
	}
	// 4. Next call with a 3rd key sk-c on same IP+UA must be 429 person_daily_tokens!
	blocked := doPost("/v1/chat/completions", "sk-c")
	if blocked.StatusCode != 429 || blocked.Header.Get("X-Yifu-FairUse-Limit") != "person_daily_tokens" {
		t.Fatalf("expected 429 person_daily_tokens, got status=%d header=%q", blocked.StatusCode, blocked.Header.Get("X-Yifu-FairUse-Limit"))
	}

	// 5. Gemini pretty-printed JSON on another IP: 10k uncached + 4*(2.5k+0.5k) + 1k cache = 23,000 eq tokens
	req, _ := http.NewRequest("POST", proxy.URL+"/v1beta/models/gemini-4:generateContent", strings.NewReader(`{}`))
	req.Header.Set("CF-Connecting-IP", "198.51.100.7")
	req.Header.Set("X-Goog-Api-Key", "sk-gem")
	req.Header.Set("User-Agent", "agy-cli/1.0")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.ReadAll(res.Body)
	res.Body.Close()

	fg.mu.Lock()
	gemUsed := fg.persons["198.51.100.7|agy-cli"].EqTokens
	fg.mu.Unlock()
	if gemUsed != 23_000 {
		t.Fatalf("gemini eq tokens = %d, want 23000", gemUsed)
	}

	// Verify state persists cleanly across restart on the same Beijing day
	fg.FlushNow()
	fg2 := newFairUseGuard(cfg, func() time.Time { return now })
	defer fg2.Close()
	fg2.mu.Lock()
	reloaded := fg2.persons["198.51.100.7|agy-cli"].EqTokens
	fg2.mu.Unlock()
	if reloaded != 23_000 {
		t.Fatalf("reloaded eq tokens = %d, want 23000", reloaded)
	}

	// Verify healthz exposes aggregate counters without leaking raw IPs
	hres, err := http.Get(proxy.URL + "/_gateway/healthz")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(hres.Body)
	hres.Body.Close()
	if strings.Contains(string(body), "203.0.113.42") || strings.Contains(string(body), "198.51.100.7") {
		t.Fatalf("raw IP leaked in healthz: %s", string(body))
	}
	var hz map[string]any
	if err := json.Unmarshal(body, &hz); err != nil || hz["fair_use"] == nil {
		t.Fatalf("invalid healthz response: %s", string(body))
	}
}

func TestFairUseConcurrentStressNoRaces(t *testing.T) {
	cfg := testFairUseConfig(t)
	cfg.personDailyReqs = 50
	cfg.keyDailyReqs = 50
	fg := newFairUseGuard(cfg, time.Now)
	defer fg.Close()

	var wg sync.WaitGroup
	allowedCount := make(chan int, 100)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			req := fg.BuildRequest(makeTestReq("203.0.113.99", fmt.Sprintf("sk-%d", i%2), "OpenAI/Python 2.1", "/v1/chat/completions"))
			if dec := fg.Admit(req); dec.Allowed {
				allowedCount <- 1
				fg.RecordOutcome(req, UsageReport{StatusCode: 200, HasExactUsage: true, InputTokens: 100, OutputTokens: 50})
			}
		}(i)
	}
	wg.Wait()
	close(allowedCount)
	total := 0
	for v := range allowedCount {
		total += v
	}
	if total != 50 {
		t.Fatalf("concurrent admit allowed %d, want exact 50", total)
	}
}
