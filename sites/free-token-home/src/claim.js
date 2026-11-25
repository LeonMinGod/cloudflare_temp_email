import { effectsStyles, effectsMarkup, effectsScripts } from './token-scene.js';

export const claimStyles = `
${effectsStyles}

/* 背景图：切换为 Free Token 首页专属海报背景 */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: linear-gradient(180deg, rgba(5, 13, 27, 0.48) 0%, rgba(5, 13, 27, 0.78) 100%), url('/free-token/welcome-mobile-v1.webp');
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
@media (orientation: landscape) {
  .backdrop {
    background-image: linear-gradient(90deg, rgba(5, 13, 27, 0.52) 0%, rgba(5, 13, 27, 0.25) 45%, rgba(5, 13, 27, 0.62) 100%), url('/free-token/welcome-desktop-v1.webp');
  }
}

/* 移除顶部导航、品牌小尾巴等边角料，保持全景仙境视野 */
.topbar, .page-foot {
  display: none !important;
}

body {
  scroll-padding-bottom: 16px;
  margin: 0;
  cursor: pointer;
}
.invitation, dialog {
  cursor: default;
}

main { z-index: 2; width: min(840px,calc(100% - 32px)); margin: auto; padding: 0; }
.invitation { grid-template-columns: .85fr 1.15fr; min-height: 500px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-color: rgba(181, 217, 197, 0.24); }
.gift-art { padding: 30px 18px 24px; position: relative; overflow: visible; }

/* 令牌容器与神圣仙芒 */
.token-visual {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 210px;
  height: 310px;
  cursor: pointer;
}

/* 令牌背景神圣灵光晕（常态柔和，hover炽盛） */
.token-visual::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 48%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(167, 243, 208, 0.35) 0%, rgba(74, 222, 128, 0.2) 35%, rgba(250, 204, 21, 0.12) 60%, transparent 75%);
  filter: blur(14px);
  pointer-events: none;
  opacity: .75;
  transition: opacity .4s ease, transform .4s ease, filter .4s ease;
}

.gift-art img {
  position: relative;
  display: block;
  width: 210px;
  height: 310px;
  max-width: 100%;
  object-fit: contain;
  /* 默认周身温润青金灵光 */
  filter: drop-shadow(0 0 10px rgba(110, 255, 190, 0.55)) drop-shadow(0 0 25px rgba(74, 222, 128, 0.35)) drop-shadow(0 15px 25px rgba(0, 15, 10, 0.7));
  transition: filter .35s cubic-bezier(.2,.8,.25,1), transform .35s cubic-bezier(.2,.8,.25,1);
  will-change: transform, filter;
  animation: token-breathe 4s ease-in-out infinite;
}

@keyframes token-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* 轨道灵光环 */
.art-orbit {
  position: absolute;
  left: 50%;
  top: 48%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  border: 1.5px solid rgba(175, 235, 195, 0.35);
  border-radius: 50%;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.25), inset 0 0 20px rgba(250, 204, 21, 0.15);
  transition: all .35s cubic-bezier(.2,.8,.25,1);
  pointer-events: none;
}

/* 【核心增强】鼠标移到令牌上时，周身神圣金绿神光暴涨！ */
.gift-art:hover .token-visual::before,
.token-visual:hover::before {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.25);
  filter: blur(20px) brightness(1.4);
  background: radial-gradient(circle, rgba(220, 255, 235, 0.65) 0%, rgba(110, 255, 190, 0.45) 30%, rgba(250, 204, 21, 0.35) 55%, transparent 75%);
}

.gift-art:hover .art-orbit,
.token-visual:hover .art-orbit {
  transform: translate(-50%, -50%) scale(1.14);
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 35px rgba(110, 255, 190, 0.75), 0 0 70px rgba(250, 204, 21, 0.55), inset 0 0 30px rgba(74, 222, 128, 0.45);
}

.gift-art:hover img,
.token-visual:hover img {
  animation-play-state: paused;
  transform: scale(1.07) translateY(-6px);
  /* 超强璀璨神圣光晕：白炽心、青玉灵芒、金光外绽、深邃光辉多重叠加 */
  filter: 
    drop-shadow(0 0 8px rgba(255, 255, 255, 0.95))
    drop-shadow(0 0 20px rgba(130, 255, 200, 0.95))
    drop-shadow(0 0 40px rgba(74, 222, 128, 0.85))
    drop-shadow(0 0 70px rgba(250, 204, 21, 0.7))
    drop-shadow(0 0 110px rgba(52, 211, 153, 0.5));
}

.ritual { padding: 36px 36px 28px; }
.eyebrow { margin-bottom: 16px; }
h1 { font-size: clamp(30px,3.4vw,39px); line-height: 1.35; }
.intro { margin: 14px 0 20px; line-height: 1.75; }
.input-wrap { margin-top: 11px; }
.input-wrap input { height: 48px; }
#input-check { top: 13px; }
.input-hint { margin: 8px 0 15px; }
.claim-button { min-height: 46px; }
.fine-print { margin-top: 12px; line-height: 1.6; }
.page-foot { margin-top: 16px; }
.modal { max-height: calc(100dvh - 32px); }

/* 横屏桌面：完美置中，舒适沉浸 */
@media (min-width: 768px) and (orientation: landscape) {
  html, body {
    min-height: 100vh;
    min-height: 100dvh;
  }
  body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    box-sizing: border-box;
    padding: 0;
  }
  main {
    width: min(860px, calc(100% - 48px));
    margin: auto;
    padding-bottom: 0;
  }
}

/* 竖屏手机：高度有限，居中布局，保证首屏操作通畅 */
@media (max-width: 740px) {
  html, body {
    min-height: 100vh;
    min-height: 100dvh;
  }
  body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 16px 0;
  }
  main { width: min(340px,calc(100% - 32px)); margin: auto; }
  .invitation { min-height: auto; }
  .gift-art { min-height: 96px; padding: 8px 22px; }
  .token-visual { width: 86px; height: 88px; }
  .token-visual::before { width: 110px; height: 110px; }
  .gift-art img { width: 60px; height: 88px; }
  .art-orbit { width: 104px; height: 104px; }
  .art-caption { font-size: 13px; letter-spacing: .18em; }
  .ritual { padding: 20px 22px 18px; }
  .eyebrow { margin-bottom: 10px; font-size: 8px; }
  h1 { font-size: 30px; line-height: 1.32; }
  .intro { margin: 10px 0 16px; font-size: 12px; line-height: 1.65; }
  form label { font-size: 12px; }
  .input-wrap { margin-top: 10px; }
  .input-wrap input { height: 46px; font-size: 16px; }
  .input-hint { margin: 8px 0 14px; }
  .fine-print { margin-top: 10px; font-size: 9px; }
  .page-foot { margin-top: 12px; font-size: 9px; }
  .modal { width: min(440px,calc(100% - 32px)); padding: 24px 22px; }
  .modal h2 { font-size: 24px; line-height: 1.45; }
  .dialog-actions { margin-top: 20px; }
}

@media (max-width: 740px) and (max-height: 640px) {
  .topbar { padding-top: 8px; }
  main { margin-top: 4px; }
  .gift-art { min-height: 72px; padding-top: 4px; padding-bottom: 4px; }
  .token-visual, .gift-art img { height: 68px; }
  .art-orbit { width: 84px; height: 84px; }
  .ritual { padding-top: 14px; padding-bottom: 12px; }
  .eyebrow { margin-bottom: 6px; }
  h1 { font-size: 27px; }
  .intro { margin: 6px 0 10px; }
  .input-wrap input { height: 42px; }
  .input-hint { margin-bottom: 8px; }
}

@media (min-width: 741px) and (max-height: 620px) {
  body { padding: 12px 0; }
  .topbar { padding-bottom: 6px; }
  .invitation { min-height: auto; }
  .ritual { padding: 18px 30px; }
  .gift-art { padding-top: 18px; padding-bottom: 16px; }
  .token-visual, .gift-art img { height: 240px; }
  h1 { font-size: 28px; }
  .intro { margin: 10px 0 14px; }
  .eyebrow { margin-bottom: 10px; }
}
`;

