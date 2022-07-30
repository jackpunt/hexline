import { C } from "@thegraid/common-lib"
import { BoolChoice, ChoiceItem, ChoiceStyle, Chooser, DropdownButton, DropdownChoice, DropdownItem, DropdownStyle, EditBox, KeyBinder, ParamItem, ParamLine, TextStyle } from "@thegraid/easeljs-lib"
import { Stone } from "./table"
import { stoneColors } from "./table-params"

/** no choice: a DropdownChoice with 1 mutable item that can be set by setValue(...) */
export class NC extends DropdownChoice {
  static style(defStyle: DropdownStyle) {
    let baseStyle = DropdownButton.mergeStyle(defStyle)
    let pidStyle = { arrowColor: 'transparent', textAlign: 'right' }
    return DropdownButton.mergeStyle(pidStyle, baseStyle)
  }
  constructor(items: DropdownItem[], item_w: number, item_h: number, defStyle?: DropdownStyle) {
    super(items, item_w, item_h, NC.style(defStyle))
  }
  /** never expand */
  override rootclick(): void {}

  override setValue(value: string, item: ParamItem, target: object): boolean {
    item.value = value // for reference?
    this._rootButton.text.text = value
    return true
  }
}

/** Chooser with an EditBox */
export class EBC extends Chooser {
  editBox: EditBox;
  constructor(items: ChoiceItem[], item_w: number, item_h: number, style?: ChoiceStyle & TextStyle) {
    super(items, item_w, item_h, style)
    style && (style.bgColor = style.fillColor)
    style && (style.textColor = C.BLACK)
    this.editBox = new EditBox({ x: 0, y: 0, w: item_w, h: item_h * 1 }, style)
    this.addChild(this.editBox)
    let scope = this.editBox.keyScope
    KeyBinder.keyBinder.setKey('M-v', { func: this.pasteClipboard, thisArg: this }, scope)
  }
  pasteClipboard(arg?: any) {
    let paste = async () => {
      let text = await navigator.clipboard.readText()
      this.editBox.setText(text)
    }
    paste()
  }

  override setValue(value: any, item?: ChoiceItem, target?: object): boolean {
    this.editBox.setText(value)
    return true
  }
}

/** like StatsPanel: read-only output field */
export class PidChoice extends NC {
  readonly playerStone: Stone = new Stone()
  paintStone(pid: number) {
    let stone = this.playerStone
    stone.paint(stoneColors[pid])
    stone.visible = true
    if (!stone.parent) {
      let line = this.parent as ParamLine
      stone.scaleX = stone.scaleY = (line.height-2)/Stone.height/2
      stone.x = stone.scaleY * Stone.height + 1
      stone.y = line.height / 2
      this.addChild(stone)
    }
  }
  override setValue(value: any, item: ParamItem, target: object) {
    //target[item.fieldName] = item.value
    this.paintStone(item ? item.value : "   ") // do NOT set any fieldName/value
    return false
  }
}

/** present [false, true] with any pair of string: ['false', 'true'] */
export class BC extends BoolChoice {}
