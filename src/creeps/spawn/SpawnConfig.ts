export default class SpawnConfig {
  private body: BodyPartConstant[]
  private role: string
  private memory?: CreepMemory

  public constructor(body: BodyPartConstant[], role: string, memory?: CreepMemory) {
    this.body = body
    this.role = role
    this.memory = memory
  }

  public getBody(): BodyPartConstant[] {
    return this.body
  }

  public getRole(): string {
    return this.role
  }

  public getMemory(): CreepMemory | undefined {
    return this.memory
  }
}
