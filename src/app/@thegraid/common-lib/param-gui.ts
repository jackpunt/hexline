import { Container, Text } from "createjs-module";
import { F, DropdownChoice, DropdownItem, DropdownStyle, stime } from ".";

export type ParamType = any; // string | number | boolean
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

export class ParamLine extends Container {
  get height():number { return this.getBounds().height }
  get width(): number { return this.getBounds().width }
  chooser_w: number = 0 // width of chooser component
  chooser_x: number = 0 // where (on the line) to place chooser 
  chooser: DropdownChoice
  spec: ParamSpec
  nameText: Text
}

export class ParamGUI extends Container {
  constructor(target: object) {
    super()
    this.target = target
  }
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
  findLine(fieldName: string): ParamLine {
    return this.lines.find(pl => pl.spec.fieldName === fieldName)
  }
  setNameText(fieldName: string, name: string = fieldName): Text {
    let line = this.findLine(fieldName)
    if (!!line.nameText) line.removeChild(line.nameText)
    let spec = line.spec
    let text = new Text(name, F.fontSpec(spec.fontSize || 32, spec.fontName), spec.fontColor)
    line.addChild(text)
    line.nameText = text
    return text
  }
  addLine(spec: ParamSpec, nth: number) {
    let line = new ParamLine()
    line.spec = spec
    let y = 0
    this.lines.forEach(pl => y += pl.height)
    line.y = y + nth * this.lead
    this.lines.push(line) // so nameText can findLine()
    let text = this.setNameText(spec.fieldName)
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
  }

  addChooser(line: ParamLine) {
    let choices = line.spec.choices
    let boxh = line.height
    let ddc = new DropdownChoice(choices, line.chooser_w, boxh, line.spec.style)
    ddc.x = line.chooser_x // ddc.y = line.text.y = 0 relative to ParamLine, same as line.text
    line.chooser = ddc
    line.addChild(ddc)
    ddc.onItemChanged(!!line.spec.onChange ? line.spec.onChange : (item) => {this.setValue(item)})
    let fieldName = line.spec.fieldName, value = this.getValue(fieldName)
    this.selectValue(fieldName, value, line)
    ddc.enable()
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
  target: object = undefined
  /** return target[fieldName]; suitable for override */
  getValue(fieldName: string) {
    return this.target[fieldName]
  }
  /** update target[item.fieldname] = item.value; suitable for override */
  setValue(item: ParamItem): void {
    this.target[item.fieldName] = item.value
    //console.log(stime(this, `.setValue: TP.${item.fieldName} =`), TP[item.fieldName], item.value, {item: item})
  }
}
