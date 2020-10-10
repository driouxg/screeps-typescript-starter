import ICreepHandler from "./ICreepHandler";
import UpgraderHandler from "./upgraderHandler";

export default class BuilderHandler implements ICreepHandler {
  private creep: Creep;

  public constructor(creep: Creep) {
    this.creep = creep;
  }

  public handle(): void {
    if (!this.hasEnergy()) {
      this.creep.memory.working = false;
    }

    if (this.hasMaxEnergy()) {
      this.creep.memory.working = true;
    }

    if (this.isWorking()) {
      this.buildConstructionSite();
    } else {
      this.harvestEnergy();
    }
  }

  private isWorking() {
    return this.creep.memory.working;
  }

  private hasEnergy(): boolean {
    return this.creep.store.energy > 0;
  }

  private hasMaxEnergy(): boolean {
    return this.creep.store.getFreeCapacity() === 0;
  }

  private buildConstructionSite(): void {
    const constructionSite: ConstructionSite | null = this.creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

    if (constructionSite) {
      if (this.creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
        this.creep.moveTo(constructionSite);
      }
    } else {
      const upgradeHandler: UpgraderHandler = new UpgraderHandler(this.creep);
      upgradeHandler.handle();
    }
  }

  private harvestEnergy(): void {
    const source: Source | null = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

    if (!source) return;

    if (this.creep.harvest(source) === ERR_NOT_IN_RANGE) {
      this.creep.moveTo(source);
    }
  }
}
