# Homepage V4 — Relume build map (Webflow handoff)

Cíl: postavit homepage 1:1 ve Webflow z Relume komponent (Client-First naming).
V4 DC (`HomepageV4Relume.dc.html`) má stejné vizuály/chování jako V2, ale DOM už
odpovídá struktuře Relume: `padding-global → container-large → padding-section-large`.
Každá sekce nese `data-relume="…"` s nejbližší Relume komponentou.
Tweak **Show Relume labels** zobrazí anotace přímo na stránce.

## Tokeny → Webflow variables
- `--color-black: #000000` (text, plochy, inverzní sekce)
- `--color-white: #ffffff`
- `--color-accent: #ff4d00` (CTA, tečky, hover)
- `--color-grey-100: #f4f4f4` (sekundární pozadí, placeholder)
- `--color-grey-300: #e2e2e2` (bordery)
- `--color-grey-600: #6f6f6f` (sekundární text)
- Font: **Urbanist** (400/500/600/700/800), mono: systémový `ui-monospace`
- Radius: 0 všude; jediný tvar = čtvrtkruh (`border-bottom-left-radius: 100%`)
- Container: `container-large` = 1200 px; `padding-global` = clamp(20px, 4vw, 32px)
- Section padding: large = clamp(64–72px, 9–10vw, 96–104px)

## Sekce → Relume komponenta (+ delty od stocku)
1. **Navbar 1** (`navbar_component`) — delty: oranžové CTA bez radiusu, bez dropdownů.
2. **Header 62** (`section_home-header`) — delty: interaktivní bloky (Blocks komponenta),
   kurzorový grid follower, klik = fyzika bloků → **custom code embed**; scroll-progress bar
   (fixed, 3px) → embed.
3. **Logo 6 / marquee** (`section_marquee`) — textový marquee, CSS keyframes loop
   (duplikovaný track, `translateX(-50%)`), pauza na hover → embed nebo Webflow interaction.
4. **Layout 465 + Layout 396** (`section_services`) — číslované řádky služeb (grid
   64px / 1fr / 1.2fr / 32px) + 4 mini karty. Hover: posun paddingu, oranžová čísla/šipky.
5. **Blog 67** (`section_cases`, bg `#f4f4f4`) — 3 karty s tagem; plovoucí náhled u kurzoru
   → custom code embed (nebo vynechat, čistě dekorativní).
6. **Layout 25** (`section_process`, inverzní černá) — split: obsah + číslovaný seznam 4 kroků.
7. **Contact 2** (`section_contact`) — delta: „dopisový“ formulář s contentEditable mezerami
   → ve Webflow nahradit standardním Form blockem stylovaným jako dopis, nebo embed.
8. **Footer 5** (`footer_component`) — slim: logo, 3 odkazy, copyright.

## Custom code embeds (JS mimo Relume)
- scroll progress bar, reveal-on-scroll (IntersectionObserver, 450ms, stagger 60ms)
- hero: grid follower + fyzika bloků (drag, gravitace, návrat po 15 s)
- cases: hover preview následující kurzor
- marquee loop (může být čistě CSS v embed `<style>`)

## Interakce (hover stavy — ve Webflow nativně)
- odkazy/nav: barva → accent; tlačítka: bg swap black↔accent, aktivní `translateY(1px)`
- řádky služeb / kroky: `padding-left` +24/12px, číslo → accent, šipka `translateX(8px)`
- karty cases: `border-top-color` → accent; mini karty: border → black + čtvrtkruh scale-in
- šipky v tlačítkách: `rotate(-45deg)` na hover
