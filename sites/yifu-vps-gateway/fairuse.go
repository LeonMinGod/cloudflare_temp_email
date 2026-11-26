package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	beijingLoc      = time.FixedZone("CST", 8*3600)
	cgnatPrefix     = netip.MustParsePrefix("100.64.0.0/10")
	benchmarkPrefix = netip.MustParsePrefix("198.18.0.0/15")
)

const (
	maxFairUseBuckets = 10000
	maxSavedAlerts    = 200
)

type fairUseConfig struct {
	enabled bool

	// Balanced "大锅饭" defaults (Beijing calendar day 00:00 reset)
	personDailyReqs     int
	personDailyEqTokens int64
	keyDailyReqs        int
	keyDailyEqTokens    int64
	ipDailyReqs         int
	ipDailyEqTokens     int64

	// Anomaly detection thresholds
	relayUAWindow        time.Duration
	relayDistinctUAs     int
	relayMinReqs         int
	relayQuarantineTTL   time.Duration
	multiKeyWindow       time.Duration
	multiKeyDistinctKeys int
	multiKeyMinReqs      int
	multiKeyMinEqTokens  int64
	sameUAMultiKeyWindow time.Duration
	sameUAMultiKeyCount  int
	sameUAMultiKeyReqs   int
	sameUAThrottleTTL    time.Duration

	// Persistence & exemptions
	stateFile     string
	alertsFile    string
	flushInterval time.Duration
	allowKeys     map[string]struct{}
	allowIPs      map[string]struct{}
}

func defaultFairUseConfig() fairUseConfig {
	return fairUseConfig{
		enabled: true,

		personDailyReqs:     500,
		personDailyEqTokens: 30_000_000,
		keyDailyReqs:        500,
		keyDailyEqTokens:    30_000_000,
		ipDailyReqs:         1250,
		ipDailyEqTokens:     75_000_000,

		relayUAWindow:        time.Hour,
		relayDistinctUAs:     5,
		relayMinReqs:         20,
		relayQuarantineTTL:   time.Hour,
		multiKeyWindow:       15 * time.Minute,
		multiKeyDistinctKeys: 3,
		multiKeyMinReqs:      60,
		multiKeyMinEqTokens:  10_000_000,
		sameUAMultiKeyWindow: 30 * time.Minute,
		sameUAMultiKeyCount:  3,
		sameUAMultiKeyReqs:   20,
		sameUAThrottleTTL:    5 * time.Minute,

		stateFile:     "/opt/yifu-cpa/data/fairuse_state.json",
		alertsFile:    "/opt/yifu-cpa/data/fairuse_alerts.json",
		flushInterval: 15 * time.Second,
		allowKeys:     map[string]struct{}{},
		allowIPs:      map[string]struct{}{},
	}
}

func envBool(name string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if raw == "" {
		return fallback
	}
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func envInt64(name string, fallback int64, minVal int64) int64 {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || v < minVal {
		return fallback
	}
	return v
}

func parseAllowSet(raw string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		if s := strings.TrimSpace(strings.ToLower(part)); s != "" {
			out[s] = struct{}{}
		}
	}
	return out
}

func loadFairUseConfig() fairUseConfig {
	cfg := defaultFairUseConfig()
	cfg.enabled = envBool("YIFU_FAIRUSE_ENABLED", cfg.enabled)
	cfg.personDailyReqs = envInt("YIFU_FAIRUSE_PERSON_DAILY_REQS", cfg.personDailyReqs, 1)
	cfg.personDailyEqTokens = envInt64("YIFU_FAIRUSE_PERSON_DAILY_TOKENS", cfg.personDailyEqTokens, 1000)
	cfg.keyDailyReqs = envInt("YIFU_FAIRUSE_KEY_DAILY_REQS", cfg.keyDailyReqs, 1)
	cfg.keyDailyEqTokens = envInt64("YIFU_FAIRUSE_KEY_DAILY_TOKENS", cfg.keyDailyEqTokens, 1000)
	cfg.ipDailyReqs = envInt("YIFU_FAIRUSE_IP_DAILY_REQS", cfg.ipDailyReqs, cfg.personDailyReqs)
	cfg.ipDailyEqTokens = envInt64("YIFU_FAIRUSE_IP_DAILY_TOKENS", cfg.ipDailyEqTokens, cfg.personDailyEqTokens)
	cfg.relayDistinctUAs = envInt("YIFU_FAIRUSE_RELAY_UA_THRESHOLD", cfg.relayDistinctUAs, 2)
	cfg.relayMinReqs = envInt("YIFU_FAIRUSE_RELAY_MIN_REQS", cfg.relayMinReqs, 1)
	cfg.relayQuarantineTTL = envDuration("YIFU_FAIRUSE_RELAY_QUARANTINE", cfg.relayQuarantineTTL)
	cfg.multiKeyDistinctKeys = envInt("YIFU_FAIRUSE_MULTI_KEY_THRESHOLD", cfg.multiKeyDistinctKeys, 2)
	cfg.multiKeyMinReqs = envInt("YIFU_FAIRUSE_MULTI_KEY_MIN_REQS", cfg.multiKeyMinReqs, 1)
	cfg.multiKeyMinEqTokens = envInt64("YIFU_FAIRUSE_MULTI_KEY_MIN_TOKENS", cfg.multiKeyMinEqTokens, 1000)
	if v := strings.TrimSpace(os.Getenv("YIFU_FAIRUSE_STATE_FILE")); v != "" {
		cfg.stateFile = v
	}
	if v := strings.TrimSpace(os.Getenv("YIFU_FAIRUSE_ALERTS_FILE")); v != "" {
		cfg.alertsFile = v
	}
	cfg.allowKeys = parseAllowSet(os.Getenv("YIFU_FAIRUSE_ALLOWLIST_KEYS"))
	cfg.allowIPs = parseAllowSet(os.Getenv("YIFU_FAIRUSE_ALLOWLIST_IPS"))
	return cfg
}

