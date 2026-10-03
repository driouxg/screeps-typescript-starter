/**
 * Goal: Pick the attack squad for a siege from the usual unboosted meta, sized to what the home can build and pay for
 * and to the damage it has to heal through (see conquest/assessment).
 *
 * Templates, by the home's energy capacity (its RCL):
 *   raid  RCL 3-4: 2 attackers and a healer. Melee only, so it's for bases without working towers: they'd kill a
 *         squad this small before it got through a wall.
 *   duo   RCL 5-6: dismantler + healer pairs (1 or 2). WORK parts take walls down at DISMANTLE_POWER (50) a part, far
 *         faster than ATTACK (30); the healer keeps the dismantler up under tower fire.
 *   quad  RCL 7-8: 2 dismantlers and 2 or more healers moving as one block, and a ranged attacker to clear defenders
 *         when the base has any. Big enough to tank several towers while it breaches.
 * Every body has a MOVE per other part, so the squad keeps full speed off-road and can't be split up by swamps.
 *
 * Healers are added (up to the template's maximum) until the squad heals the damage it will take at the breach with
 * HEAL_MARGIN to spare. Creeps are sized to the home's capacity, scaled down (to no less than MIN_BUDGET_SHARE of it)
 * when the home hasn't stored the energy for the whole squad and a couple of renewals; a squad of a few spawn fills
 * (INCOME_FILLS) is paid from income instead.
 */

export type MemberKind = "dismantler" | "healer" | "attacker" | "ranged" | "claimer"
export type TemplateName = "raid" | "duo" | "quad"

export interface SquadTemplate {
  name: TemplateName
  description: string
  /** The energy capacity it needs (RCL 3, 5 and 7). */
  minCapacity: number
  /** Fighters (not healers), in spawn order. */
  core: MemberKind[]
  minHealers: number
  maxHealers: number
  /** A ranged attacker is added when the target has defenders. */
  escort: boolean
  /** Most energy per creep: bigger bodies aren't worth the spawn time against what this template is for. */
  maxCreepEnergy: number
}

export const TEMPLATES: SquadTemplate[] = [
  {
    name: "raid",
    description: "2 attackers + healer (RCL 3-4): only for bases with no working towers",
    minCapacity: 800,
    core: ["attacker", "attacker"],
    minHealers: 1,
    maxHealers: 1,
    escort: false,
    maxCreepEnergy: 1300
  },
  {
    name: "duo",
    description: "dismantler + healer pairs (RCL 5-6): walls come down fast, the healer tanks a tower or two",
    minCapacity: 1800,
    core: ["dismantler", "dismantler"],
    minHealers: 1,
    maxHealers: 3,
    escort: true,
    maxCreepEnergy: 2300
  },
  {
    name: "quad",
    description: "2 dismantlers + 2-4 healers moving as a block (RCL 7-8), ranged escort against defenders",
    minCapacity: 5600,
    core: ["dismantler", "dismantler"],
    minHealers: 2,
    maxHealers: 4,
    escort: true,
    maxCreepEnergy: 12900
  }
]

const HEAL_MARGIN = 1.25
const MIN_BUDGET_SHARE = 0.5
/** Stored energy to keep at home for its own needs, on top of the squad. */
const HOME_RESERVE = 20000
/**
 * A squad costing no more than this many fills of the home's spawns and extensions comes out of income as it spawns
 * (a raid at RCL 4 is under two): it needs nothing stored. Bigger ones are paid for from storage.
 */
const INCOME_FILLS = 3
const MAX_PARTS = MAX_CREEP_SIZE

export interface SquadMember {
  kind: MemberKind
  body: BodyPartConstant[]
}

export interface SquadPlan {
  template: TemplateName
  members: SquadMember[]
  /** Energy to spawn them all. */
  cost: number
  /** Hits per tick it takes off structures (dismantle, attack, ranged attack). */
  siegeRate: number
  /** Damage per tick against creeps. */
  dps: number
  /** Healing per tick (healers next to their target). */
  heal: number
  hits: number
  /** Whether the healers can't heal what the squad will take, even at the template's maximum. */
  healShort: boolean
  /** Why the home can't afford it now, if it can't. */
  unaffordable?: string
}

/** The template for a home's energy capacity: the biggest it can build. */
export function templateFor(capacity: number): SquadTemplate | null {
  let best: SquadTemplate | null = null
  for (const t of TEMPLATES) if (t.minCapacity <= capacity) best = t
  return best
}

export function templateNamed(name: string | undefined): SquadTemplate | undefined {
  return TEMPLATES.find(t => t.name === name)
}

/**
 * The squad for a siege from a home with `capacity` and `stored` energy (null: no storage yet, so it's spawned from
 * income as it comes in, at full size), against `incoming` damage per tick at the
 * breach, with `defenders` (combat parts seen in the room). Null if the home can't build any template (or the one
 * asked for).
 */
