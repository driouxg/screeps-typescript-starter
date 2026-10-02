# Bench: ticks-to-milestone on the real engine

Runs `dist/main.js` on a private Screeps engine ([screeps-server-mockup](https://github.com/screepers/screeps-server-mockup))
as fast as your CPU allows, and records the game tick at which the bot reaches each milestone. Use it to check
whether a change makes the bot faster.

## Usage

```bash
npm run bench                                   # build, then run 2000 ticks (~1 minute)
npm run bench -- --ticks 30000 --until-rcl 4    # stop early once RCL 4 is reached
npm run bench -- --label extensions-first       # name the result (default: <commit>_<timestamp>)

npm run bench:compare                           # compare the two most recent runs
npm run bench:compare -- baseline extensions-first
```

Each run writes `bench/results/<label>.json` (milestones + samples) and `bench/results/<label>.log` (the bot's
console output and errors). In the compare output, the first run is the baseline; a negative delta means that
milestone was reached sooner.

| Option | Default | |
| --- | --- | --- |
| `--ticks` | 2000 | Maximum ticks to run |
| `--until-rcl` | — | Stop once this RCL is reached |
| `--sample` | 100 | Ticks between samples (CPU, creeps by role, structures, energy) |
| `--label` | `<commit>_<timestamp>` | Result file name |
| `--room` | W0N1 | Starting room in the stub world |
| `--x`, `--y` | auto | Spawn position. By default the harness picks open ground close to the sources and controller |

### Mid-game starts and expansion

```bash
npm run bench -- --start-rcl 3 --gcl 2 --ticks 4500    # expansion: claim a second room and build its spawn
```

| Option | Default | |
| --- | --- | --- |
| `--gcl` | 1 | The player's GCL level (how many rooms it may own) |
| `--start-rcl` | — | At tick 5, jump the home room to this RCL and build the extensions and towers it allows at the bot's planned positions, full of energy, plus its planned containers |
| `--start-ramparts` | — | Also build the planned ramparts with this many hits (`1` = just finished by builders) |
| `--cancel-expansion` | — | Tick to cancel the expansion underway (as the dashboard's Cancel does); the summary's `construction sites` line shows what's left by room |
| `--rival-rooms`, `--rival-remote` | — | A player "rival" owning `--rival-rooms` (a base in the first) who reserves `--rival-remote` with a reserver and a miner there; the summary shows who holds it at the end (see src/remote/contest.ts) |
| `--rival-remote-at` | 0 | Tick the rival reserves `--rival-remote` (default: from the start); later, it walks into a remote we already mine |
| `--aggression` | — | Our `Memory.controls.aggression` at the start, e.g. `aggressive` (contests need it) |
| `--scout-request`, `--scout-at` | —, 1000 | Ask for a room to be scouted at that tick (as the dashboard's Scouting card does); the log says how it went |
| `--contest`, `--contest-at` | —, 1000 | Pick a room to contest at that tick, as the dashboard's remote mining card does (goes ahead whatever the aggression) |
| `--scouting` | 1 | `0`: start with scouting switched off (a requested room is still scouted) |
| `--start-roads` | 0 | With `--start-rcl`: `1` also builds the room's planned roads (not tunnels), as if its builders had finished them |
| `--ramparts-at` | with `--start-rcl` | Tick to add those ramparts, e.g. `1000` so they arrive in a running economy |

Samples include `ramparts` (count, lowest and average hits, how many have decayed away) and `towerEnergy`:

```bash
npm run bench -- --start-rcl 3 --start-ramparts 1 --ramparts-at 1000 --ticks 2500
```

Milestones `expansion:claiming`, `rooms:2` (claimed) and `spawn:2` (the new room's spawn is built) track an
expansion.

### Other players and remote mining

```bash
npm run bench -- --start-rcl 4 --ticks 3000 --ally-rooms W1N1,W0N2 --hostile-rooms W2N1
```

| Option | Default | |
| --- | --- | --- |
| `--ally-rooms` | — | Rooms owned by a player "ally", who is added to our `Memory.allies` |
| `--hostile-rooms` | — | Rooms owned by a player "enemy", who is added to our `Memory.enemies` |
| `--neutral-rooms` | — | Rooms owned by a player "neutral" that we don't classify |
| `--neutral-towers` | 0 | `1`: the neutral gets a tower that shoots any foreign creep, so the bot should flag it hostile |
| `--retaliate` | — | Tick to ask for a strike on "enemy" (as the dashboard's Retaliate button does, see src/defence/retaliation.ts); its rooms have no towers, so it should go ahead |
| `--hostile-outpost` | 0 | `1`: the enemy's second room (`--hostile-rooms W1N2,W2N1`) gets a spawn, extensions (one under a rampart), a container, a worker and an armed defender, and no towers. The summary lists what's left of it, to check a strike fights |

The ally's and enemy's code does nothing. The result's `roomsVisited` counts creep-ticks per room (so you can check nothing
entered a hostile room), and `botState` holds the bot's remote mining plan and `remoteReport` (every candidate
source and why it was or wasn't chosen). In the stub world, W0N1's only exits are W0N2 and W1N1.

### Attack scenarios

```bash
npm run bench -- --attack 1200 --safe-mode 0                        # one 3-ATTACK raider at tick 1200
npm run bench -- --attack 1200 --attack-count 3 --safe-mode -1 \
  --attack-body tough,tough,attack,attack,attack,move,move,move,move,move
```

| Option | Default | |
| --- | --- | --- |
| `--attack` | — | Tick the raiders arrive, at the room edge nearest our spawn ([attack.js](attack.js)) |
| `--attack-body` | `attack,attack,attack,move,move,move` | Body of each raider |
| `--attack-count` | 1 | Number of raiders |
| `--attack-room` | home room | Room the raiders arrive in, e.g. a remote mining room (`--room W1N2 --start-rcl 4 --attack 3000 --attack-room W2N2`); not W1N1, the raider's own room |
| `--safe-mode` | 1 | `1`: safe mode active, as for a new player. `0`: off, one charge available. `-1`: off, and no charges when the raid starts (each RCL reached grants one) |

Raiders attack the closest creep, then the spawn, then other structures. The summary adds a `defence` line with
raiders killed, our creeps killed by role, the lowest spawn hits, and when safe mode was activated.

## Milestones

| Key | Meaning |
| --- | --- |
| `rcl:N` | Controller reached level N |
| `energy:N` | N energy harvested from sources in total (local and remote) |
| `first:<type>` | First structure of that type completed |
| `extension:N`, `tower:N`, `spawn:N`, `container:N`, `link:N` | Nth structure of that type completed |
| `creeps:N` | N creeps alive at once |
| `upgraded:N`, `built:N` | N energy spent upgrading the controller / building, for comparing short runs |
| `hostile:arrived`, `hostile:cleared`, `lost:spawn` | Raiders entered the room; all raiders dead; our last spawn destroyed |

The JSON also has `samples` (one every `--sample` ticks) with average and max CPU, bucket, energy/tick, creeps by
role and structure counts, for when you need to see *why* a milestone moved. Each sample also has the largest energy
`piles`, every `containers`' energy (and the role of the creep standing on it), and `states`: creeps per role that are
parked, working or collecting (from `memory.parkPos` / `memory.working`), averaged over the interval.

`spent on decay` is energy lost from piles on the ground (each loses `ceil(amount / 1000)` per tick), and `decayed at`
splits it into piles next to a source, near the controller, and elsewhere. A drop miner's pile never quite empties,
so it costs at least 1 energy per tick for as long as there's no container under the miner.

`cpu <key>` lines are our bot's own profile (see `profile` in `src/main.ts`): total CPU, and CPU per call, per creep
role (`creep:BUILDER`: per builder per tick) and per main loop phase. The bench turns it on by creating
`Memory.cpuProfile`; on a live server, `Memory.cpuProfile = {}` in the console does the same, and `delete
Memory.cpuProfile` turns it off. The engine's CPU here is wall-clock time, so compare runs on the same machine.

## Comparing other bots

`--bot-dist <folder>` runs any bot's built code instead of `dist/`: every `.js` file in the folder becomes a module
(`main.js` is wrapped by the recorder like ours, `x.js` is required as `x`), and `.wasm` files become binary modules.
Milestones and energy flows come from room event logs, so they work for any bot; only the by-role numbers depend on
`memory.role`.

```
npm run build && node bench/docker.js --bot-dist ../hivemind/dist --label vs-hivemind
node bench/docker.js --bot-dist ../screeps/src --ticks 12000 --until-rcl 3 --label rcl3-tooangel
```

Tested with TooAngel (its `src/` folder as is), Hivemind, Overmind and The International (each built with its own
`rollup -c`; Overmind places no construction sites in this world). Bots that count every creep that appears as
"spawned" but reuse names can show `spent on spawn` above 100%.

## Reading results

Runs are deterministic: `Math.random()` is reseeded from `Game.time` each tick, so the same code gives the same
milestones on every run. Any difference between two runs comes from your change.

The stub world's terrain is fixed and isn't a typical room. Treat the numbers as a relative benchmark between
versions of your bot, not a prediction of live-server timings.

## Layout test

```bash
npm run test-layout                                   # planner places everything (a room we expand into)
node bench/docker.js --layout-test --mode spawn       # a spawn is placed by hand first, as in a first room
node bench/docker.js --layout-test --rooms W7N1 --render   # draw the plan for one room as text
```

Bundles the base planner ([planLayout](../src/composer/constructionComposer.ts)) on its own and runs it in the
engine against all 72 rooms with a controller on the default server map. [layout-check.js](layout-check.js)
checks every plan for:

- placements the game refuses (room edge, next to an exit, on a wall, extractor off the mineral)
- duplicate steps, two structures on one tile, roads under buildings
- counts over, or short of, the RCL 8 limits (e.g. 60 extensions, 6 towers, 10 labs, 3 spawns)
- sources or the controller boxed in, and structures, sources, the controller or exits unreachable from the spawn
- core structures an attacker can reach from an exit without breaking a rampart

and reports CPU per plan. Results go to `results/layout-<mode>.json`.

## Movement scenarios

```bash
npm run test-movement
```

Bundles [movement.ts](../src/creeps/action/common/movement.ts) and `parking.ts` and runs them against scripted scenarios
on the real engine:
- 1-wide corridors with friendly or hostile blockers
- two creeps meeting head-on
- creeps boxed in on all 8 sides by idle friendly creeps, immovable (no MOVE) friendly creeps, or hostile creeps
- a puller towing a creep without MOVE parts through a 1-wide corridor, a packed crowd, and onto an occupied
  destination
- a spawn boxed in by 8 idle creeps, which the loiter rule in [parking.ts](../src/creeps/action/common/parking.ts)
  must clear

Each creep must either reach its target or, when there's no way out, report `ERR_NO_PATH` so its role picks a new
target. Scenarios are defined in `movement-scenarios.js`.

## How it works

- `docker.js` runs on your machine. It builds the `screeps-bench` image (cached after the first build) and runs
  it with `dist/` mounted read-only and `bench/results/` mounted for output.
- The engine needs Node ≥ 22.9, which is why it runs in Docker. Your project's Node version doesn't matter.
- `run.js` runs in the container. It creates the world, uploads the bot, and drives the ticks.
- `game/benchMain.js` is uploaded as the player's `main` module. It calls your bot's `loop` (uploaded as `bot`),
  measures CPU, then records milestones into `Memory.__bench`.
- `nodelay.js` turns off Nagle's algorithm on the engine's internal TCP connections. Without it, each tick
  stalls ~200 ms on delayed ACKs. With it, a tick takes ~10–30 ms depending on colony size.