type clientIPInfo struct {
	DisplayIP string
	IPBucket  string
	Trackable bool
}

func resolveClientIP(r *http.Request) clientIPInfo {
	for _, hdr := range []string{"CF-Connecting-IP", "True-Client-IP"} {
		if raw := strings.TrimSpace(r.Header.Get(hdr)); raw != "" {
			if addr, ok := parseSingleIP(raw); ok {
				return makeClientIPInfo(addr)
			}
		}
	}
	var fallback clientIPInfo
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		for _, part := range strings.Split(xff, ",") {
			if addr, ok := parseSingleIP(part); ok {
				info := makeClientIPInfo(addr)
				if info.Trackable {
					return info
				}
				if fallback.DisplayIP == "" {
					fallback = info
				}
			}
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		if addr, ok := parseSingleIP(realIP); ok {
			info := makeClientIPInfo(addr)
			if info.Trackable || fallback.DisplayIP == "" {
				return info
			}
		}
	}
	if addr, ok := parseSingleIP(r.RemoteAddr); ok {
		info := makeClientIPInfo(addr)
		if info.Trackable || fallback.DisplayIP == "" {
			return info
		}
	}
	return fallback
}

func makeClientIPInfo(addr netip.Addr) clientIPInfo {
	addr = addr.Unmap()
	trackable := isTrackableAddr(addr)
	bucket := ""
	if trackable {
		if addr.Is4() {
			bucket = addr.String()
		} else if pfx, err := addr.Prefix(64); err == nil {
			bucket = pfx.Masked().String()
		} else {
			bucket = addr.String()
		}
	}
	return clientIPInfo{
		DisplayIP: addr.String(),
		IPBucket:  bucket,
		Trackable: trackable,
	}
}

func isTrackableAddr(addr netip.Addr) bool {
	if !addr.IsValid() {
		return false
	}
	if addr.IsLoopback() || addr.IsPrivate() || addr.IsUnspecified() ||
		addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsMulticast() {
		return false
	}
	if addr.Is4() && (cgnatPrefix.Contains(addr) || benchmarkPrefix.Contains(addr)) {
		return false
	}
	return addr.IsGlobalUnicast()
}

func parseSingleIP(raw string) (netip.Addr, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return netip.Addr{}, false
	}
	if addr, err := netip.ParseAddr(s); err == nil {
		return addr.Unmap(), true
	}
	if host, _, err := net.SplitHostPort(s); err == nil {
		if addr, err := netip.ParseAddr(strings.TrimSpace(host)); err == nil {
			return addr.Unmap(), true
		}
	}
	return netip.Addr{}, false
}

func maskIPForLog(raw string) string {
	host := strings.Split(strings.TrimSpace(raw), "/")[0]
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	addr = addr.Unmap()
	if addr.Is4() {
		b := addr.As4()
		return fmt.Sprintf("%d.%d.*.*", b[0], b[1])
	}
	b := addr.As16()
	g0 := uint16(b[0])<<8 | uint16(b[1])
	g1 := uint16(b[2])<<8 | uint16(b[3])
	return fmt.Sprintf("%x:%x:*:*", g0, g1)
}

// normalizeUAFamily collapses client version churn and OS parentheticals into a
// stable application family identifier so:
//   - same person upgrading v0.142.2 -> v0.142.3 stays in the same person bucket
//   - normal client upgrades do not falsely trigger multi-UA relay detection
//   - distinct apps (codex-tui vs opencode vs linguagacha vs cherry-studio) stay separate
func normalizeUAFamily(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	if s == "" {
		return "empty-ua"
	}
	if idx := strings.IndexByte(s, '('); idx > 0 {
		s = strings.TrimSpace(s[:idx])
	}
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return "empty-ua"
	}
	first := fields[0]
	product := first
	if slash := strings.IndexByte(first, '/'); slash > 0 {
		product = first[:slash]
		after := first[slash+1:]
		// Preserve SDK runtime qualifier for OpenAI/Python, AsyncOpenAI/Python, OpenAI/JS, etc.
		if (product == "openai" || product == "asyncopenai" || product == "anthropic") && after != "" {
			sub := strings.SplitN(after, "/", 2)[0]
			if len(sub) > 0 && sub[0] >= 'a' && sub[0] <= 'z' {
				product = product + "/" + sub
			}
		}
	}
	if product == "mozilla" {
		low := strings.ToLower(raw)
		switch {
		case strings.Contains(low, "edg/"):
			return "browser-edge"
		case strings.Contains(low, "firefox/"):
			return "browser-firefox"
		case strings.Contains(low, "chrome/"):
			return "browser-chrome"
		case strings.Contains(low, "safari/"):
			return "browser-safari"
		default:
			return "browser-mozilla"
		}
	}
	// Sanitize to safe bounded ASCII identifier
	var b strings.Builder
	for i := 0; i < len(product) && b.Len() < 32; i++ {
		c := product[i]
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '/' || c == '.' {
			b.WriteByte(c)
		}
	}
	out := strings.Trim(b.String(), "/.-_")
	if out == "" {
		return "other-ua"
	}
	return out
}

