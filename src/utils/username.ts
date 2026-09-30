let cached: string | undefined

/**
 * Our player name, read from any spawn or owned controller (instead of hard-coding it).
 */
export function myUsername(): string | undefined {
  if (cached) return cached
  const spawn = Object.values(Game.spawns)[0]
  if (spawn) return (cached = spawn.owner.username)
  const controller = Object.values(Game.rooms).find(r => r.controller?.my)?.controller
  if (controller?.owner) return (cached = controller.owner.username)
  return undefined
}
