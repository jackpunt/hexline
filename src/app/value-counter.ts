import { Container, Event, Shape, Text, Point, EventDispatcher } from 'createjs-module';
import { XY, S, C, F } from './basic-intfs';

/** send a simple value of type to target. */
export class ValueEvent extends Event {
  value: number | string ;
  constructor(type: string, value: number | string) {
    super(type, true, true);
    this.value = value;
  }
  /** dispatch ValueEvent via target */
  static dispatchValueEvent(target: EventDispatcher, type: string, value: number | string): boolean {
    return target.dispatchEvent(new ValueEvent(type, value));
  }
}
/** Text in a colored circle, possibly with a lable */

export class ValueCounter extends Container {

  color: string;
  text: Text;
  textColor: string = C.black; // or "undefined" ?
  shape: Shape;
  value: number | string;
  /** width of curently displayed ellipse */
  wide: number = 0; // and cache indicator

  /** height of curently displayed ellipse */
  high: number;
  /** font size in px */
  fontSize: number = 16;
  fontName: string = S.defaultFont;
  fontSpec: string = F.fontSpec(this.fontSize, this.fontName);
  label: Text;
  labelFontSize: number = 16;


  constructor(name: string, initValue: number | string = 0, color: string = C.coinGold, fontSize: number = 16, fontName: string = S.defaultFont) {
    super();
    this.name = name;
    this.mouseEnabled = false;
    this.mouseChildren = false;
    this.setValue(initValue, color, fontSize, fontName);
  }

  /** repaint shape and text with new color/size/font.
   * Invoked by supplying extra args to setValue().
   */
  private setFont(newColor: string, fontSize: number, fontName: string) {
    if (newColor)
      this.color = newColor;
    if (fontSize)
      this.fontSize = fontSize;
    if (fontName)
      this.fontName = fontName;
    this.fontSpec = F.fontSpec(this.fontSize, this.fontName);
    this.wide = -1; // provoke newShape()
  }

  /**
   *
   * @param value string to display near value
   * @param offset from center of text to origin of oval
   * @param fontSize
   */
  setLabel(value: string | Text, offset: XY = { x: 0, y: this.high / 2 }, fontSize = 8) {
    let label: Text = (typeof (value) === "string")
      ? new Text("" + value, F.fontSpec(fontSize, this.fontName))
      : (value as Text);
    this.label = label;
    let width = label.getMeasuredWidth();
    //let height = label.getMeasuredLineHeight()
    label.x = offset.x - (width / 2);
    label.y = offset.y + 1;
    this.addChild(label);
  }

  /** return width, height and text  */
  static ovalSize(value: number | string | Text,
    fontSpec: string = F.fontSpec(16),
    textColor: string = C.black): { width: number; height: number; text: Text; } {
    let text: Text = (value as Text);
    if (!(text instanceof Text)) {
      text = new Text("" + (value as number | string), fontSpec, textColor);
    }
    let width = text.getMeasuredWidth();
    let height = text.getMeasuredLineHeight();
    let high = height * 1.2;
    let wide = Math.max(width * 1.3, high);
    let rv = { width: wide, height: high, text: text };
    text.x = 0 - (width / 2);
    text.y = 1 - (height / 2); // -1 fudge factor, roundoff?
    return rv;
  }
  /** drawEllipse: wide X high, centered at 0,0  */
  static makeOval(color: string, high: number, wide: number): Shape {
    let shape: Shape = new Shape();
    shape.graphics.beginFill(color).drawEllipse(0, 0, wide, high);
    shape.regX = wide / 2; //at center of ellipse
    shape.regY = high / 2;
    shape.x = shape.y = 0;
    return shape;
  }
  /** remove and nullify text, remove and replace Oval & label. */
  private newShape(wide: number, high: number) {
    // make new Shape and Size:
    this.removeAllChildren();
    this.text = undefined;
    this.high = high;
    this.wide = wide;
    this.shape = ValueCounter.makeOval(this.color, high, wide);
    this.addChild(this.shape);
    if (!!this.label)
      this.addChild(this.label);
  }
  getValue(): number | string {
    return this.value;
  }
  /** display new value, possilby new color, fontsize, fontName */
  setValue(value: number | string, color?: string, fontSize?: number, fontName?: string) {
    this.value = value;
    if (color || fontSize || fontName)
      this.setFont(color, fontSize, fontName);
    // use more legible text on the dark/solid Player colors:
    this.textColor = C.black;
    let { width, height, text } = ValueCounter.ovalSize(value, this.fontSpec, this.textColor);
    if ((width > this.wide) || (width < this.wide * .9)) {
      this.newShape(width, height);
    }
    if (this.text)
      this.removeChild(this.text); // remove previous text entity
    this.text = text;
    this.addChild(text); // at top of list
  }

  updateValue(value: number | string) {
    this.setValue(value);
    //this.parent.setChildIndex(this, this.parent.numChildren -1)
    this.stage.update();
  }

  /**
   * add this ValueCounter to given Container with offsets, listening to target for [Value]Event of type.
   * @param cont likely an overCont
   * @param offest where on cont to place graphic
   * @param target EventDispatcher to listen for updates
   * @param type? type of Event to listen for valf (undefined -> no listener)
   * @param valf? function to extract value from ValueEvent
   */
  attachToContainer(cont: Container, offset: XY = { x: 0, y: 0 }, target?: EventDispatcher, type?: string, valf?: ((ve: Event) => number | string)) {
    cont.addChild(this);
    this.x = offset.x;
    this.y = offset.y;
    if (!!target && !!type) {
      let valff = valf || ((ve: ValueEvent) => ve.value as string | number);
      target.on(type, ((ve: Event) => this.updateValue(valff(ve))), this)[S.aname] = "counterValf";
    }
  }
}
