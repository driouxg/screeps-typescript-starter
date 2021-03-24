import IConstructionHandler from "../IConstructionHandler";

export default class ConstructionSiteVisualizer implements IConstructionHandler {
    private settings: ISettings;

    public constructor(settings: ISettings) {
        this.settings = settings;
    }

    public handle(room: Room, desiredState: string[][]): string[][] {
        if (this.settings.constructionSite.visualize !== "true") return desiredState;

        this.print(room);
        return desiredState;
    }

    private print(room: Room): void {
        const desiredState: string[][] = room.memory.desiredState;

        for (let y = 0; y < desiredState.length; y++) {
          for (let x = 0; x < desiredState[y].length; x++) {
            room.visual.text(this.displayText(desiredState[y][x]), x, y);
          }
        }
      }

      private displayText(text: string): string {
        switch (text) {
          case STRUCTURE_TOWER:
            return "To";
          case STRUCTURE_WALL:
            return "W";
          case STRUCTURE_ROAD:
            return "r";
          case STRUCTURE_RAMPART:
            return "R";
          case STRUCTURE_STORAGE:
            return "Stg";
          case STRUCTURE_SPAWN:
            return "Sp";
          case STRUCTURE_POWER_SPAWN:
            return "sPsp";
          case STRUCTURE_CONTAINER:
            return "C";
          case STRUCTURE_EXTENSION:
            return "E";
          case STRUCTURE_NUKER:
            return "N";
          case STRUCTURE_OBSERVER:
            return "O";
          case STRUCTURE_LAB:
            return "La";
          case STRUCTURE_LINK:
            return "Li";
          case STRUCTURE_TERMINAL:
            return "Ter";
          case STRUCTURE_FACTORY:
            return "F";
          case STRUCTURE_EXTRACTOR:
            return "Ex";
          default:
            return ".";
        }
      }
}
