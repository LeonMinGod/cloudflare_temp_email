package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

const (
	maxUsageScanLineBytes = 16 * 1024
	maxUsageTailBytes     = 8 * 1024
)

type countingReadCloser struct {
	rc    io.ReadCloser
	count int64
}

func (c *countingReadCloser) Read(p []byte) (int, error) {
	n, err := c.rc.Read(p)
	c.count += int64(n)
	return n, err
}

func (c *countingReadCloser) Close() error {
	return c.rc.Close()
}

// usageTapResponseWriter passes every write and flush straight through with zero
// buffering while scanning SSE/JSON chunks in O(1) memory for provider usage blocks.
type usageTapResponseWriter struct {
	w          http.ResponseWriter
	statusCode int
	respBytes  int64
	isGzip     bool

	lineBuf     []byte
	lineDropped bool
	tailBuf     []byte

	hasUsage        bool
	inputTokens     int64
	outputTokens    int64
	cacheReadTokens int64
}

func newUsageTapResponseWriter(w http.ResponseWriter) *usageTapResponseWriter {
	return &usageTapResponseWriter{
		w:          w,
		statusCode: http.StatusOK,
	}
}

func (u *usageTapResponseWriter) Header() http.Header {
	return u.w.Header()
}

func (u *usageTapResponseWriter) WriteHeader(code int) {
	u.statusCode = code
	if strings.Contains(strings.ToLower(u.w.Header().Get("Content-Encoding")), "gzip") {
		u.isGzip = true
	}
	u.w.WriteHeader(code)
}

func (u *usageTapResponseWriter) Write(p []byte) (int, error) {
	n, err := u.w.Write(p)
	if n > 0 {
		u.respBytes += int64(n)
		if !u.isGzip && u.statusCode >= 200 && u.statusCode < 300 {
			u.appendTail(p[:n])
			u.feed(p[:n])
		}
	}
	return n, err
}

func (u *usageTapResponseWriter) appendTail(p []byte) {
	if len(p) >= maxUsageTailBytes {
		u.tailBuf = append(u.tailBuf[:0], p[len(p)-maxUsageTailBytes:]...)
		return
	}
	if len(u.tailBuf)+len(p) > maxUsageTailBytes {
		drop := len(u.tailBuf) + len(p) - maxUsageTailBytes
		u.tailBuf = append(u.tailBuf[:0], u.tailBuf[drop:]...)
	}
	u.tailBuf = append(u.tailBuf, p...)
}

func (u *usageTapResponseWriter) Flush() {
	if f, ok := u.w.(http.Flusher); ok {
		f.Flush()
	}
}

func (u *usageTapResponseWriter) Unwrap() http.ResponseWriter {
	return u.w
}

func (u *usageTapResponseWriter) Finish(reqBytes int64) UsageReport {
	if !u.isGzip {
		if len(u.lineBuf) > 0 && !u.lineDropped {
			u.inspectLine(u.lineBuf)
			u.lineBuf = nil
		}
		if !u.hasUsage && len(u.tailBuf) > 0 {
			u.inspectRawSlice(u.tailBuf)
		}
		u.tailBuf = nil
	}
	return UsageReport{
		StatusCode:      u.statusCode,
		ReqBytes:        reqBytes,
		RespBytes:       u.respBytes,
		HasExactUsage:   u.hasUsage,
		InputTokens:     u.inputTokens,
		OutputTokens:    u.outputTokens,
		CacheReadTokens: u.cacheReadTokens,
	}
}

func (u *usageTapResponseWriter) feed(chunk []byte) {
	for len(chunk) > 0 {
		nl := bytes.IndexByte(chunk, '\n')
		var part []byte
		complete := false
		if nl >= 0 {
			part = chunk[:nl]
			chunk = chunk[nl+1:]
			complete = true
		} else {
			part = chunk
			chunk = nil
		}

		if !u.lineDropped {
			if len(u.lineBuf)+len(part) > maxUsageScanLineBytes {
				// Fast fallback for huge single-line JSON responses: inspect tail
				// containing "usage" if present in the current chunk directly.
				if bytes.Contains(part, []byte(`"usage`)) {
					u.inspectRawSlice(part)
				}
				u.lineBuf = u.lineBuf[:0]
				u.lineDropped = true
			} else {
				u.lineBuf = append(u.lineBuf, part...)
			}
		} else if bytes.Contains(part, []byte(`"usage`)) {
			u.inspectRawSlice(part)
		}

		if complete {
			if !u.lineDropped && len(u.lineBuf) > 0 {
				u.inspectLine(u.lineBuf)
			}
			u.lineBuf = u.lineBuf[:0]
			u.lineDropped = false
		}
	}
}

func (u *usageTapResponseWriter) inspectLine(line []byte) {
	line = bytes.TrimSpace(line)
	if len(line) < 12 {
		return
	}
	if !bytes.Contains(line, []byte(`"usage`)) {
		return
	}
	if bytes.HasPrefix(line, []byte("data:")) {
		line = bytes.TrimSpace(line[5:])
	}
	if len(line) == 0 || line[0] != '{' {
		u.inspectRawSlice(line)
		return
	}
	var root map[string]any
	if err := json.Unmarshal(line, &root); err != nil {
		u.inspectRawSlice(line)
		return
	}
	u.extractFromMap(root, 0)
}

