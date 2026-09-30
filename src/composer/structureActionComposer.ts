import IStructureActionHandler from "structures/action/IStructureActionHandler"
import TowerActionHandler from "structures/action/towerActionHandler"
import SafeModeHandler from "structures/action/safeModeHandler"

export default class StructureActionComposer {
  public structureActionHandlers(): IStructureActionHandler[] {
    return [new SafeModeHandler(), new TowerActionHandler()]
  }
}
