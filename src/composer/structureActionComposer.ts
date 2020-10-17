import IStructureActionHandler from "structures/action/IStructureActionHandler";
import TowerActionHandler from "structures/action/towerActionHandler";

export default class StructureActionComposer {
  public structureActionHandlers(): IStructureActionHandler[] {
    return [new TowerActionHandler()];
  }
}
