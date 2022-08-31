export default interface ScoutMemory extends CreepMemory {
  lastScoutedDict: { [roomName: string]: number }
  targetRoom: string
}
