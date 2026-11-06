# Cuber Hub

A minimal, offline, single-user training hub for the 3x3x3 Rubik's Cube
(formerly Rubik Timer): a **timer**, a **cheatsheet** and **training**
without a cube, side by side.

## Navigation

The home page is a signpost to the three sections; none of them is the
default. The header stays on top of every page with the sections, the
language switch and the logo, which is a link home. The colour band in the
logo is also a reminder of the belt of side colours with white down (blue,
red, green, orange, round and round; the darker tiles at the ends show the
belt going on): facing any colour, the one on your right is the next in the
band. Hover the logo for the explanation; the home page spells it out.

Every page has its own address in the URL hash, so the browser's back button
works and a page can be bookmarked or opened directly: `#/timer`,
`#/cheatsheet/f2l`, `#/training/cross-trainer`, … (`src/lib/route.ts`).
While a solve is being timed the header fades out.

## Timer

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

Scrambles are normally generated, but "Own…" next to "New scramble" (and
"Add own…" in a set) takes one typed by hand: WCA face turns in any spacing,
with parentheses, lowercase letters or typographic apostrophes allowed. The
dialog shows the tidied moves and the resulting cube net as you type, names
the first move it can't read, and takes an optional name for the scramble.

## Usage

```sh
npm install
npm run dev      # start the app
npm test         # run unit tests (stats, cube simulation, scramble generator, sync rows)
npm run build    # typecheck + production build
npm run deploy   # test, build and release to https://cuberhub.cz (see deploy/README.md)
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
| ? | Open the cheatsheet (from the timer) |
| Esc | Cancel dialog / leave a training for the training menu |

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

The inspection penalty is stored separately from the solve penalty (a
misaligned cube, timer handling); the history shows both for solves timed
with inspection and only the solve penalty for the others.
As in WCA regulations, +2 penalties are cumulative: an inspection +2 and a
one-move misalignment give +4. A DNF in either makes the solve a DNF.

The layout works on phones: the scramble list becomes a drawer (the
"Scrambles" button), and on wide screens it can be collapsed with the same
button in the bar above the timer.

## Languages

The app is available in English and Czech. It starts in Czech when the
browser prefers Czech, otherwise in English; the EN / CZ button in the
header switches it, and the choice is remembered. UI strings live in
`src/i18n/messages.ts` (the Czech dictionary is type-checked against the
English one, so a missing translation fails the build); cheatsheet texts sit
next to their data in `src/lib/algorithms.ts` and `src/lib/notation.ts`.

## Cheatsheet

The Cheatsheet section (`?` from the timer) is a reference with three tabs:

- **Moves** — face turns, slice moves (M E S), wide moves and cube rotations,
  each drawn for the plain, prime (') and half (2) turn.
- **F2L** — all 41 F2L cases (numbered as on rubiksplace.com), grouped by
  where the corner and edge of the pair are, each with a picture, a
  face-turn-only algorithm and a one-line description of the position.
  Every case solves the pair into the front-right slot with yellow on top
  and green in front; the other top-layer pieces are grey because they
  don't matter. Tap a case to open the **F2L trainer** (below).
- **Algorithms** — 2-look OLL and all 21 PLLs, with a picture of the case
  each one solves.

Star (☆) the F2L cases and algorithms you are learning and switch to
"Favorites" to see only those; both are remembered in this browser. All
pictures are computed from the algorithms by the cube simulation:
`src/lib/algorithms.test.ts` checks every OLL/PLL algorithm keeps the first
two layers intact and solves the case its name claims, and
`src/lib/f2l.test.ts` checks the 41 F2L algorithms use face turns only, leave
the cross and the other three slots alone, and are the 41 distinct cases.

### F2L trainer

Opening an F2L case shows the position on a 3D cube (drag to look at it
from another side) with the algorithm above the move buttons. Turn faces
with the buttons or the keys `R U F L B D` (with Shift for the prime
turn); every move is checked against the algorithm:

- a move that follows the algorithm turns **green**;
- any other move is inserted in **red** at the current position and has to
  be undone (its inverse makes it disappear again; `R R` counts as `R2`,
  and turns of the opposite face in between don't get in the way);
- taking back the last correct move steps back instead of counting as a
  wrong move.

The case counts as solved as soon as the pair is in and the first two
layers are intact, whichever way you got there.

**Your own solutions.** "Add a solution" in the trainer takes an algorithm
in any notation (rotations `y`, wide moves `d`, slices, `Rw`, parentheses)
and an optional note on how you remember it. The simulation checks it:
rotations and wide moves are rewritten as face turns (both spellings stay
visible), a turn of the top layer is added in front when the position
needs one, and a solution that breaks another slot, doesn't solve the pair,
is already there, or really solves a different case (then you can save it
to that one instead) is refused with the reason. The trainer then follows
every solution of the case at once and shows the one your moves match
best; the chips above the notation pin one. Solutions are stored with the
rest of your data in this browser and in the export file. Backspace (or Z) undoes
the last move, "Restart" resets the case, ← / → go to the previous / next
case in the list and Esc goes back to the list. The trainer logic lives in
`src/lib/f2lTrainer.ts` and is unit-tested; the cube is drawn with CSS 3D
transforms in `src/components/Cube3D.tsx`, using the sticker geometry of
`src/lib/geometry.ts` (checked against the facelet simulation for every
move).

## Training

The Training section (Czech "Trénink") holds the trainers. So far these are
the dry-practice ones for the cross inspection, which need no cube in your hands:
everything happens on the 3D cube, and every answer is checked by the cube
simulation. The cube is held white down, so the cross goes into the bottom
layer; drag the cube or use "From above" / "From below" to look around it.

- **Edge Hunter** — the cube is scrambled; find the white edge you are
  asked for (white-green, white-orange, …) and tap its white sticker.
  Tapping the edge's coloured sticker is half right. The first level greys
  everything but the white edges and the centres; later levels colour the
  whole cube and give you less time.
- **Edge Tracker** — memorize where one to four marked edges are, then the
  cube hides and shows a few moves; tap the place where the white sticker
  of each edge ends up. The result shows where each edge really is and can
  replay the moves on the cube. "Memorizing time" in the bar can override
  the level's limit.
- **Mini Cross** — solve one to three marked edges into the bottom layer
  with the move buttons or keys, in as few moves as you can. The task ends
  the moment the edges are in; the result compares your count with the
  optimum and replays an optimal solution (or yours).
- **Cross Challenge** — inspect the position and plan the whole white cross,
  then the cube hides and you enter the planned moves. You are judged on
  whether the cross is solved, on the move count against the optimum and
  on the inspection time. "Inspection time" in the bar can override the
  level's limit (including unlimited).

Every mode has levels that get harder (more edges, more moves, harder
positions, tighter time) and adapt to you: three right in a row move you up,
three wrong in a row move you down, and the ◀ ▶ buttons pick a level by
hand. A result scores 100 for a correct answer (less for a partly correct
one), up to 50 more for speed, 50 for an optimal cross (15 less per extra
move), and is multiplied by the streak before it and by the level; a hint
(H: marks the white edges, peeks at the hidden cube, or names an optimal
first move) halves it. Points, streaks, personal bests (best score, fastest
time, optimal solutions) and the last hundred results are kept per mode in
this browser (not in the export file). "Same position again" repeats a task;
Enter goes on, Esc goes back.

Positions of a wanted difficulty come from the solver: a random scramble is
reduced to the level's optimal length by applying the first moves of its
optimal solution, so the rest of the cube stays scrambled. The solver in
`src/lib/cross.ts` is a breadth-first search over the positions and
orientations of the tracked edges (190 080 states for the whole cross, a
table computed once per edge set), so the optimum is exact;
`src/lib/cross.test.ts` checks it against a brute-force search on short
cases. Levels, scoring and the adaptive progress live in
`src/lib/dryPractice.ts`, also unit-tested; the modes are the components in
`src/components/training/`.

### Cross Trainer

The first tile of the training menu is a guide, not a game: no levels,
no points. For a random scramble (or one you type) it shows the shortest
white cross and the one a person would rather plan, and explains every move
on the 3D cube. The scramble is done like every scramble in the app, white
up and green in front; the cube is then turned over, white down with green
still in front, and that is the cube the trainer shows
(`scrambleWhiteDown`, checked sticker by sticker against the timer's net).

- **Plan first.** The cube comes up alone; "Show the edges" then reads the
  position the way the cross guides teach it (each white edge is in the
  bottom layer, *good*: one turn drops it white down, or *bad*: white to the
  side; which edges are already right against each other), and "Show the
  solutions" reveals the rest.
- **Shortest against recommended.** The solver lists every solution up to
  two moves over the optimum (typically a few thousand) and scores each:
  one point per move, plus penalties for B and F turns and half turns, for
  every time an edge is moved by turns meant for another edge (it has to be
  followed in the head), for an edge leaving a slot it was right in and for
  long setups; a turn that places two edges earns a little back. The
  friendliest of the shortest solutions and the friendliest overall are
  shown side by side with those counts and with what the longer one wins.
  Up to three more options that go about it differently can be picked too.
- **The hold is part of the solution.** White stays down, but which side
  colour is in front is free to choose in inspection, and it decides which
  turns are awkward: the cube's B is an easy R with orange in front. Every
  solution is scored in all four holds and comes with its best one; turning
  the cube costs nothing, green in front (where the scramble leaves it) only
  wins a tie. The trainer then says "turn the cube: blue in front
  (y2)", shows the 3D cube turned that way, and writes the moves, the slots
  and the notes for that hold; the B and F counts in the comparison are
  each solution's own.
- **Step by step.** A solution is cut into steps at the turns that put an
  edge into the cross for good; the edges of the current step are outlined
  blue, the ones in the cross green. Every move carries notes on what it
  does: drops an edge into its slot (the first one anywhere, the cross is
  built relative and a D turn matches the centres), turns a bad edge good,
  brings a slot under an edge, takes a misplaced edge out. "What to notice"
  names the techniques with their moves: two edges with one turn, one turn
  doing two jobs, setup turns, relative placement, temporary displacement.
  ◀ ▶ (or the arrow keys) step through, Space plays, a click on a move
  jumps there.

- **Your own solution.** Pick the colour you hold in front and enter a plan
  with the move buttons or the keys (R U F L B D, Shift for the other way,
  Backspace to take one back): the cube turns as you go, like in the F2L
  trainer. A whole solution can also be typed or pasted (`R' F D2`). The
  trainer checks it on the simulation and reads it exactly like its own
  solutions. A solved cross gets its length
  against the optimum, its place by effort among the solutions compared,
  what the recommended solution does better, a hint when the same turns
  would come easier in another hold, a column in the comparison table and
  the full step-by-step notes on the cube. A plan that stops short is
  finished with the solver's shortest continuation (shown in amber), so the
  moves made can still be stepped through and read.

