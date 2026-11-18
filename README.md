# Hollow

An asymmetric woodland war game for four factions - **Humans, Orcs, Elves and
Dwarves** - fighting for control of a forest of twelve clearings. Each faction
plays by different rules. First to 30 victory points wins.

Hollow is an independent hobby project, in the tradition of asymmetric
area-control games. It uses its own names, rules and numbers.

**Status: playable solo and in rooms.** A browser board, four bot levels, a
tested rules engine, and room-code multiplayer over Firebase (see "Online
rooms"). The numbers are a first balancing pass, not a finished one - see
"Bots" below.

## Running

No build step, no dependencies. Needs Node 18+.

```bash
npm run play                # serve the game at http://localhost:5309
npm test                    # rules tests, bot tests, 200 random + 60 bot games
npm run bots 80             # bot level ladder + faction balance (80 games each)
npm run bots 120 balance    # faction balance only, all-hard table
npm run move-stats          # what the bots actually do, per faction
npm run tournament 500      # random-mover statistics
```

## The factions

| | style | how it plays |
|---|---|---|
| **Humans** | engine builder | Barracks raise warriors each dawn; mills score each dawn, and every second mill grants an extra action. Build only where they rule. |
| **Orcs** | warband | A **war chant** of orders (recruit, move, battle, build) must be carried out in order every day. Add up to two orders a dawn; if one can't be done, **frenzy** breaks the chant and costs points. Hit +1 when attacking. Score from warcamps at dusk. |
| **Elves** | insurgents | Gather supporters, **spread** sympathy (scores), **revolt** to wipe a sympathetic clearing and plant a stronghold. Attackers lose a hit where sympathy runs. **Organize** at dusk. |
| **Dwarves** | tunnel fortress | **Dig** tunnels, then march between any two tunnels ignoring paths. **Forge** strongholds by spending warriors; they shrug off one hit, and score each dusk while ruled. |

## Shared rules

- **Rule:** the faction with the most warriors + buildings in a clearing rules it. Ties and empty clearings are ruled by nobody.
- **Combat:** the attacker rolls two dice (faces 0-3). The higher is the attacker's hits, the lower is the defender's, each capped by that side's warriors. A defender with no warriors takes one extra hit. Warriors die first, then buildings, then tokens; each building or token destroyed scores 1 VP for the destroyer.
- **Slots:** buildings fill a clearing's slots; tokens (sympathy, tunnels) do not.
- **Ending:** 30 VP, or the leader after round 40.

## Layout

| file | what it is |
|---|---|
| `src/map.js` | The clearings graph. |
| `src/helpers.js` | Shared machinery: pieces, rule, combat, move generation, seeded dice. |
| `src/factions/*.js` | One self-contained module per faction: setup, phases, legal moves, apply. |
| `src/factions/index.js` | The roster. A new faction is one module plus one line here. |
| `src/engine.js` | `createGame`, `legalMoves`, `applyMove`. Pure functions over plain-JSON state. |
| `src/sim.js` | Random playouts and the invariant checks (no piece created or lost, slots respected). |
| `src/room.js` | The shared room record and every rule about who may do what in it. |
| `src/transport-memory.js` | In-process transport: solo play and the tests. |
| `src/bot.js` | The opponents: `chooseMove(game, { level, rng })`. |
| `src/arena.js` | Bot-vs-bot games, used by the tournament and the tests. |
| `index.html`, `ui/` | The browser game: `render.js` draws the board as SVG, `text.js` words the moves, `app.js` runs menu, lobby, turns and the bot loop. |
| `ui/tutorial-script.js`, `ui/lesson-*.js`, `ui/lesson-kit.js` | The four lessons: the registry plus one file per faction (pure data, tested) and their shared helpers. |
| `ui/tutorial.js` | The lesson controller: draws the coach card, limits your moves to the one being taught, and holds the bots. |
| `ui/howto.js` | The How to Play guide, built from the rules' own numbers. |
| `ui/audio.js` | Sound: loads and plays the effects, with mute. |
| `ui/fx-diff.js`, `ui/fx.js` | Animation: a pure description of what changed between two boards, and the layer that plays it (slides, pops, casualties, dice). |
| `ui/net/` | Browser transports (across tabs, Firebase) and the Firebase config. |
| `assets/` | Web-sized art (about 1.2 MB): logo, faction crests, forest backdrop, grass tile, and the painted board pieces. |
| `assets/originals/` | The full-size generated images (18 MB), git-ignored. `scripts/build-art.ps1` rebuilds `assets/` from them. |
| `database.rules.json` | Realtime Database rules for rooms (deployed). |
| `scripts/` | Tests, tournaments, the move-stats diagnostic, and a dependency-free dev server. |

## The interface

Pick a faction (or **Watch** four bots play each other), pick the bot level, and
play. Tap a glowing clearing to see what you can do there; every button is one
legal move, so the UI can never offer something the rules forbid. Rings show who
rules each clearing, dashed squares are empty building slots, and the panel shows
scores, the Orc war chant, Elf supporters, and a log. It works on a phone: the
action buttons sit directly under the board. The UI never decides what is legal -
it asks `legalMoves` and sends the chosen move through `applyMove`.

`applyMove(game, factionId, move)` never mutates its input and re-validates the
move against `legalMoves`, so a human tap, a bot, and a move over the network all
go through the same door. This is the same design as HexColony's engine.

## Learning to play

Two things, both reachable from the menu, and the guide from the **?** button at any time.

**The lessons** ("New? Learn to play") are four hands-on lessons, one per faction, each a
scripted game on the real board against the real bots. A chooser lists them in a
recommended order (Humans, Dwarves, Orcs, Elves), tags the one that is up next, and ticks
off the ones you have finished on this device.

There is no pretend mode. A lesson is an ordinary solo game, started from a hand-set
position and a fixed seed, in which you may only make the move the current step teaches
(everything else is simply not offered, and the clearing to tap glows). Every step says
**what** you are doing and **why**. In every lesson **you go first**: the turn order is
rotated (the engine takes any order) so you never wait. And in every lesson the bots are
**held** while a card explains what is coming, play their real turn, and then a recap quotes
what they actually did.

| lesson | steps | you practise | the teaching moment |
|---|---|---|---|
| **Humans** | 23 | ruling, spreading out, building a mill (and why mills first), the whole combat rule, scoring, the dawn income | attacking a warcamp, with the dice explained from what rolled (3 and 1) |
| **Dwarves** | 17 | digging a tunnel, jumping a whole army through it, attacking, forging a stronghold | the tunnel hop: 6 warriors cross the forest in one move, ignoring paths and ruling |
| **Orcs** | 23 | adding orders to the war chant, carrying the chant out as a *plan* (recruit, march, battle, build) | an extra battle order is added **on purpose** so you walk into a frenzy and see exactly what it costs (a point) and why Frenzy is then the only legal choice |
| **Elves** | 17 | spreading sympathy, a revolt, organizing at dusk | a revolt wiping out a clearing with no dice at all |

A fixed seed per lesson makes the scripted fight come out the same every time, so the
explanation can be exact (`scripts/lesson-seed.mjs <lesson>` finds a good one). A lesson is
pure data (`ui/tutorial-script.js` is the registry, with `ui/lesson-*.js` per faction and
`ui/lesson-kit.js` for the shared helpers). `ui/tutorial.js` is the controller that decides
whether a move was the one being taught, when to advance, and when the bots may play.

`scripts/tutorial-tests.mjs` (24 tests) holds it all to account:
- every step of every lesson is playable against the real engine, and still plays through
  30 times each with random bot behaviour;
- each "do this" step offers only the move it teaches, and never "End" while teaching something else;
- the claims in the text are true: the dice, the scores, the supporters left after a spread, that the
  frenzy step leaves Frenzy as the *only* legal move, that a tunnel hop joins clearings that are not neighbours;
- the **controller itself** is driven exactly as the app drives it, through every lesson. That test exists
  because a bug only it could catch got through the engine-level tests: a step's "expect" describes the
  board *before* the move ("move all the warriors"), and judging the move against the board after it
  meant the Dwarf and Orc lessons never advanced. It fails if that bug comes back.

**The guide** (`ui/howto.js`) is about 2,300 words in 13 sections: goal, the forest, a turn,
ruling, fighting, scoring, one full chapter per faction (turn, every action and its cost,
scoring, strategy), the screen, playing online, and an FAQ. **Every number in it is read from
the rules** (each faction exposes a `facts` object, and starting positions come from a freshly
dealt game), so it cannot disagree with the game when rules are tuned; a test checks it.

## Online rooms

One person taps **Create a room** and reads out the four-letter code; everyone
else types it into **Join**. The lobby has one seat per faction. The host can
open a seat, fill it with a bot (easy / medium / hard), or kick someone, then
starts the game with any two or more seats filled (an open seat is simply not in
that game). Reloading or closing the tab keeps your seat: the menu offers
**Rejoin room**.

How it works, in the same spirit as HexColony:

- **One record per room** (`src/room.js`). Every rule about who may do what
  (claim a seat, start, move) is a pure function `room -> { ok, room }`, tested
  with no network. The game inside it is stored as a JSON *string*, because
  Realtime Database silently drops empty arrays and objects and a game state is
  full of them. A test checks the room never contains one.
- **Every change is a transaction.** The transport runs the room function against
  the room as it actually is, so two phones tapping the same seat in the same
  instant cannot both win: the loser's function runs on the winner's result and is
  refused. A move also carries the revision the sender was looking at; if the room
  has moved on it is refused as stale, which is what stops a double-tap playing
  twice.
- **Swappable transports** with four methods (`create`, `get`, `update`,
  `subscribe`): in-memory (`src/transport-memory.js`, used for solo and the
  tests), across tabs (`ui/net/local.js`, localStorage + BroadcastChannel + Web
  Locks), and Firebase (`ui/net/firebase.js`).
- **Solo is a room too.** Solo play is a private in-memory room with you and some
  bots, so it exercises exactly the code online play uses.
- **The host's device plays the bots.** The engine validates every bot move like
  anyone else's. There is no server, so if the host vanishes another player takes
  over the room (see "Host handover").

### Across devices: Firebase

Rooms are shared through a Firebase Realtime Database in a project of Hollow's own
(`hollow-woodland-4417`, free Spark plan, database in us-central1). Its web config
is in `ui/net/firebase-config.js`; set that to `null` and rooms fall back to tabs
on one device. A web config is not a secret - the rules decide who can write.

Rules are **not** deployed automatically. After editing `database.rules.json`:

```bash
firebase deploy --only database --project hollow-woodland-4417
```

**Verified against the live database:** two tabs created, joined, configured and
played a room through Firebase, with the host's tab driving two bots; both tabs
and the cloud copy agreed on the revision. The rules, probed with unauthenticated
requests, refuse reading the database root, writing outside `rooms/`, a
non-`ABCD`-style code, a room missing required fields, an invalid status, and an
oversized game string.

**Not verified:** two *different devices* or networks (both test tabs were on one
machine, though they talked only through the cloud), a flaky connection, or many
concurrent rooms. Rooms are never deleted, so the database slowly accumulates
finished rooms; add a clean-up before heavy use.

The `.agents/` folder and `skills-lock.json` came from answering "yes" to the
Firebase CLI's "install agent skills" prompt; they are reference docs for coding
agents, not part of the game, and can be deleted.

### Sound

Thirteen short effects, about 120 KB in all, all CC0 and found through the Openverse
API (see `assets/CREDITS.md`): menu click, march, battle, build, recruit, crumble,
Elf magic, dig, Orc frenzy, your-turn chime, clock tick, win and lose. A speaker
button in the header mutes everything and the choice is remembered.

- **One rule for every player.** Sound is decided in `ui/app.js` from what changed
  between two snapshots of the room, so your own moves, other players' and the bots'
  all sound the same. Each room records `last` (`{ f, t }`: who did what, or
  `start` / `timeout`) so every device knows what just happened without comparing
  boards. Nothing plays for the first snapshot (joining, reloading) or a repeat.
- **Derived sounds:** a *crumble* follows a fight that lowered the building and token
  count; a *your turn* chime plays when the turn passes to your seat; the clock ticks
  once at ten seconds and each of the last three on your own clock; *win* and *lose*
  play when the game ends.
- **Browser rules:** audio is blocked until the first click, tap or key press, so
  nothing is loaded before then (the very first click is therefore silent). Sounds are
  decoded once and played through Web Audio so they can overlap, and the same sound
  twice within 70 ms counts once so a burst of bot moves is not a machine-gun.
- **Rebuilding:** the raw clips are in `assets/sfx-originals/`; run
  `powershell -File scripts/build-sfx.ps1` (needs ffmpeg: `winget install Gyan.FFmpeg`)
  to trim each, match peak levels and re-encode them into `assets/sfx/`.

### Animation

Pieces move instead of jumping. Everything is driven by what actually changed on the board:

| what happened | what you see |
|---|---|
| an army marches (including a Dwarf tunnel hop) | the token slides from where it was to where it is; a tunnel hop rises across the forest |
| something is built, forged, dug or spread | a copy of the piece pops in, with a ring |
| warriors are recruited | a ring and a floating "+n" |
| warriors die | a ghost of the fallen drifts away, "-n" floats, a red ring flashes |
| a building or token is destroyed | it breaks up where it stood and "+1" floats for the point it scored |
| a battle | **two dice tumble** above the clearing (attacker's in its colour on the left, defender's on the right), each with the hits it caused, before the casualties land |
| a score changes | the bar fills, the number counts, a "+n" floats and the row flashes |

How it is built, because the obvious way does not work:

- **Describing the change is separate from playing it.** `ui/fx-diff.js` compares two game states and returns
  moves, gains, losses, builds, destructions, the dice and score changes, with no DOM at all. `scripts/fx-tests.mjs`
  checks it hard: for **every move of 150 random games** (all four factions), applying the described events to the
  old board must give the new board exactly, and every kind of event has to have occurred.
- **Every effect is a ghost on a layer that is never repainted.** The board is redrawn from the game state on every
  change, and a repaint can arrive at any moment (a tutorial step, a hover). Animating a board piece directly gets
  killed by the next repaint. This was found the hard way: my first version animated live pieces and the mill's pop-in
  silently never played. Now the board is two layers in one persistent `<svg>`, the effects live on the top one, and where
  a real piece would appear too early (an army still sliding, a building still popping in) the board is told to draw it
  invisible until its ghost lands.
- **One set of positions.** `layout()` in `ui/render.js` is used both to draw the pieces and to place the ghosts; a test
  proves they agree, so an army lands exactly on its token.
- **A fast sequence never piles up**: a new move finishes the previous one's effects at once. The dice stay up a little
  longer on their own. Bots wait a little longer between moves while animating (0.7 s, plus a pause after a fight), so
  you can follow them.
- **The board is always right underneath**: if an effect is cut short or never plays, the game state is still correct.

Turn animations off with the **Animations** checkbox on the menu. They are also off if your device is set to reduce
motion (the checkbox says so), and they skip entirely while the tab is hidden.

**Checked in the browser** by freezing each effect midway and looking at it: the slide, the pop, the tunnel hop, the dice
and casualties, the score float; a 34-second bot game (46 moves) with no errors, at most 11 effect nodes alive at once and
at most one piece hidden at a time; all four lessons played through under animation; the effects layer empties on leaving
a game, and with animations off nothing is drawn.

### Host handover

The host holds the lobby controls (seats, timer, Start) and their device plays the
bots, so a room always needs one. Three ways it changes hands:

- **On purpose:** in the lobby the host has a **Make host** button next to every
  other player.
- **Leaving:** a host who taps Leave (or Menu) hands the room to another seated
  player on the way out, if there is one.
- **Vanishing:** a closed tab, a locked phone or a dropped connection. Each device
  announces it is present, and the transport drops it the moment its connection
  goes. If the host is missing for 8 seconds (so a brief blip does not trigger it)
  the first present seated player after them claims the room. Everyone works out the
  same "first", so normally one device tries; a claim carries the revision it saw and
  is refused if the room has moved on, so two claims cannot both win. The new host's
  device picks the bots up where they stopped, and everyone sees "X is now the host".

Presence is a transport matter, not part of the room: Firebase keeps a record at
`presence/<code>/<id>` that the **server** deletes when the connection drops (no
heartbeat to notice missing), and the cross-tab transport uses heartbeats. It lives
outside the room so it never rewrites or rebroadcasts the game. Only a **seated**
player can become host, and the original host who comes back is simply a player
again.

Verified live against Firebase: with a seatless host and one player against three
bots, closing the host's tab stalled the game for the 8-second grace, then the
remaining player claimed the room and the bots resumed (revision 32 to 81 over the
next half minute). "Make host" and host-leaves-and-hands-over were checked too, and no
stale presence record was left behind. Not tested: several players contending for
the claim at once on real devices (the rule is unit-tested), or a long network
outage (Firebase's own disconnect detection can take up to about a minute there).

### Turn timers

The host picks a timer in the lobby: Off, 30 s, 60 s, 90 s (the default), 2 min or
3 min. It is an **idle** timer, not a turn budget: it restarts after every move, so
a slow but active player is never cut off, and only someone who has walked away is.
Solo play has no timer.

- When a human's clock runs out, their whole turn is passed (end each phase; an Orc
  chant's forced orders are taken as they come, or break into frenzy).
- After **two timeouts in a row** a medium bot plays the seat, and the player sees
  "Take my seat back". Making any move clears the count. A bot covering for a
  player hands the seat back when the host returns to the lobby.
- Every device may send the timeout once the deadline passes; the first wins and the
  rest are refused (the new deadline is in the future). The host's device sends it
  at once and the others after a two-second grace, so the game keeps moving even if
  the host has gone.
- **Everyone agrees on the time** because the transports expose `now()`. For
  Firebase that is the device clock plus `.info/serverTimeOffset`; in testing this
  machine's clock was 487 ms ahead of the server and the offset corrected it. The
  room functions take `now` as an argument and never read a clock, so they are
  tested with a fake one (`scripts/room-tests.mjs`, including a table where every
  human walks away and the game still finishes).
- **Honour system:** there is no server to check a device's claim of the time, so a
  modified client could expire someone's turn early. Rooms are open by design; this
  is the same trust the rest of the room already needs.

### Testing with two tabs on one machine

All tabs on one origin share localStorage, so they would share one identity. Open
the second tab as `http://localhost:5309/?player=2`: it gets its own identity and
saved room, and the first tab sees it arrive live.

### Hidden information

Rooms are open by design: no accounts, you join by saying four letters aloud, and
the whole room reaches every device. Nothing in the game is secret today (all
pieces and the Elf supporter count are public), so nothing leaks. If hidden hands
or cards are added, the room will need to keep them off other players' devices;
that needs a server holding the secrets, same as HexColony's README explains.

## Bots

A bot is a pure function of the game state: it tries every legal move on a copy
of the game, scores the result, and returns the best. Its move goes through the
same `applyMove` as a human's, so a bot cannot cheat. There is one brain; the
levels turn the knobs (`LEVELS` in `src/bot.js`):

| level | how it plays |
|---|---|
| `random` | any legal move |
| `easy` | scores moves but ignores opponents' pieces, and is very noisy |
| `medium` | sees opponents, averages 2 dice samples, shallow lookahead, little noise |
| `hard` | averages 4 dice samples, deeper lookahead, almost no noise |

Nothing is hidden from easy that hard can see; hard just reasons further.

**The ladder, measured** (80 games, one faction at the test level against three
easy bots, seats rotated; read each column against the `easy` row):

| level | Humans | Orcs | Elves | Dwarves |
|---|---|---|---|---|
| random | 0% | 0% | 0% | 0% |
| easy | 71% | 1% | 5% | 23% |
| medium | 74% | 6% | 32% | 59% |
| hard | 91% | 30% | 52% | 67% |

Each faction's own `easy` row is its baseline, because the factions are not
equally strong against weak opposition (a fair table is 25%). The Orc cells are
noisy: the Orc bot is the most sensitive to how it handles its war chant, and
Orc medium read 6% in this run and 29% in the one before. Orc hard has been
the clearest of the three (30-47%). The Orc medium bot is the weakest part of
the ladder and worth another look.

**Faction balance** (all four bots hard, 200 games): Humans 23%, Orcs 22%,
Elves 27%, Dwarves 28%. A fair table is 25% each and the sampling error is
about 3 points, so that is close to even for a first pass.

Things that were found and fixed this way, so they are not re-broken:
- digging used to score a point, which bots farmed by letting tunnels be
  destroyed and digging them again;
- Elf sympathy scored about 23 VP in total from spreading alone;
- Dwarf forging at +2 VP made them win 45% of games;
- a point per building made the Humans win 59% of games (a point per mill, 42%);
- Orc bots marched into empty clearings and then could not carry out the
  chant's battle order, falling into frenzy. Bots now refuse any move that
  forces a frenzy, which lifted the Orcs a lot and needed their scoring trimmed;
- hard Orcs lengthened the chant by two orders and did *worse* than medium,
  because every extra order is another way to break it. Hard now adds one.

## Known issues / next steps

- **Balance is a first pass.** See above. Bots are greedy one-to-two-move
  planners, so a strategy only a deeper player would find (and so a balance
  problem that depends on it) will not show up yet.
- **Games are short.** About 10 rounds. Root-style games usually feel longer;
  the win threshold or scoring rates may want lowering in pace.
- **Hidden information is not hidden.** Elf supporters are a public counter. Once
  there are cards or secret hands, the room state needs to keep them off other
  players' devices (HexColony has the same limit - see its README).
- **No cards yet.** Each faction runs on its own action economy instead.
- **The lessons and the guide are untested on real beginners.** I played every step of all four lessons in the
  browser and checked every number, but I cannot tell whether the pacing is right or which step confuses someone
  who has never seen the game. The wording is in `ui/tutorial-script.js` and `ui/lesson-*.js`.
- **The lessons follow one path.** You can only make the taught move, so you never see what happens if
  you do something else (the Orc lesson's frenzy is the one deliberate exception). Each is about 5 to 8 minutes
  and covers one faction's basics, not its strategy; the guide has that.
- **The bots in a lesson are real bots**, so what they do varies. The recap cards quote what actually
  happened, and the text that depends on it (such as whether your Elf stronghold survived) checks the board.
- **Animation has been checked by freezing frames, not by watching it run.** I can see a still of each effect and confirm
  nothing breaks or sticks, but I cannot judge the *feel*: whether the timings are right, whether a busy turn is too
  much, or whether the dice tumble reads well in motion. Every duration is a constant at the top of `ui/fx.js`.
- **No music**, and a solo game is lost on reload (online games are not: the room keeps them).
- **Sound has been checked mechanically, not by ear.** I confirmed every file decodes,
  the right sound fires for each event, and mute silences everything, but I cannot
  listen: levels, the mix with a busy bot game, and whether a clip feels right are
  untested. Each sound's loudness trim is in `ui/audio.js` (`TRIM`) and each clip's
  length in `scripts/build-sfx.ps1`.
- **Pieces are small on a phone.** The board is drawn to fit the screen width, so on
  a 375px phone a warrior token is about 17px across. Faction is still clear from the
  rim colour and the count badge, but the painted detail only shows on larger screens.
- **No spectators.** Only seated players can see a room.
- **A room with no seated human left cannot be taken over.** Only a seated player
  can become host, so if the host vanishes and nobody else is seated, the bots stop
  until someone returns. (A timer only ever covers humans.)
- **Presence is per player, not per tab.** The same player open in two tabs shares
  one presence record; closing one tab removes it for both.
- **Moves wait for the room to answer** rather than drawing optimistically the way
  HexColony's do. It is instant between tabs and should feel fine on a fast
  connection, but a slow phone will notice.
- Next: spectators.

## Art and sound credits

Sound credits are in `assets/CREDITS.md`.

## Art

The logo, faction crests, forest backdrop, grass tile and all board pieces (four
warrior tokens, five building tiles, two special tokens) were generated with
ChatGPT's image generation (prompted for an original hand-painted woodland style,
naming no other game or artist) and then shrunk for the web with
`scripts/build-art.ps1`. If you publish the game commercially, check OpenAI's
current terms for generated images. Crests, warriors and tokens are cut to circles
and building tiles to rounded squares, on transparent corners; the originals keep
their dark square backgrounds. Each faction's pieces carry its colour in the rim
(blue Humans, green Orcs, violet Elves, orange Dwarves). To change a piece, replace
its file in `assets/originals/` and rerun the script.
