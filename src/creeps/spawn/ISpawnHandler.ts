import SpawnConfig from "./SpawnConfig";

export default interface ISpawnHandler {
  spawnCreep(): SpawnConfig;
}
