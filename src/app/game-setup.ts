import { Stage } from "createjs-module";
import { GamePlay } from "./game-play";
import { Table } from "./table";
import { stime } from "./types";

/** initialize & reset & startup the application. */
export class GameSetup {

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

    /**
     * 
     * @param gs generally *this* GameSetup
     * @param ext Extensions from URL
     */
    startup(gs: GameSetup = this, ext: string[]) {
      // this is where Citymap initiates Load Images
      // using: new Bitmap(Card.assetPath + info.path)
      // we can get photos of Black and White stones.

      // after imagesLoaded: this.table.layoutTable()
      this.table.layoutTable()
    }
}
