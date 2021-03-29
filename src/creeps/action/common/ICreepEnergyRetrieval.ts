export default interface ICreepEnergyRetrieval {
  retrieve(
    creep: Creep
  ): CreepActionReturnCode | CreepMoveReturnCode | ERR_NO_PATH | ERR_NOT_FOUND | ERR_NOT_ENOUGH_RESOURCES;
}
