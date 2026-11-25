import { effectsStyles, effectsMarkup, effectsScripts } from './token-scene.js';

export default `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#050d1b">
  <meta name="description" content="LeonMinGod 仙玉流光 · 贵宾礼遇，专属密钥。">
  <title>LeonMinGod · 仙玉流光 | 免费 Token 贵宾礼遇</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
  <script>window.addEventListener('dragstart',function(e){e.preventDefault();});</script>
  ${effectsScripts}
  <style>
    ${effectsStyles}
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #050d1b; color: #fff0cf; }
    body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
    img, picture, .poster, .token-picture, .token-art, .token-motion, .scene, .welcome {
      -webkit-user-drag: none;
      -khtml-user-drag: none;
      -moz-user-drag: none;
      -o-user-drag: none;
      user-drag: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .welcome { position: fixed; inset: 0; width: 100%; height: 100vh; height: 100dvh; overflow: hidden; touch-action: none; }
    .scene {
      --token-clip: polygon(40.808% 45.933%,40.701% 45.156%,42.295% 44.916%,43.252% 45.813%,45.165% 45.813%,46.227% 44.856%,47.609% 44.916%,48.353% 45.574%,47.503% 46.292%,45.590% 46.890%,46.971% 48.146%,48.140% 48.983%,48.884% 50.419%,49.309% 51.675%,48.884% 53.768%,48.672% 55.742%,49.309% 56.818%,48.140% 58.553%,44.952% 59.450%,42.614% 60.287%,38.470% 61.543%,35.707% 60.526%,32.200% 59.569%,29.543% 58.194%,29.118% 56.878%,30.181% 54.665%,30.499% 52.632%,30.925% 50.718%,31.243% 49.282%,33.156% 48.146%,35.813% 47.428%,38.151% 46.890%);
      --token-origin: 39.8% 53.3%;
      --token-left: 28.8%; --token-top: 44.8%; --token-width: 21.8%; --token-height: 17.3%;
      --hint-left: 39.8%; --hint-top: 63.6%;
      position: absolute; left: 50%; top: 50%;
      width: max(100vw, calc(100vh * 941 / 1672));
      width: max(100vw, calc(100dvh * 941 / 1672));
      aspect-ratio: 941 / 1672;
      transform: translate(-50%, -50%);
    }
    .poster, .poster img, .token-picture, .token-art { position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
    .poster img { object-fit: cover; }
    .token-entry { position: absolute; z-index: 3; left: var(--token-left); top: var(--token-top); width: var(--token-width); height: var(--token-height); min-width: 44px; min-height: 44px; border-radius: 42%; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .token-entry:focus-visible { outline: 2px solid #f5e1aa; outline-offset: 5px; }
    .token-aura { position: absolute; z-index: 1; left: var(--token-left); top: var(--token-top); width: var(--token-width); height: var(--token-height); pointer-events: none; border-radius: 48%; background: radial-gradient(ellipse,#efffd55c 0%,#91ffdb47 28%,#e9d3992e 48%,transparent 72%); filter: blur(12px); mix-blend-mode: screen; animation: token-glow 3.8s ease-in-out infinite; }
    .token-motion { position: absolute; inset: 0; z-index: 2; pointer-events: none; transform-origin: var(--token-origin); transform: scale(1.09); filter: drop-shadow(0 0 7px #b5ffe9c7) drop-shadow(0 0 20px #86efd68c) drop-shadow(0 0 34px #f1d1966b); animation: token-float 3.8s ease-in-out infinite; will-change: transform; }
    .token-art { object-fit: cover; clip-path: var(--token-clip); }
    .token-entry:hover ~ .token-motion, .token-entry:focus-visible ~ .token-motion {
      transform: scale(1.13) translate(1px, -4px);
      filter: 
        drop-shadow(0 0 10px #ffffff)
        drop-shadow(0 0 24px #98ffd9)
        drop-shadow(0 0 48px #4ade80)
        drop-shadow(0 0 80px #facc15)
        drop-shadow(0 0 120px #22c55e);
    }
    .token-entry:hover ~ .token-aura {
      opacity: 1 !important;
      transform: scale(1.35) !important;
      filter: blur(18px) brightness(1.7);
      background: radial-gradient(ellipse, rgba(239, 255, 213, 0.9) 0%, rgba(145, 255, 219, 0.75) 35%, rgba(250, 204, 21, 0.55) 55%, transparent 75%);
    }
    .token-entry:active ~ .token-motion { animation-play-state: paused; }
    .token-hint { position: absolute; z-index: 2; left: var(--hint-left); top: var(--hint-top); margin: 0; padding: 4px 9px; transform: translateX(-50%); border-radius: 99px; background: #06151f5c; color: #f8e6ba; font-size: 11px; line-height: 1.4; letter-spacing: .08em; white-space: nowrap; text-shadow: 0 1px 5px #02070c; pointer-events: none; }
    .back { position: fixed; z-index: 5; top: max(10px, env(safe-area-inset-top)); left: max(10px, env(safe-area-inset-left)); display: inline-flex; align-items: center; min-height: 30px; padding: 5px 10px; border: 1px solid #d0e3ee30; border-radius: 99px; background: #07152270; color: #e0eaf2; font-size: 12px; line-height: 1.4; text-decoration: none; backdrop-filter: blur(8px); }
    .back:focus-visible { outline: 2px solid #f5e1aa; outline-offset: 4px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @keyframes token-float {
      0%, 100% { transform: translate(0,0) scale(1.09) rotate(-.7deg); }
      50% { transform: translate(1px,-7px) scale(1.10) rotate(.8deg); }
    }
    @keyframes token-glow { 0%, 100% { opacity: .55; transform: scale(.98); } 50% { opacity: .9; transform: scale(1.12); } }
    @media (orientation: landscape) {
      .scene {
        --token-clip: polygon(24.726% 60.093%,24.781% 58.353%,25.603% 57.657%,26.151% 59.629%,27.083% 59.629%,27.686% 57.193%,28.399% 57.077%,28.783% 58.585%,28.289% 60.209%,26.919% 61.485%,27.796% 63.225%,28.454% 64.965%,29.112% 67.285%,29.331% 70.766%,29.112% 74.710%,29.057% 78.306%,29.112% 80.162%,28.509% 83.063%,26.754% 84.687%,24.342% 85.847%,22.533% 83.875%,20.724% 82.831%,19.901% 80.510%,19.682% 77.958%,20.066% 73.782%,20.175% 70.302%,20.450% 66.705%,21.436% 64.153%,22.752% 62.645%,24.068% 61.485%);
        --token-origin: 24.4% 71.5%;
        --token-left: 19.3%; --token-top: 56.7%; --token-width: 10.6%; --token-height: 30.5%;
        --hint-left: 24.4%; --hint-top: 89.4%;
        width: max(100vw, calc(100vh * 1824 / 862));
        width: max(100vw, calc(100dvh * 1824 / 862));
        aspect-ratio: 1824 / 862;
      }
      .token-hint { font-size: 12px; }
    }
    @media (pointer: coarse) {
      .token-motion, .token-entry:hover ~ .token-motion, .token-entry:focus-visible ~ .token-motion { filter: none !important; }
      .token-aura, .token-entry:hover ~ .token-aura { filter: none !important; mix-blend-mode: normal; background: radial-gradient(ellipse,#edffdba8 0%,#91ffdb70 26%,#e9d39942 48%,transparent 72%); will-change: transform, opacity; }
      .back { backdrop-filter: none; }
    }
    @media (prefers-reduced-motion: reduce) { .token-motion, .token-aura { animation: none; will-change: auto; } }
  </style>
</head>
<body>
  <main class="welcome" data-layout="fullscreen-token">
    ${effectsMarkup}
    <h1 class="sr-only">免费 Token · 白嫖 Token？先叫声义父。</h1>
    <div class="scene">
      <picture class="poster">
        <source media="(orientation: landscape)" srcset="/free-token/welcome-desktop-v1.webp" width="1824" height="862">
        <img src="/free-token/welcome-mobile-v1.webp" width="941" height="1672" alt="LeonMinGod 免费 Token 海报：雪夜仙子递出青玉令牌。白嫖 Token？先叫声义父。Leon🌙 的见面礼，叫对了就送。" fetchpriority="high" decoding="async" draggable="false">
      </picture>
      <a id="token-entry" class="token-entry" href="/free-token/claim/" aria-label="点击令牌，进入免费 Token" aria-describedby="token-hint"><span class="sr-only">进入免费 Token</span></a>
      <div class="token-aura" aria-hidden="true"></div>
      <div class="token-motion" aria-hidden="true">
        <picture class="token-picture">
          <source media="(orientation: landscape)" srcset="/free-token/welcome-desktop-v1.webp" width="1824" height="862">
          <img class="token-art" src="/free-token/welcome-mobile-v1.webp" width="941" height="1672" alt="" decoding="async" draggable="false">
        </picture>
      </div>
      <p id="token-hint" class="token-hint">轻触令牌 · 进入</p>
    </div>
    <a class="back" href="/">← 返回首页</a>
  </main>
</body>
</html>`;