export function planSquad(
  capacity: number,
  stored: number | null,
  incoming: number,
  defenders: number,
  override?: TemplateName
): SquadPlan | null {
  const template = override ? templateNamed(override) : templateFor(capacity)
  if (!template || capacity < template.minCapacity * MIN_BUDGET_SHARE) return null

  const full = Math.min(capacity, template.maxCreepEnergy)
  let plan = build(template, full, incoming, defenders)
  // Short of energy: smaller creeps, down to MIN_BUDGET_SHARE of the full size.
  const fromIncome = (cost: number) => cost <= capacity * INCOME_FILLS
  const available = stored === null || fromIncome(plan.cost) ? Infinity : Math.max(0, stored - HOME_RESERVE)
  if (available < plan.cost) {
    const budget = Math.max(full * MIN_BUDGET_SHARE, Math.floor((full * available) / plan.cost))
    if (budget < full) plan = build(template, budget, incoming, defenders)
    if (available < plan.cost)
      plan.unaffordable = `needs ${Math.round(plan.cost / 1000)}k energy stored beyond the home's ${
        HOME_RESERVE / 1000
      }k reserve; it has ${Math.round(available / 1000)}k`
  }
  return plan
}

function build(template: SquadTemplate, energy: number, incoming: number, defenders: number): SquadPlan {
  const members: SquadMember[] = template.core.map(kind => ({ kind, body: bodyFor(kind, energy) }))
  if (template.escort && 0 < defenders) members.push({ kind: "ranged", body: bodyFor("ranged", energy) })

  const healerBody = bodyFor("healer", energy)
  const perHealer = count(healerBody, HEAL) * HEAL_POWER
  const selfHeal = members.reduce((sum, m) => sum + count(m.body, HEAL) * HEAL_POWER, 0)
  const wanted = Math.ceil(Math.max(0, incoming * HEAL_MARGIN - selfHeal) / Math.max(1, perHealer))
  const healers = Math.max(template.minHealers, Math.min(template.maxHealers, wanted))
  for (let i = 0; i < healers; i++) members.push({ kind: "healer", body: healerBody })

  return stats(template.name, members, incoming)
}

/** Totals for a squad (see SquadPlan). */
export function stats(template: TemplateName, members: SquadMember[], incoming: number): SquadPlan {
  const all = members.reduce((parts, m) => parts.concat(m.body), [] as BodyPartConstant[])
  const heal = count(all, HEAL) * HEAL_POWER
  return {
    template,
    members,
    cost: all.reduce((sum, p) => sum + BODYPART_COST[p], 0),
    siegeRate:
      count(all, WORK) * DISMANTLE_POWER + count(all, ATTACK) * ATTACK_POWER + count(all, RANGED_ATTACK) * RANGED_ATTACK_POWER,
    dps: count(all, ATTACK) * ATTACK_POWER + count(all, RANGED_ATTACK) * RANGED_ATTACK_POWER,
    heal,
    hits: all.length * 100,
    healShort: heal < incoming * HEAL_MARGIN
  }
}

/** The body of a squad member, as big as `energy` allows (see the top of this file). */
export function bodyFor(kind: MemberKind, energy: number): BodyPartConstant[] {
  switch (kind) {
    case "dismantler":
      return ratioBody(energy, [WORK], 2)
    case "attacker":
      return ratioBody(energy, [ATTACK], 2)
    case "healer":
      return ratioBody(energy, [HEAL], 0)
    case "ranged":
      // Mostly ranged attack, with a little healing of its own.
      return ratioBody(energy, [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, HEAL], 0)
    case "claimer":
      return ratioBody(energy, [CLAIM], 0)
  }
}

/**
 * `unit` parts repeated (each with a MOVE) as often as `energy` and MAX_PARTS allow, behind up to `tough` TOUGH parts
 * (each with a MOVE) to soak the first hits. TOUGH first, then the working parts, MOVE last: what's hit first matters
 * least.
 */
function ratioBody(energy: number, unit: BodyPartConstant[], tough: number): BodyPartConstant[] {
  const unitCost = unit.reduce((sum, p) => sum + BODYPART_COST[p] + BODYPART_COST[MOVE], 0)
  const toughCost = BODYPART_COST[TOUGH] + BODYPART_COST[MOVE]
  let units = Math.floor(energy / unitCost)
  units = Math.max(1, Math.min(units, Math.floor(MAX_PARTS / (unit.length * 2))))
  const working: BodyPartConstant[] = []
  for (let i = 0; i < units; i++) working.push(...unit)
  // Cut back a partial last unit so working parts and moves fit.
  const fit = Math.floor(MAX_PARTS / 2)
  working.splice(fit)
  const left = energy - working.reduce((sum, p) => sum + BODYPART_COST[p] + BODYPART_COST[MOVE], 0)
  const toughParts = Math.max(0, Math.min(tough, Math.floor(left / toughCost), fit - working.length))
  return [
    ...Array<BodyPartConstant>(toughParts).fill(TOUGH),
    ...working,
    ...Array<BodyPartConstant>(working.length + toughParts).fill(MOVE)
  ]
}

function count(body: BodyPartConstant[], part: BodyPartConstant): number {
  return body.filter(p => p === part).length
}
