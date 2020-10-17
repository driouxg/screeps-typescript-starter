import IStructureActionHandler from "./IStructureActionHandler";

export default class StructureActionHandler implements IStructureActionHandler {
  private structureActionHandlers: IStructureActionHandler[];

  public constructor(structureActionHandlers: IStructureActionHandler[]) {
    this.structureActionHandlers = structureActionHandlers;
  }
  public handle(room: Room): void {
    for (const structureActionHandler of this.structureActionHandlers) {
      structureActionHandler.handle(room);
    }
  }
}
