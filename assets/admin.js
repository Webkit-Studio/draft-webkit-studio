/* Webkit.Studio – sekce „Správa" na rozcestníku (jen role admin).
 *
 * Aktivace: <script src="/assets/admin.js"></script> na rozcestníku;
 * stránka musí mít <section id="admin" hidden> a config.js + gate.js.
 * Ne-adminům se sekce vůbec nevykreslí – bezpečnost ale stojí na RLS
 * tabulky projects a na SQL funkcích admin_list_users /
 * admin_set_user_projects (security definer, kontrola role v SQL),
 * volaných přes /rest/v1/rpc/ tokenem přihlášeného admina.
 * Service_role klíč se v prohlížeči nikdy nepoužívá.
 *
 * a) Projekty: seznam z tabulky projects, inline úprava (název,
 *    podtitulek, pořadí), „Přidat projekt" (insert), mazání s confirmem –
 *    maže jen záznam, komentáře i složka v repu zůstávají.
 * b) Uživatelé a přístupy: admin_list_users, u ne-adminů checkboxy
 *    projektů; změna posílá admin_set_user_projects s kompletním novým
 *    polem slugů. Projeví se až po příštím přihlášení / obnovení session.
 */
(function () {
  'use strict';

  var CFG = window.DRAFT_CONFIG || {};
  var API = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');

  var CSS = [
    '#admin{margin-top:64px;border-top:1px solid var(--gray-300);padding-top:40px}',
    '#admin[hidden]{display:none}',
    '.a-title{font-size:clamp(22px,4vw,28px);font-weight:700;letter-spacing:-.02em;line-height:1.12;margin-bottom:28px}',
    '.a-kicker{display:flex;align-items:center;gap:10px;margin:36px 0 12px}',
    '.a-kicker .dot{width:8px;height:8px;background:var(--black)}',
    '.a-kicker .label{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--gray-500)}',
    '.a-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:12px 0;border-top:1px solid var(--gray-300)}',
    '.a-row:last-of-type{border-bottom:1px solid var(--gray-300)}',
    '.a-slug{flex:none;width:132px;font-size:13px;font-weight:600;word-break:break-all}',
    '.a-in{height:36px;padding:0 10px;border:1px solid var(--gray-300);border-radius:0;background:var(--white);',
    'font:inherit;font-size:13.5px;color:var(--black);appearance:none;min-width:0}',
    '.a-in::placeholder{color:var(--gray-500)}',
    '.a-in:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}',
    '.a-in.a-name{flex:1 1 140px}',
    '.a-in.a-sub{flex:1 1 160px}',
    '.a-in.a-sort{flex:none;width:64px}',
    '.a-link{flex:none;font-size:12.5px;font-weight:600;color:var(--gray-500);text-decoration:none;cursor:pointer;',
    'background:none;border:0;border-radius:0;padding:0;font-family:inherit;',
    'transition:color var(--dur-fast) var(--ease-out)}',
    '.a-link:hover{color:var(--accent)}',
    '.a-link:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}',
    '.a-btn{height:40px;padding:0 18px;border:1px solid var(--black);border-radius:0;background:transparent;',
    'color:var(--black);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;',
    'transition:color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)}',
    '.a-btn:hover{color:var(--accent);border-color:var(--accent)}',
    '.a-btn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}',
    '.a-btn.a-prim{background:var(--black);color:var(--white);border-color:var(--black)}',
    '.a-btn.a-prim:hover{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}',
    '.a-add{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.a-status{flex:none;font-size:12.5px;font-weight:600;color:var(--gray-500)}',
    '.a-status.a-err{color:var(--accent)}',
    '.a-status:empty{display:none}',
    '.a-user{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;padding:14px 0;border-top:1px solid var(--gray-300)}',
    '.a-user:last-of-type{border-bottom:1px solid var(--gray-300)}',
    '.a-user b{font-size:15px;font-weight:600}',
    '.a-mail{font-size:13px;color:var(--gray-500)}',
    '.a-all{margin-left:auto;font-size:12.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;',
    'border:1px solid var(--black);padding:3px 8px;white-space:nowrap}',
    '.a-checks{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px 14px}',
    '.a-checks label{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;',
    'color:var(--gray-500);cursor:pointer;white-space:nowrap}',
    '.a-checks input{width:15px;height:15px;margin:0;accent-color:var(--black)}',
    '.a-checks input:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}',
    '.a-note{margin-top:14px;font-size:12.5px;color:var(--gray-500)}',
    '@media (max-width:560px){.a-slug{width:100%}.a-checks,.a-all{margin-left:0}}'
  ].join('');

  var root, projRows, userRows, addWrap, addForm = null;
  var projects = [];
  var users = [];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function rest(path, opts) {
    return window.draftAuth.fetch(API + path, opts).then(function (res) {
      if (!res.ok) throw new Error('rest-' + res.status);
      if (res.status === 204) return null;
      return res.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }

  function getProjects() {
    return rest('/rest/v1/projects?select=slug,name,subtitle,sort&order=sort.asc,name.asc');
  }
  function insertProject(row) {
    return rest('/rest/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
  }
  function patchProject(slug, patch) {
    return rest('/rest/v1/projects?slug=eq.' + encodeURIComponent(slug), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch)
    });
  }
  function deleteProject(slug) {
    return rest('/rest/v1/projects?slug=eq.' + encodeURIComponent(slug), { method: 'DELETE' });
  }
  function rpc(name, body) {
    return rest('/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  function flash(statusEl, ok, message) {
    statusEl.textContent = message;
    statusEl.classList.toggle('a-err', !ok);
    if (ok) {
      setTimeout(function () {
        if (statusEl.textContent === message) statusEl.textContent = '';
      }, 1800);
    }
  }

  /* ---------- projekty ---------- */

  function projectRow(p) {
    var row = el('div', 'a-row');
    row.appendChild(el('b', 'a-slug', p.slug));
    var name = el('input', 'a-in a-name');
    name.value = p.name || '';
    name.setAttribute('aria-label', 'Název – ' + p.slug);
    var sub = el('input', 'a-in a-sub');
    sub.value = p.subtitle || '';
    sub.placeholder = 'Podtitulek';
    sub.setAttribute('aria-label', 'Podtitulek – ' + p.slug);
    var sort = el('input', 'a-in a-sort');
    sort.type = 'number';
    sort.value = p.sort;
    sort.setAttribute('aria-label', 'Pořadí – ' + p.slug);
    var del = el('button', 'a-link', 'Smazat');
    del.type = 'button';
    var status = el('span', 'a-status', '');
    row.appendChild(name);
    row.appendChild(sub);
    row.appendChild(sort);
    row.appendChild(del);
    row.appendChild(status);

    function save() {
      var patch = {
        name: name.value.trim() || p.slug,
        subtitle: sub.value.trim() || null,
        sort: parseInt(sort.value, 10) || 0
      };
      patchProject(p.slug, patch).then(function () {
        p.name = patch.name;
        p.subtitle = patch.subtitle;
        p.sort = patch.sort;
        flash(status, true, 'Uloženo');
        window.draftProjectsReload && window.draftProjectsReload();
      }, function () {
        name.value = p.name || '';
        sub.value = p.subtitle || '';
        sort.value = p.sort;
        flash(status, false, 'Změna se neuložila – zkuste to znovu.');
      });
    }
    name.addEventListener('change', save);
    sub.addEventListener('change', save);
    sort.addEventListener('change', save);

    del.addEventListener('click', function () {
      if (!window.confirm('Smazat projekt? Komentáře zůstanou v databázi.')) return;
      deleteProject(p.slug).then(function () {
        reloadProjects();
        window.draftProjectsReload && window.draftProjectsReload();
      }, function () {
        flash(status, false, 'Změna se neuložila – zkuste to znovu.');
      });
    });
    return row;
  }

  function closeAddForm() {
    if (addForm) {
      addForm.remove();
      addForm = null;
    }
  }

  function openAddForm() {
    if (addForm) return;
    addForm = el('div', 'a-add');
    var slug = el('input', 'a-in a-name');
    slug.placeholder = 'slug';
    slug.setAttribute('aria-label', 'Slug');
    var name = el('input', 'a-in a-name');
    name.placeholder = 'Název';
    name.setAttribute('aria-label', 'Název');
    var sub = el('input', 'a-in a-sub');
    sub.placeholder = 'Podtitulek';
    sub.setAttribute('aria-label', 'Podtitulek');
    var sort = el('input', 'a-in a-sort');
    sort.type = 'number';
    sort.placeholder = '0';
    sort.setAttribute('aria-label', 'Pořadí');
    var save = el('button', 'a-btn a-prim', 'Přidat');
    save.type = 'button';
    var cancel = el('button', 'a-btn', 'Zrušit');
    cancel.type = 'button';
    var status = el('span', 'a-status', '');
    addForm.appendChild(slug);
    addForm.appendChild(name);
    addForm.appendChild(sub);
    addForm.appendChild(sort);
    addForm.appendChild(save);
    addForm.appendChild(cancel);
    addForm.appendChild(status);
    addWrap.appendChild(addForm);
    slug.focus();

    save.addEventListener('click', function () {
      var s = slug.value.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(s)) {
        flash(status, false, 'Slug smí mít jen malá písmena, číslice a pomlčky.');
        slug.focus();
        return;
      }
      insertProject({
        slug: s,
        name: name.value.trim() || s,
        subtitle: sub.value.trim() || null,
        sort: parseInt(sort.value, 10) || 0
      }).then(function () {
        closeAddForm();
        reloadProjects();
        window.draftProjectsReload && window.draftProjectsReload();
      }, function () {
        flash(status, false, 'Projekt se neuložil – zkuste to znovu.');
      });
    });
    cancel.addEventListener('click', closeAddForm);
  }

  function renderProjects() {
    projRows.textContent = '';
    projects.forEach(function (p) {
      projRows.appendChild(projectRow(p));
    });
  }

  function reloadProjects() {
    return getProjects().then(function (rows) {
      projects = rows || [];
      renderProjects();
      renderUsers();
    });
  }

  /* ---------- uživatelé a přístupy ---------- */

  function userName(u) {
    var full = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
    return full || u.email;
  }

  function userRow(u) {
    var row = el('div', 'a-user');
    row.appendChild(el('b', null, userName(u)));
    row.appendChild(el('span', 'a-mail', u.email));
    var status = el('span', 'a-status', '');
    if (u.role === 'admin') {
      row.appendChild(el('span', 'a-all', 'Přístup ke všemu'));
      row.appendChild(status);
      return row;
    }
    var checks = el('div', 'a-checks');
    var current = Array.isArray(u.projects) ? u.projects.slice() : [];
    projects.forEach(function (p) {
      var label = el('label', null);
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.value = p.slug;
      box.checked = current.indexOf(p.slug) > -1;
      label.appendChild(box);
      label.appendChild(document.createTextNode(' ' + p.name));
      checks.appendChild(label);
      box.addEventListener('change', function () {
        var next = [];
        var boxes = checks.querySelectorAll('input');
        for (var i = 0; i < boxes.length; i++) {
          if (boxes[i].checked) next.push(boxes[i].value);
        }
        rpc('admin_set_user_projects', { target_user: u.id, new_projects: next }).then(function () {
          u.projects = next;
          flash(status, true, 'Uloženo');
        }, function () {
          box.checked = !box.checked;
          flash(status, false, 'Změna se neuložila – zkuste to znovu.');
        });
      });
    });
    row.appendChild(checks);
    row.appendChild(status);
    return row;
  }

  function renderUsers() {
    userRows.textContent = '';
    users.forEach(function (u) {
      userRows.appendChild(userRow(u));
    });
  }

  function reloadUsers() {
    return rpc('admin_list_users').then(function (rows) {
      users = (rows || []).sort(function (a, b) {
        var ar = a.role === 'admin' ? 0 : 1;
        var br = b.role === 'admin' ? 0 : 1;
        if (ar !== br) return ar - br;
        var an = userName(a).toLowerCase();
        var bn = userName(b).toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      renderUsers();
    });
  }

  /* ---------- stavba ---------- */

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root.textContent = '';
    root.appendChild(el('h2', 'a-title', 'Správa'));

    var pk = el('div', 'a-kicker');
    pk.appendChild(el('span', 'dot', ''));
    pk.children[0].setAttribute('aria-hidden', 'true');
    pk.appendChild(el('span', 'label', 'Projekty'));
    root.appendChild(pk);
    projRows = el('div', null);
    root.appendChild(projRows);
    addWrap = el('div', null);
    root.appendChild(addWrap);
    var addBtn = el('button', 'a-btn', 'Přidat projekt');
    addBtn.type = 'button';
    addBtn.style.marginTop = '14px';
    root.appendChild(addBtn);
    addBtn.addEventListener('click', openAddForm);

    var uk = el('div', 'a-kicker');
    uk.appendChild(el('span', 'dot', ''));
    uk.children[0].setAttribute('aria-hidden', 'true');
    uk.appendChild(el('span', 'label', 'Uživatelé a přístupy'));
    root.appendChild(uk);
    userRows = el('div', null);
    root.appendChild(userRows);
    root.appendChild(el('p', 'a-note',
      'Změna přístupu se projeví po příštím přihlášení nebo obnovení session.'));

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && addForm) closeAddForm();
    });

    root.hidden = false;
    reloadProjects();
    reloadUsers();
  }

  function start() {
    if (!window.draftUser || !window.draftAuth || !API) return;
    if (window.draftUser.role !== 'admin') return;
    root = document.getElementById('admin');
    if (!root) return;
    build();
  }

  if (window.draftUser) {
    start();
  } else {
    document.addEventListener('draft:user', start, { once: true });
  }
})();
