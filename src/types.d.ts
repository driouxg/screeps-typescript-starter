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
  myTowerPositions: number[][];
  myContainerPositions: number[][];
  myStoragePosition: number[][];
  myExtensionPositions: number[][];
  mySpawnPositions: number[][];
  constructionPos: { [key: string]: number };
  desiredState: string[][];
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