func extractRawCredential(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if fields := strings.Fields(value); len(fields) == 2 && strings.EqualFold(fields[0], "Bearer") {
		value = fields[1]
	}
	if value == "" {
		value = strings.TrimSpace(r.Header.Get("X-Api-Key"))
	}
	if value == "" {
		value = strings.TrimSpace(r.Header.Get("X-Goog-Api-Key"))
	}
	if value == "" {
		value = strings.TrimSpace(r.URL.Query().Get("key"))
	}
	return value
}

func keyHashPrefix(rawKey string) string {
	if rawKey == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(rawKey))
	return hex.EncodeToString(sum[:])[:16]
}

type usageCounters struct {
	Requests       int       `json:"requests"`
	EqTokens       int64     `json:"eq_tokens"`
	InputTokens    int64     `json:"input_tokens"`
	OutputTokens   int64     `json:"output_tokens"`
	CacheTokens    int64     `json:"cache_tokens"`
	LastSeenAt     time.Time `json:"last_seen_at"`
	ClampedToOne   bool      `json:"clamped_to_one,omitempty"`
	QuarantineTill time.Time `json:"quarantine_until,omitempty"`
}

type FairUseAlert struct {
	ID            string    `json:"id"`
	Kind          string    `json:"kind"` // relay_multi_ua | multi_key_rotation | same_ua_multi_key
	Severity      string    `json:"severity"`
	DetectedAt    time.Time `json:"detected_at"`
	MaskedIP      string    `json:"masked_ip,omitempty"`
	IPBucketHash  string    `json:"ip_bucket_hash,omitempty"`
	KeyHashPrefix string    `json:"key_hash_prefix,omitempty"`
	KeyPrefixes   []string  `json:"key_prefixes,omitempty"`
	UAFamilies    []string  `json:"ua_families,omitempty"`
	WindowReqs    int       `json:"window_reqs"`
	WindowTokens  int64     `json:"window_eq_tokens,omitempty"`
	ActionTaken   string    `json:"action_taken"`
	Summary       string    `json:"summary"`
}

type fairUsePersisted struct {
	Version      int                       `json:"version"`
	Day          string                    `json:"day"`
	UpdatedAt    time.Time                 `json:"updated_at"`
	BlockedToday int64                     `json:"blocked_today"`
	Persons      map[string]*usageCounters `json:"persons"`
	Keys         map[string]*usageCounters `json:"keys"`
	IPs          map[string]*usageCounters `json:"ips"`
}

type fairUseAlertsFile struct {
	Version   int            `json:"version"`
	UpdatedAt time.Time      `json:"updated_at"`
	Alerts    []FairUseAlert `json:"alerts"`
}

type keyUATrack struct {
	uaLastSeen map[string]time.Time
	reqTimes   []time.Time
}

type ipKeyTrack struct {
	keyLastSeen  map[string]time.Time
	reqTimes     []time.Time
	windowTokens int64
	tokenResetAt time.Time
	// per-UA distinct keys seen on this IP
	uaKeys map[string]map[string]time.Time
	uaReqs map[string][]time.Time
}

type FairUseDecision struct {
	Allowed       bool
	Code          string
	Message       string
	RetryAfterSec int
	UsedReqs      int
	LimitReqs     int
	UsedTokens    int64
	LimitTokens   int64
	ResetAt       time.Time
}

type FairUseRequest struct {
	KeyHash   string
	IP        clientIPInfo
	UAFamily  string
	PersonKey string
	Exempt    bool
}

type FairUseGuard struct {
	cfg fairUseConfig
	now func() time.Time

	mu           sync.Mutex
	day          string
	blockedToday int64
	persons      map[string]*usageCounters
	keys         map[string]*usageCounters
	ips          map[string]*usageCounters

	// Short-window anomaly detectors (ephemeral, bounded)
	keyUAs map[string]*keyUATrack
	ipKeys map[string]*ipKeyTrack

	alerts       []FairUseAlert
	alertDedup   map[string]time.Time
	dirtyState   bool
	dirtyAlerts  bool
	stopCh       chan struct{}
	stopOnce     sync.Once
	flushDoneCh  chan struct{}
}

func newFairUseGuard(cfg fairUseConfig, clock func() time.Time) *FairUseGuard {
	if clock == nil {
		clock = time.Now
	}
	fg := &FairUseGuard{
		cfg:         cfg,
		now:         clock,
		day:         beijingDay(clock()),
		persons:     make(map[string]*usageCounters),
		keys:        make(map[string]*usageCounters),
		ips:         make(map[string]*usageCounters),
		keyUAs:      make(map[string]*keyUATrack),
		ipKeys:      make(map[string]*ipKeyTrack),
		alertDedup:  make(map[string]time.Time),
		stopCh:      make(chan struct{}),
		flushDoneCh: make(chan struct{}),
	}
	fg.loadFromDisk()
	if cfg.flushInterval > 0 && (cfg.stateFile != "" || cfg.alertsFile != "") {
		go fg.flushLoop()
	} else {
		close(fg.flushDoneCh)
	}
	return fg
}

func beijingDay(t time.Time) string {
	return t.In(beijingLoc).Format("2006-01-02")
}

func nextBeijingMidnight(t time.Time) time.Time {
	bj := t.In(beijingLoc)
	return time.Date(bj.Year(), bj.Month(), bj.Day()+1, 0, 0, 0, 0, beijingLoc)
}

func (fg *FairUseGuard) Close() {
	fg.stopOnce.Do(func() {
		close(fg.stopCh)
		<-fg.flushDoneCh
		fg.FlushNow()
	})
}

