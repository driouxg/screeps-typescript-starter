export default interface BuilderMemory extends CreepMemory {
  repairTargetPos: { x: number; y: number; roomName: string }
  buildTargetPos: { x: number; y: number; roomName: string }
}
