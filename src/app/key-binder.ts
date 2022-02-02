import { DisplayObject, EventDispatcher, Shape } from 'createjs-module';
import { C, S } from './basic-intfs';
import { stime } from './types';

// An injected singleton
/**
 * Must insert code into app.components.ts 
 * which will instantiate a KeyBinder, and use @HostListener to forward keyboard events.
 * 
  constructor(private keyBinder: KeyBinder) { }

  // app.component has access to the 'Host', so we use @HostListener here
  // Listen to all Host events and forward them to our internal EventDispatcher
  @HostListener('document:keyup', ['$event'])
  @HostListener('document:keydown', ['$event'])
  @HostListener('mouseenter', ['$event'])
  @HostListener('mouseleave', ['$event'])
  @HostListener('focus', ['$event'])
  @HostListener('blur', ['$event'])
  dispatchAnEvent(event) {
    //console.log(stime(this), "dispatch: "+event.type);
    this.keyBinder.dispatchEvent(event);
  }
 *
 * and in app.modules.ts: 

 providers: [
    KeyBinder,
  ],

 *
 */

type KeyBits = { shift?: boolean, ctrl?: boolean, meta?: boolean, alt?: boolean, keyup?: boolean }
type BindFunc = (arg?: any, e?: KeyboardEvent) => void
/** 
 * kcode is bound to Binding, invokes: func.call(scope, argVal, event) 
 */
export type Binding = { thisArg?: object, func: BindFunc, argVal?: any }

/** EventDispatcher with keybinding (key->func(e)) */
export class KeyBinder extends EventDispatcher {
  static keyBinder: KeyBinder;
  constructor() {
    super()
    this.keymap = Array<Binding>()
    this.keymap["scope"] = "global"
    this.initListeners();
    console.log(stime(this, ".constructor KeyBinder.keyBinder = "), this );
    KeyBinder.keyBinder = this
  }

  // global map from e.keyCode to Binding {thisArg, func, argval} 
  private keymap: Binding[];
  private focus: DisplayObject; // target for localSetKey bindings (adds _keymap field)

  /**
   * Convert shift indicators to binary-mapped number.
   * Extend numeric keycode with SHIFT, CTRL, META, ALT, KEYUP bits
   * @param kcode unicode(char) 
   * @param bits KeyBits
   * @returns kcode with higher order bits possibly set
   */
  getKeyCode(kcode: number, bits: KeyBits = {}): number {
    const SHIFT: number = 512;
    const CTRL: number = 1024;
    const META: number = 2048;
    const ALT: number = 4096;
    const KEYUP: number = 8192;

    return kcode
      | (bits.shift ? SHIFT : 0)
      | (bits.ctrl ? CTRL : 0)
      | (bits.meta ? META : 0)
      | (bits.alt ? ALT : 0)
      | (bits.keyup ? KEYUP : 0);
  }

  /**
   * setting modifier values for key binding: keyup-ctrl-alt-meta-shift char 
   * x or X for shift.
   * @param str "^-C-A-M-X" or "^-C-A-M-x" (in that order, for other bits)
   * @return keyCode of "X" with indicated shift-bits added in.
   */
  getKeyCodeFromChar(str: string): number {
    const UPPER = /[A-Z]/; const LOWER = /[a-z]/
    let obj: KeyBits = {}
    if (str.startsWith("^-")) {
      obj.keyup = true; str = str.substring(2);
    }
    if (str.startsWith("C-")) {
      obj.ctrl = true; str = str.substring(2);
    }
    if (str.startsWith("M-")) {
      obj.meta = true; str = str.substring(2);
    }
    if (str.startsWith("A-")) {
      obj.alt = true; str = str.substring(2);
    }
    let char: string = str.charAt(0); // Assert: a single [ASCII/utf8] char in the string
    if (UPPER.exec(char)) {
      obj.shift = true;
    } else if (LOWER.exec(char)) {
      char = char.toUpperCase();
    }
    return this.getKeyCode(char.charCodeAt(0), obj); // numeric unicode for char (OR key)
  }
  // if you want to replace deprecated e.keycode:
  static key_keyCode = {
    Bel: 7, Backspace: 8, Tab: 9, Enter: 13, Control: 17, Shift: 16, AltLeft: 18, AltRight: 19, 
    Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    MetaLeft: 91, MetaRight: 93 } // '[' : 219
  getKeyCodeFromEvent(e: KeyboardEvent): number {
    // Shift-down = 528 = 16 + 512 (because e.shiftKey is set on keydown)
    // Shift-up = 8208 = 16 + 8192 (because e.keyup)
    // Use key name; but use numeric code for non-char keys: "Shift", "Enter" or whatever
    let key = e.key, kcode = (key.length == 1) ? this.getKeyCodeFromChar(key) : e.keyCode
    let keycode = this.getKeyCode(
      kcode, {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      alt: e.altKey,
      keyup: (e.type == "keyup")
    });
    return keycode
  }