func (fg *FairUseGuard) flushLoop() {
	defer close(fg.flushDoneCh)
	ticker := time.NewTicker(fg.cfg.flushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			fg.FlushNow()
		case <-fg.stopCh:
			return
		}
	}
}

func (fg *FairUseGuard) BuildRequest(r *http.Request) FairUseRequest {
	rawKey := extractRawCredential(r)
	kh := keyHashPrefix(rawKey)
	ip := resolveClientIP(r)
	ua := normalizeUAFamily(r.Header.Get("User-Agent"))
	personKey := ""
	if ip.Trackable {
		personKey = ip.IPBucket + "|" + ua
	}
	exempt := !fg.cfg.enabled || isInternalProbe(r)
	if !exempt && kh != "" {
		if _, ok := fg.cfg.allowKeys[kh]; ok {
			exempt = true
		}
		if rawKey != "" {
			full := sha256.Sum256([]byte(rawKey))
			if _, ok := fg.cfg.allowKeys[hex.EncodeToString(full[:])]; ok {
				exempt = true
			}
		}
	}
	if !exempt && ip.Trackable {
		if _, ok := fg.cfg.allowIPs[strings.ToLower(ip.IPBucket)]; ok {
			exempt = true
		}
		if _, ok := fg.cfg.allowIPs[strings.ToLower(ip.DisplayIP)]; ok {
			exempt = true
		}
	}
	return FairUseRequest{
		KeyHash:   kh,
		IP:        ip,
		UAFamily:  ua,
		PersonKey: personKey,
		Exempt:    exempt,
	}
}

func isInternalProbe(r *http.Request) bool {
	ua := strings.ToLower(strings.TrimSpace(r.Header.Get("User-Agent")))
	return strings.HasPrefix(ua, "yifu-safety-verification/")
}

func (fg *FairUseGuard) rolloverLocked(now time.Time) {
	today := beijingDay(now)
	if fg.day == today {
		return
	}
	fg.day = today
	fg.blockedToday = 0
	fg.persons = make(map[string]*usageCounters)
	fg.keys = make(map[string]*usageCounters)
	fg.ips = make(map[string]*usageCounters)
	fg.dirtyState = true
}

func getOrCreateCounter(m map[string]*usageCounters, k string, now time.Time) *usageCounters {
	if c, ok := m[k]; ok {
		c.LastSeenAt = now
		return c
	}
	if len(m) >= maxFairUseBuckets {
		// Evict oldest inactive bucket to keep memory strictly bounded
		var oldestKey string
		var oldestAt time.Time
		for ek, ec := range m {
			if oldestKey == "" || ec.LastSeenAt.Before(oldestAt) {
				oldestKey = ek
				oldestAt = ec.LastSeenAt
			}
		}
		if oldestKey != "" {
			delete(m, oldestKey)
		}
	}
	c := &usageCounters{LastSeenAt: now}
	m[k] = c
	return c
}

func secondsUntil(target, now time.Time) int {
	sec := int(math.Ceil(target.Sub(now).Seconds()))
	if sec < 1 {
		return 1
	}
	return sec
}

