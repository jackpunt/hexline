import { Stage, EventDispatcher, Container, Shape } from "createjs-module";
import { C, S } from "./basic-intfs";
import { Dragger, DragInfo } from "./dragger";
import { GamePlay, Player } from "./game-play";
import { Hex, HexMap } from "./hex";
import { HexEvent } from "./hex-event";
import { KeyBinder } from "./key-binder";
import { ScaleableContainer } from "./scaleable-container";
import { TP } from "./table-params";
import { stime } from "./types";

export class Stone extends Shape {
  static radius: number = 50
  static height: number = Stone.radius*Math.sqrt(3)/2
  color: string;
  constructor(cont: Container, x: number, y: number, color: string, radius: number = Stone.height) {
    super()
    this.color = color
    this.graphics.beginFill(color).drawCircle(0, 0, radius-1)
    this.x = x; this.y = y
    cont.addChild(this)
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
  nextStone: Stone
  nextHex: Hex = new Hex("grey", Stone.radius, undefined, undefined, {x: 150, y: 150})

  allPlayers: Player[] = [];
  getNumPlayers(): number { return this.allPlayers.length; }
  curPlayerNdx: number = 0;
  curPlayer: Player;

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
    mapCont.addChild(this.nextHex)  // single Hex to hold a Stone to play

    this.hexMap = new HexMap(radius, mapCont)
    this.gamePlay.hexMap = this.hexMap
    this.make7Districts(4)

    this.makeAllPlayers()
    this.setNextPlayer(0)   // make a placeable Stone for Player[0]

    this.on(S.add, this.gamePlay.addStone, this.gamePlay)[S.aname] = "addStone"
    this.on(S.remove, this.gamePlay.removeStone, this.gamePlay)[S.aname] = "removeStone"
    this.stage.update()
  }
  setNextPlayer(ndx: number = -1) {
    if (ndx < 0) ndx = (this.curPlayer.index + 1) % this.allPlayers.length;
    if (ndx != this.curPlayerNdx) this.endCurPlayer(this.curPlayer)
    this.curPlayerNdx = ndx;
    let curPlayer = this.curPlayer = this.allPlayers[ndx], tn = this.turnNumber, lm = this.gamePlay.moveHist[tn];
    console.log(stime(this, `.setNextPlayer ---------------`), { round: this.roundNumber, turn: tn+1, plyr: curPlayer.name, prev: (!!lm) ? lm.toString() : "" }, '-------------------------------------------------', !!this.stage.canvas);
    this.putButtonOnPlayer(curPlayer);
    this.turnNumber += 1;
    this.roundNumber = Math.floor((this.turnNumber - 1) / this.allPlayers.length) + 1
  }
  endCurPlayer(player: Player) {
    
  }
  putButtonOnPlayer(player: Player) {
    this.newStone(player)
  }

  newStone(plyr: Player) {
      let stone = new Stone(this.hexMap.cont, this.nextHex.x, this.nextHex.y, plyr.color)
      plyr['stone'] = stone
      Dragger.makeDragable(stone, this, this.dragFunc, this.dropFunc)
  }
  dragFunc(stone: Stone, ctx: DragInfo) {
    if (stone.color !== this.curPlayer.color) return
    let pt = stone.parent.localToLocal(stone.x, stone.y, this.hexMap.cont)
    let x = pt.x, y = pt.y
    if (ctx.first) {
      this.hexMap.showMark()
    } else {
      let hex = this.hexMap.hexUnderPoint(x, y)
      if (!hex) return
      this.dropTarget = hex
      this.hexMap.showMark(hex)
    }
  }
  dropFunc(stone: Stone, ctx: DragInfo) {
    let mark = this.hexMap.mark
    if (!mark.visible) return
    stone.x = mark.x
    stone.y = mark.y
    if (this.dropTarget === this.nextHex) return
    this.dispatchEvent(new HexEvent(S.add, this.dropTarget))
    Dragger.stopDragable(stone)
    this.setNextPlayer()
  }
  makeAllPlayers() {
    this.allPlayers = []
    this.allPlayers[0] = new Player(this, 0, C.black)
    this.allPlayers[1] = new Player(this, 1, C.white)
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
  makeDistrict(n: number, district: number, roff: number = 0, coff: number = 0) {
    let row = n-1 + Math.floor(roff), col = 0 + Math.floor(coff), rp = Math.abs(row % 2)
    for (let dr = 0; dr < n; dr++) {
      let c0 = col + ((rp == 0) ? Math.floor(dr/2) : Math.ceil(dr/2))
      let len = (2*n - 1) - dr
      for (let dc = 0; dc < len; dc++) {
        this.hexMap.addHex(row + dr, c0 + dc, district)
        if (dr !== 0) this.hexMap.addHex(row - dr, c0 + dc, district)
      }
    }
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
      KeyBinder.keyBinder.dispatchChar("z")
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