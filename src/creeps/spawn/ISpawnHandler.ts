import SpawnConfig from "./SpawnConfig";

export default interface ISpawnHandler {
  spawnCreep(room: Room): SpawnConfig;
}
