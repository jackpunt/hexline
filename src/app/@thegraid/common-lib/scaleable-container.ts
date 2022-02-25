import { Container, DisplayObject, Point, Matrix2D, Event } from 'createjs-module';
import { XY, S } from '.';

export type SC = ScaleableContainer

type ScaleParams = { zscale?: number, initScale?: number, zero?: number, base?: number, min?: number, max?: number, limit?: number }

export class ScaleEvent extends Event {
  constructor(type: string, scale: number, scaleNdx: number) {
    super(type, true, true)
    this.scale = scale
    this.scaleNdx = scaleNdx
  }
  scale: number;
  scaleNdx: number
}
/** ScalableContainer is a Container, implements transforms to scale the display.
 * Child elements can be scaled with the Container (addChild)
 * or remain a constant size even as the Container scales (addUnscaled)
 */
export class ScaleableContainer extends Container {
  transform?: Matrix2D; // not used
  initIndex: number = 1;

  /** 
    * Create a Container
    * then makeZoomable: so can Zoom/unZoom at the mouse-point
    * if there are interposed transforms, it may not work right.
    * @param parent If supplied: parent.addChild(this); [createjs.stage]
    */
  constructor(parent?: Container, params?: ScaleParams) {
    super(); // Container();
    // x0,y0 is used for reset (di==0)
    // also default zoom point; but mousezoom always supplies mousepoint
    this.name = "ScaleableContainer"
    if (parent) {
      parent.addChild(this);
      //console.log(stime(this, ".constructor parent="), parent);
    }
    this.initIndex = this.makeZoomable(params)
  }

  //scaleAry=[0.625,0.7875,1,1.250,1.5752961,2,2.5,3,4,5,6,8,10,13,16,20,25,32,40,50,64,80,101,127,160,202,254,321,404,509,641]
  // [ -3:0.5, -2:0.65, -1:0.8, 0:1.0, 1:1.26, ... 30:1026] 
  /** scale factor of  for each increment of zoom */
  private scaleAry: Array<number> = new Array();
  private scaleNdx: number = 0;
  private scaleMin: number = -3;       // 0.49990*zero
  private scaleMax: number = 30;       // 1025.92*zero
  private scaleBase: number = 1.26;
  private scaleZero: number = 1;       // scale to fit TerrainMap [640/1024 = .625]
  private scaleLimit: number = 1000;

  private stopEvent(ev) {
    // prevent window scrolling on WheelEvent
    ev.stopPropagation();
    ev.preventDefault();
    ev.returnValue = false;
    return false;
  }

  /** 
   * addEventListener for mousewheel and DOMMouseScroll to zoom to/from XY. 
   * @param zscale sensitivity to event.wheelDelta (.3)
   * @return initial {index, scale}
  */
  makeZoomable(params: ScaleParams = {}): number {
    let ndxScale = this.scaleInit(params);
    let zscale = params.zscale || .33; // slow down the zoom, require multiple events to change scale
    let contr = this
    let stage = contr.stage;
    let di: number = 0 // accumulate scroll increments
    let mouseWheelHandler = ((e: WheelEvent) => {
      let pmx: number = stage.mouseX / stage.scaleX;
      let pmy: number = stage.mouseY / stage.scaleY;
      let p: Point = new Point(pmx, pmy);
      let delta = -e.deltaY // +N or -N (N greater for faster scroll, zscale for slower)
      // noting that *I* have scroll reversed from Apply std of "drag the document"
      //console.log(stime(this, ".mouseWheelHandler e="), delta, e.deltaX, e.deltaZ, e);
      di += Math.sign(delta) * zscale
      let dj = Math.trunc(di)

      if (dj != 0) {
        contr.scaleContainer(dj, p);  // zoom in/out by dj
        di -= dj;
        stage.update();
      }
      return contr.stopEvent(e);
    });
    // createjs can get the "click" and "drag" events from mouse.
    // createjs does not access the "wheel" or "mousewheel" event
    // only comes from Element (ie HTMLElement; and HTMLCanvasElement in our case)
    let canvas = (stage.canvas as HTMLCanvasElement);
    if (!!canvas) canvas.addEventListener("wheel", mouseWheelHandler, false);
    return ndxScale
  }

