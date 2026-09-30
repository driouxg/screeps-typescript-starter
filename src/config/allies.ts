/**
 * Players we're friendly with: we may path through their rooms, never mine or reserve their rooms, and never attack
 * their creeps or count them as threats.
 *
 * Add names here, or at runtime from the console: Memory.allies = ["SomePlayer"]
 */
export const ALLIES: string[] = []

declare global {
  interface Memory {
    allies?: string[]
  }
}

export function isAlly(username: string | undefined): boolean {
  if (!username) return false
  return ALLIES.includes(username) || (Memory.allies ?? []).includes(username)
}