// Admit checks fair-use quotas & anomaly quarantines BEFORE forwarding upstream,
// and atomically reserves 1 request unit to prevent concurrent burst bypasses.
func (fg *FairUseGuard) Admit(req FairUseRequest) FairUseDecision {
	if fg == nil || !fg.cfg.enabled || req.Exempt {
		return FairUseDecision{Allowed: true}
	}
	now := fg.now()
	resetAt := nextBeijingMidnight(now)

	fg.mu.Lock()
	defer fg.mu.Unlock()
	fg.rolloverLocked(now)

	// 1. Check active anomaly quarantines first
	if req.KeyHash != "" {
		if kc, ok := fg.keys[req.KeyHash]; ok && now.Before(kc.QuarantineTill) {
			fg.blockedToday++
			fg.dirtyState = true
			return FairUseDecision{
				Allowed:       false,
				Code:          "relay_ua_quarantine",
				RetryAfterSec: secondsUntil(kc.QuarantineTill, now),
				ResetAt:       kc.QuarantineTill,
				Message:       fmt.Sprintf("【义父公益站风控】检测到当前密钥在 1 小时内混用 ≥%d 种不同客户端（疑似挂中转站二次分发），已进入保护性临时冷却，请勿将公益密钥用于中转或多人共享。", fg.cfg.relayDistinctUAs),
			}
		}
	}
	if req.PersonKey != "" {
		if pc, ok := fg.persons[req.PersonKey]; ok && now.Before(pc.QuarantineTill) {
			fg.blockedToday++
			fg.dirtyState = true
			return FairUseDecision{
				Allowed:       false,
				Code:          "multi_key_cooldown",
				RetryAfterSec: secondsUntil(pc.QuarantineTill, now),
				ResetAt:       pc.QuarantineTill,
				Message:       "【义父公益站风控】检测到同一出口 IP 正在用相同客户端轮询多把密钥，已触发保护性限速冷却，请仅使用本人单一密钥公平使用公益池。",
			}
		}
	}

	// 2. Check Person daily quota (IP/64 + UA family cluster)
	if req.PersonKey != "" {
		if pc, ok := fg.persons[req.PersonKey]; ok {
			if pc.Requests >= fg.cfg.personDailyReqs {
				fg.blockedToday++
				fg.dirtyState = true
				return FairUseDecision{
					Allowed:       false,
					Code:          "person_daily_requests",
					RetryAfterSec: secondsUntil(resetAt, now),
					UsedReqs:      pc.Requests,
					LimitReqs:     fg.cfg.personDailyReqs,
					ResetAt:       resetAt,
					Message:       fmt.Sprintf("【义父公益站大锅饭配额】您今日调用次数已达单人上限（%d/%d 次，同网络同客户端切换小号共享额度），将于北京时间次日 00:00 自动重置。", pc.Requests, fg.cfg.personDailyReqs),
				}
			}
			if pc.EqTokens >= fg.cfg.personDailyEqTokens {
				fg.blockedToday++
				fg.dirtyState = true
				return FairUseDecision{
					Allowed:       false,
					Code:          "person_daily_tokens",
					RetryAfterSec: secondsUntil(resetAt, now),
					UsedTokens:    pc.EqTokens,
					LimitTokens:   fg.cfg.personDailyEqTokens,
					ResetAt:       resetAt,
					Message:       fmt.Sprintf("【义父公益站大锅饭配额】您今日等效 Token 消耗已达单人上限（%.1fM / %.0fM，同网络同客户端切换小号共享额度），将于北京时间次日 00:00 自动重置。", float64(pc.EqTokens)/1e6, float64(fg.cfg.personDailyEqTokens)/1e6),
				}
			}
		}
	}

	// 3. Check Key daily quota (guards single key jumping across IPs)
	if req.KeyHash != "" {
		if kc, ok := fg.keys[req.KeyHash]; ok {
			if kc.Requests >= fg.cfg.keyDailyReqs {
				fg.blockedToday++
				fg.dirtyState = true
				return FairUseDecision{
					Allowed:       false,
					Code:          "key_daily_requests",
					RetryAfterSec: secondsUntil(resetAt, now),
					UsedReqs:      kc.Requests,
					LimitReqs:     fg.cfg.keyDailyReqs,
					ResetAt:       resetAt,
					Message:       fmt.Sprintf("【义父公益站大锅饭配额】当前 API Key 今日调用次数已达上限（%d/%d 次），将于北京时间次日 00:00 自动重置。", kc.Requests, fg.cfg.keyDailyReqs),
				}
			}
			if kc.EqTokens >= fg.cfg.keyDailyEqTokens {
				fg.blockedToday++
				fg.dirtyState = true
				return FairUseDecision{
					Allowed:       false,
					Code:          "key_daily_tokens",
					RetryAfterSec: secondsUntil(resetAt, now),
					UsedTokens:    kc.EqTokens,
					LimitTokens:   fg.cfg.keyDailyEqTokens,
					ResetAt:       resetAt,
					Message:       fmt.Sprintf("【义父公益站大锅饭配额】当前 API Key 今日等效 Token 消耗已达上限（%.1fM / %.0fM），将于北京时间次日 00:00 自动重置。", float64(kc.EqTokens)/1e6, float64(fg.cfg.keyDailyEqTokens)/1e6),
				}
			}
		}
	}

	// 4. Check IP/64 hard ceiling (clamped to 1x person cap if multi-key rotation detected)
	if req.IP.Trackable {
		if ic, ok := fg.ips[req.IP.IPBucket]; ok {
			ipReqLimit := fg.cfg.ipDailyReqs
			ipTokLimit := fg.cfg.ipDailyEqTokens
			if ic.ClampedToOne {
				ipReqLimit = fg.cfg.personDailyReqs
				ipTokLimit = fg.cfg.personDailyEqTokens
			}
			if ic.Requests >= ipReqLimit {
				fg.blockedToday++
				fg.dirtyState = true
				return FairUseDecision{
					Allowed:       false,
					Code:          "ip_daily_requests",
					RetryAfterSec: secondsUntil(resetAt, now),
					UsedReqs:      ic.Requests,
					LimitReqs:     ipReqLimit,
					ResetAt:       resetAt,
					Message:       fmt.Sprintf("【义父公益站大锅饭配额】当前出口网络今日总调用次数已达上限（%d/%d 次），将于北京时间次日 00:00 自动重置。", ic.Requests, ipReqLimit),
				}
			}
			if ic.EqTokens >= ipTokLimit {
				fg.blockedToday++
				fg.dirtyState = true
				return FairUseDecision{
					Allowed:       false,
					Code:          "ip_daily_tokens",
					RetryAfterSec: secondsUntil(resetAt, now),
					UsedTokens:    ic.EqTokens,
					LimitTokens:   ipTokLimit,
					ResetAt:       resetAt,
					Message:       fmt.Sprintf("【义父公益站大锅饭配额】当前出口网络今日等效 Token 消耗已达上限（%.1fM / %.0fM），将于北京时间次日 00:00 自动重置。", float64(ic.EqTokens)/1e6, float64(ipTokLimit)/1e6),
				}
			}
		}
	}

	// 5. Update short-window anomaly detectors BEFORE reserving
	if dec := fg.observeAnomaliesLocked(req, now); !dec.Allowed {
		fg.blockedToday++
		fg.dirtyState = true
		return dec
	}

	// 6. Reserve 1 request across active dimensions
	if req.PersonKey != "" {
		getOrCreateCounter(fg.persons, req.PersonKey, now).Requests++
	}
	if req.KeyHash != "" {
		getOrCreateCounter(fg.keys, req.KeyHash, now).Requests++
	}
	if req.IP.Trackable {
		getOrCreateCounter(fg.ips, req.IP.IPBucket, now).Requests++
	}
	fg.dirtyState = true
	return FairUseDecision{Allowed: true}
}

func pruneTimes(ts []time.Time, cutoff time.Time) []time.Time {
	i := 0
	for i < len(ts) && ts[i].Before(cutoff) {
		i++
	}
	if i == 0 {
		return ts
	}
	return append(ts[:0], ts[i:]...)
}