Nothing is written per position and no AI is involved: `src/lib/crossTrainer.ts`
plays each solution through on the edge model and the notes are the
differences between the position before and after a move.
`src/lib/crossTrainer.test.ts` replays every note on the facelet simulation
(an edge said to drop in really is in the bottom layer and stays there, a
turn named as dropping an edge really does) and checks the holds against
real cube rotations: the moves written for a hold, turned on a cube rotated
into it, solve the cross. The weights of the score are
the `COST` table in that file. The principles come from the cross guides at
cubefreak.net and speedcubelab.com.

## Notes

- The data (scrambles, solves, sets, F2L solutions, training results) lives
  in a local database in the browser: [Evolu](https://www.evolu.dev), which
  is SQLite stored by the browser. Every change is saved immediately and the
  app works offline. What an earlier version kept in Local Storage is taken
  over on the first start (a copy stays under `cuberhub:data-before-database`).
  Settings of the device (language, inspection, what is open, training time
  limits, favourite algorithms) stay in Local Storage under `cuberhub:` keys.
- Sync between devices is off until it is turned on on the Sync page
  (`#/sync`). There is no account: a device has a key of 24 words, and a
  second device shows the same data once that key is entered on it. Changes
  are encrypted on the device; the relay that passes them on cannot read
  them. The relay is set with `VITE_SYNC_RELAY` at build time: the released
  app uses its own (`.env.production`, see `deploy/README.md`); a development
  build without the variable uses Evolu's testing relay, which may delete
  what it holds.
- Nothing that two devices could disagree on is stored. The number in
  "Scramble #n" is the scramble's place among all scrambles ever made, by the
  time they were made; deleted rows stay in the database (marked deleted) and
  keep their place. The training progress is worked out by replaying every
  answered task in order, so results from two devices add up.
- Export/Import uses a versioned JSON format (`format: "cuberhub", version: 1`).
  Importing replaces all stored data after confirmation. Files exported under
  the former name (`format: "rubik-timer"`) still import, and files exported
  before sets existed have no `sets` array and import as sets-free data.
- Scrambles are random-move sequences (20 moves, WCA notation, no redundant
  consecutive faces) or typed by hand (`parseCustomScramble` tidies the input
  into the same notation). Swapping in a random-state generator later only
  requires replacing the generator in `src/lib/scramble.ts`.
- Averages follow WCA rules: Ao5/Ao12 drop best and worst, a DNF counts as
  worst, two DNFs make the average DNF; Mo3 is a plain mean and DNF on any
  DNF. They are computed per round of a set, never over repeats of one
  scramble. Best/worst/mean/median/stddev of a single scramble ignore DNF
  solves; +2 penalties (inspection and solve, cumulative) are included as
  time + 2 s each. A solve has `inspectionPenalty` only when it was timed
  with inspection; older exports have none.

## Architecture

- `src/lib/` — pure, unit-tested logic: scramble generation, facelet-level
  cube simulation (net rendering and the cheatsheet), the edge model and
  optimal cross solver with the dry-practice levels and scoring, statistics,
  formatting, storage, the routes, and the notation / algorithm data.
- `src/i18n/` — language detection, the language context and UI strings.
- `src/store/` — the reducer store (`reducer.ts`, `store.ts`) with its React
  hooks (`StoreContext.tsx`), the training store (`training.ts`) and the
  start-up that opens the database and takes over older data (`boot.ts`).
- `src/sync/` — the database: `db.ts` is the only module that knows Evolu
  (schema, reading, writing, the device key, the relay); `rows.ts` turns the
  app's data into rows and back (numbering included) and works out what a
  change has to write; `persist.ts` keeps the store and the database the
  same. The schema only ever grows: add tables and columns, never rename,
  retype or remove them.
- `src/hooks/useTimer.ts` — the timer state machine (space bar and pointer,
  with the optional inspection); `src/lib/inspection.ts` holds the WCA
  inspection rules.
- `src/App.tsx` — the shell: the header on top of the page the URL names
  (`src/hooks/useRoute.ts`).
- `src/components/` — the header, the home page and the three section pages
  (`TimerPage`, `Cheatsheet`, `training/Training`) with their parts: scramble
  list with its sets, set panel with the rounds table, cube net, stats,
  solve history, dialogs, import/export, the cheatsheet diagrams, the 3D
  cube, the F2L trainer and the trainers in `components/training/`.
- `src/assets/` — the logo and the colour band, copied from the brand
  design.
- `deploy/` — releasing: the deploy scripts, the server set-up (nginx
  sites, the relay's service) and how it all fits together (`deploy/README.md`).
