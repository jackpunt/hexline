import { Move, Mover, Player } from "./game-play";
import { Table } from "./table";


class RoboBase implements Mover {
  table: Table
  player: Player

  constructor(table: Table, player: Player) {
    this.table = table
    this.player = player
  }
  makeMove() {
    let move: Move

    return 
  }
  
}