/*
 * Runs dist/main.js on a private Screeps engine (screeps-server-mockup) for a fixed number of ticks and writes
 * ticks-to-milestone results to results/<label>.json. Meant to run inside the Docker image; see README.md.
 *
 *   node run.js [--attack 1500 --attack-body attack,attack,move,move --attack-count 1 --safe-mode 0]
 *   node run.js [--ticks 2000] [--until-rcl 4] [--sample 100] [--label name] [--room W0N1] [--x 25 --y 25]
 *
 * The spawn position is chosen automatically unless --x/--y are given.
 */
process.env.STORAGE_HOST = "127.0.0.1"
require("./nodelay")

const fs = require("fs")
const path = require("path")
const { ScreepsServer } = require("screeps-server-mockup")
const { addRaider, disableSafeMode, spawnRaiders } = require("./attack")

const DIST = path.join(__dirname, "dist")
const RESULTS = path.join(__dirname, "results")
const PROGRESS_EVERY = 1000

class Server extends ScreepsServer {
  // The mockup starts engine processes with a fresh env. Pin storage to IPv4 (Node 22 resolves localhost to ::1,
  // but the driver dials 127.0.0.1) and preload the TCP_NODELAY patch.
  startProcess(name, execPath, env) {
    return super.startProcess(name, execPath, {
      ...env,
      STORAGE_HOST: "127.0.0.1",
      NODE_OPTIONS: `--require ${path.join(__dirname, "nodelay.js")}`
    })
  }
}

function parseArgs(argv) {
  const opts = {
    ticks: 2000,
    untilRcl: null,
    sample: 100,
    label: null,
    room: "W0N1",
    x: null,
    y: null,
    // Attack scenario (see attack.js): tick the raiders arrive, their body, how many, and whether we keep the
    // safe mode new players start with (1), have it off with one charge to activate (0), or have none when the raid starts (-1). Note each
    // RCL reached also grants a charge.
    attack: null,
    attackBody: "attack,attack,attack,move,move,move",
    attackCount: 1,
    safeMode: 1,
    // Mid-game start: GCL level for the player, and an RCL to jump the home room to (see fastForwardRcl).
    gcl: 1,
    startRcl: null,
    // With --start-rcl: also build the planned ramparts with this many hits (1 = just finished by builders).
    startRamparts: null,
    // Tick to add those ramparts (default: with the fast-forward). Later means they arrive in a running economy.
    rampartsAt: null,
    // Other players: rooms owned by a friendly player (added to our Memory.allies) or a hostile one (Memory.enemies).
    allyRooms: null,
    hostileRooms: null,
    // Rooms owned by a player we don't classify (neutral); with --neutral-towers 1 its first room gets a tower that
    // shoots any foreign creep in range.
    neutralRooms: null,
    neutralTowers: 0
  }
  const strings = ["label", "room", "attackBody", "allyRooms", "hostileRooms", "neutralRooms"]
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase())
    if (!(key in opts)) throw new Error(`Unknown option ${argv[i]}`)
    const value = argv[++i]
    opts[key] = strings.includes(key) ? value : Number(value)
  }
  opts.label = opts.label || process.env.BENCH_LABEL || new Date().toISOString().replace(/[:.]/g, "-")
  return opts
}

/**
 * Pick a spawn tile the way a player would: open ground with a clear 7x7 area around it, as close as possible
 * to the sources and controller combined. Distances are straight-line (Chebyshev), which is good enough to
 * pick a sensible spot and keeps runs comparable because the choice is deterministic.
 */
async function chooseSpawnPos(world, room) {
  const terrain = await world.getTerrain(room)
  const objects = await world.roomObjects(room)
  const targets = objects.filter(o => o.type === "source" || o.type === "controller")
  const CLEAR = 3

  let best = null
  for (let y = 2 + CLEAR; y < 48 - CLEAR; y++) {
    for (let x = 2 + CLEAR; x < 48 - CLEAR; x++) {
      let clear = true
      for (let dy = -CLEAR; dy <= CLEAR && clear; dy++)
        for (let dx = -CLEAR; dx <= CLEAR && clear; dx++) clear = terrain.get(x + dx, y + dy) !== "wall"
      if (!clear) continue

      const cost = targets.reduce((sum, o) => sum + Math.max(Math.abs(o.x - x), Math.abs(o.y - y)), 0)
      if (!best || cost < best.cost) best = { x, y, cost }
    }
  }
  if (!best) throw new Error(`No open ${2 * CLEAR + 1}x${2 * CLEAR + 1} area for a spawn in ${room}; pass --x/--y`)
  return best
}

