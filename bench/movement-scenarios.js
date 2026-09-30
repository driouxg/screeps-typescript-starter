/*
 * Scenario tests for src/creeps/action/common/movement.ts on the real engine: creeps blocked in corridors or boxed
 * in by friendly, immovable and hostile creeps. Run with `npm run test-movement` (see README.md).
 *
 * "arrive" scenarios must reach their target; "give-up" scenarios (no way out) must report ERR_NO_PATH so the
 * calling role can pick a new target. No scenario may throw.
 */
process.env.STORAGE_HOST = "127.0.0.1"
require("./nodelay")
const fs = require("fs")
const path = require("path")
const { ScreepsServer, TerrainMatrix } = require("screeps-server-mockup")

const TICKS = 100

class Server extends ScreepsServer {
  startProcess(name, execPath, env) {
    return super.startProcess(name, execPath, {
      ...env,
      STORAGE_HOST: "127.0.0.1",
      NODE_OPTIONS: `--require ${path.join(__dirname, "nodelay.js")}`
    })
  }
}

const ROOM = "W0N1"
const SPAWN = [45, 45]
// mover name -> [start, target, description, expectation]
const MOVERS = {
  M1: [[8, 5], [22, 5], "1-wide corridor, idle friendly creep inside", "arrive"],
  M2: [[30, 5], [40, 5], "boxed in on all 8 sides by idle friendly creeps", "arrive"],
  M3: [[30, 15], [40, 15], "boxed in on all 8 sides by hostile creeps", "give-up"],
  M4: [[8, 22], [22, 22], "corridor blocked by hostile creep, detour exists", "arrive"],
  M5: [[30, 25], [40, 25], "7 immovable own creeps (no MOVE) around, one gap on far side", "arrive"],
  M6: [[30, 35], [40, 35], "8 immovable own creeps (no MOVE) around, no gap", "give-up"],
  M7a: [[9, 40], [21, 40], "head-on in 1-wide corridor (east-bound)", "arrive"],
  M7b: [[21, 40], [9, 40], "head-on in 1-wide corridor (west-bound)", "arrive"]
}
// puller name -> [puller start, pulled creep start, destination, description]. The pulled creep has no MOVE parts.
const PULLS = {
  P1: [[7, 12], [6, 12], [22, 12], "tow through 1-wide corridor with idle friendly creep inside"],
  P2: [[35, 30], [34, 30], [45, 30], "tow through a dense 5x7 crowd of idle friendly creeps"],
  P3: [[35, 20], [34, 20], [40, 20], "tow onto a destination an idle friendly creep stands on"]
}

const around = (x, y) =>
  [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
  ].map(([dx, dy]) => [x + dx, y + dy])

const botMain = `
const { smartMove, pullTo } = require("movement")
const PULLS = ${JSON.stringify(Object.fromEntries(Object.entries(PULLS).map(([k, v]) => [k, v[2]])))}
const { clearLoiterersFromSpawns } = require("parking")
const MOVERS = ${JSON.stringify(Object.fromEntries(Object.entries(MOVERS).map(([k, v]) => [k, v[1]])))}
module.exports.loop = function () {
  const s = Memory.s || (Memory.s = {})
  for (const name in MOVERS) {
    const c = Game.creeps[name]
    const st = s[name] || (s[name] = { noPath: 0, exc: null, arrived: null })
    if (!c) { st.missing = true; continue }
    const [x, y] = MOVERS[name]
    let r
    try { r = smartMove(c, new RoomPosition(x, y, c.room.name), 0) } catch (e) { st.exc = String(e.stack || e); continue }
    if (r === ERR_NO_PATH) st.noPath++
    if (c.pos.x === x && c.pos.y === y && st.arrived === null) st.arrived = Game.time
    st.pos = c.pos.x + "," + c.pos.y
  }
  for (const name in PULLS) {
    const puller = Game.creeps[name]
    const pulled = Game.creeps[name + "-pulled"]
    const st = s[name] || (s[name] = { exc: null, arrived: null })
    if (!puller || !pulled) { st.missing = true; continue }
    const [x, y] = PULLS[name]
    try { pullTo(puller, pulled, new RoomPosition(x, y, pulled.room.name)) } catch (e) { st.exc = String(e.stack || e); continue }
    if (pulled.pos.x === x && pulled.pos.y === y && st.arrived === null) st.arrived = Game.time
    st.pos = pulled.pos.x + "," + pulled.pos.y
  }
  clearLoiterersFromSpawns()
}`

