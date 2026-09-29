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

## Milestones

| Key | Meaning |
| --- | --- |
| `rcl:N` | Controller reached level N |
| `energy:N` | N energy harvested from sources in total (local and remote) |
| `first:<type>` | First structure of that type completed |
| `extension:N`, `tower:N`, `spawn:N`, `container:N`, `link:N` | Nth structure of that type completed |
| `creeps:N` | N creeps alive at once |
| `upgraded:N`, `built:N` | N energy spent upgrading the controller / building, for comparing short runs |

The JSON also has `samples` (one every `--sample` ticks) with average and max CPU, bucket, energy/tick, creeps by
role and structure counts, for when you need to see *why* a milestone moved.

## Reading results

Runs are deterministic: `Math.random()` is reseeded from `Game.time` each tick, so the same code gives the same
milestones on every run. Any difference between two runs comes from your change.

The stub world's terrain is fixed and isn't a typical room. Treat the numbers as a relative benchmark between
versions of your bot, not a prediction of live-server timings.

## Movement scenarios

```bash
npm run test-movement
```

Compiles [movement.ts](../src/creeps/action/common/movement.ts) on its own and runs it against scripted scenarios
on the real engine:
- 1-wide corridors with friendly or hostile blockers
- two creeps meeting head-on
- creeps boxed in on all 8 sides by idle friendly creeps, immovable (no MOVE) friendly creeps, or hostile creeps

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