function loadModules(sampleInterval) {
  const main = path.join(DIST, "main.js")
  if (!fs.existsSync(main)) throw new Error(`${main} not found. Run \`npm run build\` first.`)

  const modules = {
    main: fs
      .readFileSync(path.join(__dirname, "game", "benchMain.js"), "utf8")
      .replaceAll("__SAMPLE_INTERVAL__", String(sampleInterval)),
    bot: fs.readFileSync(main, "utf8")
  }
  // Every other file is a module too, so other bots (flat multi-module ones like TooAngel, or ones with a .wasm
  // module) run the same way. `x.js` is required as `x`; a source map `main.js.map.js` as `main.js.map`.
  for (const file of fs.readdirSync(DIST)) {
    if (file === "main.js") continue
    if (file.endsWith(".wasm"))
      modules[file.slice(0, -5)] = { binary: fs.readFileSync(path.join(DIST, file)).toString("base64") }
    else if (file.endsWith(".js")) modules[file.slice(0, -3)] = fs.readFileSync(path.join(DIST, file), "utf8")
  }
  return modules
}

/** GCL points for a GCL level: the game's formula, GCL_MULTIPLY * (level - 1) ^ GCL_POW. */
function gclPoints(level) {
  return level <= 1 ? 0 : Math.ceil(1000000 * Math.pow(level - 1, 2.4)) + 1
}

/** Late enough that the bot has planned its layout (it does on its first ticks). */
const FAST_FORWARD_TICK = 5
const EXTENSIONS_PER_RCL = [0, 0, 5, 10, 20, 30, 40, 50, 60]
const EXTENSION_ENERGY_PER_RCL = [0, 0, 50, 50, 50, 50, 50, 100, 200]
const TOWERS_PER_RCL = [0, 0, 0, 1, 1, 2, 2, 3, 6]

/**
 * Jump the home room to `rcl`: set the controller level, and build the extensions and towers that RCL allows at
 * the positions the bot planned for them, full of energy, plus its planned containers (empty). Lets expansion and later-game logic be tested without
 * playing through the early game first.
 */
async function fastForwardRcl(server, player, room, rcl, rampartHits) {
  const { db } = server.common.storage
  await db["rooms.objects"].update({ room, type: "controller" }, { $set: { level: rcl, progress: 0 } })

  const memory = JSON.parse((await player.memory) || "{}")
  const buildOrder = (memory.rooms && memory.rooms[room] && memory.rooms[room].buildOrder) || []
  const want = { extension: EXTENSIONS_PER_RCL[rcl], tower: TOWERS_PER_RCL[rcl], container: 5 }
  const placed = { extension: 0, tower: 0, container: 0 }
  for (const step of buildOrder) {
    const type = step.structureType
    if (!(type in want) || want[type] <= placed[type]) continue
    const energy = type === "tower" ? 1000 : type === "container" ? 0 : EXTENSION_ENERGY_PER_RCL[rcl]
    const hits = type === "tower" ? 3000 : type === "container" ? 250000 : 1000
    const capacity = type === "container" ? 2000 : energy
    await server.world.addRoomObject(room, type, step.x, step.y, {
      user: player.id,
      store: { energy },
      ...(type === "container" ? { storeCapacity: capacity } : { storeCapacityResource: { energy: capacity } }),
      hits,
      hitsMax: hits,
      notifyWhenAttacked: true
    })
    placed[type]++
  }
  const ramparts = rampartHits ? await addPlannedRamparts(server, player, room, rcl, rampartHits) : 0
  return `${placed.extension} extensions, ${placed.tower} towers, ${placed.container} containers, ${ramparts} ramparts`
}