;(async () => {
  const s = new Server()
  await s.world.reset()
  await s.world.stubWorld()
  const t = new TerrainMatrix()
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 50; x++) if (x === 0 || y === 0 || x === 49 || y === 49) t.set(x, y, "wall")
  const corridor = cy => {
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = 10; x <= 20; x++) if (y !== cy) t.set(x, y, "wall")
  }
  corridor(5)
  corridor(22)
  corridor(40)
  corridor(12)
  await s.world.setTerrain(ROOM, t)

  const me = await s.world.addBot({
    username: "me",
    room: ROOM,
    x: SPAWN[0],
    y: SPAWN[1],
    modules: {
      main: botMain,
      movement: fs.readFileSync(path.join(__dirname, "build", "movement.js"), "utf8"),
      // Screeps modules are flat, so point parking at the "movement" module by name.
      parking: fs
        .readFileSync(path.join(__dirname, "build", "parking.js"), "utf8")
        .replace(`require("./movement")`, `require("movement")`)
    }
  })
  const foe = await s.world.addBot({
    username: "foe",
    room: "W1N1",
    x: 25,
    y: 25,
    modules: { main: "module.exports.loop=()=>{}" }
  })

  let n = 0
  const creep = async (name, x, y, user, parts) =>
    s.world.addRoomObject(ROOM, "creep", x, y, {
      name,
      user,
      body: parts.map(type => ({ type, hits: 100 })),
      hits: parts.length * 100,
      hitsMax: parts.length * 100,
      spawning: false,
      fatigue: 0,
      store: {},
      storeCapacity: 0,
      ageTime: 100000,
      notifyWhenAttacked: true,
      actionLog: {}
    })
  for (const [name, [[x, y]]] of Object.entries(MOVERS)) await creep(name, x, y, me.id, ["move", "move"])
  await creep("idle1", 15, 5, me.id, ["move"]) // M1 corridor
  for (const [x, y] of around(30, 5)) await creep(`f${n++}`, x, y, me.id, ["move"]) // M2 friendly box
  for (const [x, y] of around(30, 15)) await creep(`h${n++}`, x, y, foe.id, ["move"]) // M3 hostile box
  await creep("hostile-corridor", 15, 22, foe.id, ["move"]) // M4
  for (const [x, y] of around(30, 25)) if (!(x === 29 && y === 25)) await creep(`w${n++}`, x, y, me.id, ["work"]) // M5
  for (const [x, y] of around(30, 35)) await creep(`w${n++}`, x, y, me.id, ["work"]) // M6
  for (const [name, [[px, py], [mx, my]]] of Object.entries(PULLS)) {
    await creep(name, px, py, me.id, ["move", "move"])
    await creep(`${name}-pulled`, mx, my, me.id, ["work"])
  }
  await creep("c-idle", 15, 12, me.id, ["move"]) // P1
  for (let y = 27; y <= 33; y++) for (let x = 38; x <= 42; x++) await creep(`crowd${x},${y}`, x, y, me.id, ["move"]) // P2
  await creep("dest-idle", 40, 20, me.id, ["move"]) // P3
  // Spawn boxed in on all 8 sides by idle creeps: the loiter rule must park them away from it.
  const loiterers = around(SPAWN[0], SPAWN[1]).map(([x, y], i) => ({ name: `L${i}`, x, y }))
  for (const l of loiterers) await creep(l.name, l.x, l.y, me.id, ["move"])

  await s.start()
  for (let i = 0; i < TICKS; i++) await s.tick()
  const mem = JSON.parse(await me.memory)
  let pass = true
  for (const [name, [, target, desc, expect]] of Object.entries(MOVERS)) {
    const st = mem.s[name]
    const ok =
      st && !st.exc && !st.missing && (expect === "arrive" ? st.arrived !== null : st.noPath > 0 && st.arrived === null)
    pass = pass && ok
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${name.padEnd(4)} ${desc.padEnd(62)} expect ${expect.padEnd(8)} arrived@${
        st?.arrived ?? "-"
      } pos ${st?.pos} noPath=${st?.noPath}${st?.exc ? " EXC " + st.exc : ""}`
    )
  }
  for (const [name, [, , , desc]] of Object.entries(PULLS)) {
    const st = mem.s[name]
    const ok = st && !st.exc && !st.missing && st.arrived !== null
    pass = pass && ok
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${name.padEnd(4)} ${desc.padEnd(62)} expect arrive   arrived@${
        st?.arrived ?? "-"
      } pos ${st?.pos}${st?.exc ? " EXC " + st.exc : ""}`
    )
  }
  const objects = await s.world.roomObjects(ROOM)
  const parked = loiterers.map(l => objects.find(o => o.type === "creep" && o.name === l.name))
  const range = o => Math.max(Math.abs(o.x - SPAWN[0]), Math.abs(o.y - SPAWN[1]))
  // Parked creeps can later be nudged a tile by other traffic; what matters is that none stays next to the spawn.
  const cleared = parked.every(o => o && 2 <= range(o))
  pass = pass && cleared
  if (!cleared)
    for (const o of parked.filter(o => o && range(o) < 2))
      console.log(`      ${o.name} at ${o.x},${o.y} fatigue ${o.fatigue} memory ${JSON.stringify(mem.creeps[o.name])}`)
  console.log(
    `${cleared ? "PASS" : "FAIL"}  L    ${"spawn boxed in by 8 idle creeps: none left next to it".padEnd(
      62
    )} ranges ${parked.map(o => (o ? range(o) : "missing")).join(",")}`
  )
  console.log(pass ? "ALL PASS" : "SOME FAILED")
  s.stop()
  process.exit(pass ? 0 : 1)
})().catch(e => {
  console.error(e)
  process.exit(1)
})
