import ICreepHandler from "./ICreepHandler";

export default class WallRepairer implements ICreepHandler {
  private creep: Creep;

  public constructor(creep: Creep) {
    this.creep = creep;
  }

  public handle(): void {
    return;
  }
}
