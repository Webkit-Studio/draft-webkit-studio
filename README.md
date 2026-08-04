# draft.webkit.studio

Klientské prostředí Webkit.Studio pro sdílení pracovních návrhů.
GitHub Pages z větve `main`, čistě statické – vanilla HTML/CSS/JS, bez
buildu a bez externích knihoven (jen Google Fonts / Urbanist). Celý web
je noindex.

**Živě:** https://draft.webkit.studio

## Jak to funguje

- **Rozcestník** `/` – seznam klientů s hledáním, bez hesla.
- **Stránka klienta** `/<klient>/` – za heslovou bránou; verze návrhů
  s datem nahrání a tlačítky Počítač / Mobil.
- **Prohlížeč návrhu** `/<klient>/v<N>/desktop.html` a `mobile.html` –
  plátno wireframu zamčené na 1440 px / 375 px, zmenšuje se podle okna.
- **Brána** `assets/gate.js` – jeden sdílený skript pro všechny klienty;
  hesla se ověřují proti SHA-256 hashům, plaintext v repu není. Odemčení
  platí pro záložku (sessionStorage).

## Struktura

```
index.html               rozcestník
assets/gate.js           heslová brána (konfigurace klientů)
assets/favicon.svg|png   favicon
<klient>/index.html      stránka klienta
<klient>/v<N>/           desktop.html · mobile.html · wireframe.html (surový export)
design/webkit/           design systém – zdroj pravdy pro styl
CLAUDE.md                pravidla a postupy prostředí
```

## Běžné úkony

Postupy krok za krokem – nový klient, nová verze návrhu, změna hesla –
jsou v `CLAUDE.md`. Hesla klientů se drží mimo repo.
