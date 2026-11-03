# Rubik Timer

A minimal, offline, single-user training timer for the 3x3x3 Rubik's Cube.
The primary entity is the **scramble**: each scramble is a permanent object
that can hold any number of solves, so you can practice the same scramble
repeatedly and compare statistics per scramble.

Scrambles can be grouped into a **set** (typically five, for an Ao5), which
is where the competition statistics live: as in a competition, each scramble
of a set is solved once per round, the k-th solve of every scramble forms
round k, and every complete round gets its Ao5 (Ao12 for a set of twelve,
Mo3 below five). A set can be generated whole ("Set of 5" / "Set of 12"),
grown one scramble at a time, or made from existing scrambles with the
"Group…" button in the list. Each scramble belongs to at most one set.

## Usage

```sh
npm install
npm run dev      # start the app
npm test         # run unit tests (stats, cube simulation, scramble generator)
npm run build    # typecheck + production build
```

## Keyboard, mouse and touch

| Input | Action |
| --- | --- |
| Space, or press and hold the timer (hold, then release) | Start timer (turns green when ready) |
| Tap Space or the timer (with inspection on) | Start the 15 s inspection; then hold and release as above to start the solve |
| Esc (during inspection) | Abandon the inspection |
| Space, or click / tap anywhere (while running) | Stop timer — the solve is stored automatically |
| Delete | Delete the selected solve |
| Ctrl+N | New scramble |
| Ctrl+G | New set of 5 scrambles |
| ← / → | Previous / next scramble within the set (while the timer is idle) |
| Ctrl+F | Focus search |
| ? | Open the cheatsheet |
| Esc | Cancel dialog / close cheatsheet |

While a solve is running the timer area turns green and the screen is kept on
(Screen Wake Lock API; needs HTTPS or localhost, otherwise it is skipped).

## Inspection

The "WCA inspection (15 s)" checkbox under the timer (off by default, the
choice is remembered) makes every solve start with a competition inspection:
a tap of Space or of the timer starts a 15-second countdown, which turns
yellow at the judge's "8 seconds" call and orange at "12 seconds". Holding
and releasing then starts the solve as usual. Per WCA regulation A4d, a solve
started more than 15 s into the inspection is recorded with +2, and one
started after 17 s as DNF (the countdown shows "+2" and "DNF" in those
windows). Esc or the "Cancel inspection" button abandons the inspection.

The layout works on phones: the scramble list becomes a drawer (the
"Scrambles" button), and on wide screens it can be collapsed with the same
button in the top bar.

## Languages

The app is available in English and Czech. It starts in Czech when the
browser prefers Czech, otherwise in English; the EN / CZ button in the top
bar switches it, and the choice is remembered. UI strings live in
`src/i18n/messages.ts` (the Czech dictionary is type-checked against the
English one, so a missing translation fails the build); cheatsheet texts sit
next to their data in `src/lib/algorithms.ts` and `src/lib/notation.ts`.

## Cheatsheet

The "Cheatsheet" button (or `?`) opens a reference with two tabs:

- **Moves** — face turns, slice moves (M E S), wide moves and cube rotations,
  each drawn for the plain, prime (') and half (2) turn.
- **Algorithms** — 2-look OLL and all 21 PLLs, with a picture of the case
  each one solves. Star (☆) the ones you are learning and switch to
  "Favorites" to see only those; both are remembered in this browser. The pictures are computed from the algorithms by the cube
  simulation, and `src/lib/algorithms.test.ts` checks every algorithm keeps
  the first two layers intact and solves the case its name and description
  claim.

## Notes

- All data lives in browser Local Storage; every change is saved immediately.
- Export/Import uses a versioned JSON format (`format: "rubik-timer", version: 1`).
  Importing replaces all stored data after confirmation. Files exported before
  sets existed have no `sets` array and import as sets-free data.
- Scrambles are random-move sequences (20 moves, WCA notation, no redundant
  consecutive faces). Swapping in a random-state generator later only requires
  replacing `src/lib/scramble.ts`.
- Averages follow WCA rules: Ao5/Ao12 drop best and worst, a DNF counts as
  worst, two DNFs make the average DNF; Mo3 is a plain mean and DNF on any
  DNF. They are computed per round of a set, never over repeats of one
  scramble. Best/worst/mean/median/stddev of a single scramble ignore DNF
  solves; +2 penalties are included as time + 2s.

## Architecture

- `src/lib/` — pure, unit-tested logic: scramble generation, facelet-level
  cube simulation (net rendering and the cheatsheet), statistics, formatting,
  storage, and the notation / algorithm data.
- `src/i18n/` — language detection, the language context and UI strings.
- `src/store/` — single reducer store (React context) persisted to Local
  Storage on every change.
- `src/hooks/useTimer.ts` — the timer state machine (space bar and pointer,
  with the optional inspection); `src/lib/inspection.ts` holds the WCA
  inspection rules.
- `src/components/` — presentational components (scramble list with its
  sets, set panel with the rounds table, cube net, stats, solve history,
  dialogs, import/export, cheatsheet and its diagrams).