  /** reset the zoom-scaling array: 
   * 
   * Note: unscaled objects *are* scaled when scaleNdx\<0 (if min\<0)
   * 
   * Note: unscaled objests are super-scaled (1.5x) when scaleNdx>(max-2)
   * @param params: {initScale = 1, zero: 0.625}
   * @param zero: default scale: 0.625
   * @param base: scale per increment: 1.26
   * @param min: lowest index: -3  (zero*base^(-min) =? ~1) ==> scaleAry[0] = ~1
   * @param max: highest index: 30 
   * @param limit: highest scale: 1000 
   * @return scaleIndex to scale to 1 (or close as possible)
   */
  public scaleInit(params: ScaleParams = {}): number {
    let { zero = 0.625, base = 1.26, min = -3, max = 30, limit = 1000, initScale = base } = params;
    //console.log(stime(this, ".scaleInit:  zero=") + zero + "  base=" + base + "  min=" + min + "  max=" + max + "  limit=" + limit);
    //console.log(stime(this, ".scaleInit: params=") + params.zero, params.base, params.min, params.max, params.limit)
    this.scaleAry = new Array();
    this.scaleNdx = 0;         // ndx==0 -> scale=base (not same as: initNdx -> initScale)
    this.scaleMin = min;
    this.scaleMax = max;
    this.scaleBase = base;
    this.scaleZero = zero;
    this.scaleLimit = limit;
    this.initIndex = this.findIndex(initScale, true)
    // console.log(stime(this, ".scaleInit: initIndex="), initIndex, this.scaleAry[initIndex],
    //   "\n  scaleAry=", this.scaleAry.map(x => M.decimalRound(x, 3)));
    this.scaleX = this.scaleY = zero;
    this.setScaleIndex(this.initIndex);
    return this.initIndex;
  }
  /** find scaleIndex that gets closest to scale
   * @param initScale the scale factor you want to get
   * @param setAry true to setup the scaleAry, false to simply query [default]
   * @return index that gets closest so given scale
   */
  findIndex(initScale: number, set: boolean = false) {
    let min = this.scaleMin, max = this.scaleMax, base = this.scaleBase, zero = this.scaleZero
    let initDist = 99999, initIndex = 1
    for (let i: number = min; i <= max; i++) {
      let s: number = zero * Math.pow(base, i);       // i=0 -> s=zero
      // if s>1 try round to int
      if (Math.abs(s - Math.round(s)) < .08 * s) s = Math.round(s); // use integral scale when close
      if (Math.abs(s - initScale) < initDist) {
        // find index with Scale closest to initScale.
        initIndex = i
        initDist = Math.abs(s - initScale)
      }
      if (set) this.scaleAry[i] = Math.min(s, this.scaleLimit);
    }
    return initIndex;
  }
  /** set scaleIndex & return associated scale factor */
  getScale(ndx: number = this.scaleNdx): number {
    ndx = Math.min(this.scaleMax, Math.max(this.scaleMin, ndx));
    return this.scaleAry[this.scaleNdx = ndx]; // Hmm... this.scaleX ???
  }
  /** add di to find new index into scale array 
   * @param di typically: -1, +1 (0 to return currentScale)
   */
  incScale(di: number): number {
    return this.getScale(this.scaleNdx + di);   // new scale
  }
  /** zoom to the scale[si] */
  setScaleIndex(si: number, p?: XY): void {
    let os = this.getScale();
    let ns = this.getScale(si);
    this.scaleInternal(os, ns, p);
  }
  /** Scale this.cont by the indicated scale factor around the given XY.
   * @param di: +1/-1 to increase/decrease scale; 0 to reset to scale0 @ XY
   * @param p:  scale around this point (so 'p' does not move on display) = {0,0}
   */
  scaleContainer(di: number, p?: XY): void {
    let os: number = this.getScale();   // current -> old / original scale
    let ns: number = this.incScale(di);
    if (di == 0) { os = 0; ns = this.getScale(this.initIndex) }
    this.scaleInternal(os, ns, p);
  }
  /** convert from os to ns; if os=0 then reset to ns 
   * unscaleObj all this._unscale objects.
   * @param os oldScale
   * @param ns newScale
   * @param p  fixed point around which to scale; default: (0,0) OR when os==0: reset to (x,y)
   */
  scaleInternal(os: number, ns: number, p?: XY): void {
    let sc = this;
    //console.log(stime(this, ".scaleInternal:"), cont, os, this.scaleNdx, ns);
    let px = (p ? p.x : 0);   // cont.x0 === 0
    let py = (p ? p.y : 0);   // Hmm: can we remove (x0,y0) and just use regXY to offset wrt stage?
    //console.log(stime(this, ".scaleInternal: p="), p);
    if (os == 0) {                  // special case to reset origin
      sc.x = px;
      sc.y = py;
    } else {                        // else: scale around given [mouse] point
      sc.x = (px + (sc.x - px) * ns / os);
      sc.y = (py + (sc.y - py) * ns / os);
    }
    sc.scaleX = sc.scaleY = ns;
    // console.log(stime(this, ".scaleInternal:   os="), os.toFixed(4)+" ns="+ns.toFixed(4)+" scale="+scale.toFixed(4)
    //                           +"  p.x="+p.x+"  p.y="+p.y+"  x="+x+" y="+y);
    this.invScale = 1 / ns;           // invScale is applied to all Unscaled children
    if (this.scaleNdx < 0) {
      this.invScale = 1 / this.scaleAry[0]; // ok to "shrink" icon when in negative scale range
    } else if (this.scaleNdx >= this.scaleMax - 1) {
      this.invScale = 1.5 / ns;        // zoom the icon when at full scale (last 2 stops)
    }
    //console.log(stime(this, ".invScale="), this.invScale, this.scaleNdx, ns*this.invScale);
    this.unscaleAll();
    if (ns != os)
      this.dispatchEvent(new ScaleEvent(S.scaled, ns, this.scaleNdx))
  }
  /** Scalable.container.addChild() */
  addChildXY(child: DisplayObject, x: number, y: number): DisplayObject {
    this.addChild(child);
    child.x = x;
    child.y = y;
    return child;
  }

  private invScale: number = 1.0;
  private _unscaled: Array<DisplayObject> = new Array<DisplayObject>(); // Set<DisplayObject>
  public addUnscaled(dobj: DisplayObject): void {
    this._unscaled.push(dobj);
    this.unscaleObj(dobj);
  }
  public removeUnscaled(dobj: DisplayObject): void {
    let ndx: number = this._unscaled.indexOf(dobj);
    if (ndx < 0) return;
    delete this._unscaled[ndx];
  }
  private unscaleObj(dobj: DisplayObject): void {
    if (dobj != null) {
      dobj.regX *= dobj.scaleX/this.invScale
      dobj.regY *= dobj.scaleY/this.invScale
      dobj.scaleX = this.invScale;
      dobj.scaleY = this.invScale;
    }
    //      var tm:Matrix = dobj.transform.matrix;
    //      tm.scale(invScale/tm.a, invScale/tm.d); // also scales tm.x, tm.y
    //      dobj.transform.matrix = tm;
  }
  private unscaleAll(): void {
    this._unscaled.forEach(item => this.unscaleObj(item));
  }
}
