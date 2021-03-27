export function buildDynamicBodyParts(bluePrint: BodyPartConstant[], room: Room): BodyPartConstant[] {
  if (room.energyAvailable < 300) return bluePrint;

  bluePrint.sort((b1, b2) => BODYPART_COST[b1] - BODYPART_COST[b2]);

  let parts: BodyPartConstant[] = [];
  let cost = 0,
    idx = 0;

  while (cost + BODYPART_COST[bluePrint[idx]] <= room.energyAvailable) {
    parts.push(bluePrint[idx]);
    cost += BODYPART_COST[bluePrint[idx]];
    idx = (idx + 1) % bluePrint.length;
  }

  return parts;
}
