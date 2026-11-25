const svg = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const mail = svg('<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 7 7.5 6 7.5-6"/>');
const gift = svg('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M3 7h18v4H3zM12 7v13M12 7H8a2.5 2.5 0 1 1 2.5-2.5L12 7Zm0 0h4a2.5 2.5 0 1 0-2.5-2.5L12 7Z"/>');
const address = svg('<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>');
const scale = svg('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>');
export const navigation = `<a class="enter jade-pill" href="https://mail.leonmingod.com" aria-label="进入 LeonMinGod 邮箱">${mail}<span>进入灵境</span></a><a class="gift-link jade-pill" href="/free-token/">${gift}<span>免费Token</span></a><a class="gift-link address-link jade-pill" href="https://addr.leonmingod.com" aria-label="地址证明">${address}<span>地址证明</span></a><a class="gift-link compare-link jade-pill" href="https://github.com/waw666waw666/awesome-ai-relay-and-cards" target="_blank" rel="noopener noreferrer" aria-label="货比三家">${scale}<span>货比三家</span></a>`;

export const styles = `
:root { background: #041a16; color: #e4efe2; }
.cover { filter: brightness(1.03) saturate(.96); }
.cover-palm { filter: brightness(1.11) saturate(1.08); }
.vignette { background: linear-gradient(#031a1530,transparent 15%,transparent 76%,#031a157d); }
.interface { padding: max(14px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(15px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left)); }
.topbar { max-width: 100%; justify-content: flex-end; }
.scene-controls { gap: 2px; padding: 1px 4px; border-color: #c5e3bd25; background: #092b2252; box-shadow: inset 0 0 18px #d0f1cb05; backdrop-filter: blur(12px); max-width: 100%; }
.scene-controls button { min-height: 30px; padding: 0 8px; color: #d1e5ce; font-size: 10px; }
.scene-controls svg { stroke: #dccb96; }
.toggle-indicator { background: #9fe0b4; box-shadow: 0 0 8px #9fe0b466; }
.entry { gap: 0; padding-bottom: 0; }
.entry-actions { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; width: auto; max-width: 100%; gap: 6px; }
.entry-actions > a.jade-pill { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; gap: 5px; width: auto; min-height: 36px; padding: 0 10px; border: 1px solid #c9e5be59; border-radius: 999px; background: linear-gradient(140deg,#12392a30,#061c1757); color: #f0efd2; font-family: "KaiTi","STKaiti","PingFang SC",serif; font-size: 12px; line-height: 1.4; font-weight: 400; letter-spacing: .035em; white-space: nowrap; text-shadow: 0 1px 5px #05150f80; box-shadow: 0 2px 12px #01110a18,inset 0 1px 0 #f3f9dd12; backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); transition: background .2s,border-color .2s,transform .2s; }
.entry-actions > a.enter { border-color: #e6d5a47d; background: linear-gradient(140deg,#3d57322e,#0b2a1f60); }
.entry-actions > a.jade-pill svg { width: 14px; height: 14px; flex: 0 0 auto; fill: none; stroke: #d8e7bd; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.entry-actions > a.enter svg { stroke: #f2e1a8; }
.entry-actions > a.jade-pill:hover { background: #30513a73; border-color: #e3edc6ad; transform: translateY(-2px); box-shadow: 0 0 16px #c4e8ac12; }
.entry-actions > a.jade-pill { position: relative; }
.entry-actions > a.jade-pill::after { content: ""; position: absolute; inset: -5px 0; border-radius: inherit; }
.slogan { display: none; }
.footer-meta { margin-top: 9px; color: #c9ddc3; font-size: 9px; opacity: .7; }
#pointer-light { background: radial-gradient(circle,#fff 5%,#d9ffe0 26%,#83dba288 58%,transparent 75%); box-shadow: 0 0 10px #abedb399; }

/* Landscape: 玲珑晶莹剔透 · 仙家水魄琉璃璧导航 */
@media (min-width: 768px) and (orientation: landscape) {
  .cover img { object-position: 70% center; }
  .interface { padding: 24px 38px 22px 38px; }
  .scene-controls { gap: 4px; padding: 3px 8px; border-radius: 30px; }
  .scene-controls button { min-height: 36px; padding: 0 13px; color: #e2f2df; font-size: 13px; font-weight: 500; letter-spacing: .06em; gap: 8px; }
  .scene-controls svg { width: 15px; height: 15px; stroke: #ebd8a0; stroke-width: 1.4; }
  .toggle-indicator { width: 7px; height: 7px; }
  .footer-meta { font-size: 13px; color: #d4ebd0; opacity: .88; letter-spacing: .08em; text-shadow: 0 2px 8px #020f0b; }

  .entry { position: fixed; inset: 0; pointer-events: none; }
  .entry-actions { position: absolute; inset: 0; pointer-events: none; }
  .entry-actions > a.jade-pill {
    position: absolute;
    top: 72.5%;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: clamp(86px, min(6.5vw, 13vmin), 116px);
    height: clamp(86px, min(6.5vw, 13vmin), 116px);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    
    /* 晶莹剔透的冰种琉璃水体：通透度极高，背后湖水与微澜澄澈可见 */
    background: radial-gradient(circle at 50% 120%, rgba(12, 55, 42, 0.42) 0%, rgba(24, 92, 70, 0.22) 50%, rgba(65, 175, 125, 0.12) 100%),
                linear-gradient(145deg, rgba(235, 255, 245, 0.38) 0%, rgba(150, 245, 205, 0.15) 35%, rgba(16, 68, 52, 0.32) 100%);
    
    /* 玲珑晶莹折射外圈：白金微光细边 */
    border: 1.5px solid rgba(225, 255, 240, 0.72);
    
    color: #ffffff;
    font-family: "KaiTi", "STKaiti", "Songti SC", serif;
    font-size: clamp(12.5px, 1.35vmin, 14.5px);
    font-weight: 500;
    letter-spacing: .08em;
    text-shadow: 0 1px 4px rgba(0, 18, 10, 0.95), 0 0 10px rgba(110, 255, 190, 0.65);
    
    /* 核心水魄晶莹感：顶部白光折射 + 底部水润绿光反射 + 整体外散剔透微晕 */
    box-shadow: 
      0 8px 24px rgba(1, 15, 10, 0.48),
      0 0 22px rgba(74, 222, 128, 0.25),
      inset 0 2px 2px rgba(255, 255, 255, 0.85),
      inset 0 -2px 5px rgba(52, 211, 153, 0.32),
      inset 0 0 16px rgba(167, 243, 208, 0.2);
      
    backdrop-filter: blur(14px) saturate(145%);
    -webkit-backdrop-filter: blur(14px) saturate(145%);
    transition: transform .28s cubic-bezier(.2,.8,.3,1), border-color .28s, box-shadow .28s, background .28s;
    overflow: hidden;
  }
  
  /* 顶部细腻弧面月牙高光 (Crescent Specular Highlight) */
  .entry-actions > a.jade-pill::before {
    content: "";
    position: absolute;
    top: 3px;
    left: 15%;
    width: 70%;
    height: 38%;
    border-radius: 50% 50% 45% 45% / 60% 60% 40% 40%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.12) 70%, transparent 100%);
    pointer-events: none;
    filter: blur(.5px);
  }
  
  /* 内嵌细金丝同心仙纹 (古风同心环) */
  .entry-actions > a.jade-pill::after {
    content: "";
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    border: 1px dashed rgba(220, 255, 235, 0.45);
    pointer-events: none;
    transition: border-color .25s, transform .25s;
  }
  
  .entry-actions > a.jade-pill svg {
    width: clamp(20px, 2.4vmin, 24px);
    height: clamp(20px, 2.4vmin, 24px);
    stroke-width: 1.4;
    stroke: #e6fff2;
    filter: drop-shadow(0 0 6px rgba(110, 255, 185, 0.75));
    transition: transform .25s;
    z-index: 2;
  }
  .entry-actions > a.jade-pill span {
    z-index: 2;
  }
  
  /* 进入灵境：晶莹金琥珀琉璃感 */
  .entry-actions > a.enter {
    left: 58.0%;
    border-color: rgba(255, 238, 175, 0.8);
    background: radial-gradient(circle at 50% 120%, rgba(55, 45, 18, 0.42) 0%, rgba(85, 70, 26, 0.22) 50%, rgba(145, 115, 38, 0.12) 100%),
                linear-gradient(145deg, rgba(255, 250, 225, 0.4) 0%, rgba(250, 228, 145, 0.16) 35%, rgba(65, 50, 16, 0.32) 100%);
    box-shadow: 
      0 8px 24px rgba(1, 15, 10, 0.48),
      0 0 22px rgba(250, 204, 21, 0.28),
      inset 0 2px 2px rgba(255, 255, 255, 0.9),
      inset 0 -2px 5px rgba(234, 179, 8, 0.32),
      inset 0 0 16px rgba(254, 240, 138, 0.2);
  }
  .entry-actions > a.enter::after {
    border-color: rgba(255, 238, 175, 0.48);
  }
  .entry-actions > a.enter svg {
    stroke: #fffbeb;
    filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.85));
  }
  
  .entry-actions > a.gift-link:not(.address-link):not(.compare-link) { left: 67.5%; }
  .entry-actions > a.address-link { left: 77.0%; }
  .entry-actions > a.compare-link { left: 86.5%; }
  
  /* 悬停动效：灵气升华、水光潋滟 */
  .entry-actions > a.jade-pill:hover {
    transform: translate(-50%, -50%) translateY(-5px) scale(1.06);
    border-color: #ffffff;
    box-shadow: 
      0 12px 32px rgba(1, 15, 10, 0.6),
      0 0 32px rgba(74, 222, 128, 0.6),
      inset 0 2px 3px rgba(255, 255, 255, 1),
      inset 0 -2px 6px rgba(52, 211, 153, 0.5),
      inset 0 0 22px rgba(167, 243, 208, 0.38);
  }
  .entry-actions > a.jade-pill:hover::before {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.2) 70%, transparent 100%);
  }
  .entry-actions > a.jade-pill:hover::after {
    border-color: rgba(255, 255, 255, 0.8);
    border-style: solid;
  }
  .entry-actions > a.jade-pill:hover svg {
    transform: scale(1.12);
  }
  .entry-actions > a.enter:hover {
    border-color: #fffbeb;
    box-shadow: 
      0 12px 32px rgba(1, 15, 10, 0.6),
      0 0 32px rgba(250, 204, 21, 0.6),
      inset 0 2px 3px rgba(255, 255, 255, 1),
      inset 0 -2px 6px rgba(234, 179, 8, 0.5),
      inset 0 0 22px rgba(254, 240, 138, 0.42);
  }
}

/* Portrait adjustments */
@media (max-width: 767px), (orientation: portrait) {
  .interface { padding: max(14px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(15px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left)); }
  .scene-controls { gap: 1px; padding: 1px 3px; }
  .scene-controls button { min-height: 28px; padding: 0 7px; font-size: 9.5px; }
  .entry-actions { gap: 5px; }
  .entry-actions > a.jade-pill { min-height: 34px; padding: 0 8px; font-size: 11.5px; }
  .vignette { background: linear-gradient(#031a1530,transparent 14%,transparent 78%,#031a1570); }
  .footer-meta { font-size: 10px; margin-top: 8px; }
}
@media (max-width: 359px) {
  .entry-actions { gap: 4px; }
  .entry-actions > a.jade-pill { padding: 0 6px; gap: 4px; font-size: 11px; }
  .scene-controls button { padding: 0 5px; font-size: 9px; }
}
@media (max-height: 520px) and (orientation: landscape) {
  .interface { padding: 12px 20px 10px 20px; }
  .scene-controls button { min-height: 32px; font-size: 11px; padding: 0 10px; }
  .footer-meta { font-size: 10px; margin-top: 4px; }
  .entry-actions > a.jade-pill {
    width: clamp(62px, 15vmin, 76px);
    height: clamp(62px, 15vmin, 76px);
    font-size: 10px;
    gap: 4px;
  }
  .entry-actions > a.jade-pill svg { width: 16px; height: 16px; }
}
`;

export function renderHomepage(response) {
  const updated = new HTMLRewriter()
    .on('title', { element: element => element.setInnerContent('LeonMinGod · 灵境仙域 | 一念风起 万境星垂') })
    .on('link[rel="icon"]', { element: element => element.setAttribute('href', '/assets/logo.svg') })
    .on('.cover source', { element: element => element.setAttribute('srcset', '/home-hero-desktop-v4.webp') })
    .on('.cover img', { element(element) {
      element.setAttribute('src', '/home-hero-mobile-v4.webp');
      if (element.getAttribute('id') !== 'palm-image') element.setAttribute('alt', 'LeonMinGod：白衣仙子立于玉绿色山水之间，掌心一团青玉流光');
    } })
    .on('script[src^="scene.js"]', { element: element => element.setAttribute('src', '/home-scene-v4.js') })
    .on('nav.entry-actions', { element: element => element.setInnerContent(navigation, { html: true }) })
    .on('head', { element: element => element.append(`<style id="homepage-jade-layout">${styles}</style>`, { html: true }) })
    .transform(response);
  const headers = new Headers(updated.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(updated.body, { status: updated.status, statusText: updated.statusText, headers });
}
