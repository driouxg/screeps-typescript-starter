/*
 * Layout test: runs the bot's base planner (bench/build/planner.js) in the real engine against every room with a
 * controller on the default server map (72 real rooms), and checks each plan with layout-check.js.
 *
 *   node layout-test.js [--mode fresh|spawn] [--rooms W1N1,W2N2] [--verbose]
 *
 * mode fresh: the planner places everything (a room we expand into).
 * mode spawn: a spawn is placed first, the way a player places their first spawn by hand.
 */
process.env.STORAGE_HOST = "127.0.0.1"
require("./nodelay")

const fs = require("fs")
const path = require("path")
const { ScreepsServer, TerrainMatrix } = require("screeps-server-mockup")
const { check } = require("./layout-check")

class Server extends ScreepsServer {
  startProcess(name, execPath, env) {
    return super.startProcess(name, execPath, {
      ...env,
      STORAGE_HOST: "127.0.0.1",
      NODE_OPTIONS: `--require ${path.join(__dirname, "nodelay.js")}`
    })
  }
}

const RESULTS = path.join(__dirname, "results")
const MAX_TICKS = 400

const RUNNER = `
const { plan } = require("planner")
module.exports.loop = function () {
  if (!Memory.queue) Memory.queue = Object.keys(Game.rooms).filter(n => Game.rooms[n].controller && Game.rooms[n].controller.my && n !== __HOST__).sort()
  Memory.results = Memory.results || {}
  while (Memory.queue.length && Game.cpu.getUsed() < 250) {
    const name = Memory.queue.shift()
    const start = Game.cpu.getUsed()
    let steps = null
    let error = null
    try { steps = plan(Game.rooms[name]) } catch (e) { error = String((e && e.stack) || e).slice(0, 600) }
    Memory.results[name] = {
      cpu: +(Game.cpu.getUsed() - start).toFixed(1),
      steps: steps ? steps.map(s => [s.x, s.y, s.structureType]) : null,
      error
    }
  }
  Memory.done = Memory.queue.length === 0
}`

function parseArgs(argv) {
  const opts = { mode: "fresh", rooms: null, verbose: false, render: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--verbose") opts.verbose = true
    else if (argv[i] === "--render") opts.render = true
    else if (argv[i] === "--mode") opts.mode = argv[++i]
    else if (argv[i] === "--rooms") opts.rooms = argv[++i].split(",")
    else throw new Error(`Unknown option ${argv[i]}`)
  }
  return opts
}

/** The default server map: terrain strings and the objects we care about, for rooms with a controller. */
function loadMap() {
  const db = require("@screeps/storage/db.original.json")
  const collection = name => db.collections.find(c => c.name === name).data
  const terrain = Object.fromEntries(collection("rooms.terrain").map(t => [t.room, t.terrain]))
  const objects = {}
  for (const o of collection("rooms.objects")) {
    if (!["controller", "source", "mineral"].includes(o.type)) continue
    ;(objects[o.room] = objects[o.room] || []).push(o)
  }
  const rooms = Object.keys(objects).filter(r => objects[r].some(o => o.type === "controller") && terrain[r])
  return { rooms: rooms.sort(), terrain, objects }
}

/** Where a player would put their first spawn: open 7x7 ground closest to the sources and controller. */
function spawnSpot(terrain, objects) {
  const wall = (x, y) => terrain[y * 50 + x] === "1" || terrain[y * 50 + x] === "3"
  const targets = objects.filter(o => o.type === "source" || o.type === "controller")
  let best = null
  for (let y = 5; y < 45; y++)
    for (let x = 5; x < 45; x++) {
      let clear = true
      for (let dy = -3; dy <= 3 && clear; dy++) for (let dx = -3; dx <= 3 && clear; dx++) clear = !wall(x + dx, y + dy)
      if (!clear) continue
      const cost = targets.reduce((s, o) => s + Math.max(Math.abs(o.x - x), Math.abs(o.y - y)), 0)
      if (!best || cost < best.cost) best = { x, y, cost }
    }
  return best
}

