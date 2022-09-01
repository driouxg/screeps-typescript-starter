export default interface BuilderMemory extends CreepMemory {
  task: "building" | "repairing"
  repairTargetPos: { x: number; y: number; roomName: string }
  buildTargetPos: { x: number; y: number; roomName: string }
}