export const exitScript = `<script>
document.addEventListener('DOMContentLoaded', function() {
  function exitToOrigin() {
    if (window.history.length > 1 && document.referrer && document.referrer.includes(location.hostname)) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  }

  // 自动选中输入框 (Autofocus + Focus)
  function focusOathInput() {
    var input = document.getElementById('oath-input');
    if (input) {
      input.focus();
      input.select?.();
    }
  }
  focusOathInput();
  setTimeout(focusOathInput, 60);
  setTimeout(focusOathInput, 250);

  // 点击空白区域（卡片外任意位置）退出
  document.addEventListener('click', function(e) {
    var openDialog = document.querySelector('dialog[open]');
    if (openDialog) {
      var rect = openDialog.getBoundingClientRect();
      var inDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!inDialog) openDialog.close();
      return;
    }
    if (e.target.closest('.invitation')) return;
    exitToOrigin();
  });

  // 按 Escape 键退出
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      exitToOrigin();
    }
  });
});
</script>`;

const mobileClaimStyles = `
@media (pointer: coarse) {
  .invitation { backdrop-filter: none; -webkit-backdrop-filter: none; background-color: #0a1d20ed; }
  .gift-art img, .gift-art:hover img, .token-visual:hover img { filter: none; will-change: transform; }
  .token-visual::before, .gift-art:hover .token-visual::before, .token-visual:hover::before { filter: none; }
}
`;

export function renderClaim(response) {
  const updated = new HTMLRewriter()
    .on('title', { element: element => element.setInnerContent('LeonMinGod · 仙玉令牌领取 | 贵宾密钥') })
    .on('link[rel="icon"]', { element: element => element.setAttribute('href', '/assets/logo.svg') })
    .on('#oath-input', { element: element => element.setAttribute('autofocus', '') })
    .on('head', { element: element => element.append(
      `<style id="free-token-compact-layout">${claimStyles}${mobileClaimStyles}</style>${effectsScripts}${exitScript}`, { html: true }) })
    .on('body', { element: element => element.prepend(effectsMarkup, { html: true }) })
    .transform(response);
  const headers = new Headers(updated.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(updated.body, { status: updated.status, statusText: updated.statusText, headers });
}
