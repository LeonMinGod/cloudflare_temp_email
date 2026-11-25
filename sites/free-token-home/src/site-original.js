var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/free-token/claim") {
      const reply = /* @__PURE__ */ __name((status, body2) => Response.json(body2, {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          ...status === 405 ? { Allow: "POST" } : {}
        }
      }), "reply");
      if (request.method !== "POST") return reply(405, { error: "\u8BF7\u901A\u8FC7\u9886\u53D6\u9875\u9762\u786E\u8BA4\u540E\u9886\u53D6\u3002" });
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return reply(403, { error: "\u8BF7\u5728\u672C\u7AD9\u9886\u53D6\u3002" });
      if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
        return reply(415, { error: "\u8BF7\u6C42\u683C\u5F0F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002" });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return reply(400, { error: "\u8BF7\u6C42\u683C\u5F0F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002" });
      }
      if (typeof body?.oath !== "string" || body.oath.trim() !== "\u4E49\u7236" || body.confirmed !== true) {
        return reply(400, { error: "\u8BF7\u5148\u8F93\u5165\u300C\u4E49\u7236\u300D\uFF0C\u518D\u5B8C\u6210\u4E8C\u6B21\u786E\u8BA4\u3002" });
      }
      if (!env.FREE_TOKEN_CPA_KEY) return reply(503, { error: "\u89C1\u9762\u793C\u6B63\u5728\u51C6\u5907\uFF0C\u8BF7\u7A0D\u540E\u518D\u6765\u3002" });
      return reply(200, {
        baseUrl: "https://cpa.leonmingod.com/v1",
        apiKey: env.FREE_TOKEN_CPA_KEY,
        label: "Leon\u{1F319} \u8D35\u5BBE\u5BC6\u94A5"
      });
    }
    if (url.pathname === "/image" || url.pathname === "/img" || url.pathname === "/bg" || url.pathname === "/wallpaper.png") {
      const userAgent = request.headers.get("user-agent") || "";
      const isMobile = /mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(userAgent);
      url.pathname = isMobile ? "/hero-mobile.png" : "/hero-desktop.png";
      return env.ASSETS.fetch(new Request(url.toString(), request));
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
