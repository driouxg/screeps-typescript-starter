/*
 * Attack scenario for run.js: a hostile player ("raider") whose creeps walk in from the room edge nearest our
 * spawn and fight whatever is closest. Used with `--attack <tick>`; see README.md.
 */

/** Raider AI: heal itself if it can, then attack the closest creep, else spawn, else any other structure. */
const RAIDER_MAIN = `
module.exports.loop = function () {
  for (const name in Game.creeps) {
    const c = Game.creeps[name]
    if (c.getActiveBodyparts(HEAL)) c.heal(c)
    const target =
      c.pos.findClosestByRange(FIND_HOSTILE_CREEPS) ||
      c.pos.findClosestByRange(FIND_HOSTILE_SPAWNS) ||
      c.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType !== STRUCTURE_CONTROLLER })
    if (!target) continue
    if (c.getActiveBodyparts(RANGED_ATTACK) && c.pos.inRangeTo(target, 3)) c.rangedAttack(target)
    if (c.getActiveBodyparts(ATTACK)) {
      if (c.attack(target) === ERR_NOT_IN_RANGE) c.moveTo(target)
    } else if (!c.pos.inRangeTo(target, 3)) c.moveTo(target)
  }
}`

/** A home room for the raider player (the engine needs every player to own a room). */
const RAIDER_ROOM = "W1N1"

async function addRaider(server) {
  return server.world.addBot({ username: "raider", room: RAIDER_ROOM, x: 25, y: 25, modules: { main: RAIDER_MAIN } })
}

/**
 * Turn off the safe mode the stub world gives new players, leaving `charges` activations available (a real
 * player starts with one), so the bot's own defence is what's tested.
 */
async function disableSafeMode(server, room, charges) {
  const { db } = server.common.storage
  await db["rooms.objects"].update(
    { room, type: "controller" },
    { $set: { safeMode: null, safeModeAvailable: charges } }
  )
}

/**
 * Place `count` raider creeps just inside the room edge closest to `target` (our spawn), where they'd arrive.
 */
async function spawnRaiders(server, room, raiderId, body, count, target) {
  const terrain = await server.world.getTerrain(room)
  const objects = await server.world.roomObjects(room)
  const taken = new Set(objects.filter(o => o.type === "creep").map(o => `${o.x},${o.y}`))
  const open = (x, y) => terrain.get(x, y) !== "wall" && !taken.has(`${x},${y}`)

  // Tiles one step inside an exit, closest to the target first.
  const entries = []
  for (let i = 1; i < 49; i++) {
    for (const [x, y, ex, ey] of [
      [1, i, 0, i],
      [48, i, 49, i],
      [i, 1, i, 0],
      [i, 48, i, 49]
    ])
      if (open(x, y) && open(ex, ey)) entries.push({ x, y })
  }
  entries.sort((a, b) => range(a, target) - range(b, target))

  const placed = []
  for (const { x, y } of entries.slice(0, count)) {
    const parts = body.map(type => ({ type, hits: 100 }))
    await server.world.addRoomObject(room, "creep", x, y, {
      name: `raider-${placed.length}`,
      user: raiderId,
      body: parts,
      hits: parts.length * 100,
      hitsMax: parts.length * 100,
      spawning: false,
      fatigue: 0,
      store: {},
      storeCapacity: 0,
      ageTime: (await server.world.gameTime) + 1500,
      notifyWhenAttacked: true,
      actionLog: {}
    })
    placed.push(`${x},${y}`)
  }
  return placed
}

function range(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

module.exports = { addRaider, disableSafeMode, spawnRaiders }
