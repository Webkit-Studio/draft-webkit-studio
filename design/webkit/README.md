# Handoff: Webkit.Studio Design Style

## Overview
Kompletní balíček designového stylu Webkit.Studio pro implementaci v Claude Code — tokeny, typografie, brandové prvky, motion pravidla a referenční homepage (V4, strukturovaná podle Relume/Client-First pro build ve Webflow, ale použitelná pro jakýkoli stack).

## About the Design Files
Soubory v tomto balíčku jsou **designové reference vytvořené v HTML** — prototypy ukazující zamýšlený vzhled a chování, ne produkční kód ke zkopírování. Úkolem je **znovu postavit tyto návrhy v cílovém prostředí** (Webflow + Relume, React, Astro…) podle jeho zavedených vzorů. Pokud prostředí zatím neexistuje, zvol nejvhodnější framework a implementuj návrhy v něm. Class names v HomepageV4 (Client-First: `padding-global`, `container-large`, `section_*`) nenesou žádné styly — všechny hodnoty jsou inline; třídy jsou mapa struktury, hodnoty jsou zdroj pravdy.

## Fidelity
**High-fidelity.** Barvy, typografie, spacing i interakce jsou finální — recreate pixel-perfect.

## Design Tokens

### Barvy (monochrom + 1 akcent)
- `--black: #000000` — text, plochy, inverzní sekce
- `--white: #ffffff` — stránka
- `--gray-100: #f4f4f4` — zvednuté světlé povrchy, sekundární pozadí sekcí
- `--gray-300: #e2e2e2` — hairline bordery
- `--gray-500: #6f6f6f` — tlumený text (AA na bílé)
- `--accent: #ff4d00` — signální oranžová. POUZE cíleně: CTA, důraz, interaktivní stavy. Nikdy jako výplňová plocha nebo dekorace. Text na akcentu je vždy černý (`--accent-ink: #000000`).
- Inverzní sekce (černá): text `#ffffff`, tlumený `rgba(255,255,255,0.62)`, bordery `rgba(255,255,255,0.24)`.

### Typografie
- Jediný font: **Urbanist** (Google Fonts, variable 100–900, latin-ext pro češtinu). Fallback: 'Helvetica Neue', Arial, sans-serif.
- Mono: `ui-monospace, monospace` — jen technická meta (čísla, pořadová čísla řádků), nikdy nadpisy/body.
- Váhy: 400 body / 500 UI / 600 labels / 700 bold / 800 display.
- Škála (px): 12 xs · 14 sm · 16 base · 18 lg · 22 xl · display 28/40/56/80/112.
- Line-height: display 1.02 · heading 1.12 · body 1.55. Tracking: display −0.03em · heading −0.02em · CAPS labels +0.08em.
- Hierarchie přes váhu a velikost, ne přes další fonty.

### Spacing & layout
- 8px grid: 4/8/12/16/24/32/48/64/96/128/192.
- Container 1200px, gutter clamp(20px, 4vw, 32px), section padding clamp(64–72px, 9–10vw, 96–104px).
- **Radius 0 všude.** Jediná křivka = brandový čtvrtkruh: `border-bottom-left-radius: 100%` (vždy jen JEDEN roh).
- **Žádné stíny, nikdy.** Hloubka = hairliny (1px `#e2e2e2`, silné 2px `#000`) a výměny povrchů.

### Motion
- `--ease-snap: cubic-bezier(0.7, 0, 0.15, 1)` — podpis: rychlý nástup, tvrdé dosednutí (bloky, layout).
- `--ease-out: cubic-bezier(0.2, 0, 0, 1)` — UI stavy.
- Trvání: 120ms hover · 200ms UI · 450ms bloky/layout · stagger 60ms.
- Mechanické a přesné: translate + snap. Žádný bounce, elastic, ani fade-na-všechno. Respektovat `prefers-reduced-motion`.

### Brand
- Symbol: 4 černé bloky (čtverec + 3 čtvrtkruhy), viz `assets/logo/`. Signature animace: bloky se přeskládávají row ↔ square.
- Logotyp: „WEBKIT.STUDIO" 700, tracking 0.02em, vedle symbolu.
- Kicker/tagline vzor: 8px oranžový čtverec + uppercase label 12px/600/+0.08em `#6f6f6f`.

## Komponentové vzory (z homepage)
- **Tlačítka:** bez radiusu. Primární: bg `#ff4d00`, text černý 700, hover → bg černá/text bílá, active `translateY(1px)`. Sekundární: transparent + 1px černý border, hover → text i border oranžové. Šipka `→` uvnitř: hover `rotate(-45deg)` nebo `translateX(8px)`.
- **Číslované řádky (služby/proces):** grid, mono číslo `#6f6f6f`, spodní hairline; hover: padding-left +24px (světlé) / +12px (inverzní), číslo → oranžová.
- **Karty:** bílé, `border-top: 2px solid #000`, hover → oranžový top border. Mini karty: 1px šedý border, hover → černý border + oranžový čtvrtkruh scale-in v pravém dolním rohu (transform-origin 100% 100%).
- **Tagy:** 1px border, uppercase 11px/600/+0.08em, `#6f6f6f`.
- **Odkazy:** podtržené 1px, offset 3px, hover → oranžová. Selection: oranžové pozadí, černý text.
- Hover stavy detailně viz `build-map.md`.

## Interactions & Behavior
- Reveal-on-scroll: IntersectionObserver, opacity 0→1 + translateY 20px→0, 450ms ease-snap, stagger 60ms, threshold 0.12.
- Scroll progress bar: fixed top, 3px, oranžová.
- Marquee: duplikovaný track, `translateX(-50%)` loop 28s linear, pauza na hover.
- Hero: grid follower (48px grid), klik = fyzika bloků (gravitace, drag, návrat po 15s). Volitelné — čistě dekorativní vrstva.
- Vše dekorativní vypnout při `prefers-reduced-motion`.

## Files
- `styles.css` + `tokens/` — CSS custom properties (zdroj pravdy pro hodnoty)
- `fonts/urbanist.css` — načtení fontu
- `HomepageV4Relume.dc.html` — referenční homepage (otevři v prohlížeči; struktura = Relume/Client-First, `data-relume` atributy pojmenovávají komponenty)
- `build-map.md` — mapa sekce → Relume komponenta + delty od stocku + custom code embeds
- `guidelines/` — HTML specimeny (barvy, typo, spacing, motion, brand, states)
- `assets/logo/` — logo SVG
- `readme.md` — původní readme design systému
