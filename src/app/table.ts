import { Stage, EventDispatcher, Container, Shape } from "createjs-module";
import { map } from "rxjs";
import { C, Dir } from "./basic-intfs";
import { Dragger } from "./dragger";
import { GamePlay } from "./game-play";
import { Hex, HexMap } from "./hex";
import { KeyBinder } from "./key-binder";
import { ScaleableContainer } from "./scaleable-container";
import { TP } from "./table-params";

/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {

  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: Container
  hexMap: HexMap = new HexMap()
  /** default scaling-up value */
  upscale: number = 1.5;

  constructor(stage: Stage) {
    super();
    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    //this.makeScaleCont(!!stage.canvas)
    // bindKeys
    // make proto-District (with 37 Hexes), and 7 copies
    // link Districts 
  }

  scaleParams = { zscale: .20, initScale: .324, zero: 0.125, max: 30, limit: 2, base: 1.1, min: -2 };
  testoff: number = 1

  layoutTable(n: number = 4) {
    n = 6
    let n2 = (n/2), k = (n % 2)
    let rad = 50
    this.scaleCont = this.makeScaleCont(!!this.stage)
    let mapCont = new Container()
    this.scaleCont.addChild(mapCont)
    let circ = new Shape()
    circ.graphics.beginFill("rgb(230,230,230)").drawCircle((4.25*n)*rad, (4*n)*rad, 5*n*rad)
    mapCont.addChild(circ)
    this.hexMap = new HexMap(rad, mapCont)
    this.makeDistrict(n, 3, 0*n2+0, 3*n2+k)  // 6: (0, 9)
    this.makeDistrict(n, 2, 2*n2+0, 0*n2+1)  // 6: (6, 1)
    this.makeDistrict(n, 4, 2*n2-1, 6*n2+0)  // 6: (5, 18)
    this.makeDistrict(n, 0, 4*n2-1, 3*n2+1)  // 6: (11, 10)
    this.makeDistrict(n, 1, 6*n2-1, 0*n2+2)  // 6: (17, 1)
    this.makeDistrict(n, 5, 6*n2-2, 6*n2+0)  // 6: (16, 17)
    this.makeDistrict(n, 6, 8*n2-2, 3*n2+1+k)  // 6: (22, 10)
    this.stage.update()
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

  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  /** makeScaleableBack and setup scaleParams */
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
      background.graphics.beginFill(bgColor).drawRect(0, 0, 1600, 1600);
      scaleC.addChildAt(background, 0);
      background.x = 0;
      background.y = 0;
      //console.log(stime(this, ".makeScalableBack: background="), background);
    }
    if (bindKeys) {
      this.bindKeysToScale(scaleC, 1, 1, scale)
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
      let ns = .764
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