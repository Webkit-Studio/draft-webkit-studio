/* Webkit.Studio – klientská brána: přihlášení e-mailem a heslem přes
 * Supabase Auth (výhradně REST, bez knihoven).
 *
 * Použití na chráněné stránce (do <head>, hned za <title>, config.js první):
 *   <script src="/assets/config.js"></script>
 *   <script src="/assets/gate.js" data-client="arbosis" data-client-name="Arbosis"></script>
 * Bez data-client (rozcestník) brána pustí každého přihlášeného uživatele
 * a v co-brandu je jen WEBKIT.STUDIO.
 *
 * Přístup k projektu řídí user_metadata uživatele v Supabase:
 *   role "admin"  → všechny projekty,
 *   projects      → pole slugů, musí obsahovat data-client.
 * Uživatele zakládá Lukáš v Supabase (Dashboard → Authentication → Users),
 * hesla se do repa nikdy neukládají.
 *
 * Session: access_token + refresh_token v localStorage ("draft-session"),
 * při načtení ověření GET /auth/v1/user, při 401 obnova refresh tokenem.
 * Po odemčení skript naplní [data-auth-name], odkryje [data-auth] a naváže
 * odhlášení na [data-auth-signout]. Pro comments.js vystavuje:
 *   window.draftUser – { id, email, name, role, projects }
 *   window.draftAuth – { fetch(url, opts), token(), signOut() }
 * a vyšle událost "draft:user" na document.
 *
 * Vzhled: tokeny design systému Webkit.Studio (/design/webkit/), brána žádné
 * externí soubory nepřidává.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute('data-client') || '';
  var clientName = script.getAttribute('data-client-name') || slug;

  var CFG = window.DRAFT_CONFIG || {};
  var API = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');
  var ANON = String(CFG.SUPABASE_ANON_KEY || '');
  var STORE = 'draft-session';

  /* Stránku skryjeme okamžitě (skript běží synchronně v <head>, před prvním
     vykreslením), aby obsah pod bránou neproblikl. */
  var root = document.documentElement;
  root.style.visibility = 'hidden';

  /* ---------- session v localStorage ---------- */

  function loadSession() {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession(data) {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      }));
    } catch (e) { /* storage nedostupné – přihlášení platí jen pro toto načtení */ }
  }
  function clearSession() {
    try { localStorage.removeItem(STORE); } catch (e) { /* nevadí */ }
  }

  /* ---------- Supabase Auth přes REST ---------- */

  function authRequest(path, options, token) {
    var opts = options || {};
    var headers = { apikey: ANON };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body || undefined
    });
  }

  var refreshing = null;
  function refreshSession() {
    if (!refreshing) {
      var session = loadSession();
      if (!session || !session.refresh_token) return Promise.reject(new Error('no-session'));
      refreshing = authRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token })
      }).then(function (res) {
        if (!res.ok) throw new Error('refresh-failed');
        return res.json();
      }).then(function (data) {
        refreshing = null;
        saveSession(data);
        return data;
      }, function (err) {
        refreshing = null;
        throw err;
      });
    }
    return refreshing;
  }

  function fetchUser(token) {
    return authRequest('/auth/v1/user', {}, token).then(function (res) {
      if (res.status === 401 || res.status === 403) throw { expired: true };
      if (!res.ok) throw new Error('user-failed');
      return res.json();
    });
  }

  function signOut() {
    var session = loadSession();
    clearSession();
    if (session && session.access_token) {
      try {
        fetch(API + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: ANON, Authorization: 'Bearer ' + session.access_token },
          keepalive: true
        }).catch(function () { /* odhlášení platí lokálně i bez odpovědi */ });
      } catch (e) { /* nevadí */ }
    }
    location.reload();
  }

  /* Fetch s hlavičkami apikey + Bearer a jedním pokusem o obnovu po 401.
     Používá comments.js pro /rest/v1/… */
  function authedFetch(url, options) {
    var opts = options || {};
    function run(token) {
      var headers = {};
      var given = opts.headers || {};
      for (var k in given) if (Object.prototype.hasOwnProperty.call(given, k)) headers[k] = given[k];
      headers.apikey = ANON;
      headers.Authorization = 'Bearer ' + token;
      return fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body || undefined
      });
    }
    var session = loadSession();
    if (!session || !session.access_token) return Promise.reject(new Error('no-session'));
    return run(session.access_token).then(function (res) {
      if (res.status !== 401) return res;
      return refreshSession().then(function (data) {
        return run(data.access_token);
      }, function () {
        clearSession();
        location.reload();
        return res;
      });
    });
  }

  window.draftAuth = {
    fetch: authedFetch,
    signOut: signOut,
    token: function () {
      var session = loadSession();
      return session ? session.access_token : null;
    }
  };

  /* ---------- vzhled brány ---------- */

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
    '.wsg-brand{display:flex;flex-wrap:wrap;align-items:center;gap:var(--g-space-2) var(--g-space-3);margin-bottom:var(--g-space-6)}',
    '.wsg-symbol{display:block;height:24px;width:auto;fill:var(--g-black)}',
    '.wsg-word{font-size:13px;font-weight:700;letter-spacing:0.02em;white-space:nowrap}',
    '.wsg-co{display:inline-flex;align-items:center;gap:var(--g-space-3);white-space:nowrap}',
    '.wsg-x{font-size:13px;font-weight:700;color:var(--g-accent)}',
    '.wsg-cname{font-size:13px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase}',
    '.wsg-brand.wsg-stacked{row-gap:var(--g-space-4)}',
    '.wsg-brand.wsg-stacked .wsg-symbol{flex-basis:100%;height:40px}',
    '.wsg-form{display:flex;flex-direction:column;gap:var(--g-space-2)}',
    '.wsg-input{width:100%;height:48px;padding:0 var(--g-space-4);',
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
    '.wsg-btn[disabled]{cursor:default;background:var(--g-gray-300);color:var(--g-gray-500)}',
    '.wsg-err{margin-top:var(--g-space-3);font-size:var(--g-text-sm);font-weight:600;color:var(--g-accent)}',
    '.wsg-err[hidden]{display:none}',
    '.wsg-note{margin-top:var(--g-space-4);font-size:13px;color:var(--g-gray-500)}',
    '.wsg-msg{font-size:var(--g-text-base);font-weight:600}',
    '.wsg-out{display:inline-block;margin-top:var(--g-space-4);font-size:var(--g-text-sm);font-weight:600;',
    'color:var(--g-gray-500);text-decoration:none;cursor:pointer;',
    'transition:color var(--g-dur-fast) var(--g-ease-out)}',
    '.wsg-out:hover{color:var(--g-accent)}',
    '.wsg-out:focus-visible{outline:2px solid var(--g-focus-ring);outline-offset:2px}',
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
    '<svg class="wsg-symbol" viewBox="0 0 432 108" preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">' +
    '<path d="M0 0H108V108H0Z"></path>' +
    '<path d="M108 0C108 59.65 156.35 108 216 108L216 0Z"></path>' +
    '<path d="M216 0C216 59.65 264.35 108 324 108L324 0Z"></path>' +
    '<path d="M324 0C324 59.65 372.35 108 432 108L432 0Z"></path>' +
    '</svg>';

  var overlay = null;
  var styleEl = null;
  var prevOverflow = '';

  function mountOverlay(bodyHtml, label) {
    if (!overlay) {
      styleEl = document.createElement('style');
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
      overlay = document.createElement('div');
      overlay.className = 'wsg';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      document.body.appendChild(overlay);
      prevOverflow = root.style.overflow;
      root.style.overflow = 'hidden';
    }
    overlay.setAttribute('aria-label', label);
    overlay.innerHTML =
      '<div class="wsg-box">' +
        '<div class="wsg-brand">' + SYMBOL + '<b class="wsg-word">WEBKIT.STUDIO</b>' +
          (clientName
            ? '<span class="wsg-co"><span class="wsg-x" aria-hidden="true">x</span><span class="wsg-cname"></span></span>'
            : '') +
        '</div>' +
        bodyHtml +
      '</div>' +
      '<div class="wsg-blocks" aria-hidden="true"><i></i><i></i><i></i></div>';
    if (clientName) overlay.querySelector('.wsg-cname').textContent = clientName;
    root.style.visibility = '';
    fitBrand();
  }

  /* Logo ma jen dva stavy: vse na jednom radku, nebo symbol nad celym
     textovym radkem – zadny mezistav. */
  function fitBrand() {
    var brand = overlay && overlay.querySelector('.wsg-brand');
    if (!brand) return;
    brand.classList.remove('wsg-stacked');
    var need = 0;
    for (var i = 0; i < brand.children.length; i++) {
      need += brand.children[i].getBoundingClientRect().width;
    }
    need += 12 * (brand.children.length - 1);
    if (need > brand.parentNode.clientWidth + 1) brand.classList.add('wsg-stacked');
  }
  window.addEventListener('resize', fitBrand);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitBrand(); });

  function removeOverlay() {
    if (!overlay) return;
    root.style.overflow = prevOverflow;
    overlay.remove();
    styleEl.remove();
    overlay = null;
    styleEl = null;
  }

  /* ---------- stavy brány ---------- */

  function showLogin(message) {
    mountOverlay(
      '<form class="wsg-form" novalidate>' +
        '<input class="wsg-input" type="email" name="email" placeholder="E-mail"' +
        ' aria-label="E-mail" autocomplete="email" autofocus>' +
        '<input class="wsg-input" type="password" name="password" placeholder="Heslo"' +
        ' aria-label="Heslo" autocomplete="current-password">' +
        '<button class="wsg-btn" type="submit">Přihlásit</button>' +
      '</form>' +
      '<p class="wsg-err" role="alert" hidden></p>' +
      '<p class="wsg-note">Přístup jste dostali e-mailem.</p>',
      clientName + ' – přihlášení'
    );

    var form = overlay.querySelector('.wsg-form');
    var email = overlay.querySelector('input[name="email"]');
    var password = overlay.querySelector('input[name="password"]');
    var button = overlay.querySelector('.wsg-btn');
    var err = overlay.querySelector('.wsg-err');
    email.focus();

    function fail(message) {
      err.textContent = message;
      err.hidden = false;
      button.disabled = false;
      password.classList.add('wsg-bad', 'wsg-shake');
      password.addEventListener('animationend', function () {
        password.classList.remove('wsg-shake');
      }, { once: true });
      password.select();
      password.focus();
    }

    if (message) {
      err.textContent = message;
      err.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!API || !ANON) {
        fail('Chybí konfigurace prostředí.');
        return;
      }
      button.disabled = true;
      err.hidden = true;
      authRequest('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email: email.value.trim(), password: password.value })
      }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (result) {
        if (!result.ok) {
          fail('Nesprávný e-mail nebo heslo.');
          return;
        }
        saveSession(result.data);
        finish(result.data.user);
      }).catch(function () {
        fail('Přihlášení se nepodařilo – zkuste to znovu.');
      });
    });

    function clearBad() {
      err.hidden = true;
      password.classList.remove('wsg-bad');
    }
    email.addEventListener('input', clearBad);
    password.addEventListener('input', clearBad);
  }

  function showDenied() {
    mountOverlay(
      '<p class="wsg-msg">Nemáte přístup k tomuto projektu.</p>' +
      '<a class="wsg-out" href="#">Odhlásit</a>',
      clientName + ' – bez přístupu'
    );
    overlay.querySelector('.wsg-out').addEventListener('click', function (e) {
      e.preventDefault();
      signOut();
    });
  }

  /* ---------- odemčení ---------- */

  function displayName(meta, email) {
    var first = (meta.first_name || '').trim();
    var last = (meta.last_name || '').trim();
    if (!first && !last) return email || '';
    return first + (last ? ' ' + last.charAt(0).toUpperCase() + '.' : '');
  }

  function hasAccess(meta) {
    if (!slug) return true; /* rozcestník – stačí být přihlášený */
    if (meta.role === 'admin') return true;
    var projects = meta.projects;
    if (!projects || !projects.length) return false;
    for (var i = 0; i < projects.length; i++) {
      if (projects[i] === slug) return true;
    }
    return false;
  }

  function finish(user) {
    var meta = (user && user.user_metadata) || {};
    if (!hasAccess(meta)) {
      showDenied();
      return;
    }
    window.draftUser = {
      id: user.id,
      email: user.email,
      name: displayName(meta, user.email),
      role: meta.role || '',
      projects: meta.projects || []
    };
    var names = document.querySelectorAll('[data-auth-name]');
    for (var i = 0; i < names.length; i++) names[i].textContent = window.draftUser.name;
    var outs = document.querySelectorAll('[data-auth-signout]');
    for (var j = 0; j < outs.length; j++) {
      outs[j].addEventListener('click', function (e) {
        e.preventDefault();
        signOut();
      });
    }
    var slots = document.querySelectorAll('[data-auth]');
    for (var k = 0; k < slots.length; k++) slots[k].hidden = false;
    removeOverlay();
    root.style.visibility = '';
    document.dispatchEvent(new CustomEvent('draft:user', { detail: window.draftUser }));
  }

  /* ---------- start ---------- */

  function boot() {
    if (!API || !ANON) {
      showLogin('Chybí konfigurace prostředí.');
      return;
    }
    var session = loadSession();
    if (!session || !session.access_token) {
      showLogin();
      return;
    }
    fetchUser(session.access_token).then(finish, function (reason) {
      if (reason && reason.expired) {
        refreshSession().then(function (data) {
          return fetchUser(data.access_token).then(finish);
        }).catch(function () {
          clearSession();
          showLogin();
        });
      } else {
        showLogin('Přihlášení se nepodařilo – zkuste to znovu.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
