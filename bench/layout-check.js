/*
 * Checks a planned base layout against the game's rules and against what a base needs. Used by layout-test.js.
 *
 * check({ room, terrain, sources, controller, mineral, spawn, steps }) -> { issues: [{ type, detail }], metrics }
 *   terrain   2500-char string, index y * 50 + x: "0" plain, "1"/"3" wall, "2" swamp
 *   steps     [[x, y, structureType], ...] in build order
 *   spawn     {x, y} of a spawn placed before planning, if any
 */

// Most of each structure a room can have (RCL 8), from CONTROLLER_STRUCTURES.
const RCL8_LIMITS = {
  spawn: 3,
  extension: 60,
  tower: 6,
  link: 6,
  container: 5,
  lab: 10,
  storage: 1,
  terminal: 1,
  factory: 1,
  observer: 1,
  powerSpawn: 1,
  nuker: 1,
  extractor: 1
}
// Walkable structures; everything else blocks movement.
const WALKABLE = new Set(["road", "container", "rampart"])
// Structures an attacker must not be able to reach (melee range) from an exit without breaking a rampart.
const CORE = new Set(["spawn", "extension", "tower", "storage", "terminal", "lab", "factory", "powerSpawn", "nuker"])

const DIRS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

function check({ terrain, sources, controller, mineral, spawn, steps }) {
  const issues = []
  const issue = (type, detail) => issues.push({ type, detail })
  const isWall = (x, y) =>
    x < 0 || y < 0 || 49 < x || 49 < y || terrain[y * 50 + x] === "1" || terrain[y * 50 + x] === "3"
  const key = (x, y) => `${x},${y}`

  // Tile -> planned structure types.
  const tiles = new Map()
  for (const [x, y, type] of steps) {
    const list = tiles.get(key(x, y)) || []
    list.push(type)
    tiles.set(key(x, y), list)
  }

  // --- The game's placement rules (engine utils.checkConstructionSite) ---
  for (const [x, y, type] of steps) {
    if (x < 1 || 48 < x || y < 1 || 48 < y) {
      issue("invalid-tile", `${type} at ${x},${y} is on or outside the room edge`)
      continue
    }
    if (type !== "road" && type !== "container" && (x === 1 || x === 48 || y === 1 || y === 48)) {
      const border =
        x === 1
          ? [
              [0, y - 1],
              [0, y],
              [0, y + 1]
            ]
          : x === 48
          ? [
              [49, y - 1],
              [49, y],
              [49, y + 1]
            ]
          : y === 1
          ? [
              [x - 1, 0],
              [x, 0],
              [x + 1, 0]
            ]
          : [
              [x - 1, 49],
              [x, 49],
              [x + 1, 49]
            ]
      if (border.some(([bx, by]) => !isWall(bx, by))) issue("invalid-tile", `${type} at ${x},${y} is next to an exit`)
    }
    if (type === "extractor") {
      if (!mineral || mineral.x !== x || mineral.y !== y)
        issue("invalid-tile", `extractor at ${x},${y} is not on the mineral`)
    } else if (type !== "road" && isWall(x, y)) issue("invalid-tile", `${type} at ${x},${y} is on a wall`)
    const onObject = [...sources, controller, mineral].some(o => o && o.x === x && o.y === y)
    if (onObject && type !== "extractor")
      issue("invalid-tile", `${type} at ${x},${y} is on a source/controller/mineral`)
  }

  // --- Conflicts ---
  for (const [tile, types] of tiles) {
    const counts = {}
    for (const t of types) counts[t] = (counts[t] || 0) + 1
    for (const t in counts) if (1 < counts[t]) issue("duplicate", `${counts[t]}x ${t} at ${tile}`)
    const solid = Object.keys(counts).filter(t => t !== "road" && t !== "rampart")
    if (1 < solid.length) issue("conflict", `${solid.join(" + ")} at ${tile}`)
    if (counts.road && solid.some(t => !WALKABLE.has(t)))
      issue("road-under-structure", `road under ${solid.join("+")} at ${tile}`)
  }

  // --- Counts ---
  // Unique structures (a duplicate step builds nothing extra).
  const count = {}
  for (const s of new Set(steps.map(([x, y, t]) => `${x},${y},${t}`))) {
    const t = s.split(",")[2]
    count[t] = (count[t] || 0) + 1
  }
  for (const t in RCL8_LIMITS) {
    if (RCL8_LIMITS[t] < (count[t] || 0)) issue("over-limit", `${count[t]} ${t} (max ${RCL8_LIMITS[t]})`)
  }
  for (const t of [
    "spawn",
    "extension",
    "tower",
    "lab",
    "storage",
    "terminal",
    "factory",
    "observer",
    "powerSpawn",
    "nuker"
  ])
    if ((count[t] || 0) < RCL8_LIMITS[t]) issue("missing", `${count[t] || 0}/${RCL8_LIMITS[t]} ${t}`)
  if (mineral && !count.extractor) issue("missing", "no extractor")

  // --- Movement ---
  const blocked = (x, y) => isWall(x, y) || (tiles.get(key(x, y)) || []).some(t => !WALKABLE.has(t))
  const objectAt = (x, y) => [...sources, controller, mineral].some(o => o && o.x === x && o.y === y)
  const walkable = (x, y) => 0 <= x && x <= 49 && 0 <= y && y <= 49 && !blocked(x, y) && !objectAt(x, y)

  for (const s of sources) {
    const free = DIRS.filter(([dx, dy]) => walkable(s.x + dx, s.y + dy)).length
    if (free === 0) issue("blocks-source", `no free tile next to source at ${s.x},${s.y}`)
  }
  if (controller) {
    let standing = 0
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) if (walkable(controller.x + dx, controller.y + dy)) standing++
    if (standing === 0)
      issue("blocks-controller", `no free tile within 3 of controller at ${controller.x},${controller.y}`)
  }

  // Reachability from the (first) spawn.
  const home =
    spawn ||
    (steps.find(s => s[2] === "spawn")
      ? { x: steps.find(s => s[2] === "spawn")[0], y: steps.find(s => s[2] === "spawn")[1] }
      : null)
  const reach = new Map()
  if (home) {
    const queue = []
    for (const [dx, dy] of DIRS) {
      const x = home.x + dx
      const y = home.y + dy
      if (walkable(x, y) && !reach.has(key(x, y))) {
        reach.set(key(x, y), 1)
        queue.push([x, y])
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]
      for (const [dx, dy] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        if (walkable(nx, ny) && !reach.has(key(nx, ny))) {
          reach.set(key(nx, ny), reach.get(key(x, y)) + 1)
          queue.push([nx, ny])
        }
      }
    }
    const reachable = (x, y) => DIRS.some(([dx, dy]) => reach.has(key(x + dx, y + dy))) || reach.has(key(x, y))
    for (const [tile, types] of tiles) {
      const [x, y] = tile.split(",").map(Number)
      const needsAccess = types.filter(t => t !== "road" && t !== "rampart" && t !== "constructedWall")
      if (needsAccess.length && !reachable(x, y)) issue("unreachable", `${needsAccess.join("+")} at ${tile}`)
    }
    for (const s of sources) if (!reachable(s.x, s.y)) issue("unreachable", `source at ${s.x},${s.y}`)
    if (controller && !reachable(controller.x, controller.y))
      issue("unreachable", `controller at ${controller.x},${controller.y}`)
    let exitReached = false
    for (let i = 0; i < 50 && !exitReached; i++)
      for (const [x, y] of [
        [0, i],
        [49, i],
        [i, 0],
        [i, 49]
      ])
        if (reach.has(key(x, y))) exitReached = true
    if (!exitReached) issue("unreachable", "no exit reachable from the spawn (base walled in)")
  } else issue("missing", "no spawn to plan around")

  // --- Defence: can an attacker walk from an exit to melee range of a core structure without breaking ramparts? ---
  const enemyWalkable = (x, y) => walkable(x, y) && !(tiles.get(key(x, y)) || []).some(t => t === "rampart")
  const enemy = new Set()
  const q = []
  for (let i = 0; i < 50; i++)
    for (const [x, y] of [
      [0, i],
      [49, i],
      [i, 0],
      [i, 49]
    ])
      if (enemyWalkable(x, y) && !enemy.has(key(x, y))) {
        enemy.add(key(x, y))
        q.push([x, y])
      }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      if (enemyWalkable(nx, ny) && !enemy.has(key(nx, ny))) {
        enemy.add(key(nx, ny))
        q.push([nx, ny])
      }
    }
  }
  let core = 0
  let exposed = 0
  for (const [tile, types] of tiles) {
    if (!types.some(t => CORE.has(t))) continue
    core++
    const [x, y] = tile.split(",").map(Number)
    const underRampart = types.includes("rampart")
    if (!underRampart && DIRS.some(([dx, dy]) => enemy.has(key(x + dx, y + dy)))) exposed++
  }
  if (exposed) issue("exposed", `${exposed}/${core} core structures reachable from an exit without breaking a rampart`)

  // --- Efficiency ---
  const extensionDistances = steps
    .filter(s => s[2] === "extension")
    .map(([x, y]) => Math.min(...DIRS.map(([dx, dy]) => reach.get(key(x + dx, y + dy)) ?? Infinity)))
    .filter(Number.isFinite)
  // Walking distance from the spawn to next to a tile (Infinity if unreachable).
  const distTo = (x, y) => Math.min(...DIRS.map(([dx, dy]) => reach.get(key(x + dx, y + dy)) ?? Infinity))
  const finite = v => (Number.isFinite(v) ? v : null)
  const avgOf = list => (list.length ? +(list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : null)
  // Rapid fill: a link with a container 2 tiles either side of it, in a row or a column.
  const has = (x, y, t) => (tiles.get(key(x, y)) || []).includes(t)
  const rapidFill = steps.some(
    ([x, y, t]) =>
      t === "link" &&
      ((has(x - 2, y, "container") && has(x + 2, y, "container")) ||
        (has(x, y - 2, "container") && has(x, y + 2, "container")))
  )
  // Weakest tower cover on the rampart line: summed tower damage at the rampart tile the towers hit hardest least.
  const towers = steps.filter(s => s[2] === "tower")
  const towerDamage = (x, y) =>
    towers.reduce((sum, [tx, ty]) => {
      const range = Math.max(Math.abs(tx - x), Math.abs(ty - y))
      return sum + (range <= 5 ? 600 : range >= 20 ? 150 : 600 - ((range - 5) * 450) / 15)
    }, 0)
  const rampartTiles = steps.filter(s => s[2] === "rampart")
  const storage = steps.find(s => s[2] === "storage")
  const metrics = {
    steps: steps.length,
    rapidFill: rapidFill ? 1 : 0,
    storageDistance: storage ? finite(distTo(storage[0], storage[1])) : null,
    controllerDistance: controller ? finite(distTo(controller.x, controller.y)) : null,
    sourceDistance: avgOf(sources.map(s => distTo(s.x, s.y)).filter(Number.isFinite)),
    towerMinDamage: rampartTiles.length && towers.length ? Math.round(Math.min(...rampartTiles.map(([x, y]) => towerDamage(x, y)))) : null,
    roads: count.road || 0,
    ramparts: count.rampart || 0,
    avgExtensionDistance: extensionDistances.length
      ? +(extensionDistances.reduce((a, b) => a + b, 0) / extensionDistances.length).toFixed(1)
      : null,
    exposed,
    core
  }
  return { issues, metrics }
}

module.exports = { check }
