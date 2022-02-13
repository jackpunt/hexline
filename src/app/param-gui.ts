import { Container, Text } from "createjs-module";
import { DropdownChoice, DropdownItem, DropdownStyle } from "./dropdown";
import { TP } from "./table-params";
import { F } from "./basic-intfs";
import { stime } from './types';

type ParamType = any; // string | number | boolean
/** Supplied by user */
export interface ParamOpts {
  fontName?: string
  fontSize?: number
  fontColor?: string
  style?: DropdownStyle
  onChange?: (item: ParamItem) => void
}
/** Created by ParamGUI */
export interface ParamSpec extends ParamOpts {
  fieldName: string
  type?: string // boolean, string, string[], number,  ? (not used!?)
  chooser?: DropdownChoice // or other chooser...
  choices?: ParamItem[]
}
export interface ParamItem extends DropdownItem {
  text: string
  fieldName?: string
  value?: ParamType
  bgColor?: string
}
// in each Item: {[button:DropdownButton], text: string, fieldName: string, value: ParamType}
// when onItemChanged: TP[fieldName] = value

class ParamLine extends Container {
  get height():number { return this.getBounds().height }
  get width(): number { return this.getBounds().width }
  chooser_w: number = 0 // width of chooser component
  chooser_x: number = 0 // where (on the line) to place chooser 
  chooser: DropdownChoice
  spec: ParamSpec
}

export class ParamGUI extends Container {
  specs: ParamSpec[]
  lines: ParamLine[] = []
  linew: number = 0 // max line.text.width
  lineh: number = 0 // max line.text.height
  lead: number = 10 // y-space between lines

  makeLines(specs: ParamSpec[]) {
    this.specs = specs
    specs.forEach(this.addLine, this)
    //this.lines.forEach((line, nth) => this.addChooser(line, specs[nth].choices, nth), this)
  }

  addLine(spec: ParamSpec, nth: number) {
    let line = new ParamLine()
    line.spec = spec
    let y = 0
    this.lines.forEach(pl => y += pl.height)
    line.y = y + nth * this.lead
    let text = new Text(spec.fieldName, F.fontSpec(spec.fontSize || 32, spec.fontName), spec.fontColor)
    line.addChild(text)
    this.addChild(line)
    let width = text.getMeasuredWidth()
    let height = text.getMeasuredLineHeight()     
    this.linew = Math.max(this.linew, width) // width of longest text
    this.lineh = Math.max(this.lineh, height) // height of tallest text in all lines... ?

    let fs = spec.fontSize || 32
    let maxw = DropdownChoice.maxItemWidth(spec.choices, fs, spec.fontName)
    line.chooser_w = maxw + 1.5*fs // text_width, some space, Arrow
    line.chooser_x = 0 - line.chooser_w - .5*fs
    this.addChooser(line)
    this.lines.push(line)
  }

  addChooser(line: ParamLine) {
    let choices = line.spec.choices
    let boxh = line.height
    let ddc = new DropdownChoice(choices, line.chooser_w, boxh, line.spec.style)
    ddc.x = line.chooser_x // ddc.y = line.text.y = 0 relative to ParamLine, same as line.text
    line.chooser = ddc
    line.addChild(ddc)
    ddc.onItemChanged(line.spec.onChange || this.setTableParam)
    let fieldName = line.spec.fieldName
    this.selectValue(fieldName, TP[fieldName], line)
    ddc.enable()
  }
  findLine(fieldName: string): ParamLine {
    return this.lines.find(pl => pl.spec.fieldName === fieldName)
  }
  /** suitable entry-point for eval_params: (fieldName, value) */
  selectValue(fieldName: string, value: ParamType, line?: ParamLine): ParamItem | undefined {
    line = line || this.findLine(fieldName)
    if (!line) { return null }  // fieldName not available
    // invalid value selects *current* value:
    let choice = line.spec.choices.find(item => (item.value === value))
    if (!choice) { return undefined } // value not available
    line.chooser.select(choice) // will auto-invoke onItemChanged => setTableParam
    return choice
  }

  /** update TP[item.fieldname] = item.value */
  setTableParam(item: ParamItem) {
    TP[item.fieldName] = item.value
    //console.log(stime(this, `.setTableParam: TP.${item.fieldName} =`), item.value, {item: item})
  }
}
