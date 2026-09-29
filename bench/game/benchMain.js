/*
 * Runs INSIDE the Screeps engine as the player's `main` module. It calls the real bot (uploaded as the
 * `bot` module) and then records milestones into Memory.__bench, which the harness reads back.
 *
 * CPU is measured right after the bot's loop, so the recording below doesn't count against it.
 * `__SAMPLE_INTERVAL__` is replaced by the harness before upload.
 */
/*
 * Make the bot's Math.random() reproducible so two runs of the same code give the same milestones. Reseeded from
 * Game.time every tick, so it doesn't depend on when the engine happens to reset the global.
 */
let rngState = 0
Math.random = function () {
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const bot = require("bot")

const SAMPLE_INTERVAL = __SAMPLE_INTERVAL__
const ENERGY_STEPS = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000]
const COUNT_STEPS = {
  extension: [5, 10, 20, 30, 40, 50, 60],
  tower: [1, 2, 3, 6],
  spawn: [1, 2, 3],
  container: [1, 2, 3, 5],
  link: [1, 2, 3]
}
const CREEP_STEPS = [1, 5, 10, 20]

function state() {
  if (!Memory.__bench) {
    Memory.__bench = {
      milestones: {},
      samples: [],
      harvested: 0,
      errors: 0,
      lastError: null,
      interval: { cpuSum: 0, cpuMax: 0, ticks: 0, harvested: 0 }
    }
  }
  return Memory.__bench
}

function mark(b, key) {
  if (b.milestones[key] === undefined) b.milestones[key] = Game.time
}

function harvestedThisTick() {
  let total = 0
  for (const roomName in Game.rooms) {
    for (const e of Game.rooms[roomName].getEventLog()) {
      if (e.event !== EVENT_HARVEST) continue
      const creep = Game.getObjectById(e.objectId)
      const target = Game.getObjectById(e.data.targetId)
      if (creep && creep.my && target instanceof Source) total += e.data.amount
    }
  }
  return total
}

function ownedRooms() {
  return Object.values(Game.rooms).filter(r => r.controller && r.controller.my)
}

function structureCounts(rooms) {
  const counts = {}
  for (const room of rooms) {
    // Containers and roads have no owner, so count every structure in rooms we own.
    for (const s of room.find(FIND_STRUCTURES)) {
      if (s.structureType === STRUCTURE_CONTROLLER) continue
      if ("my" in s && s.my === false) continue
      counts[s.structureType] = (counts[s.structureType] || 0) + 1
    }
  }
  return counts
}

function creepCounts() {
  const counts = {}
  for (const name in Game.creeps) {
    const role = (Game.creeps[name].memory && Game.creeps[name].memory.role) || "unknown"
    counts[role] = (counts[role] || 0) + 1
  }
  return counts
}

function record(b, cpu) {
  const rooms = ownedRooms()
  const rcl = rooms.reduce((max, r) => Math.max(max, r.controller.level), 0)
  for (let level = 2; level <= rcl; level++) mark(b, `rcl:${level}`)

  const harvested = harvestedThisTick()
  b.harvested += harvested
  for (const step of ENERGY_STEPS) if (b.harvested >= step) mark(b, `energy:${step}`)

  const structures = structureCounts(rooms)
  for (const type in structures) {
    mark(b, `first:${type}`)
    for (const step of COUNT_STEPS[type] || []) if (structures[type] >= step) mark(b, `${type}:${step}`)
  }

  const creepTotal = Object.keys(Game.creeps).length
  for (const step of CREEP_STEPS) if (creepTotal >= step) mark(b, `creeps:${step}`)

  const iv = b.interval
  iv.cpuSum += cpu
  iv.cpuMax = Math.max(iv.cpuMax, cpu)
  iv.ticks++
  iv.harvested += harvested

  if (Game.time % SAMPLE_INTERVAL !== 0) return

  const controller = rooms.length ? rooms[0].controller : undefined
  b.samples.push({
    tick: Game.time,
    rcl,
    controllerProgress: controller ? controller.progress : 0,
    harvestedTotal: b.harvested,
    harvestedPerTick: iv.ticks ? iv.harvested / iv.ticks : 0,
    cpuAvg: iv.ticks ? iv.cpuSum / iv.ticks : 0,
    cpuMax: iv.cpuMax,
    bucket: Game.cpu.bucket,
    energyAvailable: rooms.reduce((sum, r) => sum + r.energyAvailable, 0),
    energyCapacity: rooms.reduce((sum, r) => sum + r.energyCapacityAvailable, 0),
    creeps: creepCounts(),
    structures
  })
  b.interval = { cpuSum: 0, cpuMax: 0, ticks: 0, harvested: 0 }
}

module.exports.loop = function () {
  rngState = Math.imul(Game.time, 2654435761) | 0
  let error = null
  try {
    bot.loop()
  } catch (e) {
    error = e
  }
  const cpu = Game.cpu.getUsed()

  const b = state()
  if (error) {
    b.errors++
    b.lastError = { tick: Game.time, message: String((error && error.stack) || error).slice(0, 2000) }
  }

  try {
    record(b, cpu)
  } catch (e) {
    b.lastError = { tick: Game.time, message: "bench recorder: " + String((e && e.stack) || e).slice(0, 2000) }
  }
}
