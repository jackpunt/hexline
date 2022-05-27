import { className, DropdownStyle, ParamGUI, ParamItem, stime } from "@thegraid/easeljs-lib"
import { GamePlay } from "./game-play"
import { PlannerProxy } from "./plan-proxy"

export class ParamGUIy extends ParamGUI {
  /** until supplied by ParamGUI */
  get ymax() { 
    let y = 0
    this.lines.forEach(line => y += (line.height + this.lead))
    return y
  }
}
/** ParamGUI that updates PlannerProxy -> PlanWorker */
export class ParamGUIP extends ParamGUIy {
  constructor(target: object, style?: DropdownStyle, public gamePlay?: GamePlay) {
    super(target, style)
  }

  override setValue(item: ParamItem, target = this.target): void { 
    super.setValue(item, target)
    if (!this.gamePlay) return
    console.log(stime(this, `.setValue`), `${target['name'] || className(target)}[${item.fieldName}] = ${item.value}`)
    this.gamePlay.forEachPlayer(p => {
      let planner = p.planner
      if (planner instanceof PlannerProxy) {
        planner.setParam(target, item.fieldName, item.value)
      }
    })
  }
}