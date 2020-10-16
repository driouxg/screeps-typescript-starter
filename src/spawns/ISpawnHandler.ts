import SpawnConfig from "./SpawnConfig";

export default interface ISpawnHandler {
  spawn(): SpawnConfig;
}
