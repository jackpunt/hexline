import { Stage } from "createjs-module";
import { GamePlay } from "./game-play";
import { Table } from "./table";
import { stime } from "./types";

/** initialize & reset & startup the application. */
export class GameSetup {
  startup(arg0: boolean, undefined: undefined, ext: string[]) {
    throw new Error('Method not implemented.');
  }
  stage: Stage;
  table: Table;
  gamePlay: GamePlay;

    /** @param canvasId supply undefined for 'headless' Stage */
    constructor(canvasId: string) {
      stime.fmt = "MM-DD kk:mm:ss.SSS"
      this.stage = new Stage(canvasId); this.stage.tickOnUpdate = false
      this.table = new Table(this.stage)      // makeScaleCont()
      this.gamePlay = new GamePlay(this.table)
      this.table.gamePlay = this.gamePlay
    }
}
