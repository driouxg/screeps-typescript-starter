export default interface Event {
  type: string
  tick: number
  handled: boolean // Need a way to determine if an event should be removed from queue
}

export interface SpawnEvent extends Event {
  role: string
  target: RoomPosition
  targetSourceId?: string
  targetRoomName?: string
}