// inspectRawSlice handles non-streaming JSON responses larger than 16KB by
// locating the trailing `"usage":{...}` or `"usageMetadata":{...}` object.
func (u *usageTapResponseWriter) inspectRawSlice(raw []byte) {
	for _, marker := range [][]byte{[]byte(`"usageMetadata":`), []byte(`"usage":`)} {
		idx := bytes.LastIndex(raw, marker)
		if idx < 0 {
			continue
		}
		rest := bytes.TrimSpace(raw[idx+len(marker):])
		if len(rest) == 0 || rest[0] != '{' {
			continue
		}
		depth := 0
		inStr := false
		escaped := false
		end := -1
		for i, ch := range rest {
			if inStr {
				if escaped {
					escaped = false
				} else if ch == '\\' {
					escaped = true
				} else if ch == '"' {
					inStr = false
				}
				continue
			}
			switch ch {
			case '"':
				inStr = true
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					end = i + 1
				}
			}
			if end > 0 || i > 4096 {
				break
			}
		}
		if end > 0 {
			var obj map[string]any
			if err := json.Unmarshal(rest[:end], &obj); err == nil {
				if string(marker) == `"usageMetadata":` {
					u.applyGeminiUsage(obj)
				} else {
					u.applyStandardUsage(obj)
				}
			}
		}
	}
}

func (u *usageTapResponseWriter) extractFromMap(m map[string]any, depth int) {
	if m == nil || depth > 3 {
		return
	}
	if raw, ok := m["usage"].(map[string]any); ok {
		u.applyStandardUsage(raw)
	}
	if raw, ok := m["usageMetadata"].(map[string]any); ok {
		u.applyGeminiUsage(raw)
	}
	// OpenAI Responses API nests under response.usage; Anthropic nests under message.usage
	for _, key := range []string{"response", "message"} {
		if nested, ok := m[key].(map[string]any); ok {
			u.extractFromMap(nested, depth+1)
		}
	}
}

func jsonInt64(m map[string]any, key string) (int64, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		if n >= 0 {
			return int64(n), true
		}
	case int64:
		if n >= 0 {
			return n, true
		}
	}
	return 0, false
}

func (u *usageTapResponseWriter) applyStandardUsage(m map[string]any) {
	if len(m) == 0 {
		return
	}
	var inTok, outTok, cacheTok int64
	found := false

	// OpenAI Chat: prompt_tokens / completion_tokens; OpenAI Responses & Anthropic: input_tokens / output_tokens
	if v, ok := jsonInt64(m, "prompt_tokens"); ok {
		inTok = v
		found = true
	} else if v, ok := jsonInt64(m, "input_tokens"); ok {
		inTok = v
		found = true
		// Anthropic reports uncached input_tokens separately from cache_read/cache_creation
		if cr, ok := jsonInt64(m, "cache_read_input_tokens"); ok {
			cacheTok = cr
			inTok += cr
		}
		if cc, ok := jsonInt64(m, "cache_creation_input_tokens"); ok {
			inTok += cc
		}
	}
	if v, ok := jsonInt64(m, "completion_tokens"); ok {
		outTok = v
		found = true
	} else if v, ok := jsonInt64(m, "output_tokens"); ok {
		outTok = v
		found = true
	}
	if details, ok := m["prompt_tokens_details"].(map[string]any); ok {
		if v, ok := jsonInt64(details, "cached_tokens"); ok {
			cacheTok = v
		}
	}
	if details, ok := m["input_tokens_details"].(map[string]any); ok {
		if v, ok := jsonInt64(details, "cached_tokens"); ok {
			cacheTok = v
		}
	}

	if !found {
		return
	}
	u.hasUsage = true
	// Take max so split events (Anthropic message_start -> message_delta) merge cleanly
	if inTok > u.inputTokens {
		u.inputTokens = inTok
	}
	if outTok > u.outputTokens {
		u.outputTokens = outTok
	}
	if cacheTok > u.cacheReadTokens {
		u.cacheReadTokens = cacheTok
	}
}

func (u *usageTapResponseWriter) applyGeminiUsage(m map[string]any) {
	if len(m) == 0 {
		return
	}
	inTok, okIn := jsonInt64(m, "promptTokenCount")
	outTok, okOut := jsonInt64(m, "candidatesTokenCount")
	thoughts, _ := jsonInt64(m, "thoughtsTokenCount")
	cacheTok, _ := jsonInt64(m, "cachedContentTokenCount")
	if !okIn && !okOut {
		return
	}
	u.hasUsage = true
	if inTok > u.inputTokens {
		u.inputTokens = inTok
	}
	if outTok+thoughts > u.outputTokens {
		u.outputTokens = outTok + thoughts
	}
	if cacheTok > u.cacheReadTokens {
		u.cacheReadTokens = cacheTok
	}
}
