import { stime, className } from "@thegraid/common-lib";
import { IMove, GamePlay, Move } from "./game-play";
import { Hex } from "./hex";
import { StoneColor, TP } from "./table-params";

export type PlanData = {
  verb: string,
  args: (string | number | boolean | IMove[])[]
}
export type IPlanner = {
  /** enable Planner to continue searching */
  roboMove(run: boolean): void;
  /** provoke Planner to search for next Move */
  makeMove(stoneColor: StoneColor, history: IMove[]): Promise<Hex>;
}
export class PlannerProxy implements IPlanner {
  worker: Worker 
  get ll0() { return TP.log > 0 }

  constructor(public gamePlay: GamePlay, private index: number, private colorn: string) {
    this.ll0 && console.log(stime(this, `(${this.colorn}).newPlannerProxy:`), { index, colorn })
    this.worker = this.makeWorker()
    this.worker['Aname'] = `Worker-${colorn}`
    this.postMessage(`.makeWorker`, 'log', 'made worker for:', this.colorn)
    this.ll0 && console.log(stime(this, `(${this.colorn}).newPlannerProxy:`), { worker: this.worker })
    //setTimeout(() => {this.initiate()})
    this.initiate()
  }
  // async to enable debugger to step-into
  makeWorker() {
    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('./plan.worker', import.meta.url));
      worker.onmessage = (msg) => { this.onMessage(msg) }
      worker.onerror = (err) => { this.onError(err) }
      return worker
    } else {
      // Web Workers are not supported in this environment.
      alert(`ProxyPlanner: Worker not defined!`) // TODO: fallback to non-proxy Planner...
    }
    return undefined
  }
  initiate() {
    this.ll0 && console.log(stime(this, `(${this.colorn}).initiate:`), this.worker)
    let hexm = this.gamePlay.hexMap
    this.postMessage(`.initiate-new:`, 'newPlanner', hexm.mh, hexm.nh, this.index)
    this.postMessage('.initiate-log:', 'log', `initiate:`, this.colorn, this.index);
    this.postMessage(`.initiate-set:`, 'setParam', 'TP', 'yieldMM', 300); TP.yieldMM // TP.yieldMM = 300
  }

  terminate() {
    this.ll0 && console.log(stime(this, `.terminate:`), this.worker)
    this.postMessage(`.terminate:`, 'terminate')
    setTimeout(() => this.worker.terminate())
  }

  roboMove(run: boolean) {
    this.ll0 && console.log(stime(this, `(${this.colorn}).roboMove: run =`), run)
    this.postMessage(`.roboMove:`, 'roboMove', run)
  }
  setParam(target: object, fieldName: string, value: (string | number | boolean)) {
    let targetName = target['name'] || className(target)
    this.ll0 && console.log(stime(this, `(${this.colorn}).setParam:`), {targetName, fieldName, value})
    this.postMessage(`.setParam`, 'setParam', targetName, fieldName, value)
  }

  filHex: (hex: Hex) => void
  rejHex: (arg: any) => void
  makeMove(stoneColor: StoneColor, history: Move[]): Promise<Hex> {
    let iHistory = history.map((m) => m.toIMove)
    // TODO: marshal iHistory to a [Transferable] bytebuffer [protobuf?]
    this.ll0 && console.log(stime(this, `(${stoneColor}).makeMove: iHistory =`), iHistory)
    this.postMessage(`.makeMove:`, 'makeMove', stoneColor, iHistory )
    return new Promise<Hex>((fil, rej) => {
      this.filHex = fil
      this.rejHex = rej
    })
  }

  parseMessage(data: PlanData) {
    this.ll0 && console.log(stime(this, `.parseMessage:`), data)
    let { verb, args } = data
    switch (verb) {
      case 'ready':
        break;
      case 'move':
        let [row, col, Aname] = args as [number, number, string]
        let hex = Hex.ofMap({row, col, Aname}, this.gamePlay.hexMap)
        this.ll0 && console.log(this, `.move:`, hex)
        this.filHex(hex)
        break;
    }
  }  

  onMessage(msg: MessageEvent<PlanData>) {
    this.parseMessage(msg.data)
  }
  onError(err: ErrorEvent) {
    console.error(stime(this, `.onError:`), err)
  }

  // postMessage(message: any, transfer: Transferable[]): void;
  // postMessage(message: any, options?: StructuredSerializeOptions): void;
  async postMessage(ident: string, verb: string, ...args: (string | number | boolean | IMove[] | (string|number|boolean)[])[]) {
    let data = {verb, args}
    this.ll0 && console.log(stime(this, `(${this.colorn})${ident} Post:`), {verb: data.verb}, data.args)
    this.worker.postMessage(data)
  }
}