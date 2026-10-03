import { runLinks } from "structures/links"
import IStructureActionHandler from "./IStructureActionHandler"

/** Goal: Send energy through the room's links each tick (see structures/links). */
export default class LinkActionHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    runLinks(room)
  }
}
