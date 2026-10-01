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
const UPGRADE_STEPS = [200, 1000, 2500, 5000, 10000, 25000, 45000]
const BUILD_STEPS = [1000, 3000, 5000, 10000, 20000, 40000]

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

/**
 * Energy harvested from sources, and energy spent by activity, this tick. Spawning is counted when a creep first
 * appears (the spawn deducts the whole body cost at that point).
 */
function energyThisTick(b) {
  const flow = { harvested: 0, upgrade: 0, build: 0, repair: 0, spawn: 0, decay: 0, byRole: {} }
  const byRole = (creep, activity, amount) => {
    const role = (creep.memory && creep.memory.role) || "unknown"
    const r = flow.byRole[role] || (flow.byRole[role] = {})
    r[activity] = (r[activity] || 0) + amount
  }
  for (const roomName in Game.rooms) {
    for (const e of Game.rooms[roomName].getEventLog()) {
      const creep = Game.getObjectById(e.objectId)
      if (!creep || !creep.my) continue
      if (e.event === EVENT_HARVEST) {
        if (Game.getObjectById(e.data.targetId) instanceof Source) flow.harvested += e.data.amount
      } else if (e.event === EVENT_UPGRADE_CONTROLLER) {
        flow.upgrade += e.data.energySpent
        byRole(creep, "upgrade", e.data.energySpent)
      }
      // Build events only report `amount`, which equals energy spent for unboosted creeps.
      else if (e.event === EVENT_BUILD) {
        flow.build += e.data.energySpent ?? e.data.amount
        byRole(creep, "build", e.data.energySpent ?? e.data.amount)
      } else if (e.event === EVENT_REPAIR) {
        flow.repair += e.data.energySpent
        byRole(creep, "repair", e.data.energySpent)
      }
    }
  }

  // Energy lost from piles on the ground in our rooms: each loses ceil(amount / ENERGY_DECAY) per tick.
  for (const room of ownedRooms())
    for (const r of room.find(FIND_DROPPED_RESOURCES))
      if (r.resourceType === RESOURCE_ENERGY) {
        const lost = Math.ceil(r.amount / ENERGY_DECAY)
        flow.decay += lost
        // Where: next to a source, near the controller, or elsewhere (spawn, build sites).
        const where = r.pos.findInRange(FIND_SOURCES, 1).length
          ? "source"
          : r.pos.inRangeTo(room.controller, 3)
          ? "controller"
          : "other"
        b.decayAt = b.decayAt || {}
        b.decayAt[where] = (b.decayAt[where] || 0) + lost
      }

  const seen = b.seenCreeps || (b.seenCreeps = {})
  for (const name in Game.creeps) {
    if (seen[name]) continue
    seen[name] = true
    flow.spawn += Game.creeps[name].body.reduce((sum, part) => sum + BODYPART_COST[part.type], 0)
  }
  for (const name in seen) if (!Game.creeps[name]) delete seen[name]

  return flow
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

// Where each creep last moved, to spot creeps that sit still. Kept in the global, not Memory, to keep Memory small.
const lastMoved = {}

/**
 * Creeps crowding the spawns: how many stand next to one, and whether a spawn has no free tile left (it can still
 * spawn, but the new creep can't get out and everything around it jams).
 */
function crowding(rooms) {
  const near = {}
  let boxed = 0
  for (const room of rooms) {
    const terrain = room.getTerrain()
    for (const spawn of room.find(FIND_MY_SPAWNS)) {
      let free = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = spawn.pos.x + dx
          const y = spawn.pos.y + dy
          if ((dx === 0 && dy === 0) || terrain.get(x, y) === TERRAIN_MASK_WALL) continue
          const blocked = room
            .lookForAt(LOOK_STRUCTURES, x, y)
            .some(st => OBSTACLE_OBJECT_TYPES.includes(st.structureType))
          if (blocked) continue
          const creep = room.lookForAt(LOOK_CREEPS, x, y)[0]
          if (!creep) free++
          else if (creep.my) {
            const role = (creep.memory && creep.memory.role) || "unknown"
            near[role] = (near[role] || 0) + 1
          }
        }
      if (free === 0) boxed++
    }
  }
  return { near, boxed }
}

/** Creeps (by role) that haven't moved for 20+ ticks. Miners and upgraders standing at their spot count too. */
function idleCreeps() {
  const idle = {}
  for (const name in Game.creeps) {
    const c = Game.creeps[name]
    const key = c.pos.x + "," + c.pos.y + "," + c.pos.roomName
    const last = lastMoved[name]
    if (!last || last.key !== key) lastMoved[name] = { key, since: Game.time }
    else if (20 <= Game.time - last.since) {
      const role = (c.memory && c.memory.role) || "unknown"
      idle[role] = (idle[role] || 0) + 1
    }
  }
  for (const name in lastMoved) if (!Game.creeps[name]) delete lastMoved[name]
  return idle
}

