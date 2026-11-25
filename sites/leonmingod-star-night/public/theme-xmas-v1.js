(() => {
  'use strict';

  const STORAGE_KEY = 'lmg_site_skin';
  const VALID_SKINS = new Set(['xmas', 'classic']);
  const DEFAULT_SKIN = 'xmas';
  const XMAS_THEME_COLORS = {
    home: '#1a0a14',
    token: '#1a0a14',
    choose: '#1a0a14',
    claim: '#1a0a14',
    verify: '#1a0a14',
    game: '#140c16',
    shame: '#120912',
  };

  function readSkin() {
    try {
      const qs = new URLSearchParams(window.location.search).get('skin');
      if (qs && VALID_SKINS.has(qs)) {
        try { localStorage.setItem(STORAGE_KEY, qs); } catch {}
        return qs;
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_SKINS.has(saved)) return saved;
    } catch {}
    return DEFAULT_SKIN;
  }

  let currentSkin = readSkin();
  document.documentElement.dataset.skin = currentSkin;

  let snowRaf = 0;
  let snowCanvas = null;
  let snowCtx = null;
  let flakes = [];
  let snowWidth = 0;
  let snowHeight = 0;
  let toastTimer = 0;
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function detectPageKind() {
    const p = window.location.pathname;
    if (p === '/' || p === '/index.html') return 'home';
    if (p.startsWith('/free-token/choose')) return 'choose';
    if (p.startsWith('/free-token/claim')) return 'claim';
    if (p.startsWith('/free-token/verify')) return 'verify';
    if (p.startsWith('/free-token/game')) return 'game';
    if (p.startsWith('/free-token')) return 'token';
    if (p.startsWith('/model-status')) return 'status';
    if (p.startsWith('/hall-of-shame')) return 'shame';
    return 'other';
  }

  function applyMediaForSkin(skin) {
    const attrSrc = skin === 'xmas' ? 'data-xmas-src' : 'data-classic-src';
    const attrSrcset = skin === 'xmas' ? 'data-xmas-srcset' : 'data-classic-srcset';

    document.querySelectorAll('source[data-xmas-srcset]').forEach(source => {
      if (!source.hasAttribute('data-classic-srcset')) {
        source.setAttribute('data-classic-srcset', source.getAttribute('srcset') || '');
      }
      const next = source.getAttribute(attrSrcset);
      if (next && source.getAttribute('srcset') !== next) {
        source.setAttribute('srcset', next);
      }
    });

    document.querySelectorAll('img[data-xmas-src]').forEach(img => {
      if (!img.hasAttribute('data-classic-src')) {
        img.setAttribute('data-classic-src', img.getAttribute('src') || '');
      }
      const next = img.getAttribute(attrSrc);
      if (next && img.getAttribute('src') !== next) {
        img.setAttribute('src', next);
      }
    });

    // Update theme-color meta when appropriate (skip pages that manage light/dark theme-color dynamically)
    const kind = detectPageKind();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && XMAS_THEME_COLORS[kind]) {
      if (!meta.hasAttribute('data-classic-theme-color')) {
        meta.setAttribute('data-classic-theme-color', meta.getAttribute('content') || '#050d1b');
      }
      meta.setAttribute('content', skin === 'xmas' ? XMAS_THEME_COLORS[kind] : meta.getAttribute('data-classic-theme-color'));
    }
  }

  function syncToggleUi(skin) {
    const btn = document.getElementById('skin-toggle');
    if (!btn) return;
    const isXmas = skin === 'xmas';
    btn.setAttribute('aria-pressed', String(isXmas));
    btn.dataset.skinState = skin;
    btn.title = isXmas ? '当前：圣诞限定皮肤（点击一键切回星垂原版）' : '当前：星垂原版皮肤（点击一键开启圣诞限定）';
    const icon = btn.querySelector('.skin-icon');
    const labelFull = btn.querySelector('.skin-label-full');
    const labelShort = btn.querySelector('.skin-label-short');
    if (icon) icon.textContent = isXmas ? '❄' : '☾';
    if (labelFull) labelFull.textContent = isXmas ? '圣诞限定 · 切原版' : '星垂原版 · 切圣诞';
    if (labelShort) labelShort.textContent = isXmas ? '圣诞版' : '原版';
  }

  function showSkinToast(message) {
    let box = document.getElementById('skin-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'skin-toast';
      box.className = 'skin-toast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.append(box);
    }
    box.textContent = message;
    box.hidden = false;
    box.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      box.classList.remove('is-visible');
      window.setTimeout(() => { box.hidden = true; }, 220);
    }, 2200);
  }

  function shouldSnow() {
    if (currentSkin !== 'xmas') return false;
    if (motionQuery.matches || document.hidden) return false;
    const kind = detectPageKind();
    // Keep /model-status/ light-theme crisp without distracting snow over data tables
    if (kind === 'status' && document.documentElement.dataset.theme !== 'dark') return false;
    return true;
  }

  function resizeSnow() {
    if (!snowCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    snowWidth = window.innerWidth;
    snowHeight = window.innerHeight;
    snowCanvas.width = Math.max(1, Math.floor(snowWidth * dpr));
    snowCanvas.height = Math.max(1, Math.floor(snowHeight * dpr));
    snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const kind = detectPageKind();
    const isMobile = snowWidth < 768;
    const sparse = kind === 'status' || kind === 'shame' || kind === 'game';
    const targetCount = sparse ? (isMobile ? 14 : 22) : (isMobile ? 26 : 44);
    if (flakes.length !== targetCount) {
      flakes = Array.from({ length: targetCount }, () => ({
        x: Math.random() * snowWidth,
        y: Math.random() * snowHeight,
        r: 1.1 + Math.random() * 2.5,
        vy: 0.35 + Math.random() * 0.85,
        vx: -0.25 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        warm: Math.random() < 0.28,
        alpha: 0.32 + Math.random() * 0.55,
      }));
    }
  }

  function tickSnow() {
    if (!shouldSnow() || !snowCtx) {
      stopSnow();
      return;
    }
    snowCtx.clearRect(0, 0, snowWidth, snowHeight);
    for (const f of flakes) {
      f.phase += 0.014;
      f.y += f.vy;
      f.x += f.vx + Math.sin(f.phase) * 0.35;
      if (f.y > snowHeight + 8) {
        f.y = -8;
        f.x = Math.random() * snowWidth;
      }
      if (f.x < -8) f.x = snowWidth + 8;
      if (f.x > snowWidth + 8) f.x = -8;

      snowCtx.beginPath();
      snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      snowCtx.fillStyle = f.warm
        ? `rgba(255, 228, 168, ${f.alpha})`
        : `rgba(244, 249, 255, ${f.alpha})`;
      snowCtx.fill();
    }
    snowRaf = window.requestAnimationFrame(tickSnow);
  }

  function startSnow() {
    if (!shouldSnow() || !document.body) return;
    if (!snowCanvas) {
      snowCanvas = document.createElement('canvas');
      snowCanvas.id = 'xmas-snow-canvas';
      snowCanvas.setAttribute('aria-hidden', 'true');
      document.body.append(snowCanvas);
      snowCtx = snowCanvas.getContext('2d');
      resizeSnow();
    }
    snowCanvas.hidden = false;
    if (!snowRaf) snowRaf = window.requestAnimationFrame(tickSnow);
  }

  function stopSnow() {
    if (snowRaf) {
      window.cancelAnimationFrame(snowRaf);
      snowRaf = 0;
    }
    if (snowCanvas) {
      snowCtx?.clearRect(0, 0, snowWidth, snowHeight);
      snowCanvas.hidden = true;
    }
  }

  function syncSnow() {
    if (shouldSnow()) startSnow();
    else stopSnow();
  }

  function setSkin(nextSkin, announce = false) {
    const normalized = VALID_SKINS.has(nextSkin) ? nextSkin : DEFAULT_SKIN;
    currentSkin = normalized;
    document.documentElement.dataset.skin = normalized;
    try { localStorage.setItem(STORAGE_KEY, normalized); } catch {}
    applyMediaForSkin(normalized);
    syncToggleUi(normalized);
    syncSnow();
    window.dispatchEvent(new CustomEvent('lmg-skin-change', { detail: { skin: normalized } }));
    if (announce) {
      showSkinToast(normalized === 'xmas' ? '❄ 已切换至圣诞限定皮肤' : '☾ 已切回星垂原版皮肤');
    }
  }

  window.__lmgSkin = {
    get: () => currentSkin,
    set: (s, announce = true) => setSkin(s, announce),
    toggle: () => setSkin(currentSkin === 'xmas' ? 'classic' : 'xmas', true),
    syncMedia: () => applyMediaForSkin(currentSkin),
  };

  function boot() {
    applyMediaForSkin(currentSkin);
    syncToggleUi(currentSkin);
    syncSnow();

    const btn = document.getElementById('skin-toggle');
    if (btn && !btn.dataset.skinBound) {
      btn.dataset.skinBound = '1';
      btn.addEventListener('click', () => window.__lmgSkin.toggle());
    }

    // Re-sync snow when /model-status/ or /hall-of-shame/ toggles light/dark theme
    const themeBtn = document.getElementById('theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => window.setTimeout(syncSnow, 0));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener('resize', () => {
    if (snowCanvas && !snowCanvas.hidden) resizeSnow();
  }, { passive: true });
  document.addEventListener('visibilitychange', syncSnow);
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener('change', syncSnow);
  }
})();
