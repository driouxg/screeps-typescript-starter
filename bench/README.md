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
| `--ramparts-at` | with `--start-rcl` | Tick to add those ramparts, e.g. `1000` so they arrive in a running economy |

Samples include `ramparts` (count, lowest and average hits, how many have decayed away) and `towerEnergy`:

```bash
npm run bench -- --start-rcl 3 --start-ramparts 1 --ramparts-at 1000 --ticks 2500
```

Milestones `expansion:claiming`, `rooms:2` (claimed) and `spawn:2` (the new room's spawn is built) track an
expansion.

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
role and structure counts, for when you need to see *why* a milestone moved.

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

Compiles [movement.ts](../src/creeps/action/common/movement.ts) and `parking.ts` on their own and runs them against scripted scenarios
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
