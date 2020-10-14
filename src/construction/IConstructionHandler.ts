export default interface IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][];
}
