import { S, stime } from '@thegraid/common-lib';
import { IMove } from './move';
import { IPlanMsg, MsgArgs, MsgSimple, PlanData, MK, ReplyData, ReplyKey, ParamSet } from './plan-proxy';
import { Planner } from './planner'
import { ILogWriter } from './stream-writer';
import { StoneColor, stoneColors, TP } from './table-params';
// importScripts ('MyWorker.js')
// https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers
// type of Worker: https://github.com/Microsoft/TypeScript/issues/20595#issuecomment-763604612

/** RPC 'stub' to invoke methods on given Planner */
class PlanWorker implements IPlanMsg {
  planner: Planner
  get ll0() { return TP.log > 0 }
  get ll1() { return TP.log > 1 }
  constructor() {
    stime.anno = (obj) => { return ` ${this.color || '?'}` }
  }
  async init() {
    this['Aname'] = `PlanWorker-${self['A_Random']}@${stime(this, '.init')}`
    self.addEventListener('message', (msg: MessageEvent<PlanData>) => { this.handleMsg(msg.data)})
  }
  color: StoneColor

  /** send tuple of args */
  reply(verb: ReplyKey, ...args: MsgArgs[]) {
    postMessage({verb, args} as ReplyData)
  }

  handleMsg(data: PlanData) {
    let { verb, args } = data
    this.ll1 && console.log(stime(this, `(${this.color}).handleMsg:`), data) // [Object object]
    let func = this[verb]
    if (typeof func !== 'function') {
      console.warn(stime(this, `.handleMsg.ignore: ${verb}`), args)
    } else {
      func.call(this, ...args)
    }
  };

  /// Handle inbound messages:

  /** make a Planner in Worker thread: HexMap(mh, nh) 
   * @param index show stoneColors[index] in the stime.anno
  */
  newPlanner(mh: number, nh: number, index: number) {
    this.color = stoneColors[index]
    TP.fnHexes(mh, nh)
    let logWriter: ILogWriter = { writeLine: (text: string) => { this.reply(MK.logFile, text)}}
    this.ll0 && console.log(stime(this, `.newPlanner:`), { mh, nh, index, logWriter }) // [Object object]
    this.planner = new Planner(mh, nh, logWriter)
    this[S.Aname] = `PlanWorker@${stime(this, `.newPlanner(${this.color})`)}`
    this.reply(MK.newDone, this.color, this.planner.depth)
  }
  roboMove(run: boolean) {
    this.planner.roboMove(run)
  }
  makeMove(stoneColor: StoneColor, iHistory: IMove[], incb = 0) {
    let movePromise = this.planner.makeMove(stoneColor, iHistory, incb)
    movePromise.then(hex => this.reply(MK.move, hex.row, hex.col, hex.Aname))
    return movePromise // ignored
  }
  log(...args: MsgArgs[])  {
    console.log(stime(this, `.handleMsg.log:`), ...args)
  }
  setParam(...args: ParamSet) {
    let [targetName, fieldName, value] = args
    this.ll0 && console.log(stime(this, `.setParam:`), ...args)
    if (targetName === 'TP') TP[fieldName] = value
  }
  terminate(...args: MsgArgs[]) {
    this.ll0 && console.log(stime(this, `.handleMsg.terminate:`), args)
  }
}

var A_Random = self['A_Random'] = Math.floor(Math.random()*100)
var A_PlanWorker = self['A_PlanWorker'] = new PlanWorker()
A_PlanWorker.init()

