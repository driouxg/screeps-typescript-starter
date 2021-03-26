export function dynamicBodyPartsList(bluePrint: BodyPartConstant[], room: Room): BodyPartConstant[] {
  let parts: BodyPartConstant[] = [];
  let cost = 0,
    idx = 0;

  while (cost + BODYPART_COST[bluePrint[idx]] < room.energyAvailable) {
    parts.push(bluePrint[idx]);
    cost += BODYPART_COST[bluePrint[idx]];
    idx = (idx + 1) % bluePrint.length;
  }

  return parts;
}
