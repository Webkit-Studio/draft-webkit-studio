# draft.webkit.studio – klientské prostředí Webkit.Studio

Interní prostředí pro sdílení návrhů s klienty. GitHub Pages z větve `main`
(CNAME → draft.webkit.studio). Čistě statické: vanilla HTML/CSS/JS, žádný
build, žádné externí knihovny. Jediná externí závislost je Google Fonts
(Urbanist). Celý web je noindex (meta + robots.txt).

## Struktura

- `/index.html` – rozcestník za přihlášením (gate.js bez `data-client`,
  pustí každého přihlášeného). Seznam projektů se generuje z tabulky
  `projects` (RLS vrací jen povolené): název + případný podtitulek + šipka.
  Pro roli admin nenápadný přepínač „Správa" (`#admintoggle`, šedý do
  otevření) a pod ním sekce Správa (`/assets/admin.js`) – hlavní na
  rozcestníku zůstávají projekty.
- `/<slug>/index.html` – stránka klienta, za bránou.
  Vzor s nahranou verzí: `arbosis/index.html`. Vzor bez verze: `anse/index.html`.
- `/<slug>/v<N>/desktop.html` + `mobile.html` – prohlížeč návrhu, za bránou.
  Plátno vložené nativně, zamčené na 1440 px / 375 px, zmenšuje se podle okna.
  Vzor: `arbosis/v1/`.
- `/<slug>/v<N>/wireframe.html` – surový export z Claude Design. Archiv,
  **nikdy needitovat**.
- `/assets/config.js` – Project URL + anon public klíč Supabase (jediná
  konfigurace; service_role klíč do repa nikdy).
- `/assets/gate.js` – sdílené přihlášení přes Supabase Auth (e-mail + heslo).
- `/assets/comments.js` – komentáře s piny ve viewerech.
- `/assets/admin.js` – sekce „Správa" na rozcestníku (jen role admin).
- `/assets/favicon.svg|png` – favicon (čtvercový symbol na černé).
- `/.github/workflows/keepalive.yml` – denní ping Supabase REST proti
  pauzování free tieru (+ udržovací commit 1× za 30 dní).
- `/design/webkit/` – handoff design systému. **Zdroj pravdy pro veškerý styl.**

## Pravidla

1. **Klientský obsah se needituje bez zadání.** Obsah pro klienta = plátno
   wireframu uvnitř `.frame` a soubory `wireframe.html`. Chrome okolo (lišty,
   stránky prostředí, brána) je moje odpovědnost a drží design systém.
2. Nedotýkat se: `CNAME`, `robots.txt`.
3. **Styl výhradně z tokenů** `/design/webkit/tokens/`: monochrom + akcent
   `#ff4d00` (střídmě, ideálně 1 akcentní prvek na pohled), radius 0 všude,
   žádné stíny (hloubka = hairliny `#e2e2e2`), Urbanist, focus stav = 2px
   akcentní ring s offsetem, motion 120/200 ms `cubic-bezier(0.2,0,0,1)`,
   respektovat `prefers-reduced-motion`. Nic nedopočítávat od oka.
