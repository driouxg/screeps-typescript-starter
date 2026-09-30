export default class SpawnConfig {
  private body: BodyPartConstant[]
  private role: string
  private memory?: CreepMemory
  private directions?: DirectionConstant[]
  private waitForEnergy: boolean

  /**
   * @param opts.waitForEnergy if the body isn't affordable yet, save up for it: lower priority spawn handlers don't
   *   get to spend the energy meanwhile. Use for creeps worth waiting for, e.g. a full-size miner.
   */
  public constructor(
    body: BodyPartConstant[],
    role: string,
    opts?: { memory?: CreepMemory; directions?: DirectionConstant[]; waitForEnergy?: boolean }
  ) {
    this.body = body
    this.role = role
    this.memory = opts?.memory
    this.directions = opts?.directions
    this.waitForEnergy = opts?.waitForEnergy ?? false
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

  public shouldWaitForEnergy(): boolean {
    return this.waitForEnergy
  }
}
