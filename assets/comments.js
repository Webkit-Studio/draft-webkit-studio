/* Webkit.Studio – komentáře s piny nad plátnem návrhu.
 *
 * Aktivace ve vieweru (před </body>, stránka musí mít gate.js + config.js
 * a v liště tlačítko <button class="cbtn" data-comments-toggle hidden>):
 *   <script src="/assets/comments.js" data-project="arbosis"
 *           data-version="v1" data-view="desktop"></script>
 *
 * Data: tabulka comments v Supabase (REST /rest/v1/comments, RLS podle
 * user_metadata). Pozice pinu = název sekce (data-screen-label bloku
 * plátna) + relativní souřadnice x/y (0–1) uvnitř sekce, takže pin drží
 * i při změně výšky okolních sekcí. Plátno je vložené přímo v dokumentu
 * (#frame, zmenšované transform: scale), takže vrstva pracuje nad ním bez
 * iframu; přepočet pozic řeší getBoundingClientRect při scrollu a resize.
 *
 * Panel ukazuje komentáře obou pohledů (počítač + mobil) pro projekt
 * a verzi; pin se kreslí jen pro aktuální pohled. Klik na komentář
 * z druhého pohledu přejde na druhý viewer s kotvou #c=<id>. Komentář ze
 * sekce, která už v návrhu není, pin nemá a panel to u něj poznamená.
 * Mazání neexistuje, vlákno se uklízí přes „Vyřešeno".
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var PROJECT = script.getAttribute('data-project');
  var VERSION = script.getAttribute('data-version');
  var VIEW = script.getAttribute('data-view');
  if (!PROJECT || !VERSION || (VIEW !== 'desktop' && VIEW !== 'mobile')) return;

  var VIEW_LABELS = { desktop: 'Počítač', mobile: 'Mobil' };
  var OTHER_FILE = VIEW === 'desktop' ? 'mobile.html' : 'desktop.html';

  var CFG = window.DRAFT_CONFIG || {};
  var REST = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '') + '/rest/v1/comments';

  /* ---------- vzhled (tokeny design systému Webkit.Studio) ---------- */

  var CSS = [
    /* tlačítko v liště */
    '.cbtn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;flex:none;',
    'background:transparent;border:1px solid var(--inverse-line,rgba(255,255,255,.24));border-radius:0;',
    'color:var(--white,#fff);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cbtn:hover{color:var(--accent,#ff4d00)}',
    '.cbtn[aria-expanded="true"]{background:var(--white,#fff);color:var(--black,#000)}',
    '.cbtn:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cbtn[hidden]{display:none}',
    /* piny nad plátnem */
    '.cpins{position:fixed;inset:0;z-index:15;pointer-events:none}',
    '.cpins.coff .cpin{pointer-events:none}',
    '.cpin{position:fixed;left:-99px;top:-99px;width:22px;height:22px;padding:0;',
    'transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;',
    'background:var(--black,#000);color:var(--white,#fff);border:1px solid var(--white,#fff);border-radius:0;',
    'font-family:var(--font-sans,sans-serif);font-size:11px;font-weight:700;line-height:1;',
    'cursor:pointer;pointer-events:auto}',
    '.cpin.cpin-done{background:var(--white,#fff);color:var(--black,#000);border-color:var(--black,#000)}',
    '.cpin.cpin-draft{background:var(--white,#fff);color:var(--black,#000);border-color:var(--black,#000);pointer-events:none}',
    '.cpin:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cpin.cpulse{outline:2px solid var(--accent,#ff4d00);outline-offset:2px;',
    'animation:cpulse 200ms var(--ease-out,cubic-bezier(0.2,0,0,1)) 2}',
    '@keyframes cpulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.35)}}',
    /* režim výběru místa */
    '.ccatch{position:fixed;z-index:16;cursor:crosshair;display:none}',
    '.ccatch.on{display:block}',
    '.c-hl{outline:2px solid var(--accent,#ff4d00)!important;outline-offset:-2px!important}',
    /* panel */
    '.cpanel{position:fixed;top:52px;right:0;bottom:0;width:360px;z-index:18;',
    'background:var(--white,#fff);border-left:1px solid var(--gray-300,#e2e2e2);color:var(--black,#000);',
    'font-family:var(--font-sans,sans-serif);display:flex;flex-direction:column;',
    'transform:translateX(100%);visibility:hidden;',
    'transition:transform var(--dur-base,200ms) var(--ease-out,cubic-bezier(0.2,0,0,1)),',
    'visibility 0s linear var(--dur-base,200ms)}',
    '.cpanel.on{transform:none;visibility:visible;',
    'transition:transform var(--dur-base,200ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cpanel-head{display:flex;align-items:center;gap:8px;padding:12px 20px;border-bottom:1px solid var(--gray-300,#e2e2e2)}',
    '.cpanel-head b{font-size:15px;font-weight:700}',
    '.cpanel-count{font-size:13px;font-weight:600;color:var(--gray-500,#6f6f6f)}',
    '.cpanel-x{margin-left:auto;width:32px;height:32px;border:0;border-radius:0;background:none;',
    'color:var(--black,#000);font-size:20px;line-height:1;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cpanel-x:hover{color:var(--accent,#ff4d00)}',
    '.cpanel-x:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cpanel-tools{padding:16px 20px;border-bottom:1px solid var(--gray-300,#e2e2e2);display:flex;flex-direction:column;gap:12px}',
    '.cadd{height:44px;border:0;border-radius:0;background:var(--black,#000);color:var(--white,#fff);',
    'font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;',
    'transition:background var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1)),',
    'color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cadd:hover,.cadd[aria-pressed="true"]{background:var(--accent,#ff4d00);color:var(--accent-ink,#000)}',
    '.cadd:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.ctoggle{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;',
    'color:var(--gray-500,#6f6f6f);cursor:pointer}',
    '.ctoggle input{width:16px;height:16px;margin:0;accent-color:var(--black,#000)}',
    '.ctoggle input:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cnote{padding:10px 20px;font-size:12.5px;font-weight:600;color:var(--accent,#ff4d00);',
    'border-bottom:1px solid var(--gray-300,#e2e2e2)}',
    '.cnote[hidden]{display:none}',
    /* seznam */
    '.clist{flex:1;overflow-y:auto;padding-bottom:24px}',
    '.cempty{padding:26px 20px;font-size:14px;color:var(--gray-500,#6f6f6f)}',
    '.cgroup{border-top:1px solid var(--gray-300,#e2e2e2)}',
    '.cgroup:first-child{border-top:0}',
    '.cgroup-h{padding:16px 20px 4px;font-size:11px;font-weight:600;letter-spacing:.08em;',
    'text-transform:uppercase;color:var(--gray-500,#6f6f6f)}',
    '.cgroup-dead{display:block;margin-top:2px;font-size:12.5px;font-weight:500;letter-spacing:0;',
    'text-transform:none;color:var(--gray-500,#6f6f6f)}',
    '.citem{padding:12px 20px;display:flex;gap:12px;align-items:flex-start}',
    '.citem.clink{cursor:pointer}',
    '.citem.clink:hover{background:var(--gray-100,#f4f4f4)}',
    '.citem.cflash{background:var(--gray-100,#f4f4f4)}',
    '.citem.cpending{opacity:.55}',
    '.cbadge{flex:none;width:22px;height:22px;margin-top:1px;display:flex;align-items:center;justify-content:center;',
    'background:var(--black,#000);color:var(--white,#fff);',
    'font-size:11px;font-weight:700;line-height:1}',
    '.citem.cdone .cbadge{background:var(--white,#fff);color:var(--black,#000);border:1px solid var(--black,#000)}',
    '.cmain{flex:1;min-width:0}',
    '.cmeta{display:flex;align-items:baseline;gap:8px;font-size:13px;flex-wrap:wrap}',
    '.cmeta b{font-weight:600}',
    '.ctime{font-size:12px;font-weight:500;color:var(--gray-500,#6f6f6f)}',
    '.ctag{margin-left:auto;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;',
    'border:1px solid var(--black,#000);padding:2px 6px;white-space:nowrap}',
    '.citem.cdone .cmeta b,.citem.cdone .ctext{color:var(--gray-500,#6f6f6f)}',
    '.ctext{margin-top:4px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
    '.cact{display:flex;align-items:center;gap:16px;margin-top:8px;font-size:12.5px}',
    '.cact label{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--gray-500,#6f6f6f);cursor:pointer}',
    '.cact input{width:14px;height:14px;margin:0;accent-color:var(--black,#000)}',
    '.cact input:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.creply{font-weight:600;color:var(--gray-500,#6f6f6f);text-decoration:none;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.creply:hover{color:var(--accent,#ff4d00)}',
    '.creply:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.creps{margin-top:10px;border-left:1px solid var(--gray-300,#e2e2e2);padding-left:14px;',
    'display:flex;flex-direction:column;gap:10px}',
    '.crepnote{margin-top:8px;font-size:12.5px;font-weight:500;color:var(--gray-500,#6f6f6f)}',
    /* formuláře */
    '.cform{margin-top:10px}',
    '.cform textarea,.ccomp textarea{display:block;width:100%;min-height:72px;padding:10px 12px;',
    'border:1px solid var(--gray-300,#e2e2e2);border-radius:0;background:var(--white,#fff);',
    'font-family:var(--font-sans,sans-serif);font-size:14px;font-weight:500;line-height:1.5;',
    'color:var(--black,#000);resize:vertical}',
    '.cform textarea:focus-visible,.ccomp textarea:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cform-act{display:flex;gap:8px;margin-top:8px}',
    '.cprim{height:40px;padding:0 18px;border:0;border-radius:0;background:var(--black,#000);color:var(--white,#fff);',
    'font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;',
    'transition:background var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1)),',
    'color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cprim:hover{background:var(--accent,#ff4d00);color:var(--accent-ink,#000)}',
    '.cprim:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cghost{height:40px;padding:0 18px;background:transparent;border:1px solid var(--black,#000);border-radius:0;',
    'color:var(--black,#000);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1)),',
    'border-color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cghost:hover{color:var(--accent,#ff4d00);border-color:var(--accent,#ff4d00)}',
    '.cghost:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cerr{margin-top:8px;font-size:12.5px;font-weight:600;color:var(--accent,#ff4d00)}',
    '.cerr[hidden]{display:none}',
    '.ccomp{position:fixed;z-index:19;width:300px;background:var(--white,#fff);',
    'border:1px solid var(--black,#000);padding:12px;display:none}',
    '.ccomp.on{display:block}',
    /* posun plátna při otevřeném panelu */
    'body.c-open{padding-right:360px}',
    '@media (max-width:560px){',
    '.cpanel{width:100%}',
    'body.c-open{padding-right:0}',
    '.cbtn{padding:0 10px}',
    '.cbtn .cbtn-t{display:none}',
    '.ccomp{left:16px!important;right:16px;width:auto;top:auto!important;bottom:16px}',
    '}',
    '@media (prefers-reduced-motion:reduce){',
    '.cpanel,.cpin,.cbtn,.cadd,.cprim,.cghost,.cpanel-x,.creply{transition:none!important;animation:none!important}',
    '}'
  ].join('');

  /* ---------- stav ---------- */

  var frame = null;
  var sections = {};        /* data-screen-label → element (aktuální pohled) */
  var sectionOrder = [];    /* labely v pořadí dokumentu */
  var items = [];           /* všechny komentáře projektu+verze (oba pohledy) */
  var numbers = {};         /* id kořene → číslo pinu */
  var showResolved = false;
  var panelOpen = false;
  var picking = false;
  var draft = null;         /* {section,x,y} při otevřeném composeru */
  var replyFor = null;      /* id kořene s otevřenou odpovědí */
  var replyText = '';
  var tmpSeq = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia && window.matchMedia('(max-width: 560px)');

  var barBtn, barCount, pinsLayer, catchLayer, panel, listEl, countEl, noteEl,
      addBtn, toggleInput, comp, compText, compErr;
  var pinEls = {};          /* id → element pinu */
  var draftPinEl = null;

  /* ---------- REST ---------- */

  function restFetch(url, opts) {
    return window.draftAuth.fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('rest-' + res.status);
      return res.status === 204 ? null : res.json();
    });
  }

  function loadAll() {
    return restFetch(REST +
      '?select=*&project=eq.' + encodeURIComponent(PROJECT) +
      '&version=eq.' + encodeURIComponent(VERSION) +
      '&order=created_at.asc');
  }

  function insertRow(row) {
    return restFetch(REST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row)
    }).then(function (rows) { return rows[0]; });
  }

  function patchResolved(id, value) {
    return restFetch(REST + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ resolved: value })
    });
  }

  /* ---------- pomocníci ---------- */

  function roots() {
    return items.filter(function (c) { return !c.parent_id; });
  }
  function replies(rootId) {
    return items.filter(function (c) { return c.parent_id === rootId; });
  }
  function byId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function unresolvedCount() {
    return roots().filter(function (c) { return !c.resolved; }).length;
  }
  function renumber() {
    numbers = {};
    var list = roots();
    for (var i = 0; i < list.length; i++) numbers[list[i].id] = i + 1;
  }
  function sortItems() {
    items.sort(function (a, b) {
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    });
  }

  function relTime(iso) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'právě teď';
    if (s < 3600) return 'před ' + Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return 'před ' + Math.round(s / 3600) + ' h';
    if (s < 172800) return 'včera';
    if (s < 604800) return 'před ' + Math.round(s / 86400) + ' dny';
    var d = new Date(t);
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  }

  function pluralReplies(n) {
    if (n === 1) return '1 odpověď';
    if (n >= 2 && n <= 4) return n + ' odpovědi';
    return n + ' odpovědí';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- projekce pinů ---------- */

  function project(c) {
    var sec = sections[c.section];
    if (!sec) return null;
    var r = sec.getBoundingClientRect();
    return { x: r.left + c.x * r.width, y: r.top + c.y * r.height };
  }

  function pinVisible(c) {
    if (c.view !== VIEW || c.parent_id) return false;
    if (c.resolved && !showResolved) return false;
    return !!sections[c.section];
  }

  var rafPending = false;
  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      updatePositions();
    });
  }

  function updatePositions() {
    for (var id in pinEls) {
      if (!Object.prototype.hasOwnProperty.call(pinEls, id)) continue;
      var c = byId(id);
      var pos = c && pinVisible(c) ? project(c) : null;
      var pin = pinEls[id];
      if (!pos) {
        pin.style.display = 'none';
      } else {
        pin.style.display = '';
        pin.style.left = pos.x + 'px';
        pin.style.top = pos.y + 'px';
      }
    }
    if (draftPinEl) {
      var dpos = draft ? project(draft) : null;
      if (!dpos) {
        draftPinEl.style.display = 'none';
      } else {
        draftPinEl.style.display = '';
        draftPinEl.style.left = dpos.x + 'px';
        draftPinEl.style.top = dpos.y + 'px';
      }
    }
    if (picking) {
      var fr = frame.getBoundingClientRect();
      catchLayer.style.left = fr.left + 'px';
      catchLayer.style.top = fr.top + 'px';
      catchLayer.style.width = fr.width + 'px';
      catchLayer.style.height = fr.height + 'px';
    }
  }

  /* ---------- vykreslení ---------- */

  function render() {
    sortItems();
    renumber();
    var n = unresolvedCount();
    barCount.textContent = '(' + n + ')';
    countEl.textContent = '(' + n + ')';
    renderPins();
    renderList();
    updatePositions();
  }

  function renderPins() {
    var keep = {};
    var list = roots();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!pinVisible(c)) continue;
      keep[c.id] = true;
      var pin = pinEls[c.id];
      if (!pin) {
        pin = el('button', 'cpin', '');
        pin.type = 'button';
        pin.setAttribute('data-id', c.id);
        pinsLayer.appendChild(pin);
        pinEls[c.id] = pin;
      }
      pin.textContent = String(numbers[c.id]);
      pin.className = 'cpin' + (c.resolved ? ' cpin-done' : '');
      pin.setAttribute('aria-label', 'Komentář ' + numbers[c.id] + ' – ' + c.section);
    }
    for (var id in pinEls) {
      if (Object.prototype.hasOwnProperty.call(pinEls, id) && !keep[id]) {
        pinEls[id].remove();
        delete pinEls[id];
      }
    }
  }

  function visibleRoots() {
    return roots().filter(function (c) { return showResolved || !c.resolved; });
  }

  function groupList() {
    var list = visibleRoots();
    var map = {};
    var order = [];
    function put(key, group) { map[key] = group; order.push(key); }
    /* skupiny aktuálního pohledu v pořadí sekcí na plátně */
    for (var s = 0; s < sectionOrder.length; s++) {
      var label = sectionOrder[s];
      var inSection = list.filter(function (c) { return c.view === VIEW && c.section === label; });
      if (inSection.length) put(VIEW + ' ' + label, { view: VIEW, section: label, live: true, items: inSection });
    }
    /* zaniklé sekce aktuálního pohledu */
    var rest = list.filter(function (c) { return c.view === VIEW && !sections[c.section]; });
    for (var i = 0; i < rest.length; i++) {
      var key = VIEW + ' ' + rest[i].section;
      if (!map[key]) put(key, { view: VIEW, section: rest[i].section, live: false, items: [] });
      map[key].items.push(rest[i]);
    }
    /* druhý pohled – podle času prvního komentáře */
    var other = list.filter(function (c) { return c.view !== VIEW; });
    for (var j = 0; j < other.length; j++) {
      var okey = other[j].view + ' ' + other[j].section;
      if (!map[okey]) put(okey, { view: other[j].view, section: other[j].section, live: null, items: [] });
      map[okey].items.push(other[j]);
    }
    return order.map(function (k) { return map[k]; });
  }

  function renderList() {
    listEl.textContent = '';
    var groups = groupList();
    if (!groups.length) {
      listEl.appendChild(el('p', 'cempty', 'Zatím žádné komentáře.'));
      return;
    }
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var groupEl = el('div', 'cgroup');
      var head = el('div', 'cgroup-h', group.section);
      if (group.live === false) head.appendChild(el('span', 'cgroup-dead', 'Sekce už v návrhu není.'));
      groupEl.appendChild(head);
      for (var i = 0; i < group.items.length; i++) {
        groupEl.appendChild(renderItem(group.items[i], group));
      }
      listEl.appendChild(groupEl);
    }
  }

  function renderItem(c, group) {
    var kids = replies(c.id);
    var item = el('div', 'citem');
    item.setAttribute('data-id', c.id);
    if (c.resolved) item.className += ' cdone';
    if (c.pending) item.className += ' cpending';
    if ((group.live && !c.pending) || group.live === null) item.className += ' clink';

    var badge = el('span', 'cbadge', numbers[c.id] ? String(numbers[c.id]) : '·');
    item.appendChild(badge);

    var main = el('div', 'cmain');
    var meta = el('div', 'cmeta');
    meta.appendChild(el('b', null, c.author_name));
    meta.appendChild(el('span', 'ctime', c.pending ? 'právě teď' : relTime(c.created_at)));
    meta.appendChild(el('span', 'ctag', VIEW_LABELS[c.view] || c.view));
    main.appendChild(meta);
    main.appendChild(el('div', 'ctext', c.body));

    var act = el('div', 'cact');
    var resLabel = el('label', null);
    var resInput = document.createElement('input');
    resInput.type = 'checkbox';
    resInput.checked = !!c.resolved;
    resInput.disabled = !!c.pending;
    resInput.setAttribute('data-resolve', c.id);
    resLabel.appendChild(resInput);
    resLabel.appendChild(document.createTextNode(' Vyřešeno'));
    act.appendChild(resLabel);
    if (!c.resolved && !c.pending) {
      var reply = el('a', 'creply', 'Odpovědět');
      reply.href = '#';
      reply.setAttribute('data-reply', c.id);
      act.appendChild(reply);
    }
    main.appendChild(act);

    if (c.resolved) {
      /* vyřešené vlákno je sbalené */
      if (kids.length) main.appendChild(el('div', 'crepnote', pluralReplies(kids.length)));
    } else {
      if (kids.length) {
        var reps = el('div', 'creps');
        for (var i = 0; i < kids.length; i++) {
          var kid = kids[i];
          var rep = el('div', 'crep' + (kid.pending ? ' cpending' : ''));
          var rmeta = el('div', 'cmeta');
          rmeta.appendChild(el('b', null, kid.author_name));
          rmeta.appendChild(el('span', 'ctime', kid.pending ? 'právě teď' : relTime(kid.created_at)));
          rep.appendChild(rmeta);
          rep.appendChild(el('div', 'ctext', kid.body));
          reps.appendChild(rep);
        }
        main.appendChild(reps);
      }
      if (replyFor === c.id) {
        var form = el('div', 'cform');
        var ta = document.createElement('textarea');
        ta.placeholder = 'Odpověď';
        ta.setAttribute('aria-label', 'Odpověď');
        ta.value = replyText;
        var actRow = el('div', 'cform-act');
        var save = el('button', 'cprim', 'Přidat');
        save.type = 'button';
        var cancel = el('button', 'cghost', 'Zrušit');
        cancel.type = 'button';
        actRow.appendChild(save);
        actRow.appendChild(cancel);
        var ferr = el('p', 'cerr');
        ferr.hidden = true;
        form.appendChild(ta);
        form.appendChild(actRow);
        form.appendChild(ferr);
        main.appendChild(form);
        save.addEventListener('click', function () {
          submitReply(c.id, ta, ferr);
        });
        cancel.addEventListener('click', function () {
          replyFor = null;
          replyText = '';
          render();
        });
        ta.addEventListener('input', function () { replyText = ta.value; });
        setTimeout(function () { ta.focus(); }, 0);
      }
    }

    item.appendChild(main);
    return item;
  }

  /* ---------- panel ---------- */

  function openPanel() {
    if (panelOpen) return Promise.resolve();
    panelOpen = true;
    panel.classList.add('on');
    barBtn.setAttribute('aria-expanded', 'true');
    if (!narrow.matches) document.body.classList.add('c-open');
    window.dispatchEvent(new Event('resize'));
    return refresh();
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.classList.remove('on');
    barBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('c-open');
    window.dispatchEvent(new Event('resize'));
  }

  function refresh() {
    return loadAll().then(function (rows) {
      var pending = items.filter(function (c) { return c.pending; });
      items = rows.concat(pending);
      noteEl.hidden = true;
      render();
    }, function () {
      noteEl.textContent = 'Komentáře se nenačetly – zkuste to znovu.';
      noteEl.hidden = false;
    });
  }

  /* ---------- režim komentování ---------- */

  var hlEl = null;
  function clearHl() {
    if (hlEl) { hlEl.classList.remove('c-hl'); hlEl = null; }
  }

  function sectionAt(x, y) {
    catchLayer.style.pointerEvents = 'none';
    var hit = document.elementFromPoint(x, y);
    catchLayer.style.pointerEvents = '';
    while (hit && hit !== frame) {
      if (hit.nodeType === 1 && hit.hasAttribute('data-screen-label')) return hit;
      hit = hit.parentNode;
    }
    return null;
  }

  function enterPick() {
    if (picking) return;
    picking = true;
    catchLayer.classList.add('on');
    pinsLayer.classList.add('coff');
    addBtn.setAttribute('aria-pressed', 'true');
    schedule();
  }

  function exitPick() {
    if (!picking) return;
    picking = false;
    catchLayer.classList.remove('on');
    pinsLayer.classList.remove('coff');
    addBtn.setAttribute('aria-pressed', 'false');
    clearHl();
  }

  /* ---------- composer nového komentáře ---------- */

  function openComposer(px, py, message) {
    comp.classList.add('on');
    compErr.textContent = message || '';
    compErr.hidden = !message;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = Math.min(Math.max(px + 12, 12), Math.max(12, vw - 312));
    comp.style.left = left + 'px';
    comp.style.top = Math.min(Math.max(py + 12, 64), Math.max(64, vh - 200)) + 'px';
    setTimeout(function () { compText.focus(); }, 0);
    schedule();
  }

  function closeComposer(keepDraft) {
    comp.classList.remove('on');
    if (!keepDraft) {
      draft = null;
      compText.value = '';
      compErr.hidden = true;
      schedule();
    }
  }

  function submitRoot() {
    var text = compText.value.trim();
    if (!text || !draft) return;
    var ctx = draft;
    var tmp = {
      id: 'tmp-' + (++tmpSeq),
      project: PROJECT, version: VERSION, view: VIEW,
      section: ctx.section, x: ctx.x, y: ctx.y,
      parent_id: null,
      author_id: window.draftUser.id,
      author_name: window.draftUser.name,
      body: text, resolved: false,
      created_at: new Date().toISOString(),
      pending: true
    };
    items.push(tmp);
    closeComposer(true);
    var at = lastPoint;
    draft = null;
    compText.value = '';
    render();
    insertRow({
      project: PROJECT, version: VERSION, view: VIEW,
      section: ctx.section, x: ctx.x, y: ctx.y,
      author_name: window.draftUser.name, body: text
    }).then(function (row) {
      replaceTmp(tmp.id, row);
    }, function () {
      removeTmp(tmp.id);
      draft = ctx;
      compText.value = text;
      openComposer(at.x, at.y, 'Komentář se neuložil – zkuste to znovu.');
      render();
    });
  }

  function submitReply(rootId, ta, errEl) {
    var text = ta.value.trim();
    if (!text) return;
    var root = byId(rootId);
    var tmp = {
      id: 'tmp-' + (++tmpSeq),
      project: PROJECT, version: VERSION, view: root.view,
      section: root.section, x: null, y: null,
      parent_id: rootId,
      author_id: window.draftUser.id,
      author_name: window.draftUser.name,
      body: text, resolved: false,
      created_at: new Date().toISOString(),
      pending: true
    };
    items.push(tmp);
    replyFor = null;
    replyText = '';
    render();
    insertRow({
      project: PROJECT, version: VERSION, view: root.view,
      section: root.section, parent_id: rootId,
      author_name: window.draftUser.name, body: text
    }).then(function (row) {
      replaceTmp(tmp.id, row);
    }, function () {
      removeTmp(tmp.id);
      replyFor = rootId;
      replyText = text;
      render();
      var err = listEl.querySelector('.citem[data-id="' + rootId + '"] .cerr');
      if (err) { err.textContent = 'Komentář se neuložil – zkuste to znovu.'; err.hidden = false; }
    });
  }

  function replaceTmp(tmpId, row) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === tmpId) { items[i] = row; break; }
    }
    render();
  }
  function removeTmp(tmpId) {
    items = items.filter(function (c) { return c.id !== tmpId; });
    render();
  }

  /* ---------- vyřešení ---------- */

  function setResolved(id, value) {
    var c = byId(id);
    if (!c) return;
    c.resolved = value;
    render();
    patchResolved(id, value).then(function () {
      noteEl.hidden = true;
    }, function () {
      c.resolved = !value;
      render();
      noteEl.textContent = 'Změna se neuložila – zkuste to znovu.';
      noteEl.hidden = false;
    });
  }

  /* ---------- pin ↔ panel ---------- */

  function focusPin(c) {
    var pos = project(c);
    if (!pos) return;
    var target = window.scrollY + pos.y - window.innerHeight * 0.4;
    window.scrollTo({ top: Math.max(0, target), behavior: reduced && reduced.matches ? 'auto' : 'smooth' });
    var pin = pinEls[c.id];
    if (pin) {
      pin.classList.add('cpulse');
      setTimeout(function () { pin.classList.remove('cpulse'); }, 900);
    }
  }

  function focusItem(id) {
    var item = listEl.querySelector('.citem[data-id="' + id + '"]');
    if (!item) return;
    item.scrollIntoView({ block: 'nearest' });
    item.classList.add('cflash');
    setTimeout(function () { item.classList.remove('cflash'); }, 900);
  }

  /* ---------- stavba UI ---------- */

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    frame = document.getElementById('frame');
    var nodes = frame ? frame.querySelectorAll('[data-screen-label]') : [];
    for (var i = 0; i < nodes.length; i++) {
      var label = nodes[i].getAttribute('data-screen-label');
      if (!sections[label]) {
        sections[label] = nodes[i];
        sectionOrder.push(label);
      }
    }

    barBtn = document.querySelector('[data-comments-toggle]');
    if (!barBtn || !frame) return false;
    barBtn.hidden = false;
    barBtn.setAttribute('aria-expanded', 'false');
    barCount = barBtn.querySelector('.cbtn-n');

    pinsLayer = el('div', 'cpins');
    pinsLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pinsLayer);

    catchLayer = el('div', 'ccatch');
    document.body.appendChild(catchLayer);

    draftPinEl = el('span', 'cpin cpin-draft', '+');
    draftPinEl.style.display = 'none';
    pinsLayer.appendChild(draftPinEl);

    panel = el('aside', 'cpanel');
    panel.setAttribute('aria-label', 'Komentáře');
    var head = el('div', 'cpanel-head');
    head.appendChild(el('b', null, 'Komentáře'));
    countEl = el('span', 'cpanel-count', '(0)');
    head.appendChild(countEl);
    var x = el('button', 'cpanel-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Zavřít');
    head.appendChild(x);
    panel.appendChild(head);

    var tools = el('div', 'cpanel-tools');
    addBtn = el('button', 'cadd', 'Přidat komentář');
    addBtn.type = 'button';
    addBtn.setAttribute('aria-pressed', 'false');
    tools.appendChild(addBtn);
    var toggle = el('label', 'ctoggle');
    toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggle.appendChild(toggleInput);
    toggle.appendChild(document.createTextNode(' Zobrazit vyřešené'));
    tools.appendChild(toggle);
    panel.appendChild(tools);

    noteEl = el('p', 'cnote');
    noteEl.hidden = true;
    panel.appendChild(noteEl);

    listEl = el('div', 'clist');
    panel.appendChild(listEl);
    document.body.appendChild(panel);

    comp = el('div', 'ccomp');
    compText = document.createElement('textarea');
    compText.placeholder = 'Komentář';
    compText.setAttribute('aria-label', 'Komentář');
    comp.appendChild(compText);
    var compAct = el('div', 'cform-act');
    var compSave = el('button', 'cprim', 'Přidat');
    compSave.type = 'button';
    var compCancel = el('button', 'cghost', 'Zrušit');
    compCancel.type = 'button';
    compAct.appendChild(compSave);
    compAct.appendChild(compCancel);
    comp.appendChild(compAct);
    compErr = el('p', 'cerr');
    compErr.hidden = true;
    comp.appendChild(compErr);
    document.body.appendChild(comp);

    /* události */
    barBtn.addEventListener('click', function () {
      if (panelOpen) closePanel(); else openPanel();
    });
    x.addEventListener('click', closePanel);
    addBtn.addEventListener('click', function () {
      if (picking) { exitPick(); return; }
      closeComposer();
      if (narrow.matches) closePanel();
      enterPick();
    });
    toggleInput.addEventListener('change', function () {
      showResolved = toggleInput.checked;
      render();
    });
    compSave.addEventListener('click', submitRoot);
    compCancel.addEventListener('click', function () { closeComposer(); });

    catchLayer.addEventListener('mousemove', function (e) {
      var sec = sectionAt(e.clientX, e.clientY);
      if (sec !== hlEl) {
        clearHl();
        if (sec) { hlEl = sec; sec.classList.add('c-hl'); }
      }
    });
    catchLayer.addEventListener('mouseleave', clearHl);
    catchLayer.addEventListener('click', function (e) {
      var sec = sectionAt(e.clientX, e.clientY);
      if (!sec) return;
      var r = sec.getBoundingClientRect();
      draft = {
        section: sec.getAttribute('data-screen-label'),
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      };
      lastPoint = { x: e.clientX, y: e.clientY };
      exitPick();
      compText.value = '';
      openComposer(e.clientX, e.clientY);
      render();
      schedule();
    });

    pinsLayer.addEventListener('click', function (e) {
      var pin = e.target.closest ? e.target.closest('.cpin[data-id]') : null;
      if (!pin) return;
      var id = pin.getAttribute('data-id');
      openPanel().then(function () { focusItem(id); });
    });

    listEl.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('.cform') || t.closest('textarea')) return;
      var reply = t.closest('[data-reply]');
      if (reply) {
        e.preventDefault();
        replyFor = reply.getAttribute('data-reply');
        replyText = '';
        render();
        return;
      }
      if (t.closest('input') || t.closest('label')) return;
      var item = t.closest('.citem[data-id]');
      if (!item) return;
      var c = byId(item.getAttribute('data-id'));
      if (!c || c.pending) return;
      if (c.view === VIEW) {
        if (sections[c.section]) {
          if (narrow.matches) closePanel();
          focusPin(c);
        }
      } else {
        location.href = OTHER_FILE + '#c=' + c.id;
      }
    });

    listEl.addEventListener('change', function (e) {
      var input = e.target;
      if (input && input.hasAttribute && input.hasAttribute('data-resolve')) {
        setResolved(input.getAttribute('data-resolve'), input.checked);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (comp.classList.contains('on')) { closeComposer(); return; }
      if (replyFor) { replyFor = null; replyText = ''; render(); return; }
      if (picking) { exitPick(); return; }
      if (panelOpen) closePanel();
    });

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return true;
  }

  var lastPoint = { x: 0, y: 0 };

  /* ---------- start ---------- */

  function start() {
    if (!window.draftUser || !window.draftAuth) return;
    if (!build()) return;
    loadAll().then(function (rows) {
      items = rows;
      render();
      var m = /(?:^|[#&])c=([\w-]+)/.exec(location.hash);
      if (m) {
        var c = byId(m[1]);
        if (c) {
          var rootC = c.parent_id ? byId(c.parent_id) || c : c;
          openPanel();
          focusItem(rootC.id);
          if (rootC.view === VIEW && sections[rootC.section] && !narrow.matches) focusPin(rootC);
        }
      }
    }, function () {
      barBtn.hidden = false;
      noteEl.textContent = 'Komentáře se nenačetly – zkuste to znovu.';
      noteEl.hidden = false;
    });
  }

  if (window.draftUser) {
    start();
  } else {
    document.addEventListener('draft:user', start, { once: true });
  }
})();