/**
 * Defence stats: raiders seen and killed, our creeps killed (gone before their time ran out) by role, the lowest
 * spawn hits, and when safe mode came on.
 */
function recordDefence(b, rooms) {
  const d =
    b.defence ||
    (b.defence = { hostilesSeen: 0, hostilesKilled: 0, lost: 0, lostRoles: {}, spawnMinHits: null, safeModeTick: null })

  const prev = b.prevCreeps || {}
  for (const name in prev) {
    if (Game.creeps[name] || prev[name].ttl <= 2) continue
    d.lost++
    d.lostRoles[prev[name].role] = (d.lostRoles[prev[name].role] || 0) + 1
  }
  b.prevCreeps = {}
  for (const name in Game.creeps) {
    const c = Game.creeps[name]
    if (!c.spawning) b.prevCreeps[name] = { ttl: c.ticksToLive, role: (c.memory && c.memory.role) || "unknown" }
  }

  const seen = b.hostiles || (b.hostiles = {})
  const hostiles = rooms.reduce((all, r) => all.concat(r.find(FIND_HOSTILE_CREEPS)), [])
  for (const h of hostiles) {
    if (seen[h.id] === undefined) {
      d.hostilesSeen++
      mark(b, "hostile:arrived")
    }
    seen[h.id] = h.ticksToLive
  }
  for (const id in seen) {
    if (hostiles.some(h => h.id === id)) continue
    if (2 < seen[id]) d.hostilesKilled++
    delete seen[id]
  }
  if (0 < d.hostilesSeen && hostiles.length === 0) mark(b, "hostile:cleared")

  for (const r of rooms) {
    for (const s of r.find(FIND_MY_SPAWNS)) d.spawnMinHits = Math.min(d.spawnMinHits ?? s.hits, s.hits)
    if (r.controller.safeMode && d.safeModeTick === null && 0 < d.hostilesSeen) d.safeModeTick = Game.time
  }
  if (0 < d.hostilesSeen && rooms.every(r => r.find(FIND_MY_SPAWNS).length === 0)) mark(b, "lost:spawn")
}

function rampartStats(rooms, b) {
  const ramparts = rooms.reduce(
    (all, r) => all.concat(r.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART })),
    []
  )
  const seen = b.rampartIds || (b.rampartIds = {})
  let lost = b.rampartsLost || 0
  const now = new Set(ramparts.map(r => r.id))
  for (const id in seen)
    if (!now.has(id)) {
      lost++
      delete seen[id]
    }
  for (const r of ramparts) seen[r.id] = true
  b.rampartsLost = lost
  const hits = ramparts.map(r => r.hits)
  return {
    count: ramparts.length,
    minHits: hits.length ? Math.min(...hits) : null,
    avgHits: hits.length ? Math.round(hits.reduce((x, y) => x + y, 0) / hits.length) : null,
    lost
  }
}