func (fg *FairUseGuard) observeAnomaliesLocked(req FairUseRequest, now time.Time) FairUseDecision {
	// A) Single key mixing too many distinct UA families in 1h (relay resale signature)
	if req.KeyHash != "" && req.UAFamily != "" {
		tr := fg.keyUAs[req.KeyHash]
		if tr == nil {
			if len(fg.keyUAs) >= maxFairUseBuckets {
				fg.keyUAs = make(map[string]*keyUATrack)
			}
			tr = &keyUATrack{uaLastSeen: make(map[string]time.Time)}
			fg.keyUAs[req.KeyHash] = tr
		}
		cutoff := now.Add(-fg.cfg.relayUAWindow)
		tr.reqTimes = append(pruneTimes(tr.reqTimes, cutoff), now)
		tr.uaLastSeen[req.UAFamily] = now
		for u, seen := range tr.uaLastSeen {
			if seen.Before(cutoff) {
				delete(tr.uaLastSeen, u)
			}
		}
		if len(tr.uaLastSeen) >= fg.cfg.relayDistinctUAs && len(tr.reqTimes) >= fg.cfg.relayMinReqs {
			kc := getOrCreateCounter(fg.keys, req.KeyHash, now)
			kc.QuarantineTill = now.Add(fg.cfg.relayQuarantineTTL)
			uas := make([]string, 0, len(tr.uaLastSeen))
			for u := range tr.uaLastSeen {
				uas = append(uas, u)
			}
			sort.Strings(uas)
			fg.recordAlertLocked(now, "relay_multi_ua:"+req.KeyHash, FairUseAlert{
				Kind:          "relay_multi_ua",
				Severity:      "high",
				DetectedAt:    now.UTC(),
				MaskedIP:      maskIPForLog(req.IP.DisplayIP),
				KeyHashPrefix: req.KeyHash,
				UAFamilies:    uas,
				WindowReqs:    len(tr.reqTimes),
				ActionTaken:   fmt.Sprintf("quarantine_%dm", int(fg.cfg.relayQuarantineTTL/time.Minute)),
				Summary:       fmt.Sprintf("Key %s 1h 内混用 %d 种客户端（%d 次请求），疑似挂中转分发", req.KeyHash, len(uas), len(tr.reqTimes)),
			})
			return FairUseDecision{
				Allowed:       false,
				Code:          "relay_ua_quarantine",
				RetryAfterSec: secondsUntil(kc.QuarantineTill, now),
				ResetAt:       kc.QuarantineTill,
				Message:       fmt.Sprintf("【义父公益站风控】检测到当前密钥在 1 小时内混用 ≥%d 种不同客户端（疑似挂中转站二次分发），已进入保护性临时冷却，请勿将公益密钥用于中转或多人共享。", fg.cfg.relayDistinctUAs),
			}
		}
	}

	// B) Single IP/64 rotating multiple keys
	if req.IP.Trackable && req.KeyHash != "" {
		tr := fg.ipKeys[req.IP.IPBucket]
		if tr == nil {
			if len(fg.ipKeys) >= maxFairUseBuckets {
				fg.ipKeys = make(map[string]*ipKeyTrack)
			}
			tr = &ipKeyTrack{
				keyLastSeen:  make(map[string]time.Time),
				uaKeys:       make(map[string]map[string]time.Time),
				uaReqs:       make(map[string][]time.Time),
				tokenResetAt: now,
			}
			fg.ipKeys[req.IP.IPBucket] = tr
		}
		cutoff := now.Add(-fg.cfg.multiKeyWindow)
		tr.reqTimes = append(pruneTimes(tr.reqTimes, cutoff), now)
		if now.Sub(tr.tokenResetAt) > fg.cfg.multiKeyWindow {
			tr.windowTokens = 0
			tr.tokenResetAt = now
		}
		tr.keyLastSeen[req.KeyHash] = now
		for k, seen := range tr.keyLastSeen {
			if seen.Before(cutoff) {
				delete(tr.keyLastSeen, k)
			}
		}

		// B1) Same IP + SAME UA rotating >= 3 keys (exact LinguaGacha 4-key pool signature!)
		uaCutoff := now.Add(-fg.cfg.sameUAMultiKeyWindow)
		if tr.uaKeys[req.UAFamily] == nil {
			tr.uaKeys[req.UAFamily] = make(map[string]time.Time)
		}
		tr.uaKeys[req.UAFamily][req.KeyHash] = now
		for k, seen := range tr.uaKeys[req.UAFamily] {
			if seen.Before(uaCutoff) {
				delete(tr.uaKeys[req.UAFamily], k)
			}
		}
		tr.uaReqs[req.UAFamily] = append(pruneTimes(tr.uaReqs[req.UAFamily], uaCutoff), now)

		if len(tr.uaKeys[req.UAFamily]) >= fg.cfg.sameUAMultiKeyCount && len(tr.uaReqs[req.UAFamily]) >= fg.cfg.sameUAMultiKeyReqs {
			ic := getOrCreateCounter(fg.ips, req.IP.IPBucket, now)
			ic.ClampedToOne = true
			pc := getOrCreateCounter(fg.persons, req.PersonKey, now)
			pc.QuarantineTill = now.Add(fg.cfg.sameUAThrottleTTL)
			keys := sortedKeys(tr.uaKeys[req.UAFamily])
			fg.recordAlertLocked(now, "same_ua_multi_key:"+req.IP.IPBucket+":"+req.UAFamily, FairUseAlert{
				Kind:        "same_ua_multi_key",
				Severity:    "high",
				DetectedAt:  now.UTC(),
				MaskedIP:    maskIPForLog(req.IP.DisplayIP),
				KeyPrefixes: keys,
				UAFamilies:  []string{req.UAFamily},
				WindowReqs:  len(tr.uaReqs[req.UAFamily]),
				ActionTaken: "clamp_ip_1x_and_cooldown",
				Summary:     fmt.Sprintf("出口 %s 使用同一客户端 %s 在 30m 内轮询 %d 把密钥（%d 次请求），已收紧至单人配额并临时冷却", maskIPForLog(req.IP.DisplayIP), req.UAFamily, len(keys), len(tr.uaReqs[req.UAFamily])),
			})
			return FairUseDecision{
				Allowed:       false,
				Code:          "multi_key_cooldown",
				RetryAfterSec: secondsUntil(pc.QuarantineTill, now),
				ResetAt:       pc.QuarantineTill,
				Message:       "【义父公益站风控】检测到同一出口 IP 正在用相同客户端轮询多把密钥，已收紧至单人配额并触发保护性冷却，请仅使用本人单一密钥公平使用公益池。",
			}
		}

		// B2) Same IP rotating >= 3 keys with forged/varied UAs under heavy load
		if len(tr.keyLastSeen) >= fg.cfg.multiKeyDistinctKeys &&
			(len(tr.reqTimes) >= fg.cfg.multiKeyMinReqs || tr.windowTokens >= fg.cfg.multiKeyMinEqTokens) {
			ic := getOrCreateCounter(fg.ips, req.IP.IPBucket, now)
			if !ic.ClampedToOne {
				ic.ClampedToOne = true
				fg.dirtyState = true
			}
			keys := sortedKeys(tr.keyLastSeen)
			fg.recordAlertLocked(now, "multi_key_rotation:"+req.IP.IPBucket, FairUseAlert{
				Kind:         "multi_key_rotation",
				Severity:     "high",
				DetectedAt:   now.UTC(),
				MaskedIP:     maskIPForLog(req.IP.DisplayIP),
				KeyPrefixes:  keys,
				WindowReqs:   len(tr.reqTimes),
				WindowTokens: tr.windowTokens,
				ActionTaken:  "clamp_ip_1x",
				Summary:      fmt.Sprintf("出口 %s 在 15m 内轮询 %d 把密钥（%d 次 / %.1fM 等效 Token），已自动收回共享 IP 宽容额度", maskIPForLog(req.IP.DisplayIP), len(keys), len(tr.reqTimes), float64(tr.windowTokens)/1e6),
			})
		}
	}

	return FairUseDecision{Allowed: true}
}

