// ==UserScript==
// @name         Torn Companion - OC Utility Manager
// @namespace    https://torn-companion.workers.dev/
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/eKININJ4x/torn-oc-utility-manager/main/oc-utility-manager.meta.js
// @downloadURL  https://raw.githubusercontent.com/eKININJ4x/torn-oc-utility-manager/main/oc-utility-manager.user.js
// @description  Helps faction staff identify and issue missing OC 2.0 armory items.
// @author       Torn Companion
// @match        https://www.torn.com/factions.php*
// @connect      api.torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // Torn Companion OC Utility Manager
  // Public release v1.1.0.
  // Compatible with Tampermonkey and TornPDA.

  const SCRIPT_VERSION = '1.1.0';
  const STORAGE_KEY = 'tc_oc_api_key';
  const PENDING_KEY = 'tc_oc_pending_issue';
  const PANEL_ID = 'tc-oc-manager';
  const BUTTON_ID = 'tc-oc-button';
  const APPEARANCE_KEY = 'tc_oc_button_appearance_v1';
  const POSITION_KEY = 'tc_oc_button_position_v1';
  const LAUNCHER_ID = 'tc-oc-launcher';
  let movement = null;

    function makeMovableButton({ anchor, handle, read, write, panel, report }) {
        const gap = 8;
        const original = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(key => [key, anchor.style[key]]));
        let saved = null;
        let active = null;
        let disposed = false;
        let touched = false;
        let writes = Promise.resolve();
        const view = () => ({
            width: Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth),
            height: Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight)
        });
        const clamp = (n, low, high) => Math.max(low, Math.min(Math.max(low, high), n));
        const rect = () => anchor.getBoundingClientRect();
        function placePanel() {
            const box = panel?.();
            if (!box || box.hidden) return;
            const size = view();
            box.style.maxWidth = Math.max(0, size.width - gap * 2) + 'px';
            let bounds = box.getBoundingClientRect();
            if (bounds.height > size.height - gap * 2) {
                box.style.maxHeight = Math.max(60, size.height - gap * 2) + 'px';
                bounds = box.getBoundingClientRect();
            }
            const button = rect();
            const below = size.height - button.bottom - gap * 2;
            const above = button.top - gap * 2;
            const top = below >= bounds.height || below >= above ? button.bottom + gap : button.top - gap - bounds.height;
            box.style.left = clamp(button.left, gap, size.width - bounds.width - gap) + 'px';
            box.style.top = clamp(top, gap, size.height - bounds.height - gap) + 'px';
            box.style.right = 'auto'; box.style.bottom = 'auto';
        }
        function move(left, top) {
            const size = view(), bounds = rect();
            anchor.style.left = Math.round(clamp(left, gap, size.width - bounds.width - gap) * 100) / 100 + 'px';
            anchor.style.top = Math.round(clamp(top, gap, size.height - bounds.height - gap) * 100) / 100 + 'px';
            anchor.style.right = 'auto'; anchor.style.bottom = 'auto';
            placePanel();
        }
        function restore() {
            if (!saved) {
                for (const [key, value] of Object.entries(original)) anchor.style[key] = value;
                const bounds = rect(); move(bounds.left, bounds.top);
            } else {
                const size = view(), bounds = rect();
                move(gap + saved.x * Math.max(0, size.width - bounds.width - gap * 2),
                    gap + saved.y * Math.max(0, size.height - bounds.height - gap * 2));
            }
        }
        function persist(value) {
            writes = writes.then(async () => {
                if (disposed) return false;
                try { await write(value); report?.('Button position saved.'); return true; }
                catch { report?.('Moved for this page, but the position could not be saved.'); return false; }
            });
            return writes;
        }
        function remember() {
            const size = view(), bounds = rect();
            saved = {
                version: 1,
                x: clamp((bounds.left - gap) / Math.max(1, size.width - bounds.width - gap * 2), 0, 1),
                y: clamp((bounds.top - gap) / Math.max(1, size.height - bounds.height - gap * 2), 0, 1)
            };
            return persist(JSON.stringify(saved));
        }
        function release() {
            const id = active?.id; active = null;
            try { if (id !== undefined) handle.releasePointerCapture?.(id); } catch {}
            handle.style.cursor = 'grab';
        }
        function cancel() { if (active) { release(); restore(); } }
        function down(event) {
            if (event.button !== 0 || active) return;
            touched = true;
            event.preventDefault(); event.stopPropagation();
            const bounds = rect();
            active = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top, moved: false };
            handle.focus({ preventScroll: true }); handle.style.cursor = 'grabbing';
            try { handle.setPointerCapture?.(event.pointerId); } catch {}
        }
        function pointerMove(event) {
            if (!active || event.pointerId !== active.id) return;
            const dx = event.clientX - active.x, dy = event.clientY - active.y;
            if (!active.moved && Math.hypot(dx, dy) < 4) return;
            active.moved = true; event.preventDefault();
            move(active.left + dx, active.top + dy);
        }
        function up(event) {
            if (!active || event.pointerId !== active.id) return;
            const moved = active.moved; release();
            if (moved) remember();
        }
        function key(event) {
            const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (!arrows[event.key]) return;
            touched = true; event.preventDefault(); event.stopPropagation();
            const bounds = rect(), step = event.shiftKey ? 10 : 2, [x, y] = arrows[event.key];
            move(bounds.left + x * step, bounds.top + y * step); remember();
        }
        function click(event) { event.preventDefault(); event.stopPropagation(); }
        function resize() { cancel(); restore(); }
        handle.addEventListener('pointerdown', down);
        handle.addEventListener('keydown', key);
        handle.addEventListener('click', click);
        handle.addEventListener('lostpointercapture', cancel);
        window.addEventListener('pointermove', pointerMove, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('blur', cancel);
        window.addEventListener('resize', resize);
        restore();
        const ready = Promise.resolve().then(read).then(value => {
            if (disposed || touched) return;
            const parsed = typeof value === 'string' ? JSON.parse(value || 'null') : value;
            if (parsed?.version === 1 && [parsed.x, parsed.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) saved = parsed;
            restore();
        }).catch(() => { if (!disposed && !touched) restore(); });
        return {
            ready, placePanel, reflow() { if (!active) restore(); },
            async reset() {
                if (disposed) return false;
                cancel(); touched = true; saved = null; restore();
                const ok = await persist('');
                if (ok) report?.('Default button position restored.');
                return ok;
            },
            stop() {
                cancel(); disposed = true;
                handle.removeEventListener('pointerdown', down); handle.removeEventListener('keydown', key);
                handle.removeEventListener('click', click); handle.removeEventListener('lostpointercapture', cancel);
                window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel);
                window.removeEventListener('resize', resize);
            }
        };
    }

  const isFactionPage = () => location.pathname.includes('factions.php');

  const isCrimesPage = () =>
    isFactionPage() &&
    (
      location.hash.includes('crimes') ||
      document.body.innerText.includes('Organized Crimes') ||
      document.body.innerText.includes('Organised Crimes')
    );

  const isArmoryPage = () =>
    isFactionPage() &&
    (
      location.hash.toLowerCase().includes('/tab=armoury') ||
      location.hash.toLowerCase().includes('/tab=armory') ||
      location.hash.toLowerCase().includes('sub=temporary') ||
      location.hash.toLowerCase().includes('sub=medical') ||
      location.hash.toLowerCase().includes('sub=utilities') ||
      location.hash.toLowerCase().includes('sub=weapons') ||
      location.hash.toLowerCase().includes('sub=armor') ||
      location.hash.toLowerCase().includes('sub=consumables') ||
      location.hash.toLowerCase().includes('sub=drugs') ||
      location.hash.toLowerCase().includes('sub=boosters') ||
      location.hash.toLowerCase().includes('sub=loot') ||
      document.body.innerText.includes('Faction Armory') ||
      document.body.innerText.includes('Faction Armoury')
    );

  const gmGet = async (key, fallback = '') => {
    try {
      if (typeof GM_getValue === 'function') return await GM_getValue(key, fallback);
    } catch {}
    return localStorage.getItem(key) ?? fallback;
  };

  const gmSet = async (key, value) => {
    try {
      if (typeof GM_setValue === 'function') return await GM_setValue(key, value);
    } catch {}
    localStorage.setItem(key, value);
  };

  const readButtonAppearance = async () => {
    try {
      const raw = await gmGet(APPEARANCE_KEY, '');
      const saved = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw;
      return saved && /^#[0-9a-f]{6}$/i.test(saved.background) && /^#[0-9a-f]{6}$/i.test(saved.text) ? saved : null;
    } catch { return null; }
  };

  const paintButton = (button, appearance) => {
    if (!button) return;
    button.style.background = appearance?.background || 'linear-gradient(180deg,#a855f7,#7c3aed)';
    button.style.color = appearance?.text || '#ffffff';
  };

  const apiRequest = async (path, key) => {
    const url = `https://api.torn.com/v2/${path}`;

    if (typeof GM_xmlhttpRequest === 'function') {
      return await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: {
            Authorization: `ApiKey ${key}`,
            Accept: 'application/json'
          },
          onload: (res) => {
            try {
              const data = JSON.parse(res.responseText || '{}');
              if (res.status < 200 || res.status >= 300 || data.error) {
                reject(new Error(apiError(data, res.status)));
                return;
              }
              resolve(data);
            } catch (e) {
              reject(e);
            }
          },
          onerror: () => reject(new Error('Unable to reach the Torn API.'))
        });
      });
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `ApiKey ${key}`,
        Accept: 'application/json'
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(apiError(data, res.status));
    return data;
  };

  const apiError = (data, status) => {
    const err = data?.error;
    const code = Number(err?.code);

    if (code === 7) {
      return 'Faction API access required. Ask faction leadership to enable Faction API Access for your role.';
    }
    if (code === 16) {
      return 'Your API key does not have enough access for faction crimes.';
    }

    return err?.error || err?.message || (typeof err === 'string' ? err : null) ||
      (status === 403 ? 'Faction crimes access was denied.' : null) ||
      'Torn API request failed.';
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const injectStyles = () => {
    if (document.getElementById('tc-oc-style')) return;
    const style = document.createElement('style');
    style.id = 'tc-oc-style';
    style.textContent = `
      #${LAUNCHER_ID}{position:fixed;right:18px;top:18px;z-index:99998;display:flex;align-items:center;gap:6px}
      #${LAUNCHER_ID} .tc-drag-handle{border:1px solid #72528c;border-radius:9px;background:#21182e;color:#e4d4f4;padding:9px 7px;font:700 20px/1 Arial,sans-serif;cursor:grab;touch-action:none;user-select:none}
      #${LAUNCHER_ID} .tc-drag-handle:focus-visible{outline:2px solid #c699ff;outline-offset:2px}
      #${BUTTON_ID}{
        position:fixed;right:18px;top:18px;z-index:99998;
        border:0;border-radius:999px;padding:12px 16px;
        background:linear-gradient(180deg,#a855f7,#7c3aed);
        color:white;font:700 14px/1.2 Arial,sans-serif;
        box-shadow:0 10px 28px rgba(0,0,0,.35);cursor:pointer
      }
      #${PANEL_ID}{
        position:fixed;right:18px;top:70px;z-index:99999;
        width:min(430px,calc(100vw - 24px));max-height:72vh;overflow:hidden;
        background:#101722;color:#edf3fa;border:1px solid #2b3b51;
        border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.5);
        font-family:Arial,sans-serif
      }
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .tc-head{display:flex;align-items:center;justify-content:space-between;
        gap:12px;padding:14px 16px;border-bottom:1px solid #253246}
      #${PANEL_ID} .tc-title{font-weight:800;font-size:16px}
      #${PANEL_ID} .tc-sub{color:#8f9bae;font-size:11px;margin-top:2px}
      #${PANEL_ID} .tc-close{border:0;background:transparent;color:#9facbd;font-size:22px;cursor:pointer}
      #${PANEL_ID} .tc-tools{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid #253246}
      #${PANEL_ID} button.tc-btn{border:1px solid #35445b;background:#172334;color:#dce4ee;
        border-radius:9px;padding:8px 10px;font-weight:700;cursor:pointer}
      #${PANEL_ID} button.tc-primary{background:#6d28d9;border-color:#7c3aed;color:white}
      #${PANEL_ID} .tc-body{overflow:auto;max-height:calc(72vh - 112px)}
      #${PANEL_ID} .tc-msg{padding:14px 16px;color:#aebbc9;font-size:13px}
      #${PANEL_ID} .tc-row{display:grid;grid-template-columns:1fr auto;gap:10px;
        padding:12px 14px;border-top:1px solid rgba(255,255,255,.06)}
      #${PANEL_ID} .tc-member{font-weight:800;font-size:13px}
      #${PANEL_ID} .tc-item{font-size:13px;margin-top:4px}
      #${PANEL_ID} .tc-meta{font-size:11px;color:#8f9bae;margin-top:4px}
      #${PANEL_ID} .tc-badge{align-self:center;border:1px solid #5b3440;background:#2a171d;
        color:#ffb4c0;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800}
      #${PANEL_ID} .tc-statuses{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      #${PANEL_ID} .tc-stock{border:1px solid #28533f;background:#13271f;color:#8fe1b2;
        border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800}
      #${PANEL_ID} .tc-stock.none{border-color:#5b3440;background:#2a171d;color:#ffb4c0}
      #${PANEL_ID} .tc-settings{padding:14px}
      #${PANEL_ID} input{width:100%;background:#0b111a;color:#edf3fa;border:1px solid #35445b;
        border-radius:9px;padding:10px;margin:8px 0 10px}
      #tc-oc-pending{
        position:fixed;right:18px;top:18px;z-index:99999;width:min(390px,calc(100vw - 24px));
        background:#101722;color:#edf3fa;border:1px solid #2b3b51;border-radius:14px;
        box-shadow:0 18px 50px rgba(0,0,0,.45);padding:14px;font-family:Arial,sans-serif
      }
      #tc-oc-pending .tc-p-title{font-weight:800;font-size:15px;margin-bottom:4px}
      #tc-oc-pending .tc-p-sub{font-size:12px;color:#9facbd;line-height:1.45}
      #tc-oc-pending .tc-p-actions{display:flex;gap:8px;margin-top:11px}
      #tc-oc-pending button{border:1px solid #35445b;background:#172334;color:#dce4ee;
        border-radius:9px;padding:8px 10px;font-weight:800;cursor:pointer}
      #tc-oc-pending button.tc-p-primary{background:#6d28d9;border-color:#7c3aed;color:white}
      .tc-oc-highlight{outline:3px solid #a855f7!important;outline-offset:2px!important;border-radius:6px!important}
      .tc-oc-required-tab{
        background:linear-gradient(180deg,#34d399,#16a34a)!important;
        color:#06140c!important;
        border-color:#4ade80!important;
        box-shadow:0 0 0 2px rgba(74,222,128,.30),0 0 18px rgba(34,197,94,.45)!important;
        border-radius:8px!important;
        font-weight:900!important;
        transition:background .18s ease,box-shadow .18s ease!important
      }
      .tc-oc-required-tab *{color:#06140c!important}
      @media(max-width:700px){
        #${LAUNCHER_ID}{right:max(10px,env(safe-area-inset-right));top:clamp(72px,10vh,96px)}
        #${BUTTON_ID}{
          position:fixed;
          right:max(10px,env(safe-area-inset-right));
          top:clamp(72px,10vh,96px);
          bottom:auto;
          padding:8px 11px;
          font-size:clamp(11px,3vw,13px);
          box-shadow:0 6px 18px rgba(0,0,0,.35)
        }

        #${PANEL_ID}{
          position:fixed;
          left:max(8px,env(safe-area-inset-left));
          right:max(8px,env(safe-area-inset-right));
          top:clamp(118px,15vh,145px);
          bottom:auto;
          width:auto;
          max-width:none;
          height:auto;
          max-height:min(58dvh,520px);
          border-radius:12px;
          display:flex;
          flex-direction:column;
        }

        #${PANEL_ID} .tc-head{
          padding:9px 11px;
          flex:0 0 auto;
        }
        #${PANEL_ID} .tc-title{font-size:clamp(13px,3.6vw,15px)}
        #${PANEL_ID} .tc-sub{font-size:clamp(9px,2.6vw,11px)}
        #${PANEL_ID} .tc-tools{
          padding:7px;
          gap:5px;
          flex-wrap:wrap;
          flex:0 0 auto;
        }
        #${PANEL_ID} button.tc-btn{
          padding:6px 8px;
          font-size:clamp(10px,2.8vw,12px)
        }
        #${PANEL_ID} .tc-body{
          flex:0 1 auto;
          min-height:0;
          max-height:calc(min(58dvh,520px) - 92px);
          overflow:auto;
          -webkit-overflow-scrolling:touch;
        }
        #${PANEL_ID} .tc-row{padding:9px 10px;gap:6px}
        #${PANEL_ID} .tc-member{font-size:clamp(11px,3vw,13px)}
        #${PANEL_ID} .tc-item{font-size:clamp(11px,3vw,13px)}
        #${PANEL_ID} .tc-meta{font-size:clamp(9px,2.5vw,11px)}
        #${PANEL_ID} .tc-badge,#${PANEL_ID} .tc-stock{
          font-size:clamp(8px,2.2vw,10px);
          padding:4px 6px
        }

        #tc-oc-pending{
          position:fixed;
          left:max(8px,env(safe-area-inset-left));
          right:max(8px,env(safe-area-inset-right));
          top:clamp(118px,15vh,145px);
          bottom:auto;
          width:auto;
          max-width:none;
          max-height:calc(100dvh - clamp(138px,18vh,165px) - env(safe-area-inset-bottom));
          overflow:auto;
          -webkit-overflow-scrolling:touch;
          padding:10px;
          border-radius:12px;
        }

        #tc-oc-pending .tc-p-title{font-size:clamp(13px,3.6vw,15px)}
        #tc-oc-pending .tc-p-sub{font-size:clamp(10px,2.8vw,12px)}
        #tc-oc-pending .tc-p-actions{
          gap:6px;
          margin-top:8px;
          flex-wrap:wrap
        }
        #tc-oc-pending button{
          padding:7px 9px;
          font-size:clamp(10px,2.8vw,12px);
          max-width:100%;
        }
      }

      @media(max-width:420px){
        #${LAUNCHER_ID}{top:clamp(68px,9vh,88px);right:max(8px,env(safe-area-inset-right))}
        #${BUTTON_ID}{
          top:clamp(68px,9vh,88px);
          right:max(8px,env(safe-area-inset-right))
        }

        #${PANEL_ID},
        #tc-oc-pending{
          left:max(6px,env(safe-area-inset-left));
          right:max(6px,env(safe-area-inset-right));
          top:clamp(108px,14vh,132px);
        }
      }

      @media(max-height:700px) and (max-width:700px){
        #${BUTTON_ID}{top:64px}
        #${LAUNCHER_ID}{top:64px}
        #${PANEL_ID},
        #tc-oc-pending{top:102px}
      }
    `;
    document.head.appendChild(style);
  };

  const createPanel = () => {
    injectStyles();

    if (!document.getElementById(BUTTON_ID)) {
      const btn = document.createElement('button');
      btn.id = BUTTON_ID;
      btn.type = 'button';
      btn.style.position = 'static';
      btn.textContent = 'TC OC';
      btn.title = 'Open Torn Companion OC Utility Manager';
      btn.addEventListener('click', () => {
        const panel = document.getElementById(PANEL_ID);
        if (panel) {
          panel.remove();
        } else {
          openPanel();
        }
      });
      movement?.stop();
      document.getElementById(LAUNCHER_ID)?.remove();
      const launcher = document.createElement('div'); launcher.id = LAUNCHER_ID;
      const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'tc-drag-handle';
      handle.textContent = '⠿'; handle.setAttribute('aria-label', 'Move TC OC button');
      handle.title = 'Drag to move. Arrow keys move; Shift moves faster.';
      launcher.append(btn, handle); document.body.appendChild(launcher);
      movement = makeMovableButton({
        anchor: launcher, handle,
        read: () => gmGet(POSITION_KEY, ''), write: value => gmSet(POSITION_KEY, value),
        panel: () => document.getElementById(PANEL_ID),
        report: text => { const status = document.getElementById('tc-oc-position-status'); if (status) status.textContent = text; }
      });
      readButtonAppearance().then(appearance => paintButton(btn, appearance));
    }
  };

  const openPanel = async () => {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="tc-head">
        <div>
          <div class="tc-title">Torn Companion · OC Utility Manager</div>
          <div class="tc-sub">Build ${esc(SCRIPT_VERSION)} · OC 2.0 item manager</div>
        </div>
        <button class="tc-close" aria-label="Close">×</button>
      </div>
      <div class="tc-tools">
        <button class="tc-btn tc-primary" data-action="refresh">Refresh</button>
        <button class="tc-btn" data-action="settings">Settings</button>
      </div>
      <div class="tc-body"><div class="tc-msg">Open the panel and press Refresh to scan current OC requirements.</div></div>
    `;

    document.body.appendChild(panel);
    movement?.placePanel();

    panel.querySelector('.tc-close').addEventListener('click', () => panel.remove());
    panel.querySelector('[data-action="refresh"]').addEventListener('click', refresh);
    panel.querySelector('[data-action="settings"]').addEventListener('click', showSettings);

    const key = await gmGet(STORAGE_KEY, '');
    if (!key) showSettings();
  };

  const showSettings = async () => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const key = await gmGet(STORAGE_KEY, '');
    const appearance = await readButtonAppearance();
    const body = panel.querySelector('.tc-body');
    body.innerHTML = `
      <div class="tc-settings">
        <div style="font-weight:800">Torn API key</div>
        <div class="tc-meta">Stored only in this userscript/browser.</div>
        <input id="tc-oc-key" type="password" autocomplete="off" placeholder="Paste API key" value="${esc(key)}">
        <button class="tc-btn tc-primary" id="tc-oc-save-key">Save API key</button>
      </div>
      <div class="tc-settings" style="border-top:1px solid #253246">
        <div style="font-weight:800">Button colours</div>
        <p class="tc-meta">Choose colours for your TC OC button. Saved choices stay in this userscript/browser through updates.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label for="tc-oc-button-background">Background<input type="color" id="tc-oc-button-background" value="${esc(appearance?.background || '#7c3aed')}" style="height:42px;padding:4px"></label>
          <label for="tc-oc-button-text">Text<input type="color" id="tc-oc-button-text" value="${esc(appearance?.text || '#ffffff')}" style="height:42px;padding:4px"></label>
        </div>
        <div class="tc-meta" style="margin-bottom:8px">Preview</div>
        <span id="tc-oc-button-preview" style="display:inline-block;border-radius:999px;padding:12px 16px;font:700 14px/1.2 Arial,sans-serif">TC OC</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button type="button" class="tc-btn tc-primary" id="tc-oc-save-colours">Save colours</button>
          <button type="button" class="tc-btn" id="tc-oc-reset-colours">Reset colours</button>
        </div>
        <p class="tc-meta" id="tc-oc-colours-status" role="status" aria-live="polite"></p>
      </div>
      <div class="tc-settings" style="border-top:1px solid #253246">
        <div style="font-weight:800">Button position</div>
        <p class="tc-meta">Drag the dotted handle with a mouse or finger. Focus the handle and use arrow keys to move it; hold Shift for larger steps. Its position is saved and adapts to screen size.</p>
        <button type="button" class="tc-btn" id="tc-oc-reset-position">Reset position</button>
        <p class="tc-meta" id="tc-oc-position-status" role="status" aria-live="polite"></p>
      </div>
    `;

    movement?.placePanel();
    body.querySelector('#tc-oc-reset-position').addEventListener('click', () => movement.reset());
    const background = body.querySelector('#tc-oc-button-background');
    const text = body.querySelector('#tc-oc-button-text');
    const preview = body.querySelector('#tc-oc-button-preview');
    const status = body.querySelector('#tc-oc-colours-status');
    const save = body.querySelector('#tc-oc-save-colours');
    const reset = body.querySelector('#tc-oc-reset-colours');
    const chosenColours = () => ({ background: background.value, text: text.value });
    paintButton(preview, appearance);
    for (const input of [background, text]) input.addEventListener('input', () => {
      paintButton(preview, chosenColours());
      status.textContent = 'Preview only. Save colours to apply.';
    });
    const persistColours = async appearance => {
      save.disabled = reset.disabled = true;
      try {
        await gmSet(APPEARANCE_KEY, appearance ? JSON.stringify(appearance) : '');
        paintButton(document.getElementById(BUTTON_ID), appearance);
        paintButton(preview, appearance);
        status.textContent = appearance ? 'Button colours saved.' : 'Default button colours restored.';
        return true;
      } catch { status.textContent = 'Could not save colours. Your saved colours have not changed.'; return false; }
      finally { save.disabled = reset.disabled = false; }
    };
    save.addEventListener('click', () => persistColours(chosenColours()));
    reset.addEventListener('click', async () => {
      if (await persistColours(null)) {
        background.value = '#7c3aed'; text.value = '#ffffff';
      }
    });

    body.querySelector('#tc-oc-save-key').addEventListener('click', async () => {
      const value = body.querySelector('#tc-oc-key').value.trim();
      await gmSet(STORAGE_KEY, value);
      body.innerHTML = '<div class="tc-msg">API key saved. Press Refresh.</div>';
    });
  };

  const extractMissing = (crimesData) => {
    const crimes = crimesData?.crimes || [];
    const rows = [];

    for (const crime of crimes) {
      for (const slot of crime?.slots || []) {
        const memberId =
          slot?.user?.id ??
          slot?.user_id ??
          slot?.user?.user_id ??
          slot?.member_id ??
          null;

        if (!memberId) continue;

        const itemReq =
          slot?.item_requirement ??
          slot?.item ??
          slot?.requirements?.item ??
          null;

        const itemId =
          itemReq?.id ??
          itemReq?.item_id ??
          slot?.item_id ??
          null;

        if (!itemId) continue;

        const available =
          itemReq?.available ??
          itemReq?.is_available ??
          slot?.item_available ??
          false;

        if (available === true) continue;

        rows.push({
          memberId,
          itemId,
          crimeName: crime?.name || `Crime #${crime?.id ?? '?'}`,
          crimeStatus: crime?.status || '',
          slotPosition: slot?.position || slot?.position_name || ''
        });
      }
    }

    return rows;
  };

  const buildMemberMap = (membersData) => {
    const map = new Map();
    const members = Array.isArray(membersData?.members)
      ? membersData.members
      : Object.values(membersData?.members || {});

    for (const m of members) {
      const id = m?.id ?? m?.user_id;
      if (!id) continue;
      map.set(String(id), m?.name || m?.username || `Member #${id}`);
    }

    return map;
  };

  const buildItemMap = (catalogData) => {
    const map = new Map();
    const root =
      catalogData?.organizedcrimes ??
      catalogData?.organized_crimes ??
      catalogData?.crimes ??
      catalogData;

    const visit = (value) => {
      if (!value || typeof value !== 'object') return;

      if (
        (value.id || value.item_id) &&
        typeof value.name === 'string' &&
        /item/i.test(JSON.stringify(Object.keys(value)))
      ) {
        const id = value.id ?? value.item_id;
        if (id) map.set(String(id), value.name);
      }

      for (const [key, child] of Object.entries(value)) {
        if (/item/i.test(key) && child && typeof child === 'object') {
          if (Array.isArray(child)) {
            child.forEach((item) => {
              const id = item?.id ?? item?.item_id;
              if (id && item?.name) map.set(String(id), item.name);
            });
          } else {
            const id = child?.id ?? child?.item_id;
            if (id && child?.name) map.set(String(id), child.name);
          }
        }
        visit(child);
      }
    };

    visit(root);
    return map;
  };

  const loadFactionInventory = async (key) => {
    const categories = ['weapons','armor','temporary','medical','consumables','drugs','boosters','utilities','loot'];
    const index = new Map();

    for (const category of categories) {
      try {
        const data = await apiRequest(`faction/inventory?cat=${encodeURIComponent(category)}&limit=100&offset=0`, key);
        const items = data?.inventory || data?.items || [];

        for (const item of items) {
          const id = item?.id ?? item?.item_id;
          if (!id) continue;

          const amount = Number(item?.amount ?? item?.quantity ?? item?.qty ?? 0);
          const loaned = item?.loaned;
          const available = loaned ? 0 : amount;

          const current = index.get(String(id)) || {
            total: 0,
            available: 0,
            name: item?.name || '',
            category
          };

          current.total += Number.isFinite(amount) ? amount : 0;
          current.available += Number.isFinite(available) ? available : 0;
          if (!current.name && item?.name) current.name = item.name;
          current.category = category;

          index.set(String(id), current);
        }
      } catch {}
    }

    return index;
  };

  const refresh = async () => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const body = panel.querySelector('.tc-body');
    const key = (await gmGet(STORAGE_KEY, '')).trim();

    if (!key) {
      showSettings();
      return;
    }

    body.innerHTML = '<div class="tc-msg">Loading OC requirements…</div>';

    try {
      const [crimesData, membersData, catalogData, inventory] = await Promise.all([
        apiRequest('faction/crimes', key),
        apiRequest('faction/members', key),
        apiRequest('torn/organizedcrimes', key),
        loadFactionInventory(key)
      ]);

      const missing = extractMissing(crimesData);
      const memberMap = buildMemberMap(membersData);
      const itemMap = buildItemMap(catalogData);

      if (!missing.length) {
        body.innerHTML = '<div class="tc-msg">No missing OC items were found.</div>';
        return;
      }

      body.innerHTML = missing.map(row => {
        const memberName = memberMap.get(String(row.memberId)) || `Member #${row.memberId}`;
        const inv = inventory.get(String(row.itemId));
        const itemName = itemMap.get(String(row.itemId)) || inv?.name || `Item #${row.itemId}`;
        const available = Number(inv?.available || 0);
        const hasStock = available > 0;

        return `
          <div class="tc-row">
            <div>
              <div class="tc-member">${esc(memberName)} [${esc(row.memberId)}]</div>
              <div class="tc-item">${esc(itemName)} <span class="tc-meta">#${esc(row.itemId)}</span></div>
              <div class="tc-meta">${esc(row.crimeName)} · ${esc(row.crimeStatus || 'Unknown')}</div>
            </div>
            <div class="tc-statuses">
              <span class="tc-badge">MISSING</span>
              <span class="tc-stock ${hasStock ? '' : 'none'}">
                ${hasStock ? `${available} IN ARMORY` : 'NOT IN ARMORY'}
              </span>
              ${hasStock ? `
                <button class="tc-btn tc-primary tc-issue"
                  data-member-id="${esc(row.memberId)}"
                  data-member-name="${esc(memberName)}"
                  data-item-id="${esc(row.itemId)}"
                  data-item-name="${esc(itemName)}"
                  data-stock-category="${esc(inv?.category || '')}">
                  Issue
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      body.querySelectorAll('.tc-issue').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pending = {
            memberId: btn.dataset.memberId,
            memberName: btn.dataset.memberName,
            itemId: btn.dataset.itemId,
            itemName: btn.dataset.itemName,
            stockCategory: btn.dataset.stockCategory || '',
            created: Date.now()
          };

          await gmSet(PENDING_KEY, JSON.stringify(pending));
          location.hash = '/tab=armoury';
        });
      });
    } catch (err) {
      body.innerHTML = `<div class="tc-msg">Could not load OC data: ${esc(err.message)}</div>`;
    }
  };

  const readPending = async () => {
    const raw = await gmGet(PENDING_KEY, '');
    if (!raw) return null;

    try {
      const p = JSON.parse(raw);
      if (!p?.memberId || !p?.itemId) return null;
      if (Date.now() - Number(p.created) > 30 * 60 * 1000) {
        await gmSet(PENDING_KEY, '');
        return null;
      }
      return p;
    } catch {
      return null;
    }
  };

  const categoryLabel = (cat) => ({
    weapons: 'Weapons',
    armor: 'Armor',
    temporary: 'Temporary',
    medical: 'Medical',
    consumables: 'Consumables',
    drugs: 'Drugs',
    boosters: 'Boosters',
    utilities: 'Utilities',
    loot: 'Loot'
  })[String(cat || '').toLowerCase()] || 'Utilities';

  let armoryHighlightObserver = null;

  const clearRequiredArmoryHighlight = () => {
    document.querySelectorAll('.tc-oc-required-tab').forEach(el => el.classList.remove('tc-oc-required-tab'));
    if (armoryHighlightObserver) {
      armoryHighlightObserver.disconnect();
      armoryHighlightObserver = null;
    }
  };

  const armoryCategoryTerms = (cat) => {
    const key = String(cat || '').toLowerCase();
    if (key === 'armor') return ['armor', 'armour'];
    return [key, categoryLabel(key).toLowerCase()];
  };

  const applyRequiredArmoryHighlight = (pending) => {
    if (!pending?.stockCategory || !isArmoryPage()) return false;

    document.querySelectorAll('.tc-oc-required-tab').forEach(el => el.classList.remove('tc-oc-required-tab'));

    const terms = armoryCategoryTerms(pending.stockCategory).filter(Boolean);
    const clickables = [...document.querySelectorAll('a,button,[role="tab"],li')];

    let target = clickables.find(el => {
      const href = (el.getAttribute?.('href') || '').toLowerCase();
      const dataTab = (
        el.getAttribute?.('data-tab') ||
        el.getAttribute?.('data-category') ||
        el.getAttribute?.('data-type') ||
        ''
      ).toLowerCase();
      return terms.some(term =>
        href.includes('sub=' + term) ||
        href.includes('/' + term) ||
        dataTab === term ||
        dataTab.includes(term)
      );
    });

    if (!target) {
      target = clickables.find(el => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return terms.some(term => text === term);
      });
    }

    if (!target) {
      target = clickables.find(el => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return terms.some(term => text.startsWith(term + ' ') || text.endsWith(' ' + term));
      });
    }

    if (!target) return false;

    const visualTarget =
      target.matches('a,button,[role="tab"]')
        ? target
        : target.querySelector('a,button,[role="tab"]') || target;

    visualTarget.classList.add('tc-oc-required-tab');
    return true;
  };

  const watchRequiredArmoryTab = (pending) => {
    clearRequiredArmoryHighlight();
    if (!pending?.stockCategory || !isArmoryPage()) return;

    applyRequiredArmoryHighlight(pending);

    armoryHighlightObserver = new MutationObserver(() => {
      if (!document.querySelector('.tc-oc-required-tab')) {
        applyRequiredArmoryHighlight(pending);
      }
    });

    armoryHighlightObserver.observe(document.body, { childList: true, subtree: true });
  };

  const findRfcv = () => {
    try {
      const resources = performance.getEntriesByType('resource') || [];
      for (let i = resources.length - 1; i >= 0; i--) {
        const raw = resources[i]?.name || '';
        if (!raw.includes('rfcv=')) continue;
        try {
          const u = new URL(raw, location.origin);
          const token = u.searchParams.get('rfcv');
          if (token) return token;
        } catch {}
      }
    } catch {}

    const nodes = [
      ...document.querySelectorAll('a[href*="rfcv="], form[action*="rfcv="]')
    ];

    for (const el of nodes) {
      const raw = el.getAttribute('href') || el.getAttribute('action') || '';
      try {
        const u = new URL(raw, location.origin);
        const token = u.searchParams.get('rfcv');
        if (token) return token;
      } catch {}
    }

    const html = document.documentElement.innerHTML;
    const patterns = [
      /[?&]rfcv=([a-zA-Z0-9_-]{8,})/i,
      /rfcv["']?\s*[:=]\s*["']([a-zA-Z0-9_-]{8,})["']/i,
      /rfcv(?:=|["':\s]+)([a-zA-Z0-9_-]{8,})/i
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m?.[1]) return m[1];
    }

    return '';
  };

  const findTornItemRow = (pending) => {
    const wantedName = String(pending.itemName || '').trim().toLowerCase();
    if (!wantedName) return null;

    const candidates = [...document.querySelectorAll('li, tr, [class*="item"]')];

    return candidates.find(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text.includes(wantedName) && /\bavailable\b/i.test(text);
    }) || candidates.find(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text.includes(wantedName);
    }) || null;
  };

  const findArmoryId = (row, pending) => {
    if (!row) return '';

    const nodes = [row, ...row.querySelectorAll('[data-armoryid], [data-armouryid], [data-itemid]')];

    for (const el of nodes) {
      const itemId = el.getAttribute?.('data-itemid');
      const armoryId =
        el.getAttribute?.('data-armoryid') ||
        el.getAttribute?.('data-armouryid');

      if (armoryId && (!itemId || String(itemId) === String(pending.itemId))) {
        return String(armoryId);
      }
    }

    return '';
  };

  const giveViaTornPost = async (pending) => {
    const row = findTornItemRow(pending);
    if (!row) {
      throw new Error(`Could not find the available ${pending.itemName} row.`);
    }

    const armoryId = findArmoryId(row, pending);
    if (!armoryId) {
      throw new Error(`Found ${pending.itemName}, but Torn's internal armory ID was not present.`);
    }

    const rfcv = findRfcv();
    if (!rfcv) {
      throw new Error("Could not locate Torn's rfcv token.");
    }

    const body = new URLSearchParams({
      ajax: 'true',
      step: 'armouryActionItem',
      role: 'give',
      item: armoryId,
      itemID: String(pending.itemId),
      type: categoryLabel(pending.stockCategory),
      user: `${pending.memberName} [${pending.memberId}]`,
      quantity: '1'
    });

    const response = await fetch(`/factions.php?rfcv=${encodeURIComponent(rfcv)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body.toString()
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Torn returned HTTP ${response.status}.`);
    }

    return { text, armoryId };
  };

  const showPendingIssue = async () => {
    if (!isArmoryPage() || document.getElementById('tc-oc-pending')) return;

    const pending = await readPending();
    if (!pending) return;

    const box = document.createElement('div');
    box.id = 'tc-oc-pending';
    box.innerHTML = `
      <div class="tc-p-title">Torn Companion · Pending OC Issue</div>
      <div class="tc-p-sub">
        Give <strong>${esc(pending.itemName)}</strong> to
        <strong>${esc(pending.memberName)}</strong> [${esc(pending.memberId)}].
      </div>
      <div style="margin-top:10px;padding:9px 10px;border:1px solid #4c3a6d;background:#1a1230;border-radius:9px;color:#e6d8ff;font-size:12px;line-height:1.45">
        <strong>Step 1:</strong> Open the <strong>${esc(categoryLabel(pending.stockCategory))}</strong> tab in the Armory.<br>
        <strong>Step 2:</strong> Press the Give button below.
      </div>
      <div class="tc-p-actions">
        <button class="tc-p-primary" id="tc-oc-direct-give">
          Give ${esc(pending.itemName)} to ${esc(pending.memberName)}
        </button>
        <button id="tc-oc-cancel-issue">Cancel</button>
      </div>
      <div class="tc-p-sub" id="tc-oc-pending-msg" style="margin-top:9px">
        Open the required Armory tab, then use the Give button below.
      </div>
    `;
    document.body.appendChild(box);
    watchRequiredArmoryTab(pending);

    const msg = box.querySelector('#tc-oc-pending-msg');
    const giveBtn = box.querySelector('#tc-oc-direct-give');

    box.querySelector('#tc-oc-cancel-issue').addEventListener('click', async () => {
      await gmSet(PENDING_KEY, '');
      const routeKey = `tc_oc_routed_${pending.memberId}_${pending.itemId}_${String(pending.stockCategory || '').toLowerCase()}`;
      sessionStorage.removeItem(routeKey);
      clearRequiredArmoryHighlight();
      box.remove();
    });

    giveBtn.addEventListener('click', async () => {
      giveBtn.disabled = true;
      msg.textContent = `Giving 1 × ${pending.itemName} to ${pending.memberName}…`;

      try {
        await giveViaTornPost(pending);
        msg.textContent = `Issued 1 × ${pending.itemName} to ${pending.memberName}.`;
        giveBtn.textContent = 'Issued ✓';
        await gmSet(PENDING_KEY, '');
        clearRequiredArmoryHighlight();
      } catch (err) {
        giveBtn.disabled = false;
        msg.textContent = `Could not issue item: ${err.message}`;
      }
    });
  };

  const boot = () => {
    if (isCrimesPage() || isArmoryPage()) createPanel();
    if (isArmoryPage()) showPendingIssue();
  };

  boot();

  const routeBoot = () => {
    boot();
    setTimeout(boot, 75);
    setTimeout(boot, 200);
  };

  window.addEventListener('hashchange', routeBoot);
  window.addEventListener('popstate', routeBoot);

  let lastUrl = location.href;
  new MutationObserver(() => {
    movement?.placePanel();
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      routeBoot();
    } else if (
      ((isCrimesPage() || isArmoryPage()) && !document.getElementById(BUTTON_ID)) ||
      (isArmoryPage() && !document.getElementById('tc-oc-pending'))
    ) {
      boot();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