4. **Texty: stroze.** Česky, en dash „–", žádná emoji. Žádné pomocné,
   vysvětlující ani zdvořilostní věty („Návrh si prohlédněte…", „Heslo jste
   dostali…" apod.) – působí jako AI slop. Placeholdery v [hranatých
   závorkách]. U verze návrhu jen datum nahrání (např. „4. 8. 2026")
   a štítek „v1.0".
5. **Co-brand:** „WEBKIT.STUDIO x NÁZEV" – `x` je akcentní a `aria-hidden`,
   název klienta uppercase přes CSS (v markupu normálně). Není součástí loga
   (vlastní `<span>`), ale musí tak vypadat. Logo má **jen dva stavy, žádný
   mezistav**: buď vše na jednom řádku, nebo symbol (40 px) nad celým
   textovým řádkem „WEBKIT.STUDIO x NÁZEV" – přepíná malý skript podle
   skutečné šířky (třídy `.measure`/`.stacked`). V liště prohlížeče se
   co-brand sbaluje jen na název klienta.
6. **Commity:** krátká česká zpráva bez diakritiky. Push do `main` spouští
   Pages build (~1 min). CDN cache 10 min – po nasazení hard refresh.

## Brána (gate.js)

- Aktivace v `<head>` hned za `<title>`, synchronně (skrývá obsah před
  prvním vykreslením):
  `<script src="/assets/config.js"></script>`
  `<script src="/assets/gate.js" data-client="<slug>" data-client-name="<Název>"></script>`
- Přihlášení e-mail + heslo proti Supabase Auth (čistý REST:
  `/auth/v1/token?grant_type=password`, `/auth/v1/user`). Session drží
  `localStorage["draft-session"]` (access + refresh token), při 401 se
  zkusí refresh. Registrace neexistuje, účty zakládá Lukáš v Supabase
  (Dashboard → Authentication → Users). **Hesla ani service_role klíč do
  repa nikdy** (repo je veřejné).
- Přístup per projekt přes `app_metadata` (uživatel si je sám nepřepíše;
  `user_metadata` je editovatelné, do bezpečnosti nikdy nepatří):
  `role: "admin"` smí všude, jinak pole `projects` musí obsahovat slug
  z `data-client`. Gate čte autorizaci výhradně z `app_metadata`,
  z `user_metadata` jen jména. Bez přístupu se místo obsahu ukáže
  „Nemáte přístup k tomuto projektu." Bez `data-client` (rozcestník)
  stačí být přihlášený; co-brand je jen WEBKIT.STUDIO.
- Po odemčení gate naplní `[data-auth-name]` (jméno „Lukáš S."), odkryje
  `[data-auth]`, naváže `[data-auth-signout]` a vystaví `window.draftUser`
  + `window.draftAuth.fetch` (autorizovaný fetch pro REST) + událost
  `draft:user` pro comments.js.

## Komentáře (comments.js)

- Aktivace ve viewerech (před `</body>`):
  `<script src="/assets/comments.js" data-project="<slug>" data-version="v<N>" data-view="desktop|mobile"></script>`
  Lišta vieweru musí mít `<button class="cbtn" data-comments-toggle hidden>`.
- Data v Supabase tabulce `comments` (REST `/rest/v1/comments`, RLS přes
  `has_project_access` nad `app_metadata`). Pozice pinu =
  `data-screen-label` sekce plátna +
  relativní x/y (0–1) uvnitř sekce. Panel ukazuje oba pohledy pro
  projekt+verzi, pin se kreslí jen v aktuálním pohledu; klik na komentář
  z druhého pohledu přechází na druhý viewer s `#c=<id>`. Klient vlákna
  uklízí přes „Vyřešeno"; mazat smí jen admin („Smazat" s potvrzením,
  vlastní i cizí, smazání kořene vezme kaskádou i odpovědi).
- Fáze B: filtry stav/zobrazení/autor (kombinují se, localStorage
  `draft-filters-<projekt>`, platí i pro piny; počítadlo v liště je vždy
  počet nevyřešených), nepřečtené (localStorage `seen-<projekt>-<verze>`,
  tečka u jména + „(N · M nových)" v liště, nuluje se otevřením panelu),
  trvalé odkazy `#c=<id>` + „Kopírovat odkaz" u komentáře, „Export" do
  Markdownu (jen role admin). Na klientském indexu štítek u verze
  (`[data-vc="v<N>"]` + inline skript): nejdřív počet otevřených akcentní
  barvou, pak „·" a celkový počet; bez otevřených jen celkový počet.

## Projekty a Správa (admin.js)

- Tabulka `projects` (slug, name, subtitle, sort) je zdroj pravdy pro
  rozcestník; RLS: select podle `has_project_access(slug)`, insert/update/
  delete jen role admin (čteno z `app_metadata`).
- Autorizace stojí na `app_metadata` (uživatel needitovatelné): `role` a
  `projects` tam zrcadlí `admin_set_user_projects`; `user_metadata` drží
  jen jména + zrcadlo pro UI. `has_project_access` i admin funkce/politiky
  čtou výhradně `app_metadata`.
- Admin logika výhradně přes SQL funkce (security definer, kontrola role
  uvnitř) volané přes `/rest/v1/rpc/` tokenem přihlášeného admina:
  `admin_list_users`, `admin_set_user_projects` (zapisuje `app_metadata` i
  zrcadlo v `user_metadata`), `admin_set_user_password`,
  `admin_create_user`. **Service_role klíč nikdy v repu ani v
  prohlížeči.** Skrytí Správy v UI není bezpečnostní prvek – bezpečnost
  drží RLS a funkce.
- Nový účet jde založit v „Přidat uživatele" (e-mail, jméno, příjmení):
  vznikne bez role a bez přístupů, heslo se vygeneruje a rovnou ukáže.
  Roli admin lze dát jen zásahem do `app_metadata` v Supabase.
- Hesla: uložené heslo je bcrypt hash, přečíst ho nelze. Ve Správě jde jen
  nastavit nové – vygeneruje se v prohlížeči, uloží přes
  `admin_set_user_password` a zůstane zobrazené do zavření stránky
  (tečky, najetím se odkryje, kliknutím zkopíruje). Do repa nikdy.
  Adminovi smí heslo měnit jen on sám (hlídá SQL funkce).
- Grants: `anon` má na `projects`/`comments` jen SELECT (RLS vrací prázdno,
  keepalive dostává 200 `[]`), `authenticated` bez DELETE na `comments`
  (mazání neexistuje, jen „Vyřešeno").
- Smazání projektu maže jen záznam; komentáře v databázi i složka v repu
  zůstávají. Změna přístupů se projeví po příštím přihlášení / obnovení
  session uživatele (nový JWT s aktuálním `app_metadata`).

## Postupy

### Nový klient
1. V Supabase založit/upravit uživatele klienta: heslo drží Lukáš mimo
   repo, `user_metadata` = `first_name`, `last_name`. Přístup k projektům
   se nenastavuje ručně – řídí ho `app_metadata`, které zapisuje sekce
   „Správa" (krok 3). (Roli admin lze nastavit jen v `app_metadata`
   uživatele, ne přes UI.)
2. Zkopírovat `anse/index.html` → `/<slug>/index.html`; upravit `<title>`,
   `data-client`, `data-client-name`, `.cname` a `<h1>`.
3. Přidat projekt v sekci „Správa" na rozcestníku (slug = název složky)
   a zaškrtnout uživateli přístup (píše se do `app_metadata`).

### Nová verze návrhu
1. Založit `/<slug>/v<N>/` podle `arbosis/v1/`.
2. Z exportu Claude Design vyjmout desktopové a mobilní plátno a vložit
   nativně do `desktop.html` / `mobile.html`: bez postranních anotací a fold
   značek, kotvy funkční, na mobilu sticky CTA. Surový export uložit jako
   `wireframe.html`. V hlavičkách noindex + správný `<title>` + config.js
   + gate; v liště tlačítko komentářů, před `</body>` comments.js.
3. Na stránce klienta přidat/aktualizovat řádek verze: název verze, datum
   nahrání, štítek `vX.Y`, tlačítka Počítač (primární) / Mobil (ghost).

### Ověření před pushem
Lokálně `python3 -m http.server` + Playwright (`playwright-core`,
`executablePath: '/opt/pw-browsers/chromium'`): brány (jméno, heslo,
sessionStorage), rozcestník a filtr, responzivita (zlom co-brandu, sbalení
lišty, škálování plátna), screenshoty. Po pushi zkontrolovat workflow
„pages build and deployment" pro daný commit.