function record(b, cpu) {
  const rooms = ownedRooms()
  const rcl = rooms.reduce((max, r) => Math.max(max, r.controller.level), 0)
  for (let level = 2; level <= rcl; level++) mark(b, `rcl:${level}`)

  const flow = energyThisTick(b)
  const harvested = flow.harvested
  b.harvested += harvested
  const spent = b.spent || (b.spent = { upgrade: 0, build: 0, repair: 0, spawn: 0 })
  if (spent.decay === undefined) spent.decay = 0
  for (const key in spent) spent[key] += flow[key]
  const spentByRole = b.spentByRole || (b.spentByRole = {})
  for (const role in flow.byRole) {
    const r = spentByRole[role] || (spentByRole[role] = {})
    for (const activity in flow.byRole[role]) r[activity] = (r[activity] || 0) + flow.byRole[role][activity]
  }
  for (const step of UPGRADE_STEPS) if (spent.upgrade >= step) mark(b, `upgraded:${step}`)
  for (const step of BUILD_STEPS) if (spent.build >= step) mark(b, `built:${step}`)
  for (const step of ENERGY_STEPS) if (b.harvested >= step) mark(b, `energy:${step}`)

  const structures = structureCounts(rooms)
  for (const type in structures) {
    mark(b, `first:${type}`)
    for (const step of COUNT_STEPS[type] || []) if (structures[type] >= step) mark(b, `${type}:${step}`)
  }

  for (let n = 2; n <= rooms.length; n++) mark(b, `rooms:${n}`)
  if (Memory.expansion) mark(b, `expansion:${Memory.expansion.state}`)

  const creepTotal = Object.keys(Game.creeps).length
  for (const step of CREEP_STEPS) if (creepTotal >= step) mark(b, `creeps:${step}`)

  recordDefence(b, rooms)
  // Creep-ticks spent in each room, to see where our creeps go (e.g. that they never enter a hostile room).
  const visited = b.roomsVisited || (b.roomsVisited = {})
  for (const name in Game.creeps) {
    const room = Game.creeps[name].room.name
    visited[room] = (visited[room] || 0) + 1
  }
  const crowd = crowding(rooms)
  const totals = b.crowd || (b.crowd = { nearSpawn: 0, boxedTicks: 0, ticks: 0 })
  totals.ticks++
  if (crowd.boxed) totals.boxedTicks++
  for (const role in crowd.near) totals.nearSpawn += crowd.near[role]
  const idle = idleCreeps()

  const iv = b.interval
  iv.near = iv.near || {}
  for (const role in crowd.near) iv.near[role] = (iv.near[role] || 0) + crowd.near[role]
  iv.cpuSum += cpu
  // What each role's creeps are doing (creep-ticks): parked (memory.parkPos), working (memory.working) or not.
  iv.states = iv.states || {}
  for (const name in Game.creeps) {
    const m = Game.creeps[name].memory || {}
    const key = (m.role || "unknown") + ":" + (m.parkPos ? "parked" : m.working ? "working" : "collecting")
    iv.states[key] = (iv.states[key] || 0) + 1
  }
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
    spentTotal: Object.assign({}, spent),
    harvestedPerTick: iv.ticks ? iv.harvested / iv.ticks : 0,
    cpuAvg: iv.ticks ? iv.cpuSum / iv.ticks : 0,
    cpuMax: iv.cpuMax,
    bucket: Game.cpu.bucket,
    energyAvailable: rooms.reduce((sum, r) => sum + r.energyAvailable, 0),
    // Energy lying on the ground or in containers/storage: harvested but not yet used.
    droppedEnergy: rooms.reduce(
      (sum, r) =>
        sum +
        r.find(FIND_DROPPED_RESOURCES).reduce((s, d) => s + (d.resourceType === RESOURCE_ENERGY ? d.amount : 0), 0),
      0
    ),
    // Largest energy piles, to see where energy is stalling.
    piles: rooms
      .reduce(
        (all, r) => all.concat(r.find(FIND_DROPPED_RESOURCES, { filter: d => d.resourceType === RESOURCE_ENERGY })),
        []
      )
      .sort((p1, p2) => p2.amount - p1.amount)
      .slice(0, 5)
      .map(p => `${p.pos.x},${p.pos.y}:${p.amount}`),
    // Containers and their energy, and which creep role stands on each.
    containers: rooms.reduce(
      (all, r) =>
        all.concat(
          r
            .find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER })
            .map(c => {
              const on = c.pos.lookFor(LOOK_CREEPS)[0]
              return `${c.pos.x},${c.pos.y}:${c.store.energy}${on ? " " + ((on.memory && on.memory.role) || "?") : ""}`
            })
        ),
      []
    ),
    storedEnergy: rooms.reduce(
      (sum, r) =>
        sum +
        r
          .find(FIND_STRUCTURES)
          .reduce(
            (s, st) =>
              s +
              (st.structureType === STRUCTURE_CONTAINER || st.structureType === STRUCTURE_STORAGE
                ? st.store.energy
                : 0),
            0
          ),
      0
    ),
    energyCapacity: rooms.reduce((sum, r) => sum + r.energyCapacityAvailable, 0),
    // Ramparts: how many, their lowest and average hits, and how many have decayed away so far.
    ramparts: rampartStats(rooms, b),
    towerEnergy: rooms.reduce(
      (all, r) =>
        all.concat(
          r.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).map(t => t.store.energy)
        ),
      []
    ),
    creeps: creepCounts(),
    // Average creeps per tick standing next to a spawn, by role; creeps that haven't moved for 20+ ticks, by role.
    nearSpawn: Object.fromEntries(Object.entries(iv.near || {}).map(([r, n]) => [r, +(n / iv.ticks).toFixed(2)])),
    idle,
    states: Object.fromEntries(Object.entries(iv.states || {}).map(([k, v]) => [k, +(v / iv.ticks).toFixed(1)])),
    structures
  })
  b.interval = { cpuSum: 0, cpuMax: 0, ticks: 0, harvested: 0 }
}

module.exports.loop = function () {
  rngState = Math.imul(Game.time, 2654435761) | 0
  let error = null
  // Our bot adds up CPU per creep role and loop phase here while it exists (see profile in main.ts).
  if (!Memory.cpuProfile) Memory.cpuProfile = {}
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
