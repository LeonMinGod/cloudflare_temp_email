export const effectsStyles = `
#token-fluid { position: fixed; inset: 0; z-index: 1; width: 100%; height: 100%; pointer-events: none; opacity: .92; mix-blend-mode: screen; filter: saturate(1.2); transition: opacity .45s; }
#token-pointer-light { position: fixed; left: 0; top: 0; z-index: 4; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; pointer-events: none; opacity: 0; background: radial-gradient(circle,#fff 5%,#d9ffe0 26%,#83dba288 58%,transparent 75%); box-shadow: 0 0 10px #abedb399; mix-blend-mode: screen; }
[data-motion="idle"] #token-fluid { opacity: .2; }
[data-motion="reduced"] #token-fluid, [data-motion="unavailable"] #token-fluid { opacity: 0; }
@media (prefers-reduced-motion: reduce) { #token-fluid, #token-pointer-light { display: none; } }
@media (pointer: coarse) { #token-fluid { filter: none; } }
`;

export const effectsMarkup = '<canvas id="token-fluid" aria-hidden="true"></canvas><span id="token-pointer-light" aria-hidden="true"></span>';
export const effectsScripts = '<script src="/free-token/fluid-v2.js" defer></script><script src="/free-token/effects-v2.js" defer></script>';

function tokenScene() {
  'use strict';
  const canvas = document.getElementById('token-fluid');
  const light = document.getElementById('token-pointer-light');
  if (!canvas || !light) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(pointer: coarse)').matches;
  const lowPower = mobile && ((navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4));
  const budget = mobile ? {
    SIM_RESOLUTION: lowPower ? 48 : 64,
    DYE_RESOLUTION: lowPower ? 192 : 256,
    PRESSURE_ITERATIONS: lowPower ? 4 : 6,
    MAX_FPS: lowPower ? 24 : 30, MAX_DPR: 1, SHADING: false, START_SPLATS: 2,
  } : { SIM_RESOLUTION: 128, DYE_RESOLUTION: 768, PRESSURE_ITERATIONS: 16, MAX_FPS: 60, MAX_DPR: 1.5 };
  canvas.dataset.quality = mobile ? 'mobile' : 'desktop';
  const pointers = new Set();
  const timers = new Set();
  let engine;
  let running = false;
  let unavailable = false;
  let idle = false;
  let idleTimer;
  let hovering = false;
  let introduced = false;
  let resizeTimer;
  let lastMove = -Infinity;

  function interactive(target) {
    return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, label, dialog'));
  }
  function clearPointers() {
    pointers.forEach(id => engine?.end(id));
    pointers.clear();
    if (hovering) engine?.end('hover');
    hovering = false;
    light.style.opacity = '0';
  }
  function sync() {
    if (!engine && !unavailable && !motion.matches && !document.hidden) {
      try {
        engine = window.createFluidBackground(canvas, {
          TRANSPARENT: true, SUNRAYS: false, BLOOM: false,
          ...budget,
          DENSITY_DISSIPATION: 1.8, VELOCITY_DISSIPATION: .85,
          CURL: 26, SPLAT_RADIUS: .13, SPLAT_FORCE: 3600,
          PALETTE: [[.08,1.45,.75], [.24,1.25,.82], [1.25,1.15,.35], [.55,1.55,1.05], [.75,1.25,.68]],
        });
        canvas.dataset.renderer = 'webgl';
      } catch {
        unavailable = true;
        canvas.dataset.renderer = 'unavailable';
      }
    }
    const next = Boolean(engine) && !unavailable && !motion.matches && !document.hidden && !idle;
    if (running !== next) {
      engine?.setPaused(!next);
      running = next;
    }
    if (!running) {
      clearPointers();
      clearTimeout(idleTimer);
      timers.forEach(clearTimeout);
      timers.clear();
    }
    document.body.dataset.motion = unavailable ? 'unavailable' : motion.matches ? 'reduced' :
      document.hidden ? 'hidden' : idle ? 'idle' : 'playing';
  }
  function activity() {
    if (idle) { idle = false; sync(); }
    clearTimeout(idleTimer);
    if (running) idleTimer = setTimeout(() => { idle = true; sync(); }, mobile ? 2500 : 12000);
  }
  function showLight(event) {
    light.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    light.style.opacity = '1';
  }
  window.addEventListener('pointerdown', event => {
    if (interactive(event.target) || motion.matches || unavailable ||
        (event.pointerType === 'mouse' && event.button !== 0)) return;
    activity();
    if (!running) return;
    if (hovering) { engine.end('hover'); hovering = false; }
    pointers.add(event.pointerId);
    engine.start(event.pointerId, event.clientX, event.clientY);
    showLight(event);
  }, { passive: true });
  window.addEventListener('pointermove', event => {
    if (motion.matches || unavailable) return;
    if (mobile && event.timeStamp - lastMove < 1000 / budget.MAX_FPS) return;
    lastMove = event.timeStamp;
    if (pointers.has(event.pointerId)) {
      activity();
      if (running) {
        engine.move(event.pointerId, event.clientX, event.clientY);
        showLight(event);
      }
    } else if (event.pointerType === 'mouse' && event.buttons === 0 && !interactive(event.target)) {
      activity();
      if (!running) return;
      if (!hovering) { engine.start('hover', event.clientX, event.clientY); hovering = true; }
      engine.move('hover', event.clientX, event.clientY);
      showLight(event);
    } else if (hovering) {
      engine?.end('hover');
      hovering = false;
      light.style.opacity = '0';
    }
  }, { passive: true });
  function endPointer(event) {
    engine?.end(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointers.size && !hovering) light.style.opacity = '0';
  }
  window.addEventListener('pointerup', endPointer, { passive: true });
  window.addEventListener('pointercancel', endPointer, { passive: true });
  window.addEventListener('blur', clearPointers);
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => engine?.resize(), 150);
  }, { passive: true });
  function resume() {
    idle = false;
    sync();
    activity();
    if (!introduced && running) {
      introduced = true;
      (mobile ? [[.18,.56]] : [[.18,.56], [.77,.72], [.32,.83]]).forEach(([x, y], index) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!running) return;
          engine.start('intro', innerWidth * x, innerHeight * y);
          engine.end('intro');
        }, 400 + index * 400);
        timers.add(timer);
      });
    }
  }
  document.addEventListener('visibilitychange', () => document.hidden ? sync() : resume());
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', () => { idle = true; sync(); });
  motion.addEventListener('change', resume);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    unavailable = true;
    sync();
    engine = undefined;
    canvas.dataset.renderer = 'unavailable';
  });
  canvas.addEventListener('webglcontextrestored', () => { unavailable = false; resume(); });
  resume();
}

export default `(${tokenScene.toString()})();`;
