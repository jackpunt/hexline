import { S, stime } from '@thegraid/common-lib';
import { IMove } from './move';
import { IPlanMsg, MsgArgs, MsgSimple, PlanData, MK, ReplyData, ReplyKey, ParamSet, ReplyArgs } from './plan-proxy';
import { Planner, SubPlanner } from './planner'
import { ILogWriter } from './stream-writer';
import { StoneColor, stoneColors, TP } from './table-params';
// importScripts ('MyWorker.js')
// https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers
// type of Worker: https://github.com/Microsoft/TypeScript/issues/20595#issuecomment-763604612

/** RPC 'stub' to invoke methods on given Planner */
class PlanWorker implements IPlanMsg {
  planner: SubPlanner
  get ll0() { return TP.log > 0 }
  get ll1() { return TP.log > 1 }
  constructor() {
    stime.anno = (obj) => { return ` ${this.annoColor}` }
  }
  async init() {
    this['Aname'] = `PlanWorker-${self['A_Random']}@${stime(this, '.init')}`
    self.addEventListener('message', (msg: MessageEvent<PlanData>) => { this.handleMsg(msg.data)})
  }
  annoColor: string = '?'

  /** send tuple of args */
  reply(verb: ReplyKey, ...args: ReplyArgs[]) {
    postMessage({verb, args} as ReplyData)
  }

  handleMsg(data: PlanData) {
    let { verb, args } = data
    this.ll1 && console.log(stime(this, `(${this.annoColor}).handleMsg:`), data) // [Object object]
    let func = this[verb]
    if (typeof func !== 'function') {
      console.warn(stime(this, `.handleMsg.ignore: ${verb}`), args)
    } else {
      func.call(this, ...args)
    }
  };

  /// Handle inbound command messages:

  /** make a Planner in Worker thread: HexMap(mh, nh) 
   * @param index show stoneColors[index] in the stime.anno
   */
  newPlanner(mh: number, nh: number, index: number) {
    let ident = MK.newPlanner           // new Planner(mh, nh, logWriter)
    this.annoColor = stoneColors[index] || `x${-index}`
    TP.fnHexes(mh, nh)
    let logWriter: ILogWriter = { writeLine: (text: string) => { this.reply(MK.logFile, text)}}
    /*this.ll0 &&*/ console.log(stime(this, `.${ident}:`), { mh, nh, index, logWriter, pPlaner: TP.pPlaner }) // [Object object]
    MK.newPlanner; this.planner = new SubPlanner(mh, nh, index % 2, logWriter)
    this[S.Aname] = `PlanWorker@${stime(this, `.${ident}(${this.annoColor})`)}`
    this.reply(MK.newDone, this.annoColor, this.planner.depth)
  }
  roboMove(run: boolean) {
    MK.roboMove; this.planner.roboMove(run)
  }
  makeMove(stoneColor: StoneColor, iHistory: IMove[], incb = 0) {
    MK.makeMove; let movePromise = this.planner.makeMove(stoneColor, iHistory, incb)
    movePromise.then(ihex => this.reply(MK.sendMove, ihex))
    return movePromise // ignored
  }
  log(...args: MsgArgs[])  {
    MK.log; console.log(stime(this, `.${MK.log}:`), ...args)
  }
  setParam(...args: ParamSet) {
    let [targetName, fieldName, value] = args
    if (targetName == 'Worker') return (this[fieldName] = value, undefined)// this.color --> stime.anno()
    // If we have a Planner, let *IT* setParams; Note: setParams may precede newPlanner [eg: (TP.log = 1)]
    if (this.planner) {
      MK.setParam; this.planner?.setParam(...args) 
    } else {
      TP.log > 0 && console.log(stime(this, `.setParam:`), ...args)
      if (targetName === 'TP') TP[fieldName] = value      
    }
  }
  pause():void { MK.pause; this.planner.pause() }
  resume(): void { MK.resume; this.planner.resume() }
  terminate(...args: MsgArgs[]) {
    this.ll0 && console.log(stime(this, `.handleMsg.terminate:`), args)
    MK.terminate; this.planner.terminate()
    MK.terminateDone; this.reply(MK.terminateDone)
  }
}

var A_Random = self['A_Random'] = Math.floor(Math.random()*100)
var A_PlanWorker = self['A_PlanWorker'] = new PlanWorker()
A_PlanWorker.init()

