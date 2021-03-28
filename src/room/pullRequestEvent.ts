export default class PullRequestEvent implements RoomEvent {
  type: RoomEventType = "PULL_REQUEST";
  tick: number;
  destination: RoomPosition;
  creepId: string;

  public constructor(destination: RoomPosition, creepId: string) {
    this.destination = destination;
    this.tick = Game.time;
    this.creepId = creepId;
  }
}
