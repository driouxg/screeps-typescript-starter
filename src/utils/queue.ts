export default class Queue<T> {
  private pushStack: T[];
  private popStack: T[];

  public constructor() {
    this.pushStack = new Array<T>();
    this.popStack = new Array<T>();
  }

  public add(x: T): void {
    this.pushStack.push(x);
  }

  private swap(): void {
    if (this.popStack.length <= 0) {
      while (this.pushStack.length > 0) {
        const item: T | undefined = this.pushStack.pop();
        if (!item) continue;
        this.popStack.push(item);
      }
    }
  }

  public remove(): T | undefined {
    this.swap();

    return this.popStack.pop();
  }

  public isEmpty(): boolean {
    return this.popStack.length <= 0 && this.pushStack.length <= 0;
  }

  public size(): number {
    return this.popStack.length + this.pushStack.length;
  }
}
