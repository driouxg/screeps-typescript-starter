// example declaration file - remove these and add your own custom typings

interface ISettings {
  constructionSite: {
    visualize: "true" | "false";
    desiredSitesConstructedPerTick: number;
  };
}

// memory extension samples
interface CreepMemory {
  role: string;
  room: string;
  working: boolean;
}

interface Memory {
  uuid: number;
  log: any;
}

interface RoomMemory {
  constructionPos: { [key: string]: number };
  desiredState: string[][];
  positions: { [structure: string]: RoomPosition[] };
  events: RoomEvent[];
}

interface RoomEvent {
  type: RoomEventType;
  tick: number;
}

type RoomEventType = PULL_REQUEST;

type PULL_REQUEST = "PULL_REQUEST";

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
