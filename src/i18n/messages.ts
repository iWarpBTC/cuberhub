import type { TimerPhase } from '../hooks/useTimer';
import type { SortOrder } from '../components/ScrambleList';
import type { ImportErrorCode } from '../lib/storage';
import type { Face } from '../lib/cube';
import type { Lang } from './lang';

const en = {
  langName: 'English',
  switchLanguage: 'Přepnout do češtiny',

  scrambleName: (n: number | string) => `Scramble #${n}`,
  setName: (n: number | string) => `Set #${n}`,
  solveCount: (n: number) => `${n} ${n === 1 ? 'solve' : 'solves'}`,
  scrambleCount: (n: number) => `${n} ${n === 1 ? 'scramble' : 'scrambles'}`,
  roundCount: (n: number) => `${n} ${n === 1 ? 'round' : 'rounds'}`,

  toolbar: {
    scrambles: 'Scrambles',
    showList: 'Show scramble list',
    hideList: 'Hide scramble list',
    new: 'New',
    newSet: 'Set of 5',
    cheatsheet: 'Cheatsheet',
    cheatsheetTitle: 'Moves and algorithms (?)',
  },

  list: {
    newScramble: 'New scramble',
    newSet: (size: number) => `Set of ${size}`,
    newSetTitle: (size: number, label: string) => `New set of ${size} scrambles (${label})`,
    group: 'Group…',
    groupTitle: 'Put existing scrambles into a set',
    groupHint: 'Tick the scrambles to group.',
    groupTarget: 'Set to add to',
    groupNew: 'New set',
    groupConfirm: (n: number) => `Group (${n})`,
    groupCancel: 'Done',
    search: 'Search title or moves…',
    sortLabel: 'Sort scrambles',
    sort: {
      newest: 'Newest',
      oldest: 'Oldest',
      'best-average': 'Best average',
      'most-solves': 'Most solves',
      'favorites-first': 'Favorites first',
    } satisfies Record<SortOrder, string>,
    empty: 'No scrambles yet.',
    noMatch: 'No scrambles match the search.',
    best: 'best',
    avg: 'avg',
    markFavorite: 'Mark favorite',
    removeFavorite: 'Remove favorite',
    rename: 'Rename scramble',
    delete: 'Delete scramble',
    deleteTitle: 'Delete scramble?',
    deleteMessage: (name: string, solves: number) =>
      `This deletes "${name}" and all ${solves} of its solves. This cannot be undone.`,
    deleteConfirm: 'Delete',
    collapseSet: 'Collapse set',
    expandSet: 'Expand set',
    renameSet: 'Rename set',
    deleteSet: 'Delete set',
    deleteSetTitle: 'Delete set?',
    deleteSetMessage: (name: string, scrambles: number, solves: number) =>
      `This deletes "${name}" with its ${scrambles} scrambles and all ${solves} of their solves. To keep the scrambles, dissolve the set instead. This cannot be undone.`,
    deleteSetConfirm: 'Delete',
    removeFromSet: 'Remove from set',
    selectForGroup: 'Select for grouping',
  },

  importExport: {
    export: 'Export JSON',
    import: 'Import JSON',
    title: 'Import data?',
    message: (scrambles: number, solves: number, sets: number, newScrambles: number, newSolves: number, newSets: number) =>
      `This replaces everything currently stored (${scrambles} scrambles, ${solves} solves, ${sets} sets) with the imported file (${newScrambles} scrambles, ${newSolves} solves, ${newSets} sets).`,
    confirm: 'Import',
    errors: {
      'not-json': 'Not a valid JSON file.',
      'not-export': 'Not a rubik-timer export file.',
      version: 'Unsupported export version.',
      'invalid-data': 'Invalid data: expected "scrambles" and "solves" arrays.',
    } satisfies Record<ImportErrorCode, string>,
    failed: 'Import failed.',
  },

  dialog: { cancel: 'Cancel' },

  panel: {
    noneSelected: 'No scramble selected. Pick one from the list, or start a new one.',
    shortcut: 'Shortcuts:',
    newScrambleShortcut: 'new scramble',
    newSetShortcut: 'new set of 5',
    netLabel: 'Scrambled cube net',
    statistics: 'Statistics',
    notes: 'Notes',
    notesPlaceholder: 'Notes about this scramble…',
    history: 'Solve history',
    inSet: (position: number, size: number) => `scramble ${position} of ${size}`,
    showSet: 'Show the set',
    previousScramble: 'Previous scramble in the set',
    nextScramble: 'Next scramble in the set',
    round: (k: number) => `Round ${k}`,
    lastRound: 'last round',
  },

  set: {
    scrambles: 'Scrambles',
    completedRounds: 'Rounds',
    bestAverage: (label: string) => `Best ${label}`,
    lastAverage: (label: string) => `Last ${label}`,
    bestSingle: 'Best single',
    solves: 'Solves',
    rounds: 'Rounds',
    roundsNote:
      'As in a competition, each scramble is solved once per round: the k-th solve of every scramble makes up round k, and a complete round gets its average.',
    noRounds: 'No solves yet. Open the first scramble and start solving; the set’s average appears once every scramble has a solve.',
    round: 'Round',
    bestRound: 'Best round',
    open: 'Open',
    addScramble: 'Add a scramble',
    dissolve: 'Dissolve set',
    dissolveTitle: 'Dissolve set?',
    dissolveMessage: (name: string) =>
      `"${name}" is removed. Its scrambles and their solves stay as standalone scrambles.`,
    dissolveConfirm: 'Dissolve',
    notesPlaceholder: 'Notes about this set…',
  },

  stats: {
    solves: 'Solves',
    best: 'Best',
    worst: 'Worst',
    average: 'Average',
    median: 'Median',
    stdDev: 'Std Dev',
  },

  history: {
    empty: 'No solves yet.',
    time: 'Time',
    penalty: 'Penalty',
    inspectionPenalty: 'Insp.',
    solvePenalty: 'Solve',
    notes: 'Notes',
    date: 'Date',
    notesPlaceholder: 'notes',
    delete: 'Delete solve',
  },

  /** `inspection`: whether a solve begins with a WCA inspection (changes the idle hint). */
  timerHint: (phase: TimerPhase, touch: boolean, inspection: boolean): string => {
    switch (phase) {
      case 'running':
        return touch ? 'Tap anywhere to stop' : 'Press Space or click anywhere to stop';
      case 'ready':
        return 'Release to start';
      case 'holding':
        return 'Keep holding…';
      case 'inspecting':
        return touch ? 'Inspecting — touch and hold the timer, release to start' : 'Inspecting — hold Space, release to start';
      case 'idle':
        if (inspection) return touch ? 'Tap the timer to start the inspection' : 'Press Space or tap the timer to start the inspection';
        return touch ? 'Touch and hold the timer, release to start' : 'Hold Space or click and hold the timer to start';
    }
  },

  inspection: {
    label: 'WCA inspection (15 s)',
    hint: '+2 when the solve starts after 15 s, DNF after 17 s',
    cancel: 'Cancel inspection',
  },

  cheatsheet: {
    title: 'Cheatsheet',
    sections: 'Cheatsheet sections',
    close: 'Close cheatsheet',
    moves: 'Moves',
    algorithms: 'Algorithms',
    movesIntro: {
      before: 'A letter turns that layer 90° ',
      clockwise: 'clockwise',
      middle: ', as seen looking straight at that face. An apostrophe (',
      prime: ', “R prime”) turns it counterclockwise, a ',
      after: ' turns it twice (180°). Blue marks the layers that move.',
    },
    algorithmsIntro:
      'Pictures show the top layer from above (front at the bottom), yellow on top and green in front. Hold the cube like the picture, then do the algorithm; arrows show where pieces go. A move in parentheses at the end is the final turn of the top layer.',
    triggers: 'Triggers',
    triggersNote:
      'Short sequences the algorithms below are built from. Done six times in a row, each returns the cube to where it started.',
    caseLabel: 'Top layer of the case',
    filterLabel: 'Which algorithms to show',
    showAll: 'All',
    showFavorites: 'Favorites',
    markFavorite: 'Mark as favorite',
    removeFavorite: 'Remove from favorites',
    noFavorites: 'No favorites yet. Tap the ☆ on an algorithm to add it here.',
    f2l: 'F2L',
  },

  f2l: {
    intro:
      'All 41 ways the corner and edge of one pair can sit in the top layer or in their slot, solved into the front-right slot with yellow on top and green in front. Grey pieces don’t matter. Tap a case to try it on the cube.',
    caseName: (n: number) => `F2L ${n}`,
    caseLabel: 'The case',
    corner: 'Corner',
    edge: 'Edge',
    white: 'white',
    green: 'green',
    toward: {
      U: 'up',
      D: 'down',
      F: 'to the front',
      B: 'to the back',
      R: 'to the right',
      L: 'to the left',
    } satisfies Record<Face, string>,
    open: 'Try on the cube',
    trainer: 'F2L trainer',
    cubeLabel: 'The cube; drag to turn the view',
    resetView: 'Reset view',
    back: 'Back to the list',
    prev: 'Previous case',
    next: 'Next case',
    moves: 'Moves',
    undo: 'Undo',
    restart: 'Restart',
    solved: 'Solved!',
    solvedHint: 'The pair is in. Restart the case or go on to the next one.',
    progress: (done: number, total: number) => `${done} / ${total}`,
    keysHint: 'Keys: R U F L B D turn a face, Shift turns it the other way, Backspace undoes, ← → change case, Esc closes.',
    legend: {
      done: 'done',
      wrong: 'wrong, undo it',
      next: 'next',
    },
  },
};