// One character per structure type for --render.
const GLYPHS = {
  spawn: "S",
  extension: "e",
  tower: "T",
  storage: "O",
  terminal: "M",
  factory: "F",
  powerSpawn: "P",
  nuker: "N",
  observer: "V",
  lab: "B",
  link: "L",
  container: "C",
  extractor: "X",
  road: "+",
  rampart: "=",
  constructedWall: "W"
}

/** The room as text: terrain (# wall, ~ swamp), sources (s), controller (K), mineral (m) and the plan. */
function render(name, { terrain, sources, controller, mineral, steps }) {
  const grid = []
  for (let y = 0; y < 50; y++) {
    const row = []
    for (let x = 0; x < 50; x++) {
      const t = terrain[y * 50 + x]
      row.push(t === "1" || t === "3" ? "#" : t === "2" ? "~" : " ")
    }
    grid.push(row)
  }
  // Roads and ramparts first so buildings drawn after them show on top.
  const order = t => (t === "road" ? 0 : t === "rampart" ? 1 : 2)
  for (const [x, y, t] of [...steps].sort((a, b) => order(a[2]) - order(b[2]))) grid[y][x] = GLYPHS[t] || "?"
  for (const s of sources) grid[s.y][s.x] = "s"
  if (controller) grid[controller.y][controller.x] = "K"
  if (mineral) grid[mineral.y][mineral.x] = "m"
  return ["", name, ...grid.map(r => r.join(""))].join("\n")
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const map = loadMap()
  const rooms = opts.rooms || map.rooms
  // The planner player needs a home room with a spawn to exist at all; that room isn't tested.
  const host = map.rooms.find(r => !rooms.includes(r)) || rooms[0]
  const all = [...new Set([host, ...rooms])]

  const server = new Server()
  await server.world.reset()
  for (const name of all) {
    await server.world.addRoom(name)
    // "3" is wall + swamp, which the game treats as a wall.
    await server.world.setTerrain(name, TerrainMatrix.unserialize(map.terrain[name].replace(/3/g, "1")))
    for (const o of map.objects[name]) {
      const { _id, $loki, meta, room, x, y, type, ...attributes } = o // drop the old database bookkeeping
      await server.world.addRoomObject(
        name,
        type,
        x,
        y,
        type === "controller" ? { ...attributes, level: 0 } : attributes
      )
    }
  }

  const hostSpawn = spawnSpot(map.terrain[host], map.objects[host])
  const player = await server.world.addBot({
    username: "planner",
    room: host,
    x: hostSpawn.x,
    y: hostSpawn.y,
    cpu: 500,
    cpuAvailable: 10000,
    modules: {
      main: RUNNER.replace("__HOST__", JSON.stringify(host)),
      planner: fs.readFileSync(path.join(__dirname, "build", "planner.js"), "utf8")
    }
  })

  // Own every test room's controller; in spawn mode also place the first spawn.
  const { db } = server.common.storage
  const spawns = {}
  for (const name of rooms) {
    await db["rooms.objects"].update({ room: name, type: "controller" }, { $set: { user: player.id, level: 1 } })
    if (opts.mode === "spawn") {
      spawns[name] = spawnSpot(map.terrain[name], map.objects[name])
      if (!spawns[name]) continue // no open 7x7 area for a hand-placed spawn
      await server.world.addRoomObject(name, "spawn", spawns[name].x, spawns[name].y, {
        user: player.id,
        name: `Spawn-${name}`,
        store: { energy: 300 },
        storeCapacityResource: { energy: 300 },
        hits: 5000,
        hitsMax: 5000,
        spawning: null,
        notifyWhenAttacked: true
      })
    }
  }

  let firstError = null
  await server.common.storage.pubsub.subscribe(`user:${player.id}/console`, event => {
    const { error } = JSON.parse(event)
    if (error && !firstError) firstError = String(error)
  })

  await server.start()
  let memory = {}
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    await server.tick()
    memory = JSON.parse((await player.memory) || "{}")
    if (memory.done) break
  }
  server.stop()
  if (!memory.results) throw new Error(`Planner never ran. First error: ${firstError}`)

  // --- Check every plan ---
  const report = { mode: opts.mode, rooms: {}, summary: {} }
  const byType = {}
  let planned = 0
  let cpuTotal = 0
  const tested = rooms.filter(r => r !== host)
  for (const name of tested) {
    const result = memory.results[name]
    const objects = map.objects[name]
    const input = {
      terrain: map.terrain[name],
      sources: objects.filter(o => o.type === "source").map(o => ({ x: o.x, y: o.y })),
      controller: objects.filter(o => o.type === "controller").map(o => ({ x: o.x, y: o.y }))[0],
      mineral: objects.filter(o => o.type === "mineral").map(o => ({ x: o.x, y: o.y }))[0],
      spawn: spawns[name],
      steps: (result && result.steps) || []
    }
    let entry
    if (!result) entry = { issues: [{ type: "not-planned", detail: "planner never reached this room" }] }
    else if (result.error)
      entry = { issues: [{ type: "error", detail: result.error.split("\n").slice(0, 3).join(" | ") }] }
    else if (!result.steps || result.steps.length === 0)
      entry = { issues: [{ type: "no-layout", detail: "no layout fits" }] }
    else {
      entry = check(input)
      planned++
    }
    entry.cpu = result && result.cpu
    if (opts.render) console.log(render(name, input))
    cpuTotal += (result && result.cpu) || 0
    report.rooms[name] = entry
    for (const i of entry.issues) {
      const t = (byType[i.type] = byType[i.type] || { rooms: new Set(), count: 0, example: `${name}: ${i.detail}` })
      t.rooms.add(name)
      t.count++
    }
  }

  // --- Print ---
  const clean = tested.filter(r => report.rooms[r].issues.length === 0).length
  console.log(`\nLayout test (${opts.mode}): ${tested.length} rooms, ${planned} planned, ${clean} with no issues`)
  console.log(
    `CPU per plan: avg ${(cpuTotal / tested.length).toFixed(1)}, max ${Math.max(
      ...tested.map(r => report.rooms[r].cpu || 0)
    ).toFixed(1)}`
  )
  const metrics = tested.map(r => report.rooms[r].metrics).filter(Boolean)
  const avg = k => (metrics.reduce((s, m) => s + (m[k] || 0), 0) / (metrics.length || 1)).toFixed(1)
  console.log(
    `Avg per plan: ${avg("steps")} steps, ${avg("roads")} roads, ${avg("ramparts")} ramparts, extension distance ${avg(
      "avgExtensionDistance"
    )}, exposed core ${avg("exposed")}/${avg("core")}`
  )
  console.log(
    `Spawn to: storage ${avg("storageDistance")}, controller ${avg("controllerDistance")}, sources ${avg(
      "sourceDistance"
    )}. Rapid fill in ${metrics.filter(m => m.rapidFill).length}/${metrics.length} rooms. ` +
      `Weakest tower cover on the ramparts ${avg("towerMinDamage")} (min ${Math.min(
        ...metrics.map(m => m.towerMinDamage ?? Infinity)
      )})`
  )
  console.log("\nIssue                  rooms  total  example")
  for (const [type, t] of Object.entries(byType).sort((a, b) => b[1].rooms.size - a[1].rooms.size))
    console.log(
      `${type.padEnd(22)} ${String(t.rooms.size).padStart(5)} ${String(t.count).padStart(6)}  ${t.example.slice(
        0,
        110
      )}`
    )
  if (opts.verbose)
    for (const name of tested)
      for (const i of report.rooms[name].issues) console.log(`  ${name} ${i.type}: ${i.detail}`)

  report.summary = Object.fromEntries(
    Object.entries(byType).map(([k, v]) => [k, { rooms: v.rooms.size, count: v.count }])
  )
  fs.mkdirSync(RESULTS, { recursive: true })
  fs.writeFileSync(path.join(RESULTS, `layout-${opts.mode}.json`), JSON.stringify(report, null, 2))
  console.log(`\nWrote results/layout-${opts.mode}.json`)
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
