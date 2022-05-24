import { S, stime } from '@thegraid/common-lib';
import { IMove } from './game-play';
import { PlanData } from './plan-proxy';
import { Planner } from './planner'
import { StoneColor, TP } from './table-params';
// importScripts ('MyWorker.js')
// https://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers
// type of Worker: https://github.com/Microsoft/TypeScript/issues/20595#issuecomment-763604612

/** RPC 'stub' to invoke methods on given Planner */
class PlanWorker {
  planner: Planner
  get ll0() { return TP.log > 0 }
  get ll1() { return TP.log > 1 }
  constructor() {}
  async init() {
    this['Aname'] = `${self['A_Instance']}init@${stime(this, '.init')}`
    self.addEventListener('message', (msg: MessageEvent<PlanData>) => { this.handleMsg(msg)})
  }
  get color() { return this.planner?.myStoneColor || '?' }

  handleMsg(msg: MessageEvent<PlanData>) {
    // QQQ: how to get Transferable[]
    let { verb, args } = msg.data
    this.ll1 && console.log(stime(this, `(${this.color}).handleMsg:`), msg.data) // [Object object]
    //debugger;
    switch (verb) {
      case 'newPlanner':
        let [mh, nh, index] = args as number[] // presumably gamePlay was marked 'Transferable'
        TP.fnHexes(nh, mh)
        // this.planner.gamePlay.hexMap.mh
        this.ll0 && console.log(stime(this, `.newPlanner:`), {mh, nh, index}) // [Object object]
        this[S.Aname] = `newPlanner@${stime(this, `.newPlanner(${index})`)}`
        this.planner = new Planner(mh, nh, index)
        this.reply('ready', this.color, this.planner.depth)
        break;
      case 'roboMove':
        this.planner.roboMove(args[0] as boolean)
        break;
      case 'makeMove':
        let [ stoneColor, iHistory ] = args as [ StoneColor, IMove[] ]
        let movePromise = this.planner.makeMove(stoneColor, iHistory)
        movePromise.then(hex => this.reply('move', hex.row, hex.col, hex.Aname))
        break;
      case 'log':
        console.log(stime(this, `.handleMsg.log:`), ...args)
        break;
      case 'setParam':
        let [targetName, fieldName, value] = args as [string, string, (string | number | boolean)]
        this.ll0 && console.log(stime(this, `.setParam:`), args)
        if (targetName === 'TP') TP[fieldName] = value
        break;
      case 'terminate':
        this[S.Aname] = `terminate@${stime(this, `.terminate`)}`
        this.ll0 && console.log(stime(this, `.handleMsg.terminate: ${verb}`), args)
        break;
      default:
        console.warn(stime(this, `.handleMsg.default: ${verb}`), args)
        //this.planner[verb](...args)
    }
  };
  /** send tuple of args */
  reply(verb: string, ...args: (string | number | boolean)[]) {
    postMessage({verb, args})
  }

}
stime.anno = (obj) => {
  return ` ${A_PlanWorker.color}`
}
var A_Instance = self['A_Instance'] = Math.floor(Math.random()*100)
var A_PlanWorker = self['A_PlanWorker'] = new PlanWorker()
A_PlanWorker.init()

