export default class ConstructionPosition {
  private x: number;
  private y: number;

  public constructor(pos: { [key: string]: number }) {
    if (!pos) {
      this.x = 0;
      this.y = 0;
    } else {
      this.x = pos.x;
      this.y = pos.y;
    }
  }

  public getX(): number {
    return this.x;
  }

  public getY(): number {
    return this.y;
  }

  public incrementX(): void {
    this.x = (this.x + 1) % 50;
  }

  public incrementY(): void {
    this.y = (this.y + 1) % 50;
  }

  public serialize(): { [key: string]: number } {
    return { x: this.x, y: this.y };
  }
}
