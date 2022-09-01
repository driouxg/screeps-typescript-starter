import SpawnConfig from "./SpawnConfig"

export default interface ISpawnHandler {
  spawnCreep(spawn: StructureSpawn): SpawnConfig | null
}
