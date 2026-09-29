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

const TICKS = 60

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
const { smartMove } = require("movement")
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
  await s.world.setTerrain(ROOM, t)

  const me = await s.world.addBot({
    username: "me",
    room: ROOM,
    x: 45,
    y: 45,
    modules: { main: botMain, movement: fs.readFileSync(path.join(__dirname, "build", "movement.js"), "utf8") }
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
  console.log(pass ? "ALL PASS" : "SOME FAILED")
  s.stop()
  process.exit(pass ? 0 : 1)
})().catch(e => {
  console.error(e)
  process.exit(1)
})
