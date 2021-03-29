export function buildDynamicBodyParts(
  bluePrint: BodyPartConstant[],
  room: Room,
  minBluePrint?: BodyPartConstant[]
): BodyPartConstant[] {
  return buildCappedBodyParts(bluePrint, room, 50, minBluePrint);
}

export function buildCappedBodyParts(
  bluePrint: BodyPartConstant[],
  room: Room,
  cap: number,
  minBluePrint?: BodyPartConstant[]
): BodyPartConstant[] {
  if (room.energyAvailable < 300) return [];

  bluePrint.sort((b1, b2) => BODYPART_COST[b1] - BODYPART_COST[b2]);

  let parts = minBluePrint || [];
  let cost = minBluePrint ? minBluePrint.reduce((acc, val) => acc + BODYPART_COST[val], 0) : 0;
  let idx = 0;

  while (parts.length < cap && cost + BODYPART_COST[bluePrint[idx]] <= room.energyAvailable) {
    parts.push(bluePrint[idx]);
    cost += BODYPART_COST[bluePrint[idx]];
    idx = (idx + 1) % bluePrint.length;
  }

  return parts;
}
