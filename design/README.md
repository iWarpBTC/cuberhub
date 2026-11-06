# Cuber Hub — směr redesignu

## Záměr

Aplikace vznikla jako generátor scramblů a timer. Postupně přibyly taháky a tréninkové nástroje, z nichž některé jsou nyní schované v sekcích Tahák a Sušení. Redesign má představit Cuber Hub jako přehledné místo pro měření, cílený trénink a sledování pokroku. Timer zůstává klíčovou funkcí a musí být okamžitě dostupný.

## Hlavní navigace

Přehled slouží jako úvodní rozcestník. Vedle něj jsou trvale dostupné čtyři hlavní sekce:

| Sekce | Obsah a účel |
| --- | --- |
| Timer | Generování scramblů, měření a aktuální session. |
| Trénink | Sušení, cross, F2L a další cílená cvičení. Konkrétní tréninky jsou viditelné a mají krátké vysvětlení. |
| Taháky | Algoritmy, diagramy, orientace barev a další referenční pomůcky. |
| Statistiky | Historie, osobní rekordy a dlouhodobý pokrok. |

Sušení patří mezi způsoby tréninku, nikoli jako zastřešující název pro nesouvisející funkce. Interaktivní cvičení umístit do Tréninku; referenční obsah do Taháků. Související cvičení a tahák mohou být vzájemně propojené.

Na počítači i mobilu musí být hlavní sekce snadno dostupné. Timer je z rozcestníku dostupný jednou akcí. Při přechodu mezi sekcemi zachovat rozpracovanou session a kontext tréninku.

## Úvodní obrazovka: Přehled

Vytvořit kompaktní tréninkový rozcestník s hlavními volbami viditelnými bez dlouhého rolování. Doporučené pořadí obsahu:

1. **Pokračovat v poslední aktivitě.** Výrazná akce „Pokračovat v timeru“ nebo návrat do konkrétního tréninku. Při prvním otevření nabídnout „Spustit timer“.
2. **Vybrat aktivitu.** Jasné vstupy do Timeru, Tréninku, Taháků a Statistik. U tréninků ukázat konkrétní možnosti a stručný účel, například „Trénovat cross · plánování bez měření“. Neskrývat celou nabídku za obecný název Sušení.
3. **Poslední session.** Nenápadný stručný přehled s odkazem na detail. Novému uživateli zobrazit krátkou výzvu k prvnímu solve místo prázdných statistik.

Rozcestník má pomoci rozhodnout, co dělat dál. Podrobné grafy a kompletní historii ponechat ve Statistikách, aby nepřebily hlavní akce.

## Volitelná výchozí obrazovka

Rozcestník nesmí být povinnou zastávkou před každým měřením. V nastavení nabídnout:

- **Přehled** — výchozí volba pro nové uživatele.
- **Timer** — přímý vstup do měření.
- **Poslední aktivita** — návrat do naposledy používané sekce či konkrétního tréninku.

Volbu uložit a respektovat při dalším běžném otevření aplikace. Přímý odkaz na konkrétní obrazovku má přednost. Pokud poslední aktivita už není dostupná, otevřít Přehled. Návrat k aktivitě sám nespouští měření ani odpočet.

## Vizuální směr

Navázat na [identitu Cuber Hub](cuber-hub/README.md) a [náhled loga a ikony](cuber-hub/preview.html). Použít klidné plochy, čitelnou typografii, pravidelné mezery a střídmé barevné akcenty. Na obrazovce timeru má dominantní postavení čas a scramble; při měření ostatní prvky vizuálně utlumit.

Barevný pás je současně funkční tahák: **modrá → červená → zelená → oranžová → modrá → červená**, se žlutou nahoře a bílou dole. Krajní modrá a červená jsou ztmavené a označují pokračování cyklu. Zachovat pořadí i význam krajních dílků. V ikoně H používat jednotné odstíny skutečných barev kostky; ztmavené odstíny patří pouze krajům taháku.

## Postup redesignu

1. Zmapovat současné funkce a přiřadit je do Timeru, Tréninku, Taháků a Statistik. Nejprve zpřehlednit navigaci a odkrytí tréninků.
2. Navrhnout Přehled a volbu výchozí obrazovky jako součást stejné navigace.
3. Ověřit návrh na hlavním timeru, výběru a průběhu tréninku a historii se statistikami. Připravit mobilní i desktopovou podobu ve světlém a tmavém režimu.
4. Doladit vizuální systém a následně implementovat redesign při zachování uložených výsledků a rozpracovaného kontextu.

## Co má návrh splnit

- Nový uživatel pozná, že aplikace nabízí měření i samostatné tréninky.
- Konkrétní trénink najde podle jeho účelu bez znalosti původního členění aplikace.
- Pravidelný uživatel může aplikaci otevřít přímo v timeru.
- Z Přehledu lze jednou akcí spustit obrazovku timeru nebo pokračovat v poslední aktivitě.
- Hlavní sekce zůstávají snadno dostupné i na mobilu.
- Vizuální identita zachovává funkční význam barevného taháku.