func sortedKeys(m map[string]time.Time) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (fg *FairUseGuard) recordAlertLocked(now time.Time, dedupKey string, alert FairUseAlert) {
	if prev, ok := fg.alertDedup[dedupKey]; ok && now.Sub(prev) < 15*time.Minute {
		return
	}
	fg.alertDedup[dedupKey] = now
	if len(fg.alertDedup) > 1000 {
		for k, t := range fg.alertDedup {
			if now.Sub(t) > time.Hour {
				delete(fg.alertDedup, k)
			}
		}
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s|%d", dedupKey, now.UnixNano())))
	alert.ID = hex.EncodeToString(sum[:])[:12]
	if alert.MaskedIP != "" {
		ipSum := sha256.Sum256([]byte(dedupKey))
		alert.IPBucketHash = hex.EncodeToString(ipSum[:])[:12]
	}
	fg.alerts = append(fg.alerts, alert)
	if len(fg.alerts) > maxSavedAlerts {
		fg.alerts = fg.alerts[len(fg.alerts)-maxSavedAlerts:]
	}
	fg.dirtyAlerts = true
	if encoded, err := json.Marshal(map[string]any{
		"event": "fairuse_anomaly",
		"alert": alert,
	}); err == nil {
		log.Printf("%s", encoded)
	}
}

type UsageReport struct {
	StatusCode      int
	ReqBytes        int64
	RespBytes       int64
	HasExactUsage   bool
	InputTokens     int64
	OutputTokens    int64
	CacheReadTokens int64
}

// ComputeEqTokens weights real upstream cost:
//
//	eq_tokens = uncached_input + 4 * output + 0.1 * cache_read
//
// Normal coding agents with 90%+ prompt cache read stay cheap, while batch
// uncached translation / high-output scripts burn quota rapidly.
func ComputeEqTokens(u UsageReport) (eqTokens, inputTok, outputTok, cacheTok int64) {
	if u.StatusCode < 200 || u.StatusCode >= 300 {
		return 0, 0, 0, 0
	}
	if u.HasExactUsage {
		in := max64(0, u.InputTokens)
		out := max64(0, u.OutputTokens)
		cache := max64(0, u.CacheReadTokens)
		uncached := in
		if cache > 0 && in >= cache {
			uncached = in - cache
		} else if cache > in {
			uncached = 0
		}
		eq := uncached + 4*out + cache/10
		if eq < 1 && (in > 0 || out > 0 || cache > 0) {
			eq = 1
		}
		return eq, in, out, cache
	}
	// Fallback estimation when provider omits usage or client disconnects early
	estIn := max64(0, u.ReqBytes/3)
	estOut := max64(0, u.RespBytes/3)
	eq := estIn + 4*estOut
	return eq, estIn, estOut, 0
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// RecordOutcome commits final token consumption after a request completes,
// and refunds the request count on upstream 5xx gateway failures.
func (fg *FairUseGuard) RecordOutcome(req FairUseRequest, report UsageReport) {
	if fg == nil || !fg.cfg.enabled || req.Exempt {
		return
	}
	now := fg.now()
	fg.mu.Lock()
	defer fg.mu.Unlock()
	fg.rolloverLocked(now)

	// Refund request slot on transient upstream 5xx / gateway 502 so users are
	// not penalized when an upstream node hiccups.
	if report.StatusCode >= 500 || report.StatusCode == 0 {
		if req.PersonKey != "" {
			if c := fg.persons[req.PersonKey]; c != nil && c.Requests > 0 {
				c.Requests--
			}
		}
		if req.KeyHash != "" {
			if c := fg.keys[req.KeyHash]; c != nil && c.Requests > 0 {
				c.Requests--
			}
		}
		if req.IP.Trackable {
			if c := fg.ips[req.IP.IPBucket]; c != nil && c.Requests > 0 {
				c.Requests--
			}
		}
		fg.dirtyState = true
		return
	}

	eq, inTok, outTok, cacheTok := ComputeEqTokens(report)
	if eq <= 0 {
		return
	}
	addTokens := func(m map[string]*usageCounters, k string) {
		if k == "" {
			return
		}
		c := getOrCreateCounter(m, k, now)
		c.EqTokens += eq
		c.InputTokens += inTok
		c.OutputTokens += outTok
		c.CacheTokens += cacheTok
	}
	addTokens(fg.persons, req.PersonKey)
	addTokens(fg.keys, req.KeyHash)
	if req.IP.Trackable {
		addTokens(fg.ips, req.IP.IPBucket)
		if tr := fg.ipKeys[req.IP.IPBucket]; tr != nil {
			tr.windowTokens += eq
		}
	}
	fg.dirtyState = true
}

func (fg *FairUseGuard) HealthSummary() map[string]any {
	if fg == nil {
		return map[string]any{"enabled": false}
	}
	now := fg.now()
	fg.mu.Lock()
	defer fg.mu.Unlock()
	fg.rolloverLocked(now)
	return map[string]any{
		"enabled":              fg.cfg.enabled,
		"day":                  fg.day,
		"person_daily_reqs":    fg.cfg.personDailyReqs,
		"person_daily_tokens":  fg.cfg.personDailyEqTokens,
		"ip_daily_reqs":        fg.cfg.ipDailyReqs,
		"ip_daily_tokens":      fg.cfg.ipDailyEqTokens,
		"tracked_persons":      len(fg.persons),
		"tracked_keys":         len(fg.keys),
		"tracked_ips":          len(fg.ips),
		"blocked_today":        fg.blockedToday,
		"recent_alerts_stored": len(fg.alerts),
	}
}

func (fg *FairUseGuard) loadFromDisk() {
	now := fg.now()
	today := beijingDay(now)
	if fg.cfg.stateFile != "" {
		if raw, err := os.ReadFile(fg.cfg.stateFile); err == nil && len(raw) > 0 {
			var parsed fairUsePersisted
			if err := json.Unmarshal(raw, &parsed); err == nil && parsed.Day == today {
				if parsed.Persons != nil {
					fg.persons = parsed.Persons
				}
				if parsed.Keys != nil {
					fg.keys = parsed.Keys
				}
				if parsed.IPs != nil {
					fg.ips = parsed.IPs
				}
				fg.blockedToday = parsed.BlockedToday
			}
		}
	}
	if fg.cfg.alertsFile != "" {
		if raw, err := os.ReadFile(fg.cfg.alertsFile); err == nil && len(raw) > 0 {
			var parsed fairUseAlertsFile
			if err := json.Unmarshal(raw, &parsed); err == nil && len(parsed.Alerts) > 0 {
				fg.alerts = parsed.Alerts
				if len(fg.alerts) > maxSavedAlerts {
					fg.alerts = fg.alerts[len(fg.alerts)-maxSavedAlerts:]
				}
			}
		}
	}
}

func (fg *FairUseGuard) FlushNow() {
	if fg == nil {
		return
	}
	now := fg.now()
	fg.mu.Lock()
	var stateBytes, alertBytes []byte
	var statePath, alertsPath string
	if fg.dirtyState && fg.cfg.stateFile != "" {
		snapshot := fairUsePersisted{
			Version:      1,
			Day:          fg.day,
			UpdatedAt:    now.UTC(),
			BlockedToday: fg.blockedToday,
			Persons:      fg.persons,
			Keys:         fg.keys,
			IPs:          fg.ips,
		}
		if b, err := json.Marshal(snapshot); err == nil {
			stateBytes = append(b, '\n')
			statePath = fg.cfg.stateFile
			fg.dirtyState = false
		}
	}
	if fg.dirtyAlerts && fg.cfg.alertsFile != "" {
		snapshot := fairUseAlertsFile{
			Version:   1,
			UpdatedAt: now.UTC(),
			Alerts:    fg.alerts,
		}
		if b, err := json.MarshalIndent(snapshot, "", "  "); err == nil {
			alertBytes = append(b, '\n')
			alertsPath = fg.cfg.alertsFile
			fg.dirtyAlerts = false
		}
	}
	fg.mu.Unlock()

	if statePath != "" {
		if err := atomicWriteFile(statePath, stateBytes); err != nil {
			log.Printf("fairuse state save failed: %v", err)
		}
	}
	if alertsPath != "" {
		if err := atomicWriteFile(alertsPath, alertBytes); err != nil {
			log.Printf("fairuse alerts save failed: %v", err)
		}
	}
}

func atomicWriteFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
