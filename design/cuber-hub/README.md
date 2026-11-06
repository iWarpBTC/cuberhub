# Cuber Hub — návrh vizuální identity

První koncept pro budoucí redesign. Vychází z původních souborů `design/color-band-light.svg` a `design/color-band-dark.svg`. Současnou aplikaci ani její ikony tento návrh nemění.

## Soubory

- `logo-light.svg`: transparentní logo na světlé pozadí.
- `logo-dark.svg`: transparentní logo na tmavé pozadí.
- `logo-horizontal-light.svg`, `logo-horizontal-dark.svg`: vodorovná varianta pro lišty a jiná nízká místa. Pás a název stojí vedle sebe, verzálky názvu mají výšku dílku. Soubor obsahuje ochranný prostor jednoho dílku ze všech stran; v hlavičce aplikace vysoké 44 px vyplní celou výšku.
- `icon.svg`: samostatné H na tmavém zaobleném podkladu.
- `preview.html`: společný náhled včetně ikony v 64, 32 a 16 px; otevřít v prohlížeči.

Logo kombinuje původní pás šesti dílků s názvem Cuber Hub. Pás je funkční tahák na cyklické pořadí bočních barev při bílé dole: **modrá → červená → zelená → oranžová → modrá → červená**. První modrá a poslední červená jsou ztmavené: ukazují pokračování cyklu a umožňují u každé ze čtyř prostředních barev okamžitě přečíst levého a pravého souseda. Pořadí ani toto zvýraznění neměnit podle tématu aplikace. Žlutá horní a bílá spodní linka zůstávají součástí motivu. Ikona převádí dílky do sedmidílného H, které odkazuje na Hub. V ikoně má každá barva kostky jediný jednotný odstín: modrá, červená, zelená a oranžová v H, žlutá a bílá v linkách. Ztmavené krajní odstíny patří pouze taháku v logu, nikoli ikoně. Zelená se opakuje, aby příčka působila vyváženě. Je to nová kompozice, nikoli schéma skutečné stěny kostky.

## Směr redesignu

Klidné, přehledné prostředí pro soustředěný trénink. Barvy kostky mají dodat charakter a orientaci; hlavní prostor patří času, scramblu a výsledkům. Vyhnout se barevným rámečkům kolem každého panelu a plošnému obarvování celé aplikace.

### Záhlaví a navigace

Na široké obrazovce použít logo s názvem, na mobilu samotnou ikonu vedle krátkého názvu. Pás může být podpisem domovské obrazovky nebo navigačního panelu a zároveň dostupnou pomůckou při tréninku orientace barev. Při použití jako taháku vždy zobrazit celou sekvenci včetně ztmavených krajů. Na aktivní obrazovce timeru stačí menší značka. Celé logo neopakovat v každé kartě.

Sekcím lze přiřadit jeden barevný akcent, například modrou timeru, zelenou tréninku a oranžovou statistikám. Barva musí být vždy doplněna názvem nebo ikonou. Červenou používat opatrně, aby se nepletla s chybami a mazáním.

### Timer a soustředění

Nejvýraznějším prvkem má být velký čas s číslicemi stejné šířky. Při měření utlumit navigaci i barevný pás. Připravenost vyjádřit textem a jednou stavovou barvou; všechny barvy značky nemají současně blikat. Návrat do běžného zobrazení může doprovodit krátké jemné rozsvícení pásu.

### Panely, historie a statistiky

Převzít z dílků mírně zaoblené rohy, pravidelné mezery a modulární mřížku. Panely ponechat převážně neutrální. Dílky mohou označovat vybraný trénink nebo aktivní filtr. Grafům přiřadit stabilní barvy a čitelné popisky; necyklovat bez významu všechny barvy loga. Osobní rekord zvýraznit malým barevným detailem u výsledku.

### Úvodní a prázdné obrazovky

Použít větší pás nad krátkým vysvětlením a jednou hlavní akcí, například „Začít první solve“. Ze stejných dílků lze skládat drobné ilustrace pro prázdnou historii, dokončený trénink nebo import. Motiv by měl podporovat sdělení, ne působit jako další ovládací prvek.

### Pohyb

Krátké postupné objevení dílků při prvním načtení nebo dokončení tréninku může spojit značku s pocitem pokroku. Nepoužívat nekonečnou animaci poblíž timeru. Respektovat nastavení omezeného pohybu a nepřidávat čekání jen kvůli animaci.

## Barvy a typografie

| Role | Barva |
| --- | --- |
| Tmavý základ | `#101d32` |
| Text na světlém pozadí | `#14243b` |
| Modrá | `#3b82f6` |
| Ztmavená modrá — pouze levý kraj taháku | `#204887` |
| Červená | `#ef4444` |
| Ztmavená červená — pouze pravý kraj taháku | `#832525` |
| Zelená | `#22c55e` |
| Oranžová | `#f97316` |
| Žlutá linka | `#facc15` |
| Bílá linka / světlý text | `#f1f5f9` |

Barvy loga nejsou automaticky vhodné pro drobný text na libovolném pozadí. Při implementaci ověřit kontrast textů, ovládání a stavů v obou režimech. Význam nikdy nesdělovat pouze barvou.

Návrh wordmarku používá Inter s náhradními systémovými fonty. SVG obsahuje živý text: vzhled závisí na dostupném fontu. Po schválení typografie připravit finální export s textem převedeným na křivky. V aplikaci použít stejnou rodinu písma, pro timer tabulární číslice.

## Používání loga a ikony

Kolem loga ponechat alespoň prostor odpovídající výšce jednoho barevného dílku. Zachovat poměr stran, pořadí barev i mezery. Na fotografiích nebo rušném podkladu použít klidnou plochu pod logem.

Plné logo je určeno přibližně od šířky 180 px. Pod touto velikostí upřednostnit ikonu. Vodorovná varianta potřebuje na výšku jen 44 px, na šířku ale zhruba 190 px: v hlavičce na mobilu, kde vedle sekcí nezbývá místo, ji nahrazuje samotný pás. Pro favicon 16 px při finalizaci zvážit zjednodušené H bez horní a spodní linky; nynější SVG je společný koncept pro všechny velikosti. Před nasazením připravit samostatné PNG exporty, favicon a maskovatelnou ikonu s odpovídající bezpečnou zónou. Zaoblený podklad současné ikony je prezentační varianta.

## Doporučený další krok

Ověřit motiv na třech konkrétních obrazovkách: hlavní timer, historie se statistikami a výběr tréninku. Připravit je ve světlém i tmavém režimu a na mobilu. Podle výsledku doladit hustotu informací, typografii, velikost značky a teprve potom vytvořit finální produkční exporty.
