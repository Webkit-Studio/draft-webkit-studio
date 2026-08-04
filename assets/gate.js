/* Webkit.Studio – klientská brána (zdvořilostní bariéra, ne bezpečnostní prvek).
 *
 * Použití na klientské stránce (do <head>, hned za <title>):
 *   <script src="/assets/gate.js" data-client="arbosis"></script>
 *
 * Nový klient = nový záznam v CLIENTS níže. Hash hesla vygeneruješ
 * v konzoli prohlížeče (heslo se do repa nikdy neukládá v plaintextu):
 *
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('nove-heslo'))
 *     .then(function (b) {
 *       console.log(Array.from(new Uint8Array(b))
 *         .map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''));
 *     });
 *
 * Odemčení se drží v sessionStorage ("gate-<slug>") – platí pro záložku,
 * nová záložka nebo nové okno se ptá znovu.
 *
 * Vzhled: tokeny design systému Webkit.Studio (/design/webkit/) jako CSS
 * custom properties níže. Urbanist načítají samotné stránky, brána žádné
 * externí soubory nepřidává.
 */
(function () {
  'use strict';

  /* Konfigurace klientů: slug → jméno (zobrazí se na bráně) + SHA-256 hash hesla (hex, lowercase). */
  var CLIENTS = {
    arbosis: { name: 'Arbosis', hash: '030eeacca7a881bcd4c225f4848babafbdd6f6fe43a05b2ec7268bf0fb1a4028' }
  };

  var script = document.currentScript;
  var slug = script && script.getAttribute('data-client');
  var client = slug && CLIENTS[slug];
  if (!client) return;

  var KEY = 'gate-' + slug;
  try {
    if (sessionStorage.getItem(KEY) === '1') return;
  } catch (e) { /* storage nedostupné – brána se zobrazí při každém načtení */ }

  /* Stránku skryjeme okamžitě (skript běží synchronně v <head>, před prvním
     vykreslením), aby obsah pod bránou neproblikl. */
  var root = document.documentElement;
  root.style.visibility = 'hidden';

  var CSS = [
    '.wsg{--g-black:#000000;--g-white:#ffffff;--g-gray-100:#f4f4f4;--g-gray-300:#e2e2e2;',
    '--g-gray-500:#6f6f6f;--g-accent:#ff4d00;--g-accent-ink:#000000;--g-focus-ring:var(--g-accent);',
    '--g-font-sans:\'Urbanist\',\'Helvetica Neue\',Arial,sans-serif;',
    '--g-text-sm:14px;--g-text-base:16px;--g-label-size:12px;--g-tracking-caps:0.08em;',
    '--g-leading-body:1.55;',
    '--g-space-2:8px;--g-space-3:12px;--g-space-4:16px;--g-space-5:24px;--g-space-6:32px;--g-space-8:64px;',
    '--g-border-w:1px;--g-ease-out:cubic-bezier(0.2,0,0,1);--g-dur-fast:120ms;--g-dur-base:200ms;',
    'position:fixed;inset:0;z-index:2147483000;background:var(--g-white);color:var(--g-black);',
    'font-family:var(--g-font-sans);font-size:var(--g-text-base);line-height:var(--g-leading-body);',
    '-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;',
    'padding:var(--g-space-5)}',
    '.wsg,.wsg *{margin:0;padding:0;box-sizing:border-box}',
    '.wsg{padding:var(--g-space-5)}',
    '.wsg-box{width:100%;max-width:360px}',
    '.wsg-brand{display:flex;align-items:center;gap:var(--g-space-3);margin-bottom:var(--g-space-4)}',
    '.wsg-symbol{display:block;height:24px;width:auto;fill:var(--g-black)}',
    '.wsg-word{font-size:13px;font-weight:700;letter-spacing:0.02em}',
    '.wsg-client{font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1.12;margin-bottom:var(--g-space-6)}',
    '.wsg-form{display:flex;gap:var(--g-space-2);flex-wrap:wrap}',
    '.wsg-input{flex:1;min-width:180px;height:48px;padding:0 var(--g-space-4);',
    'border:var(--g-border-w) solid var(--g-gray-300);border-radius:0;background:var(--g-white);',
    'font:inherit;font-size:var(--g-text-base);color:var(--g-black);appearance:none}',
    '.wsg-input::placeholder{color:var(--g-gray-500)}',
    '.wsg-input:focus-visible{outline:2px solid var(--g-focus-ring);outline-offset:2px}',
    '.wsg-input.wsg-bad{border-color:var(--g-accent)}',
    '.wsg-btn{height:48px;padding:0 var(--g-space-5);border:0;border-radius:0;cursor:pointer;',
    'background:var(--g-accent);color:var(--g-accent-ink);font-family:inherit;',
    'font-size:var(--g-text-sm);font-weight:700;',
    'transition:background var(--g-dur-fast) var(--g-ease-out),color var(--g-dur-fast) var(--g-ease-out),',
    'transform var(--g-dur-fast) var(--g-ease-out)}',
    '.wsg-btn:hover{background:var(--g-black);color:var(--g-white)}',
    '.wsg-btn:active{transform:translateY(1px)}',
    '.wsg-btn:focus-visible{outline:2px solid var(--g-focus-ring);outline-offset:2px}',
    '.wsg-err{margin-top:var(--g-space-3);font-size:var(--g-text-sm);font-weight:600;color:var(--g-accent)}',
    '.wsg-err[hidden]{display:none}',
    '.wsg-blocks{position:absolute;right:0;bottom:0;width:128px;height:128px;pointer-events:none}',
    '.wsg-blocks i{position:absolute;display:block;width:var(--g-space-8);height:var(--g-space-8)}',
    '.wsg-blocks i:nth-child(1){right:0;bottom:0;background:var(--g-black);border-bottom-left-radius:100%}',
    '.wsg-blocks i:nth-child(2){right:var(--g-space-8);bottom:0;background:var(--g-black)}',
    '.wsg-blocks i:nth-child(3){right:0;bottom:var(--g-space-8);background:var(--g-accent);border-bottom-left-radius:100%}',
    '@keyframes wsg-shake{0%{transform:translateX(0)}25%{transform:translateX(-6px)}',
    '50%{transform:translateX(6px)}75%{transform:translateX(-3px)}100%{transform:translateX(0)}}',
    '.wsg-shake{animation:wsg-shake var(--g-dur-base) var(--g-ease-out)}',
    '@media (max-width:420px){.wsg-blocks{display:none}}',
    '@media (prefers-reduced-motion:reduce){.wsg *{transition:none!important;animation:none!important}}'
  ].join('');

  /* Symbol: 4 bloky – čtverec (tečka) + 3 čtvrtkruhy (W), viz assets/logo/symbol-row.svg. */
  var SYMBOL =
    '<svg class="wsg-symbol" viewBox="0 0 432 108" aria-hidden="true" focusable="false">' +
    '<path d="M0 0H108V108H0Z"></path>' +
    '<path d="M108 0C108 59.65 156.35 108 216 108L216 0Z"></path>' +
    '<path d="M216 0C216 59.65 264.35 108 324 108L324 0Z"></path>' +
    '<path d="M324 0C324 59.65 372.35 108 432 108L432 0Z"></path>' +
    '</svg>';

  function hex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(function (x) { return x.toString(16).padStart(2, '0'); })
      .join('');
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'wsg';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', (client.name || slug) + ' – zadejte heslo');
    overlay.innerHTML =
      '<div class="wsg-box">' +
        '<div class="wsg-brand">' + SYMBOL + '<b class="wsg-word">WEBKIT.STUDIO</b></div>' +
        '<p class="wsg-client"></p>' +
        '<form class="wsg-form" novalidate>' +
          '<input class="wsg-input" type="password" name="password" placeholder="Heslo"' +
          ' aria-label="Heslo" autocomplete="current-password" autofocus>' +
          '<button class="wsg-btn" type="submit">Vstoupit</button>' +
        '</form>' +
        '<p class="wsg-err" role="alert" hidden>Nesprávné heslo.</p>' +
      '</div>' +
      '<div class="wsg-blocks" aria-hidden="true"><i></i><i></i><i></i></div>';
    overlay.querySelector('.wsg-client').textContent = client.name || slug;
    document.body.appendChild(overlay);

    var prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    root.style.visibility = '';

    var form = overlay.querySelector('.wsg-form');
    var input = overlay.querySelector('.wsg-input');
    var err = overlay.querySelector('.wsg-err');
    input.focus();

    function unlock() {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* neuloží se – odemčeno jen pro tuto stránku */ }
      root.style.overflow = prevOverflow;
      overlay.remove();
      style.remove();
    }

    function fail(message) {
      err.textContent = message || 'Nesprávné heslo.';
      err.hidden = false;
      input.classList.add('wsg-bad', 'wsg-shake');
      input.addEventListener('animationend', function () {
        input.classList.remove('wsg-shake');
      }, { once: true });
      input.select();
      input.focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!(window.crypto && crypto.subtle)) {
        fail('Otevřete stránku přes HTTPS.');
        return;
      }
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.value))
        .then(function (digest) {
          if (hex(digest) === client.hash) unlock();
          else fail();
        })
        .catch(function () { fail(); });
    });

    input.addEventListener('input', function () {
      err.hidden = true;
      input.classList.remove('wsg-bad');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