/** Build the room's planned ramparts with `hits` hits (1 = just finished by builders). */
async function addPlannedRamparts(server, player, room, rcl, hits) {
  const memory = JSON.parse((await player.memory) || "{}")
  const buildOrder = (memory.rooms && memory.rooms[room] && memory.rooms[room].buildOrder) || []
  let n = 0
  for (const step of buildOrder.filter(s => s.structureType === "rampart")) {
    await server.world.addRoomObject(room, "rampart", step.x, step.y, {
      user: player.id,
      hits,
      hitsMax: 1000000 * [0, 0, 0.3, 1, 3, 10, 30, 100, 300][rcl],
      nextDecayTime: (await server.world.gameTime) + 100,
      notifyWhenAttacked: true
    })
    n++
  }
  return n
}

/**
 * Another player owning `rooms`: a spawn in the first (so the player exists) and the other controllers claimed. Its
 * code does nothing, so it never attacks; whether we treat it as friendly depends on Memory.allies.
 */
async function addNeighbour(server, username, rooms, code) {
  const [first, ...rest] = rooms
  const { x, y } = await chooseSpawnPos(server.world, first)
  const bot = await server.world.addBot({
    username,
    room: first,
    x,
    y,
    modules: { main: code || "module.exports.loop=()=>{}" }
  })
  const { db } = server.common.storage
  if (code) {
    // A working tower next to its spawn (towers need RCL 3).
    await db["rooms.objects"].update({ room: first, type: "controller" }, { $set: { level: 3 } })
    await server.world.addRoomObject(first, "tower", x + 2, y, {
      user: bot.id,
      store: { energy: 1000 },
      storeCapacityResource: { energy: 1000 },
      hits: 3000,
      hitsMax: 3000
    })
  }
  for (const room of rest)
    await db["rooms.objects"].update({ room, type: "controller" }, { $set: { user: bot.id, level: 1 } })
  return bot
}

/** Code for a player whose towers shoot any foreign creep in their room. */
const TOWER_SHOOTER = `module.exports.loop = function () {
  for (const t of Object.values(Game.structures).filter(s => s.structureType === STRUCTURE_TOWER)) {
    const target = t.pos.findClosestByRange(FIND_HOSTILE_CREEPS)
    if (target) t.attack(target)
  }
}`

async function readBench(player) {
  const memory = JSON.parse((await player.memory) || "{}")
  return memory.__bench || { milestones: {}, samples: [], harvested: 0, errors: 0 }
}

function lastSample(bench) {
  return bench.samples[bench.samples.length - 1] || {}
}

function formatCreeps(creeps = {}) {
  return (
    Object.entries(creeps)
      .map(([role, n]) => `${role}:${n}`)
      .join(" ") || "-"
  )
}