export type Messages = typeof en;

const cs: Messages = {
  langName: 'Čeština',
  switchLanguage: 'Switch to English',

  scrambleName: (n) => `Zamíchání #${n}`,
  setName: (n) => `Sada #${n}`,
  solveCount: (n) => `${n} složení`,
  scrambleCount: (n) => `${n} zamíchání`,
  roundCount: (n) => `${n} ${n === 1 ? 'kolo' : n >= 2 && n <= 4 ? 'kola' : 'kol'}`,

  toolbar: {
    scrambles: 'Zamíchání',
    showList: 'Zobrazit seznam zamíchání',
    hideList: 'Skrýt seznam zamíchání',
    new: 'Nové',
    newSet: 'Pětice',
    cheatsheet: 'Tahák',
    cheatsheetTitle: 'Tahy a algoritmy (?)',
  },

  list: {
    newScramble: 'Nové zamíchání',
    newSet: (size) => (size === 5 ? 'Pětice' : size === 12 ? 'Dvanáctka' : `Sada ${size}`),
    newSetTitle: (size, label) => `Nová sada ${size} zamíchání (${label})`,
    group: 'Seskupit…',
    groupTitle: 'Seskupit existující zamíchání do sady',
    groupHint: 'Zaškrtni zamíchání, která chceš seskupit.',
    groupTarget: 'Přidat do sady',
    groupNew: 'Nová sada',
    groupConfirm: (n) => `Seskupit (${n})`,
    groupCancel: 'Hotovo',
    search: 'Hledat název nebo tahy…',
    sortLabel: 'Řazení zamíchání',
    sort: {
      newest: 'Nejnovější',
      oldest: 'Nejstarší',
      'best-average': 'Nejlepší průměr',
      'most-solves': 'Nejvíc složení',
      'favorites-first': 'Oblíbená nahoře',
    },
    empty: 'Zatím žádná zamíchání.',
    noMatch: 'Hledání neodpovídá žádné zamíchání.',
    best: 'nejl.',
    avg: 'prům.',
    markFavorite: 'Označit jako oblíbené',
    removeFavorite: 'Odebrat z oblíbených',
    rename: 'Přejmenovat zamíchání',
    delete: 'Smazat zamíchání',
    deleteTitle: 'Smazat zamíchání?',
    deleteMessage: (name, solves) =>
      `Smaže se „${name}“ a všech ${solves} jeho složení. Tuto akci nelze vrátit.`,
    deleteConfirm: 'Smazat',
    collapseSet: 'Sbalit sadu',
    expandSet: 'Rozbalit sadu',
    renameSet: 'Přejmenovat sadu',
    deleteSet: 'Smazat sadu',
    deleteSetTitle: 'Smazat sadu?',
    deleteSetMessage: (name, scrambles, solves) =>
      `Smaže se „${name}“ včetně jejích ${scrambles} zamíchání a všech ${solves} složení. Pokud chceš zamíchání zachovat, sadu místo toho rozpusť. Tuto akci nelze vrátit.`,
    deleteSetConfirm: 'Smazat',
    removeFromSet: 'Vyjmout ze sady',
    selectForGroup: 'Vybrat k seskupení',
  },

  importExport: {
    export: 'Export JSON',
    import: 'Import JSON',
    title: 'Importovat data?',
    message: (scrambles, solves, sets, newScrambles, newSolves, newSets) =>
      `Vše, co je teď uložené (zamíchání: ${scrambles}, složení: ${solves}, sady: ${sets}), se nahradí importovaným souborem (zamíchání: ${newScrambles}, složení: ${newSolves}, sady: ${newSets}).`,
    confirm: 'Importovat',
    errors: {
      'not-json': 'Soubor není platný JSON.',
      'not-export': 'Soubor není export z rubik-timer.',
      version: 'Nepodporovaná verze exportu.',
      'invalid-data': 'Neplatná data: chybí pole „scrambles“ a „solves“.',
    },
    failed: 'Import se nezdařil.',
  },

  dialog: { cancel: 'Zrušit' },

  panel: {
    noneSelected: 'Není vybrané žádné zamíchání. Vyber ho ze seznamu nebo začni nové.',
    shortcut: 'Zkratky:',
    newScrambleShortcut: 'nové zamíchání',
    newSetShortcut: 'nová pětice',
    netLabel: 'Síť zamíchané kostky',
    statistics: 'Statistiky',
    notes: 'Poznámky',
    notesPlaceholder: 'Poznámky k tomuto zamíchání…',
    history: 'Historie složení',
    inSet: (position, size) => `zamíchání ${position} z ${size}`,
    showSet: 'Zobrazit sadu',
    previousScramble: 'Předchozí zamíchání v sadě',
    nextScramble: 'Další zamíchání v sadě',
    round: (k) => `${k}. kolo`,
    lastRound: 'minulé kolo',
  },

  set: {
    scrambles: 'Zamíchání',
    completedRounds: 'Kola',
    bestAverage: (label) => `Nejl. ${label}`,
    lastAverage: (label) => `Posl. ${label}`,
    bestSingle: 'Nejl. čas',
    solves: 'Složení',
    rounds: 'Kola',
    roundsNote:
      'Jako na soutěži se každé zamíchání v kole skládá jednou: k-té složení každého zamíchání tvoří k-té kolo a kompletní kolo dostane svůj průměr.',
    noRounds: 'Zatím žádná složení. Otevři první zamíchání a začni skládat; průměr sady se objeví, jakmile má každé zamíchání aspoň jedno složení.',
    round: 'Kolo',
    bestRound: 'Nejlepší kolo',
    open: 'Otevřít',
    addScramble: 'Přidat zamíchání',
    dissolve: 'Rozpustit sadu',
    dissolveTitle: 'Rozpustit sadu?',
    dissolveMessage: (name) =>
      `„${name}“ se odstraní. Její zamíchání i jejich složení zůstanou jako samostatná zamíchání.`,
    dissolveConfirm: 'Rozpustit',
    notesPlaceholder: 'Poznámky k této sadě…',
  },

  stats: {
    solves: 'Složení',
    best: 'Nejlepší',
    worst: 'Nejhorší',
    average: 'Průměr',
    median: 'Medián',
    stdDev: 'Sm. odch.',
  },

  history: {
    empty: 'Zatím žádná složení.',
    time: 'Čas',
    penalty: 'Penalizace',
    inspectionPenalty: 'Insp.',
    solvePenalty: 'Složení',
    notes: 'Poznámky',
    date: 'Datum',
    notesPlaceholder: 'poznámka',
    delete: 'Smazat složení',
  },

  timerHint: (phase, touch, inspection) => {
    switch (phase) {
      case 'running':
        return touch ? 'Klepni kamkoli pro zastavení' : 'Zastav mezerníkem nebo kliknutím kamkoli';
      case 'ready':
        return 'Pusť pro start';
      case 'holding':
        return 'Drž dál…';
      case 'inspecting':
        return touch ? 'Inspekce – podrž prst na časovači a pusť pro start' : 'Inspekce – podrž mezerník a pusť pro start';
      case 'idle':
        if (inspection) return touch ? 'Klepni na časovač pro start inspekce' : 'Stiskni mezerník nebo klepni na časovač pro start inspekce';
        return touch ? 'Podrž prst na časovači a pusť pro start' : 'Podrž mezerník nebo tlačítko myši na časovači a pusť pro start';
    }
  },

  inspection: {
    label: 'Inspekce WCA (15 s)',
    hint: '+2 při startu po 15 s, DNF po 17 s',
    cancel: 'Zrušit inspekci',
  },

  cheatsheet: {
    title: 'Tahák',
    sections: 'Části taháku',
    close: 'Zavřít tahák',
    moves: 'Tahy',
    algorithms: 'Algoritmy',
    movesIntro: {
      before: 'Písmeno otočí danou vrstvu o 90° ',
      clockwise: 'po směru hodinových ručiček',
      middle: ', když se na tu stěnu díváš zepředu. Apostrof (',
      prime: ', „R s čárkou“) ji otočí proti směru, ',
      after: ' dvakrát (o 180°). Modře jsou vrstvy, které se pohnou.',
    },
    algorithmsIntro:
      'Obrázky ukazují horní vrstvu shora (přední strana dole), žlutá nahoře a zelená vpředu. Drž kostku jako na obrázku a proveď algoritmus; šipky ukazují, kam se kostičky přesunou. Tah v závorce na konci je závěrečné otočení horní vrstvy.',
    triggers: 'Triggery',
    triggersNote:
      'Krátké sekvence, ze kterých jsou algoritmy níže složené. Když kterýkoli zopakuješ šestkrát za sebou, kostka se vrátí do původního stavu.',
    caseLabel: 'Horní vrstva případu',
    filterLabel: 'Které algoritmy zobrazit',
    showAll: 'Všechny',
    showFavorites: 'Oblíbené',
    markFavorite: 'Označit jako oblíbený',
    removeFavorite: 'Odebrat z oblíbených',
    noFavorites: 'Zatím žádné oblíbené. Klepni na ☆ u algoritmu a přidáš ho sem.',
    f2l: 'F2L',
  },

  f2l: {
    intro:
      'Všech 41 situací, jak může roh a hrana jedné dvojice ležet v horní vrstvě nebo ve svém slotu; řeší se do pravého předního slotu, žlutá nahoře a zelená vpředu. Šedé kostičky nehrají roli. Klepnutím na situaci si ji vyzkoušíš na kostce.',
    caseName: (n: number) => `F2L ${n}`,
    caseLabel: 'Situace',
    corner: 'Roh',
    edge: 'Hrana',
    white: 'bílá',
    green: 'zelená',
    toward: {
      U: 'nahoru',
      D: 'dolů',
      F: 'dopředu',
      B: 'dozadu',
      R: 'doprava',
      L: 'doleva',
    } satisfies Record<Face, string>,
    open: 'Vyzkoušet na kostce',
    trainer: 'Trenažér F2L',
    cubeLabel: 'Kostka; tažením otočíš pohled',
    resetView: 'Výchozí pohled',
    back: 'Zpět na seznam',
    prev: 'Předchozí situace',
    next: 'Další situace',
    moves: 'Tahy',
    undo: 'Zpět',
    restart: 'Znovu',
    solved: 'Vyřešeno!',
    solvedHint: 'Dvojice je na místě. Zkus to znovu nebo přejdi na další situaci.',
    progress: (done: number, total: number) => `${done} / ${total}`,
    keysHint: 'Klávesy: R U F L B D otočí stěnu, se Shiftem opačným směrem, Backspace vrátí tah, ← → přepne situaci, Esc zavře.',
    legend: {
      done: 'hotovo',
      wrong: 'špatně, vrať',
      next: 'další',
    },
  },
};

export const MESSAGES: Record<Lang, Messages> = { en, cs };
