(() => {
  'use strict';
  const canvas = document.getElementById('fluid');
  const playground = document.getElementById('playground');
  const castButton = document.getElementById('cast');
  const toggleButton = document.getElementById('toggle');
  const toggleLabel = document.getElementById('toggle-label');
  const hint = document.getElementById('hint');
  const pointerLight = document.getElementById('pointer-light');
  const palmImage = document.getElementById('scene-image');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointers = new Set();
  const timers = new Set();
  let engine;
  let running = false;
  let enabled = true;
  let unavailable = false;
  let idle = false;
  let idleTimer;
  let introPlayed = false;
  let hovering = false;
  const motionSamples = new Map();

  function positionPalm() {
    if (!palmImage.naturalWidth) return;
    const scale = Math.max(innerWidth / palmImage.naturalWidth, innerHeight / palmImage.naturalHeight);
    const width = palmImage.naturalWidth * scale;
    const height = palmImage.naturalHeight * scale;
    const portrait = window.matchMedia('(max-width: 767px), (orientation: portrait)').matches;
    const style = palmImage.parentElement.style;
    style.setProperty('--palm-x', `${(innerWidth - width) * (portrait ? .5 : .7) + width * (portrait ? .43 : .296)}px`);
    style.setProperty('--palm-y', `${(innerHeight - height) / 2 + height * (portrait ? .67 : .635)}px`);
    style.setProperty('--palm-rx', `${Math.max(42, Math.min(110, width * .065))}px`);
    style.setProperty('--palm-ry', `${Math.max(35, Math.min(84, height * .09))}px`);
    const orb = document.getElementById('spirit-orb');
    if (orb) {
      orb.style.left = style.getPropertyValue('--palm-x');
      orb.style.top = style.getPropertyValue('--palm-y');
      const diameter = Math.max(64, Math.min(204, width * (portrait ? .25 : .13)));
      orb.style.width = `${diameter}px`;
      orb.style.height = `${diameter}px`;
    }
  }
  function predict(event) {
    const samples = event.getCoalescedEvents?.() || [];
    const sample = samples.length ? samples[samples.length - 1] : event;
    const previous = samples.length > 1 ? samples[samples.length - 2] : motionSamples.get(event.pointerId);
    let vx = 0, vy = 0;
    const dt = previous ? sample.timeStamp - previous.timeStamp : 0;
    if (dt > 0 && dt < 80) {
      vx = (sample.clientX - previous.clientX) / dt;
      vy = (sample.clientY - previous.clientY) / dt;
    }
    motionSamples.set(event.pointerId, {clientX: sample.clientX, clientY: sample.clientY, timeStamp: sample.timeStamp});
    const leadMs = 9;
    let dx = vx * leadMs, dy = vy * leadMs;
    const distance = Math.hypot(dx, dy);
    const limit = event.pointerType === 'touch' ? 12 : 22;
    if (distance > limit) { dx *= limit / distance; dy *= limit / distance; }
    return {x: Math.max(0, Math.min(innerWidth, sample.clientX + dx)), y: Math.max(0, Math.min(innerHeight, sample.clientY + dy))};
  }
  function showPointer(x, y) {
    pointerLight.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    pointerLight.style.opacity = '1';
  }

  function stopIntro() {
    timers.forEach(window.clearTimeout);
    timers.clear();
  }
  function endPointers() {
    document.body.classList.remove('interacting');
    pointerLight.style.opacity = '0';
    motionSamples.clear();
    if (hovering) { engine?.end('hover'); hovering = false; }
    pointers.forEach(id => {
      engine?.end(id);
      if (playground.hasPointerCapture(id)) playground.releasePointerCapture(id);
    });
    pointers.clear();
  }
  function sync() {
    if (!engine && !unavailable && enabled && !motionQuery.matches && !document.hidden) {
      try {
        engine = window.createFluidBackground(canvas, {
          TRANSPARENT: true,
          SUNRAYS: false,
          BLOOM: false,
          DYE_RESOLUTION: window.matchMedia('(pointer: coarse)').matches ? 384 : 768,
          PRESSURE_ITERATIONS: 16,
          DENSITY_DISSIPATION: 1.05,
          VELOCITY_DISSIPATION: .85,
          CURL: 32,
          SPLAT_RADIUS: .18,
          SPLAT_FORCE: 5200,
          PALETTE: [[.12,.9,.58], [.25,.78,.85], [.7,.58,.19]],
        });
        canvas.dataset.renderer = 'webgl';
      } catch (error) {
        unavailable = true;
        canvas.dataset.renderer = 'unavailable';
        console.warn('流光暂不可用，保留原封面。', error);
      }
    }
    const shouldRun = Boolean(engine) && enabled && !unavailable && !motionQuery.matches && !document.hidden && !idle;
    if (running !== shouldRun) {
      engine?.setPaused(!shouldRun);
      running = shouldRun;
    }
    if (!running) {
      endPointers();
      stopIntro();
      window.clearTimeout(idleTimer);
    }
    const state = unavailable ? 'unavailable' : motionQuery.matches ? 'reduced' :
      !enabled ? 'off' : document.hidden ? 'hidden' : idle ? 'idle' : 'playing';
    document.body.dataset.motion = state;
    document.body.dataset.effects = enabled ? 'on' : 'off';
    toggleButton.disabled = castButton.disabled = unavailable || motionQuery.matches;
    toggleButton.setAttribute('aria-pressed', String(enabled));
    toggleLabel.textContent = unavailable || motionQuery.matches ? '静态封面' : enabled ? '流光：开' : '流光：关';
    hint.textContent = unavailable ? '原封面静静相候。' : motionQuery.matches ? '已跟随系统偏好，静观此境。' :
      !enabled ? '流光已收起，静观此境。' : window.matchMedia('(pointer: coarse)').matches ?
      '按住拖动，让青玉灵气随指而生。' : '移动鼠标或按住拖动，引动青玉灵气。';
  }
  function activity() {
    if (idle) { idle = false; sync(); }
    window.clearTimeout(idleTimer);
    if (running) idleTimer = window.setTimeout(() => { idle = true; sync(); }, 12000);
  }
  function intro() {
    stopIntro();
    if (!running) return;
    introPlayed = true;
    if (hovering) { engine.end('hover'); hovering = false; }
    const portrait = window.matchMedia('(max-width: 767px), (orientation: portrait)').matches;
    const points = portrait ? [[.12,.56], [.88,.7], [.24,.82]] : [[.12,.67], [.5,.79], [.83,.73]];
    const bounds = playground.getBoundingClientRect();
    points.forEach(([x,y], index) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!running) return;
        engine.start('intro', bounds.width * x, bounds.height * y);
        engine.end('intro');
        activity();
      }, 400 + index * 400);
      timers.add(timer);
    });
  }
  playground.addEventListener('pointerdown', event => {
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    if (!enabled || unavailable || motionQuery.matches || (event.pointerType === 'mouse' && event.button !== 0)) return;
    stopIntro();
    activity();
    if (!running) return;
    introPlayed = true;
    if (hovering) { engine.end('hover'); hovering = false; }
    pointers.add(event.pointerId);
    motionSamples.set(event.pointerId, {clientX:event.clientX,clientY:event.clientY,timeStamp:event.timeStamp});
    showPointer(event.clientX, event.clientY);
    document.body.classList.add('interacting');
    engine.start(event.pointerId, event.clientX, event.clientY);
    try { playground.setPointerCapture(event.pointerId); } catch { /* Window listeners remain active. */ }
  });
  window.addEventListener('pointermove', event => {
    if (!enabled || unavailable || motionQuery.matches) return;
    const point = predict(event);
    if (pointers.has(event.pointerId)) {
      activity();
      if (running) { engine.move(event.pointerId, point.x, point.y); showPointer(point.x, point.y); }
    } else if (event.pointerType === 'mouse' && event.buttons === 0 &&
        event.target instanceof Element && playground.contains(event.target)) {
      activity();
      if (!running) return;
      if (!hovering) {
        engine.start('hover', point.x, point.y);
        hovering = true;
      }
      engine.move('hover', point.x, point.y);
      showPointer(point.x, point.y);
    } else if (hovering) {
      engine?.end('hover');
      hovering = false;
      pointerLight.style.opacity = '0';
      motionSamples.delete(event.pointerId);
    }
  }, { passive: true });
  function endPointer(event) {
    engine?.end(event.pointerId);
    pointers.delete(event.pointerId);
    motionSamples.delete(event.pointerId);
    if (!hovering && !pointers.size) pointerLight.style.opacity = '0';
    if (!pointers.size) document.body.classList.remove('interacting');
    if (playground.hasPointerCapture(event.pointerId)) playground.releasePointerCapture(event.pointerId);
  }
  window.addEventListener('pointerup', endPointer, { passive: true });
  window.addEventListener('pointercancel', endPointer, { passive: true });
  playground.addEventListener('lostpointercapture', endPointer);
  window.addEventListener('blur', endPointers);
  window.addEventListener('resize', () => { engine?.resize(); positionPalm(); }, { passive: true });
  palmImage.addEventListener('load', positionPalm);
  positionPalm();
  toggleButton.addEventListener('click', () => {
    enabled = !enabled;
    idle = false;
    sync();
    activity();
  });
  castButton.addEventListener('click', () => {
    enabled = true;
    idle = false;
    sync();
    activity();
    intro();
  });
  window.addEventListener('spirit-orb:cast', event => {
    if (!enabled || unavailable || motionQuery.matches) return;
    stopIntro();
    activity();
    if (!running) return;
    const { x, y } = event.detail;
    engine.start('orb-cast', x, y);
    engine.move('orb-cast', x + 6, y - 4);
    engine.end('orb-cast');
  });
  function resume() {
    idle = false;
    sync();
    activity();
    if (!introPlayed) intro();
  }
  document.addEventListener('visibilitychange', () => document.hidden ? sync() : resume());
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', () => { idle = true; sync(); });
  motionQuery.addEventListener('change', resume);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    unavailable = true;
    sync();
    engine = undefined;
    canvas.dataset.renderer = 'unavailable';
  });
  canvas.addEventListener('webglcontextrestored', () => { unavailable = false; resume(); });
  resume();
})();
