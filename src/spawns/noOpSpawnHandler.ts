import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class NoOpSpawnHandler implements ISpawnHandler {
  public spawnCreep(): SpawnConfig {
    return new SpawnConfig([], "");
  }
}