function printSummary(result) {
  const { meta, milestones } = result
  console.log(`\n=== ${meta.label}  (${meta.ticksRun} ticks, ${meta.msPerTick.toFixed(1)} ms/tick) ===`)
  for (const [key, tick] of Object.entries(milestones)) console.log(`  ${key.padEnd(22)} ${String(tick).padStart(7)}`)
  console.log(`  harvested total        ${result.harvested}`)
  for (const [activity, amount] of Object.entries(result.spent))
    console.log(
      `  spent on ${activity.padEnd(13)} ${amount}  (${((amount / (result.harvested || 1)) * 100).toFixed(0)}%)`
    )
  if (Object.keys(result.decayAt || {}).length)
    console.log(
      `  decayed at             ${Object.entries(result.decayAt)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}`
    )
  if (result.crowding.nearSpawnPerTick !== undefined)
    console.log(
      `  next to spawn          ${result.crowding.nearSpawnPerTick} creeps/tick  (spawn boxed in ${result.crowding.spawnBoxedTicks} ticks)`
    )
  const d = result.defence
  if (d && d.hostilesSeen)
    console.log(
      `  defence                ${d.hostilesKilled}/${d.hostilesSeen} raiders killed, lost ${
        d.lost
      } creeps ${JSON.stringify(d.lostRoles)}, spawn hits min ${d.spawnMinHits}${
        d.safeModeTick ? `, safe mode at ${d.safeModeTick}` : ""
      }`
    )
  console.log(`  errors logged          ${result.errors.logged}  (uncaught: ${result.errors.uncaught})`)
  if (result.errors.first) console.log(`  first error: ${result.errors.first.split("\n")[0]}`)
  if (result.errors.last)
    console.log(`  last error @${result.errors.last.tick}: ${result.errors.last.message.split("\n")[0]}`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  fs.mkdirSync(RESULTS, { recursive: true })
  const logFile = path.join(RESULTS, `${opts.label}.log`)
  const log = fs.createWriteStream(logFile)

  const server = new Server()
  await server.world.reset()
  await server.world.stubWorld()
  if (opts.x === null || opts.y === null) ({ x: opts.x, y: opts.y } = await chooseSpawnPos(server.world, opts.room))
  // Added before our bot: adding a second player after the first makes the first one's tick-1 start fail.
  const raider = opts.attack !== null ? await addRaider(server) : null
  const ally = opts.allyRooms ? await addNeighbour(server, "ally", opts.allyRooms.split(",")) : null
  if (opts.hostileRooms) await addNeighbour(server, "enemy", opts.hostileRooms.split(","))
  if (opts.neutralRooms)
    await addNeighbour(server, "neutral", opts.neutralRooms.split(","), opts.neutralTowers ? TOWER_SHOOTER : undefined)
  const player = await server.world.addBot({
    username: "bench",
    room: opts.room,
    x: opts.x,
    y: opts.y,
    gcl: gclPoints(opts.gcl),
    modules: loadModules(opts.sample)
  })

  if (opts.safeMode !== 1) await disableSafeMode(server, opts.room, opts.safeMode === 0 ? 1 : 0)

  // Subscribe to the raw console channel: the mockup's `console` event drops `error`, which is where uncaught
  // exceptions (including failures to load the code at all) are reported.
  let loggedErrors = 0
  let firstError = null
  await server.common.storage.pubsub.subscribe(`user:${player.id}/console`, event => {
    const { messages, error } = JSON.parse(event)
    for (const line of (messages && messages.log) || []) {
      if (/error/i.test(line)) loggedErrors++
      log.write(line + "\n")
    }
    if (error) {
      loggedErrors++
      firstError = firstError || String(error)
      log.write(`[ERROR] ${error}\n`)
    }
  })

  await server.start()
  if (ally) await player.console(`Memory.allies = ["ally"]`)
  // The "enemy" player is one we've declared hostile, as a player would in config/relations or Memory.enemies.
  if (opts.hostileRooms) await player.console(`Memory.enemies = ["enemy"]`)
  console.log(
    `Running ${opts.ticks} ticks in ${opts.room}, spawn at ${opts.x},${opts.y}${
      opts.untilRcl ? `, stopping at RCL ${opts.untilRcl}` : ""
    }`
  )

  const started = Date.now()
  let tick = 0
  let bench = null
  for (tick = 1; tick <= opts.ticks; tick++) {
    if (opts.startRcl && tick === FAST_FORWARD_TICK) {
      const placed = await fastForwardRcl(
        server,
        player,
        opts.room,
        opts.startRcl,
        opts.rampartsAt ? null : opts.startRamparts
      )
      console.log(`tick ${String(tick).padStart(6)}  fast-forwarded to RCL ${opts.startRcl}: ${placed}`)
    }
    if (opts.startRamparts && opts.rampartsAt && tick === opts.rampartsAt) {
      const n = await addPlannedRamparts(server, player, opts.room, opts.startRcl || 3, opts.startRamparts)
      console.log(`tick ${String(tick).padStart(6)}  added ${n} ramparts with ${opts.startRamparts} hits`)
    }
    if (raider && tick === opts.attack) {
      const body = opts.attackBody.split(",").map(p => p.trim())
      // Each RCL reached grants a safe mode charge, so "none" has to be enforced when the raid starts.
      if (opts.safeMode === -1) await disableSafeMode(server, opts.room, 0)
      const at = await spawnRaiders(server, opts.room, raider.id, body, opts.attackCount, opts)
      console.log(`tick ${String(tick).padStart(6)}  raiders arrive at ${at.join(" ")}: ${body.join(",")}`)
    }
    await server.tick()
    if (tick % PROGRESS_EVERY !== 0) continue

    bench = await readBench(player)
    const s = lastSample(bench)
    const msPerTick = (Date.now() - started) / tick
    console.log(
      `tick ${String(tick).padStart(6)}  rcl ${s.rcl ?? 0}  harvested ${bench.harvested}  ` +
        `cpu ${(s.cpuAvg ?? 0).toFixed(2)}  creeps ${formatCreeps(s.creeps)}  (${msPerTick.toFixed(1)} ms/tick)`
    )
    if (opts.untilRcl && bench.milestones[`rcl:${opts.untilRcl}`] !== undefined) break
    if (!bench.samples.length && tick >= opts.sample) {
      // The recorder writes a sample every --sample ticks, so none after 1000 ticks means the code isn't running.
      console.error(`\nNo samples recorded; the code is not running. First error:\n${firstError || "(none reported)"}`)
      break
    }
  }
  const ticksRun = Math.min(tick, opts.ticks)
  const wallSeconds = (Date.now() - started) / 1000
  bench = await readBench(player)

  const result = {
    meta: {
      label: opts.label,
      date: new Date().toISOString(),
      commit: process.env.BENCH_COMMIT || null,
      dirty: process.env.BENCH_DIRTY === "1",
      room: opts.room,
      spawn: { x: opts.x, y: opts.y },
      ticksRequested: opts.ticks,
      ticksRun,
      wallSeconds,
      msPerTick: (wallSeconds * 1000) / ticksRun,
      sampleInterval: opts.sample,
      attack: opts.attack === null ? null : { tick: opts.attack, body: opts.attackBody, count: opts.attackCount },
      safeMode: opts.safeMode,
      gcl: opts.gcl,
      allyRooms: opts.allyRooms,
      hostileRooms: opts.hostileRooms,
      neutralRooms: opts.neutralRooms,
      neutralTowers: opts.neutralTowers,
      startRcl: opts.startRcl
    },
    milestones: Object.fromEntries(Object.entries(bench.milestones).sort((a, b) => a[1] - b[1])),
    harvested: bench.harvested,
    spent: bench.spent || {},
    spentByRole: bench.spentByRole || {},
    decayAt: bench.decayAt || {},
    crowding: bench.crowd
      ? {
          nearSpawnPerTick: +(bench.crowd.nearSpawn / bench.crowd.ticks).toFixed(2),
          spawnBoxedTicks: bench.crowd.boxedTicks
        }
      : {},
    defence: bench.defence || null,
    roomsVisited: bench.roomsVisited || {},
    // The bot's own view at the end: remote mining plan, allies, and what it knows about each room.
    botState: await (async () => {
      const m = JSON.parse((await player.memory) || "{}")
      const intel = Object.fromEntries(
        Object.entries(m.rooms || {})
          .filter(([, r]) => r.intel)
          .map(([n, r]) => [
            n,
            {
              owner: r.intel.controller && r.intel.controller.owner,
              sources: r.intel.sources,
              positions: (r.intel.sourcePositions || []).length,
              hostileStructures: r.intel.hostileStructures,
              tick: r.intel.tick
            }
          ])
      )
      return {
        remotes: m.remotes,
        remoteReport: m.remoteReport,
        remotePaused: m.remotePaused,
        allies: m.allies,
        hostilePlayers: m.hostilePlayers,
        intel
      }
    })(),
    errors: { logged: loggedErrors, uncaught: bench.errors, first: firstError, last: bench.lastError },
    samples: bench.samples
  }

  const out = path.join(RESULTS, `${opts.label}.json`)
  fs.writeFileSync(out, JSON.stringify(result, null, 2))
  printSummary(result)
  console.log(`\nWrote results/${opts.label}.json and results/${opts.label}.log`)

  log.end()
  server.stop()
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
