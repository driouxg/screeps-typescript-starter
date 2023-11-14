export default class SpawnConfig {
  private body: BodyPartConstant[]
  private role: string
  private memory?: CreepMemory
  private directions?: DirectionConstant[]

  public constructor(
    body: BodyPartConstant[],
    role: string,
    opts?: { memory?: CreepMemory; directions?: DirectionConstant[] }
  ) {
    console.log("Spawn config memory", JSON.stringify(opts?.memory))

    this.body = body
    this.role = role
    this.memory = opts?.memory
    this.directions
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

  public getDirections(): DirectionConstant[] | undefined {
    return this.directions
  }
}
