/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
import ICreepHandler from "./IcreepHandler";

export default class NoOpCreepHandler implements ICreepHandler {
  public move(creep: Creep): void {}

  public attack(creep: Creep): void {}
}
