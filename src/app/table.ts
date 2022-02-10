import { Stage, EventDispatcher, Container, Shape } from "createjs-module";
import { C, S } from "./basic-intfs";
import { Dragger, DragInfo } from "./dragger";
import { GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder } from "./key-binder";
import { ScaleableContainer } from "./scaleable-container";
import { TP, StoneColor, stoneColors, otherColor } from "./table-params";
import { stime } from "./types";

export class Stone extends Shape {
  static radius: number = 50
  static height: number = Stone.radius*Math.sqrt(3)/2
  color: StoneColor;
  /** put new Stone of color on cont at location of hex */
  constructor(color: StoneColor, radius: number = Stone.height) {
    super()
    this.color = color
    this.graphics.beginFill(color).drawCircle(0, 0, radius-1)
  }
  static onHex(stone: Stone, hex: Hex, cont: Container) {
    let pt = hex.parent.localToLocal(hex.x, hex.y, cont)
    stone.x = pt.x; stone.y = pt.y
    cont.addChild(stone)
    hex.stone = stone
  }
}
/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {

  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: Container
  hexMap: HexMap
  dropTarget: Hex;
  roundNumber: number = 0;
  turnNumber: number = 0
  dropStone: Stone
  nextHex: Hex = new Hex("grey", Stone.radius, undefined, undefined, {x: 150, y: 150})

  allPlayers: Player[] = [];
  getNumPlayers(): number { return this.allPlayers.length; }
  curPlayerNdx: number = 0;
  curPlayer: Player;
  getPlayer(stone: Stone): Player {
    return this.allPlayers.find(p => p.color == stone.color)
  }

  constructor(stage: Stage) {
    super();
    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    this.nextHex.Aname = "nextHex"
    this.nextHex.scaleX = this.nextHex.scaleY = 2
  }

  scaleParams = { zscale: .20, initScale: .324, zero: 0.125, max: 30, limit: 2, base: 1.1, min: -2 };
  testoff: number = 1

  layoutTable() {
    let radius = Stone.radius
    this.scaleCont = this.makeScaleCont(!!this.stage)
    let mapCont = new Container(); mapCont.y = 100; mapCont.x = 200
    mapCont[S.aname] = "mapCont"
    this.scaleCont.addChild(mapCont)

    this.hexMap = new HexMap(radius, mapCont)
    this.hexMap.hexCont.addChild(this.nextHex)  // single Hex to hold a Stone to play
    this.gamePlay.hexMap = this.hexMap
    this.make7Districts(TP.nHexes) // typically: 4

    this.makeAllPlayers()
    this.setNextPlayer(0)   // make a placeable Stone for Player[0]

    this.on(S.add, this.gamePlay.addStoneEvent, this.gamePlay)[S.aname] = "addStone"
    this.on(S.remove, this.gamePlay.removeStoneEvent, this.gamePlay)[S.aname] = "removeStone"
    this.stage.update()
  }
  setNextPlayer(ndx: number = -1) {
    if (ndx < 0) ndx = (this.curPlayer.index + 1) % this.allPlayers.length;
    if (ndx != this.curPlayerNdx) this.endCurPlayer(this.curPlayer)
    this.curPlayerNdx = ndx;
    let lm = this.gamePlay.history[0], lms = !!lm? lm.toString(): ""
    let curPlayer = this.curPlayer = this.allPlayers[ndx], tn = this.turnNumber, capd = this.gamePlay.lastCaptured
    let info = { turn: tn+1, plyr: curPlayer.name, prev: lms, capd: capd, undo: this.gamePlay.undoRecs }
    console.log(stime(this, `.setNextPlayer ---------------`), info, '-----------------------------', !!this.stage.canvas);
    this.putButtonOnPlayer(curPlayer);
    this.turnNumber += 1;
    this.roundNumber = Math.floor((this.turnNumber - 1) / this.allPlayers.length) + 1
  }
  endCurPlayer(player: Player) {
    Dragger.stopDragable(this.dropStone) // whereever it landed
    let stone: Stone = this.nextHex.stone
    if (!!stone) {
      stone.parent.removeChild(stone)
      this.hexMap.update()
    }
  }
  putButtonOnPlayer(player: Player) {
    let stone = new Stone(player.color)
    Stone.onHex(stone, this.nextHex, this.hexMap.hexCont)
    this.makeDragable(stone)

    let color = otherColor(player.color)
    let attacks = this.hexMap.filterEachHex(hex => hex.isAttack(color)).map(h => h.Aname)
    console.log(stime(this, `.putButtonOnPlayer:${player.color}`), attacks)
    this.hexMap.update()
  }

  nextStone(stone: Stone, hex = this.nextHex) {
    Stone.onHex(stone, hex, this.hexMap.stoneCont)
    this.makeDragable(stone)
  }

  makeDragable(stone: Stone) {
    Dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
  }
  dragFunc(stone: Stone, ctx: DragInfo) {
    if (stone.color !== this.curPlayer.color) return
    if (ctx.first && this.nextHex.stone == stone) this.nextHex.stone = undefined  // remove 
    let pt = stone.parent.localToLocal(stone.x, stone.y, this.hexMap.hexCont)
    let x = pt.x, y = pt.y
    if (ctx.first) {
      this.hexMap.showMark()
    } else {
      let hex = this.hexMap.hexUnderPoint(x, y)
      if (!hex) return
      if (!!hex.captured) return
      if (!!hex.stone) return
      this.dropTarget = hex
      this.hexMap.showMark(hex)
    }
  }
  dropFunc(stone: Stone, ctx: DragInfo) {
    this.dropStone = stone
    let mark = this.hexMap.mark
    if (!mark.visible) return
    stone.x = mark.x
    stone.y = mark.y
    if (this.dropTarget === this.nextHex) return
    this.nextHex.stone = undefined
    this.dispatchEvent(new HexEvent(S.add, this.dropTarget, stone))
  }
  makeAllPlayers() {
    this.allPlayers = []
    this.allPlayers[0] = new Player(this, 0, stoneColors[0])
    this.allPlayers[1] = new Player(this, 1, stoneColors[1])
  }
  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }
  make7Districts(n: number) {
    let n2 = (n/2), k = (n % 2)
    this.makeDistrict(n, 1, 0*n2+0, 3*n2+k)  // 6: (0, 9)
    this.makeDistrict(n, 6, 2*n2+0, 0*n2+1)  // 6: (6, 1)
    this.makeDistrict(n, 2, 2*n2-1, 6*n2+0)  // 6: (5, 18)
    this.makeDistrict(n, 0, 4*n2-1, 3*n2+1)  // 6: (11, 10)
    this.makeDistrict(n, 5, 6*n2-1, 0*n2+2)  // 6: (17, 1)
    this.makeDistrict(n, 3, 6*n2-2, 6*n2+0)  // 6: (16, 17)
    this.makeDistrict(n, 4, 8*n2-2, 3*n2+1+k)  // 6: (22, 10)
  }
  districtHexAry: Array<Array<Hex>> = []
  makeDistrict(n: number, district: number, roff: number = 0, coff: number = 0) {
    let hexAry = []
    let row = n-1 + Math.floor(roff), col = 0 + Math.floor(coff), rp = Math.abs(row % 2)
    for (let dr = 0; dr < n; dr++) {
      let c0 = col + ((rp == 0) ? Math.floor(dr/2) : Math.ceil(dr/2))
      let len = (2*n - 1) - dr
      for (let dc = 0; dc < len; dc++) {
        hexAry.push(this.hexMap.addHex(row + dr, c0 + dc, district))
        if (dr !== 0) hexAry.push(this.hexMap.addHex(row - dr, c0 + dc, district))
      }
    }
    this.districtHexAry[district] = hexAry
  }

  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  /** makeScaleableBack and setup scaleParams 
   * @param bindkeys true if there's a GUI/user/keyboard
   */
  makeScaleCont(bindKeys: boolean, bgColor: string = TP.bgColor): ScaleableContainer {
    let scale = this.scaleParams.initScale = 0.324; // .125 if full-size cards
    /** scaleCont: a scalable background */
    let scaleC = new ScaleableContainer(this.stage, this.scaleParams);
    if (!!scaleC.stage.canvas) {
      Dragger.makeDragable(scaleC); // THE case where not "dragAsDispObj"
      scaleC.addChild(Dragger.dragCont); // so dragCont is in ScaleableContainer
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }    
    if (!!bgColor) {
      // specify an Area that is Dragable (mouse won't hit "empty" space)
      let background = new Shape();
      background.graphics.beginFill(bgColor).drawRect(0, 0, 2000, 2000);
      scaleC.addChildAt(background, 0);
      background.x = 0;
      background.y = 0;
      //console.log(stime(this, ".makeScalableBack: background="), background);
    }
    if (bindKeys) {
      this.bindKeysToScale(scaleC, 100, 0, scale)
      KeyBinder.keyBinder.dispatchChar("a")
    }
    return scaleC
  }
  bindKeysToScale(scaleC: ScaleableContainer, xos: number, yos: number, scale: number) {
    let xoff= scaleC.x, yoff = scaleC.y
    // set Keybindings to reset Scale:
    let resetScaleX = () => {
      scaleC.scaleContainer(0, {x: xoff, y: yoff}); // resetXY
      scaleC.stage.update();
    };
    let resetScale1 = () => {
      let ns = .244
      scaleC.scaleContainer(0, {x: xoff + xos*scale, y: yoff}); // resetXY
      scaleC.setScaleIndex(scaleC.findIndex(ns))
      scaleC.stage.update();
    };
    let resetScaleA = () => {
      let ns = .5
      scaleC.scaleContainer(0, {x: xoff + xos*scale, y: yoff - yos*scale}); // resetXY
      scaleC.setScaleIndex(scaleC.findIndex(ns))
      scaleC.stage.update();
    };
    // Scale-setting keystrokes:
    KeyBinder.keyBinder.globalSetKeyFromChar("x", { thisArg: this, func: resetScaleX });
    KeyBinder.keyBinder.globalSetKeyFromChar("z", { thisArg: this, func: resetScale1 });
    KeyBinder.keyBinder.globalSetKeyFromChar("a", { thisArg: this, func: resetScaleA });
  }
}