  _bindKey(keymap: object, kcode: number, bind: Binding) {
    //console.log(stime(this, "_bindKey: "), { kcode: kcode, func: bind, scope: keymap["scope"] });
    if (typeof (bind.func) == 'function') {
      keymap[kcode] = bind
    } else if (!!bind.func) {
      let msg = "KeyBinder.globalSetKey: unrecognized key-binding"
      console.log(stime(this, "_bindKey:"), msg, { bind: bind })
      alert(msg)
    } else {
      delete keymap[kcode];
    }

  }

  // arg:function crashes tsc [3/2017]
  // func:function(e, p, k)
  globalSetKey(kcode: number, bind: Binding) {
    this._bindKey(this.keymap, kcode, bind)
  }

  /**
   * Bind key to event handling function.
   * @param str a string describing a single keychord.
   * @param bind a Binding {thisArg: keymap, func: ()=>void, argVal?: arg}
   */
  globalSetKeyFromChar(str: string, bind: Binding) {
    this.globalSetKey(this.getKeyCodeFromChar(str), bind);
  }

  localSetKey(scope: DisplayObject, kcode: number, bind: Binding) {
    this._bindKey(scope["_keymap"], kcode, bind)
  }
  localSetKeyFromChar(scope: DisplayObject, str: string, bind: Binding) {
    this._bindKey(scope["_keymap"], this.getKeyCodeFromChar(str), bind);
  }


  // NOTE: bindings will be to kcode chord with a letter, not just shift keys.
  // However, it could happen that C-X is seen before C-M-X, so both would be triggered.
  // Q: Do we need to wait nnn-msecs, so see if another event comes to replace the current one?
  // nnn < ~50 ?
  // Promise to resolve to (func.call(this, e, kcode0))
  // but when new chord comes, attempt to cancel the Promise, and replace
  /** dispatch keyup and keydown events [keypress dispatches to keydown, the default] 
   * KeyboardEvent is HTML Event, so current/target path is: window, document, html, body
   * Useless for 'local' bindings; we need a 'focus' on DisplayObject, and target to that.
   * Text/EditBox can listen for 'click' and set focus. (currentTarget)
   * Text/EditBox can listen for 'Enter' and release focus (blur) [also: onCollapse of menu]
   */
  dispatchKey(e: KeyboardEvent) {
    this.dispatchKeyCode(this.getKeyCodeFromEvent(e)) // encode all the C-M-A-Shift bits:
  }
  /** invoke keyBound function as if kcode(str) was received. */
  dispatchChar(str: string) {
    this.dispatchKeyCode(this.getKeyCodeFromChar(str)) // for ex: "^-C-M-z"
  }
  /**
   * Dispatch based on keycode.
   * @param kcode extracted from KeyboardEvent, or synthesized from getKeyCodeFromChar(str)
   * @param e optional KeyboardEvent for logging
   */
  dispatchKeyCode(kcode: number, e?: KeyboardEvent) {
    let keymap = (!this.focus) ? this.keymap : this.focus["_keymap"];
    let bind: Binding = keymap[kcode]
    if (this.details) // TODO: maybe use console.debug()
      console.log(stime(this, "dispatchKeyCode:"), { key: e.key, bind: bind, kcode: kcode, keymap: keymap, focus: this.focus }, e);
    if (!!bind && typeof (bind.func) == 'function') {
      bind.func.call(bind.thisArg, bind.argVal, e)
    }
  }
  details = false // details of event to console.log 

  private initListeners() {
    console.log(stime(this, ".initListeners: THIS (new KeyBinder) ="), this);

    this.on("keydown", this.dispatchKey, this)[S.aname] = "KeyBinder.dispatchKey"
    this.on("keyup", this.dispatchKey, this)[S.aname] = "KeyBinder.dispatchKey"

    // let mousein = (e) => {evtd.showevent("onFocus", e)};
    // this.addEventListener("mouseenter", mousein);
    // let mouseout = (e) => {evtd.showevent("onBlur", e)};
    // this.addEventListener("mouseleave", mouseout);
  }

  showKeyEvent(str: string, e: KeyboardEvent) {
    console.log(stime(this), str, { Key: JSON.stringify(e.key), Kcode: this.getKeyCodeFromEvent(e), event: e });
  }
}

/** a [Rectangle] Shape that holds a Text
 * keystrokes to the Shape are inserted into the Text.
 * 
 * EditBox:
 * localSetKey(BS,DEL,C-A, C-K, C-W, C-Y, C-B, C-F) to edit functions...?
 */
class TextBox extends Shape {
  constructor() {
    super()
    let g = this.graphics

  }
  setText(text?: string, fontSize?: string, fontName?: string, color: string = C.black) {

  }
  setBind(w: number, h: number, init?: string, focus?: Binding, blur?: Binding) {

  }
}
