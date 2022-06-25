import { className, DropdownStyle, ParamGUI, ParamItem, stime } from "@thegraid/easeljs-lib"
import { GamePlay } from "./game-play"
import { PlannerProxy } from "./plan-proxy"

/** ParamGUI that sends value changes via PlannerProxy -> PlanWorker */
export class ParamGUIP extends ParamGUI {
  constructor(target: object, style?: DropdownStyle, public gamePlay?: GamePlay) {
    super(target, style)
  }

  override setValue(item: ParamItem, target = this.target): void { 
    super.setValue(item, target)
    if (!this.gamePlay) return
    let targetName = target['name'] || className(target)
    console.log(stime(this, `.setValue`), `${targetName}[${item.fieldName}] = ${item.value}`)
    this.gamePlay.forEachPlayer(p => {
      let planner = p.planner
      if (planner instanceof PlannerProxy) {
        planner.setParam(targetName, item.fieldName, item.value)
      }
    })
  }
}