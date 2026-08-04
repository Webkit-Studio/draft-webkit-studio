/* Webkit.Studio – komentáře s piny nad plátnem návrhu.
 *
 * Aktivace ve vieweru (před </body>, stránka musí mít gate.js + config.js
 * a v liště tlačítko <button class="cbtn" data-comments-toggle hidden>):
 *   <script src="/assets/comments.js" data-project="arbosis"
 *           data-version="v1" data-view="desktop"></script>
 * Vedle tlačítka komentářů si skript sám doskládá akcentní segment
 * „Přidat komentář" – viewer v markupu drží jen [data-comments-toggle].
 *
 * Data: tabulka comments v Supabase (REST /rest/v1/comments, RLS přes
 * has_project_access nad app_metadata). Pozice pinu = název sekce (data-screen-label bloku
 * plátna) + relativní souřadnice x/y (0–1) uvnitř sekce, takže pin drží
 * i při změně výšky okolních sekcí. Plátno je vložené přímo v dokumentu
 * (#frame, zmenšované transform: scale), takže vrstva pracuje nad ním bez
 * iframu; přepočet pozic řeší getBoundingClientRect při scrollu a resize.
 *
 * Panel ukazuje komentáře obou pohledů (počítač + mobil) pro projekt
 * a verzi; pin se kreslí jen pro aktuální pohled. Klik na komentář
 * z druhého pohledu přejde na druhý viewer s kotvou #c=<id>. Komentář ze
 * sekce, která už v návrhu není, pin nemá a panel to u něj poznamená.
 * Klient vlákno uklízí přes „Vyřešeno", mazat smí jen admin.
 *
 * Fáze B:
 * – filtry (stav / zobrazení / autor) nad seznamem, kombinují se, drží se
 *   v localStorage per projekt ("draft-filters-<projekt>") a platí i pro
 *   piny; počítadlo v liště je vždy počet nevyřešených,
 * – nepřečtené: localStorage "seen-<projekt>-<verze>" = čas posledního
 *   otevření panelu; novější cizí komentáře mají tečku u jména a lišta
 *   ukazuje „Komentáře (N · M nových)", otevřením panelu se M nuluje,
 * – trvalé odkazy: #c=<id> po přihlášení otevře panel, odscrolluje na
 *   komentář i pin a pulzne (u vyřešených dočasně povolí filtr stavu);
 *   „Kopírovat odkaz" u komentáře dá plnou URL do schránky,
 * – „Export" (jen role admin) stáhne <projekt>-<verze>-komentare.md.
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
    /* segment „Přidat komentář" přilepený k tlačítku komentářů (jako Počítač/Mobil);
       akcentní, dokud není režim zapnutý – pak akcent přebírá zvýrazněná sekce */
    '.cgroup{display:inline-flex;flex:none;border:1px solid var(--inverse-line,rgba(255,255,255,.24))}',
    '.cgroup .cbtn{border:0;height:28px}',
    '.cbadd{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 12px;flex:none;',
    'background:var(--accent,#ff4d00);border:0;',
    'border-left:1px solid var(--inverse-line,rgba(255,255,255,.24));border-radius:0;',
    'color:var(--accent-ink,#000);font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;',
    'transition:background var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1)),',
    'color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cbadd:hover,.cbadd[aria-pressed="true"]{background:var(--black,#000);color:var(--white,#fff)}',
    '.cbadd:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
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
    '.ctools-row{display:flex;gap:8px}',
    '.ctools-row .cadd{flex:1}',
    '.cexport{height:44px;padding:0 16px;background:transparent;border:1px solid var(--black,#000);border-radius:0;',
    'color:var(--black,#000);font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1)),',
    'border-color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cexport:hover{color:var(--accent,#ff4d00);border-color:var(--accent,#ff4d00)}',
    '.cexport:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cexport[hidden]{display:none}',
    /* filtry */
    '.cfilters{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 20px;',
    'border-bottom:1px solid var(--gray-300,#e2e2e2)}',
    '.cfgroup{display:inline-flex;border:1px solid var(--gray-300,#e2e2e2)}',
    '.cfbtn{padding:6px 10px;border:0;border-radius:0;background:transparent;color:var(--gray-500,#6f6f6f);',
    'font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cfbtn:hover{color:var(--accent,#ff4d00)}',
    '.cfbtn[aria-pressed="true"]{background:var(--black,#000);color:var(--white,#fff)}',
    '.cfbtn:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:-2px}',
    '.cfsel{height:30px;max-width:150px;padding:0 8px;border:1px solid var(--gray-300,#e2e2e2);border-radius:0;',
    'background:var(--white,#fff);color:var(--black,#000);font-family:inherit;font-size:12px;font-weight:600}',
    '.cfsel:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    /* nepřečtené + odkazy */
    '.cnew{display:inline-block;flex:none;width:6px;height:6px;background:var(--accent,#ff4d00)}',
    '.ccopy{font-weight:600;color:var(--gray-500,#6f6f6f);text-decoration:none;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.ccopy:hover{color:var(--accent,#ff4d00)}',
    '.ccopy:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
    '.cdel{margin-left:auto;font-weight:600;color:var(--gray-500,#6f6f6f);text-decoration:none;cursor:pointer;',
    'transition:color var(--dur-fast,120ms) var(--ease-out,cubic-bezier(0.2,0,0,1))}',
    '.cdel:hover{color:var(--accent,#ff4d00)}',
    '.cdel:focus-visible{outline:2px solid var(--focus-ring,#ff4d00);outline-offset:2px}',
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
    '.cbadd{padding:0 10px}',
    '.cbadd .cbadd-l{display:none}',
    '.ccomp{left:16px!important;right:16px;width:auto;top:auto!important;bottom:16px}',
    '}',
    '@media (prefers-reduced-motion:reduce){',
    '.cpanel,.cpin,.cbtn,.cbadd,.cadd,.cprim,.cghost,.cpanel-x,.creply{transition:none!important;animation:none!important}',
    '}'
  ].join('');

  /* ---------- stav ---------- */

  var frame = null;
  var sections = {};        /* data-screen-label → element (aktuální pohled) */
  var sectionOrder = [];    /* labely v pořadí dokumentu */
  var items = [];           /* všechny komentáře projektu+verze (oba pohledy) */
  var numbers = {};         /* id kořene → číslo pinu */
  var panelOpen = false;
  var picking = false;
  var draft = null;         /* {section,x,y} při otevřeném composeru */
  var replyFor = null;      /* id kořene s otevřenou odpovědí */
  var replyText = '';
  var tmpSeq = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia && window.matchMedia('(max-width: 560px)');

  var barBtn, barCount, barAdd, pinsLayer, catchLayer, panel, listEl, countEl, noteEl,
      addBtn, exportBtn, authorSel, filtersEl, comp, compText, compErr;
  var pinEls = {};          /* id → element pinu */
  var draftPinEl = null;

  /* ---------- filtry a nepřečtené ---------- */

  var FILTER_KEY = 'draft-filters-' + PROJECT;
  var SEEN_KEY = 'seen-' + PROJECT + '-' + VERSION;

  /* stav filtrů; deep link na skrytý komentář je dočasně povolí bez uložení */
  var filters = loadFilters();
  var seenAtLoad = loadSeen();  /* tečky drží stav z načtení stránky */
  var seenLive = seenAtLoad;    /* „M nových" se nuluje otevřením panelu */

  function loadFilters() {
    var def = { state: 'open', view: 'all', author: '' };
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (!raw) return def;
      var f = JSON.parse(raw);
      if (['open', 'resolved', 'all'].indexOf(f.state) < 0) f.state = def.state;
      if (['all', 'desktop', 'mobile'].indexOf(f.view) < 0) f.view = def.view;
      if (typeof f.author !== 'string') f.author = def.author;
      return f;
    } catch (e) { return def; }
  }
  function saveFilters() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (e) { /* nevadí */ }
  }
  function loadSeen() {
    try { return parseInt(localStorage.getItem(SEEN_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function storeSeen(ts) {
    seenLive = ts;
    try { localStorage.setItem(SEEN_KEY, String(ts)); } catch (e) { /* nevadí */ }
  }

  function isAdmin() {
    return !!(window.draftUser && window.draftUser.role === 'admin');
  }

  /* „Smazat" se vykresluje jen adminovi; skutečnou kontrolu drží RLS. */
  function deleteLink(id) {
    var a = el('a', 'cdel', 'Smazat');
    a.href = '#';
    a.setAttribute('data-del', id);
    return a;
  }

  function passes(c) {
    if (filters.state === 'open' && c.resolved) return false;
    if (filters.state === 'resolved' && !c.resolved) return false;
    if (filters.view !== 'all' && c.view !== filters.view) return false;
    if (filters.author && c.author_id !== filters.author) return false;
    return true;
  }

  function isNew(c, since) {
    if (c.pending) return false;
    if (window.draftUser && c.author_id === window.draftUser.id) return false;
    var t = Date.parse(c.created_at);
    return isFinite(t) && t > since;
  }
  function newCount() {
    return items.filter(function (c) { return isNew(c, seenLive); }).length;
  }
  function pluralNew(n) {
    if (n === 1) return 'nový';
    if (n >= 2 && n <= 4) return 'nové';
    return 'nových';
  }
  function countLabel() {
    var n = unresolvedCount();
    var m = newCount();
    return '(' + n + (m ? ' · ' + m + ' ' + pluralNew(m) : '') + ')';
  }

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

  /* Mazání smí jen admin (hlídá RLS). Odpovědi bere kaskáda v databázi. */
  function deleteRow(id) {
    return restFetch(REST + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
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
    if (!passes(c)) return false;
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
    refreshAuthors();
    barCount.textContent = countLabel();
    countEl.textContent = '(' + unresolvedCount() + ')';
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
    return roots().filter(passes);
  }

  /* ---------- filtry: UI ---------- */

  function filterGroup(key, label, options) {
    var group = el('div', 'cfgroup');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    options.forEach(function (opt) {
      var b = el('button', 'cfbtn', opt[1]);
      b.type = 'button';
      b.setAttribute('data-f', key);
      b.setAttribute('data-v', opt[0]);
      b.addEventListener('click', function () {
        if (filters[key] === opt[0]) return;
        filters[key] = opt[0];
        saveFilters();
        syncFilterUI();
        render();
      });
      group.appendChild(b);
    });
    return group;
  }

  function syncFilterUI() {
    if (!filtersEl) return;
    var btns = filtersEl.querySelectorAll('.cfbtn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.setAttribute('aria-pressed', String(filters[b.getAttribute('data-f')] === b.getAttribute('data-v')));
    }
    if (authorSel) authorSel.value = filters.author;
  }

  var lastAuthorsKey = null;
  function refreshAuthors() {
    if (!authorSel) return;
    var known = {};
    var authors = [];
    items.forEach(function (c) {
      if (c.author_id && !known[c.author_id]) {
        known[c.author_id] = true;
        authors.push({ id: c.author_id, name: c.author_name });
      }
    });
    authors.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    var key = authors.map(function (a) { return a.id; }).join(',');
    if (key === lastAuthorsKey) return;
    lastAuthorsKey = key;
    authorSel.textContent = '';
    var optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Všichni';
    authorSel.appendChild(optAll);
    authors.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.name;
      authorSel.appendChild(o);
    });
    if (filters.author && !known[filters.author]) filters.author = '';
    authorSel.value = filters.author;
  }

  /* ---------- trvalé odkazy a export ---------- */

  function commentUrl(c) {
    var file = c.view === 'desktop' ? 'desktop.html' : 'mobile.html';
    return location.origin + location.pathname.replace(/[^/]*$/, '') + file + '#c=' + c.id;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand('copy')) resolve(); else reject(new Error('copy'));
      } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function fmtAbs(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    var min = d.getMinutes();
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear() +
      ' ' + d.getHours() + ':' + (min < 10 ? '0' : '') + min;
  }

  function clientName() {
    var tc = document.querySelector('.bar .title .tc');
    return (tc && tc.textContent.trim()) || PROJECT;
  }

  /* Export je úplný záznam projektu+verze – filtry na něj nemají vliv. */
  function buildMarkdown() {
    var lines = [];
    lines.push('# ' + clientName() + ' – ' + VERSION + ' – komentáře');
    lines.push('');
    lines.push('Export: ' + fmtAbs(new Date().toISOString()));
    var all = roots();
    var bySection = {};
    var seq = [];
    all.forEach(function (c) {
      if (!bySection[c.section]) { bySection[c.section] = []; seq.push(c.section); }
      bySection[c.section].push(c);
    });
    var ordered = sectionOrder.filter(function (l) { return bySection[l]; })
      .concat(seq.filter(function (l) { return sectionOrder.indexOf(l) < 0; }));
    ordered.forEach(function (label) {
      lines.push('');
      lines.push('## ' + label);
      bySection[label].forEach(function (c) {
        lines.push('');
        lines.push('**' + (numbers[c.id] || '–') + '. ' + c.author_name + '** – ' + fmtAbs(c.created_at) +
          ' – ' + (VIEW_LABELS[c.view] || c.view) + ' – ' + (c.resolved ? 'vyřešený' : 'otevřený'));
        lines.push('');
        c.body.split('\n').forEach(function (ln) { lines.push(ln); });
        replies(c.id).forEach(function (r) {
          lines.push('');
          lines.push('  - **' + r.author_name + '** – ' + fmtAbs(r.created_at));
          r.body.split('\n').forEach(function (ln) { lines.push('    ' + ln); });
        });
      });
    });
    return lines.join('\n') + '\n';
  }

  function downloadExport() {
    var blob = new Blob([buildMarkdown()], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = PROJECT + '-' + VERSION + '-komentare.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
    if (isNew(c, seenAtLoad)) {
      var dot = el('span', 'cnew', '');
      dot.setAttribute('aria-hidden', 'true');
      meta.appendChild(dot);
    }
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
    if (!c.pending) {
      var copyA = el('a', 'ccopy', 'Kopírovat odkaz');
      copyA.href = '#';
      copyA.setAttribute('data-copy', c.id);
      act.appendChild(copyA);
    }
    if (isAdmin() && !c.pending) act.appendChild(deleteLink(c.id));
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
          if (isNew(kid, seenAtLoad)) {
            var rdot = el('span', 'cnew', '');
            rdot.setAttribute('aria-hidden', 'true');
            rmeta.appendChild(rdot);
          }
          rmeta.appendChild(el('span', 'ctime', kid.pending ? 'právě teď' : relTime(kid.created_at)));
          rep.appendChild(rmeta);
          rep.appendChild(el('div', 'ctext', kid.body));
          if (!kid.pending) {
            var rAct = el('div', 'cact');
            var rCopy = el('a', 'ccopy', 'Kopírovat odkaz');
            rCopy.href = '#';
            rCopy.setAttribute('data-copy', kid.id);
            rAct.appendChild(rCopy);
            if (isAdmin()) rAct.appendChild(deleteLink(kid.id));
            rep.appendChild(rAct);
          }
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
    /* návštěva panelu = přečteno; tečky drží stav z načtení stránky */
    storeSeen(Date.now());
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

  function markPick(on) {
    addBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    barAdd.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function enterPick() {
    if (picking) return;
    picking = true;
    catchLayer.classList.add('on');
    pinsLayer.classList.add('coff');
    markPick(true);
    schedule();
  }

  function exitPick() {
    if (!picking) return;
    picking = false;
    catchLayer.classList.remove('on');
    pinsLayer.classList.remove('coff');
    markPick(false);
    clearHl();
  }

  /* Zapnutí/vypnutí režimu přidávání – z lišty i z panelu. */
  function togglePick() {
    if (picking) { exitPick(); return; }
    closeComposer();
    if (narrow.matches) closePanel();
    enterPick();
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

    /* Tlačítko komentářů a „Přidat komentář" tvoří v liště jeden segment –
       přidat jde rovnou, bez otevírání panelu. Skládá se tady, aby viewer
       v markupu držel jen [data-comments-toggle]. */
    var group = el('span', 'cgroup');
    barBtn.parentNode.insertBefore(group, barBtn);
    group.appendChild(barBtn);
    barAdd = el('button', 'cbadd');
    barAdd.type = 'button';
    barAdd.setAttribute('data-comments-add', '');
    barAdd.setAttribute('aria-pressed', 'false');
    /* na úzkém okně zůstane vidět jen „Přidat", název pro čtečky je celý */
    barAdd.setAttribute('aria-label', 'Přidat komentář');
    barAdd.appendChild(el('span', null, 'Přidat'));
    barAdd.appendChild(el('span', 'cbadd-l', 'komentář'));
    group.appendChild(barAdd);

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
    var toolsRow = el('div', 'ctools-row');
    addBtn = el('button', 'cadd', 'Přidat komentář');
    addBtn.type = 'button';
    addBtn.setAttribute('aria-pressed', 'false');
    toolsRow.appendChild(addBtn);
    exportBtn = el('button', 'cexport', 'Export');
    exportBtn.type = 'button';
    exportBtn.hidden = !(window.draftUser && window.draftUser.role === 'admin');
    toolsRow.appendChild(exportBtn);
    tools.appendChild(toolsRow);
    panel.appendChild(tools);

    filtersEl = el('div', 'cfilters');
    filtersEl.appendChild(filterGroup('state', 'Stav',
      [['open', 'Otevřené'], ['resolved', 'Vyřešené'], ['all', 'Vše']]));
    filtersEl.appendChild(filterGroup('view', 'Zobrazení',
      [['all', 'Vše'], ['desktop', 'Počítač'], ['mobile', 'Mobil']]));
    authorSel = document.createElement('select');
    authorSel.className = 'cfsel';
    authorSel.setAttribute('aria-label', 'Autor');
    filtersEl.appendChild(authorSel);
    panel.appendChild(filtersEl);
    syncFilterUI();

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
    addBtn.addEventListener('click', togglePick);
    barAdd.addEventListener('click', togglePick);
    authorSel.addEventListener('change', function () {
      filters.author = authorSel.value;
      saveFilters();
      render();
    });
    exportBtn.addEventListener('click', downloadExport);
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
      var copy = t.closest('[data-copy]');
      if (copy) {
        e.preventDefault();
        var cc = byId(copy.getAttribute('data-copy'));
        if (!cc) return;
        copyText(commentUrl(cc)).then(function () {
          copy.textContent = 'Zkopírováno';
          setTimeout(function () { copy.textContent = 'Kopírovat odkaz'; }, 1500);
        }, function () { /* schránka nedostupná – text se nemění */ });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        e.preventDefault();
        var delId = del.getAttribute('data-del');
        var dc = byId(delId);
        if (!dc) return;
        var kidCount = replies(delId).length;
        if (!window.confirm(kidCount
          ? 'Smazat komentář včetně ' + pluralReplies(kidCount) + '? Nelze vrátit.'
          : 'Smazat komentář? Nelze vrátit.')) return;
        deleteRow(delId).then(function () {
          items = items.filter(function (x) {
            return x.id !== delId && x.parent_id !== delId;
          });
          if (replyFor === delId) { replyFor = null; replyText = ''; }
          render();
        }, function () {
          noteEl.textContent = 'Komentář se nepodařilo smazat – zkuste to znovu.';
          noteEl.hidden = false;
        });
        return;
      }
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

  /* Trvalý odkaz #c=<id>: otevři panel, odscrolluj na vlákno i pin a pulzni.
     Funguje při načtení i při změně hashe v otevřeném vieweru. */
  function openFromHash() {
    var m = /(?:^|[#&])c=([\w-]+)/.exec(location.hash);
    if (!m) return;
    var c = byId(m[1]);
    if (!c) return;
    var rootC = c.parent_id ? byId(c.parent_id) || c : c;
    /* dočasně (bez uložení) povol filtry tak, aby byl cíl vidět */
    if (!passes(rootC)) {
      if ((filters.state === 'open' && rootC.resolved) ||
          (filters.state === 'resolved' && !rootC.resolved)) filters.state = 'all';
      if (filters.view !== 'all' && filters.view !== rootC.view) filters.view = 'all';
      if (filters.author && filters.author !== rootC.author_id) filters.author = '';
      syncFilterUI();
      render();
    }
    openPanel().then(function () {
      focusItem(rootC.id);
      if (rootC.view === VIEW && sections[rootC.section] && !narrow.matches) focusPin(rootC);
    });
  }

  /* ---------- start ---------- */

  function start() {
    if (!window.draftUser || !window.draftAuth) return;
    if (!build()) return;
    loadAll().then(function (rows) {
      items = rows;
      render();
      openFromHash();
      window.addEventListener('hashchange', openFromHash);
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
