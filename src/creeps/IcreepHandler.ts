export default interface ICreepHandler {
  move(creep: Creep): void;
  attack(creep: Creep): void;
}
