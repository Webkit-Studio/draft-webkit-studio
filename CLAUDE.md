# draft.webkit.studio – klientské prostředí Webkit.Studio

Interní prostředí pro sdílení návrhů s klienty. GitHub Pages z větve `main`
(CNAME → draft.webkit.studio). Čistě statické: vanilla HTML/CSS/JS, žádný
build, žádné externí knihovny. Jediná externí závislost je Google Fonts
(Urbanist). Celý web je noindex (meta + robots.txt).

## Struktura

- `/index.html` – rozcestník klientů, bez hesla. Řádek klienta = **jen název
  a šipka**, žádné podtitulky ani stavy.
- `/<slug>/index.html` – stránka klienta, za bránou.
  Vzor s nahranou verzí: `arbosis/index.html`. Vzor bez verze: `anse/index.html`.
- `/<slug>/v<N>/desktop.html` + `mobile.html` – prohlížeč návrhu, za bránou.
  Plátno vložené nativně, zamčené na 1440 px / 375 px, zmenšuje se podle okna.
  Vzor: `arbosis/v1/`.
- `/<slug>/v<N>/wireframe.html` – surový export z Claude Design. Archiv,
  **nikdy needitovat**.
- `/assets/gate.js` – sdílená heslová brána, konfigurace `CLIENTS` na začátku.
- `/assets/favicon.svg|png` – favicon (čtvercový symbol na černé).
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

- Aktivace: `<script src="/assets/gate.js" data-client="<slug>"></script>`
  v `<head>` hned za `<title>` – musí být synchronní, skrývá obsah před
  prvním vykreslením.
- Ověření proti SHA-256 hashi v `CLIENTS`. **Plaintext hesla do repa nikdy**
  (repo je veřejné) – drží je Lukáš mimo repo. Návod na vygenerování hashe je
  v komentáři gate.js.
- Odemčení drží `sessionStorage["gate-<slug>"]` – platí pro záložku, nová
  záložka se ptá znovu.

## Postupy

### Nový klient
1. Vygenerovat heslo (slovo bez diakritiky + 2 číslice), spočítat hash,
   přidat záznam do `CLIENTS` v `gate.js` (slug, name, hash).
2. Zkopírovat `anse/index.html` → `/<slug>/index.html`; upravit `<title>`,
   `data-client`, `.cname` a `<h1>`.
3. Přidat řádek na rozcestník (abecedně): jen název + šipka.
4. Heslo předat Lukášovi v odpovědi, nikam ho neukládat.

### Nová verze návrhu
1. Založit `/<slug>/v<N>/` podle `arbosis/v1/`.
2. Z exportu Claude Design vyjmout desktopové a mobilní plátno a vložit
   nativně do `desktop.html` / `mobile.html`: bez postranních anotací a fold
   značek, kotvy funkční, na mobilu sticky CTA. Surový export uložit jako
   `wireframe.html`. V hlavičkách noindex + správný `<title>` + gate.
3. Na stránce klienta přidat/aktualizovat řádek verze: název verze, datum
   nahrání, štítek `vX.Y`, tlačítka Počítač (primární) / Mobil (ghost).

### Ověření před pushem
Lokálně `python3 -m http.server` + Playwright (`playwright-core`,
`executablePath: '/opt/pw-browsers/chromium'`): brány (jméno, heslo,
sessionStorage), rozcestník a filtr, responzivita (zlom co-brandu, sbalení
lišty, škálování plátna), screenshoty. Po pushi zkontrolovat workflow
„pages build and deployment" pro daný commit.
