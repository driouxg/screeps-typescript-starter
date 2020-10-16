export default class SpawnConfig {
  private body: BodyPartConstant[];
  private role: string;

  public constructor(body: BodyPartConstant[], role: string) {
    this.body = body;
    this.role = role;
  }

  public getBody(): BodyPartConstant[] {
    return this.body;
  }

  public getRole(): string {
    return this.role;
  }
}
