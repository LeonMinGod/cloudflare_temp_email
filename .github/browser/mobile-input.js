/* Native mobile input for the private Selkies viewer; no storage or telemetry. */
(() => {
  'use strict';
  if (location.pathname !== '/' || !matchMedia('(pointer: coarse)').matches) return;
  const STYLE = `
    #rak-mobile-input-bar{position:fixed;left:8px;right:8px;z-index:2147483000;display:flex;align-items:center;gap:5px;padding:7px;background:#17243bf5;border:1px solid #7186a0;border-radius:12px;box-shadow:0 3px 18px #0006;box-sizing:border-box;font:14px system-ui;color:white;touch-action:manipulation}
    #rak-mobile-input-bar[hidden]{display:none!important}
    #rak-mobile-input-bar #keyboard-input-assist{position:static!important;left:auto!important;top:auto!important;display:block!important;width:100%!important;min-width:0!important;flex:1;height:44px!important;opacity:1!important;border:1px solid #8295ad!important;border-radius:7px!important;padding:0 10px!important;background:#fff!important;color:#142239!important;caret-color:#142239!important;font:16px system-ui!important;pointer-events:auto!important;touch-action:manipulation!important;user-select:text!important;-webkit-user-select:text!important;box-sizing:border-box!important}
    #rak-mobile-input-bar button,#rak-mobile-input-open{height:44px;min-width:40px;padding:0 9px;border:1px solid #7c92ad;border-radius:7px;background:#294b77;color:white;font:14px system-ui;touch-action:manipulation}
    #rak-mobile-input-open{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147482999}
    #rak-mobile-input-open[hidden]{display:none!important}
    body.rak-mobile-input [data-virtual-keyboard-button]{display:none!important}
  `;
  function mount() {
    const field = document.getElementById('keyboard-input-assist');
    if (!field || document.getElementById('rak-mobile-input-bar')) return false;
    const style = document.createElement('style'); style.textContent = STYLE; document.head.append(style);
    document.body.classList.add('rak-mobile-input');
    const bar = document.createElement('div'); bar.id = 'rak-mobile-input-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '云端浏览器输入');
    field.type = 'text'; field.inputMode = 'text'; field.enterKeyHint = 'send'; field.tabIndex = 0;
    field.removeAttribute('aria-hidden'); field.removeAttribute('virtualkeyboardpolicy');
    field.virtualKeyboardPolicy = 'auto'; field.autocomplete = 'off'; field.autocapitalize = 'off';
    field.setAttribute('autocorrect', 'off'); field.spellcheck = false;
    field.placeholder = '点这里打开手机键盘'; field.setAttribute('aria-label', '输入到云端 Chrome');
    // Reuse the original input node and its IME handlers; typed text stays in the existing authenticated WebSocket.
    bar.append(field);
    const connected = () => !!window.webrtcInput?.isInputAttached?.();
    const key = (sym) => { if (connected()) { window.webrtcInput.send('kd,' + sym); window.webrtcInput.send('ku,' + sym); } };
    const makeButton = (text, label, action) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label);
      button.addEventListener('pointerdown', e => e.preventDefault());
      button.addEventListener('click', e => { e.preventDefault(); action(); }); return button;
    };
    bar.append(makeButton('⌫', '删除一个字符', () => key(65288)), makeButton('↵', '发送回车', () => key(65293)));
    const open = makeButton('⌨ 输入', '打开手机键盘', () => reveal()); open.id = 'rak-mobile-input-open'; open.hidden = true;
    bar.append(makeButton('收起', '收起输入栏', () => { field.blur(); bar.hidden = true; open.hidden = false; }));
    document.body.append(bar, open);
    function position() {
      const vv = window.visualViewport;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      bar.style.top = Math.max(4, bottom - bar.getBoundingClientRect().height - 8) + 'px';
    }
    function reveal() {
      bar.hidden = false; open.hidden = true; field.removeAttribute('aria-hidden'); position();
      // Synchronous in the user's click, with a visible native field. Do not postMessage or await before focus.
      field.focus({preventScroll:true});
    }
    field.addEventListener('focus', () => { field.removeAttribute('aria-hidden'); position(); });
    document.addEventListener('click', e => {
      const b = e.target.closest?.('button');
      if (!b || bar.contains(b) || b === open) return;
      if (b.hasAttribute('data-virtual-keyboard-button') || /^(Virtual Keyboard|虚拟键盘|螢幕小鍵盤)$/.test(b.getAttribute('aria-label') || '')) {
        e.preventDefault(); e.stopImmediatePropagation(); reveal();
      }
    }, true);
    window.addEventListener('resize', position, {passive:true});
    window.visualViewport?.addEventListener('resize', position, {passive:true});
    window.visualViewport?.addEventListener('scroll', position, {passive:true});
    position();
    return true;
  }
  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, {childList:true,subtree:true});
    window.setTimeout(() => observer.disconnect(), 60000);
  }
})();
