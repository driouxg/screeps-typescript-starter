import IStructureActionHandler from "structures/action/IStructureActionHandler"
import TowerActionHandler from "structures/action/towerActionHandler"
import SafeModeHandler from "structures/action/safeModeHandler"
import LinkActionHandler from "structures/action/linkActionHandler"

export default class StructureActionComposer {
  public structureActionHandlers(): IStructureActionHandler[] {
    return [new SafeModeHandler(), new TowerActionHandler(), new LinkActionHandler()]
  }
}
