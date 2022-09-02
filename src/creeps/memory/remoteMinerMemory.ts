export default interface RemoteMinerMemory extends CreepMemory {
  targetRoomName: string
  targetSourceId: string
  birthRoomName: string
  offloadTargetPos: { x: number; y: number; roomName: string }
}
