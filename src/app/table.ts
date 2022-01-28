import { Stage, EventDispatcher } from "createjs-module";
import { GamePlay } from "./game-play";

/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {

  gamePlay: GamePlay;
  stage: Stage;
  constructor(stage: Stage) {
    super();
    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    //this.makeScaleCont(!!stage.canvas)
    // bindKeys
    // make proto-District (with 37 Hexes), and 7 copies
    // link Districts 
  }

  layoutTable() {
    throw new Error("Method not implemented.");
  }
}