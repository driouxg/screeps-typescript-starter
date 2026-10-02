/**
 * Goal: Decisions a player makes at runtime, without redeploying: set from the dashboard (see dashboard/), or from
 * the console, e.g. `Memory.controls = { aggression: "aggressive" }`. Anything missing or invalid falls back to
 * DEFAULT_CONTROLS.
 *
 * aggression:
 *   passive     never flag players as hostile for attacking us (only ENEMIES/Memory.enemies and NPCs are), and
 *               never send defenders to remote rooms: a threatened remote is just paused
 *   defensive   the default: players who attack us become hostile; remote threats get defenders when they can win
 *               with a margin
 *   aggressive  as defensive, and any other (non-allied) player's armed creeps in rooms we see are hostile on sight,
 *               so towers and defenders engage them before they strike; remote defenders are sent without a margin
 * remoteMining  false stops all remote mining (its creeps go home)
 * expansion     false stops starting new expansions (one already underway is finished)
 * scouting      false stops all scouting: no scouts are spawned, and those out retire
 */

export type Aggression = "passive" | "defensive" | "aggressive"
export const AGGRESSION_LEVELS: Aggression[] = ["passive", "defensive", "aggressive"]

export interface Controls {
  aggression: Aggression
  remoteMining: boolean
  expansion: boolean
  scouting: boolean
}

export const DEFAULT_CONTROLS: Controls = { aggression: "defensive", remoteMining: true, expansion: true, scouting: true }

declare global {
  interface Memory {
    /** Runtime decisions (see config/controls.ts); partial, validated by controls(). */
    controls?: Partial<Controls>
  }
}

/** The current controls: Memory.controls over DEFAULT_CONTROLS, ignoring invalid values. */
export function controls(): Controls {
  const set = Memory.controls ?? {}
  return {
    aggression: AGGRESSION_LEVELS.includes(set.aggression as Aggression)
      ? (set.aggression as Aggression)
      : DEFAULT_CONTROLS.aggression,
    remoteMining: typeof set.remoteMining === "boolean" ? set.remoteMining : DEFAULT_CONTROLS.remoteMining,
    expansion: typeof set.expansion === "boolean" ? set.expansion : DEFAULT_CONTROLS.expansion,
    scouting: typeof set.scouting === "boolean" ? set.scouting : DEFAULT_CONTROLS.scouting
  }
}
