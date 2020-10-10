/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
import ICreepHandler from "./ICreepHandler";

export default class NoOpCreepHandler implements ICreepHandler {
  public handle(): void {}
}
