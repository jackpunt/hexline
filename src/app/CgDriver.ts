import { WebSocketBase, pbMessage, CgMessage, AckPromise, CgBase, CgMessageOpts, CgType, stime } from "@thegraid/wspbclient";
import { HgMessage } from "src/proto/HgProto";

// try make a Generic CgDriver that wraps a CgBase for a given pbMessage type.
// OuterMessage is like: HgMessage or CmMessage
// presumably, we can inject a deserializer ?
// OH! we extend CgDriver with the application-specific proto driver/client, using these methods to talk to CgBase
export class CgDriver<OuterMessage extends pbMessage> extends CgBase<CgMessage> {
  wsbase: WebSocketBase<pbMessage, pbMessage>;
  cgBase: CgBase<OuterMessage>; // === this.dnstream

  /** CgBase.ack_promise: Promise with .message from last send_send (or leave, join) 
   * is .resolved when an Ack/Nak is receieved.
   */
  override get ack_promise(): AckPromise { return (this.dnstream as CgBase<OuterMessage>).ack_promise}

  // modeled on CgBase.sendToSocket() TODO: integrate into CgBase?
  /** 
   * Promise for last inbound CgType.send message (that expects an Ack)
   * 
   * client must Ack before emitting a new 'send' (that exepect an Ack) 
   */
  message_to_ack: AckPromise = new AckPromise(new CgMessage({type: CgType.none})).fulfill(null);
  
  sendCgAck(cause: string, opts?: CgMessageOpts) {
    if (this.message_to_ack.resolved) {
      // prevent 'spurious ack'
      console.log(stime(this, `.sendCgAck: duplicate Ack(${cause})`), this.message_to_ack.message)
      return this.message_to_ack
    }
    let rv = this.cgBase.sendAck(cause, opts)
    this.message_to_ack.fulfill(rv.message) // server was waiting for an ACK
    return rv
  }
  sendCgNak(cause: string, opts?: CgMessageOpts) {
    let rv = this.cgBase.sendNak(cause, opts)
    this.message_to_ack.fulfill(rv.message)
    return rv
  }
  /**
   * Send_send via this.outer CgClient [after we Ack the previous inbound request]
   * @param message a CmMessage to be wrapped
   * @param cgOpts -- if not supplied, the default for nocc: is undefined, so ref is not self-copied
   */
  send_message(message: OuterMessage, cgOpts?: CgMessageOpts, ackPromise?: AckPromise): AckPromise {
    // TODO: default cgOpts = {nocc: true}
    // note: sendCgAck() & sendCgNak() are not processed by this code.
    // queue new requests until previous request is ack'd:
    if (!this.message_to_ack.resolved) {
      console.log(stime(this, `.send_message: need_to_ack`), {message, message_to_ack: this.message_to_ack.message})
      if (!ackPromise) ackPromise = new AckPromise(undefined) // undefined indicates still pending
      this.message_to_ack.then(() => {
        this.send_message(message, cgOpts, ackPromise) // ignore return value (either ackPromise OR .ack_promise)
      })
      return ackPromise // message queued to be sent
    }
    this.cgBase.send_send(message, cgOpts) // sets this.ack_promise === cgClient.ack_promise
    if (!!ackPromise) {
      // if ackPromise is supplied, then add .message and arrange to .fulfill():
      ackPromise.message = this.ack_promise.message // presence of .message indicates CgMessage has been sent
      this.ack_promise.then((ack) => {
        ackPromise.fulfill(ack)
      })
    }
    return this.ack_promise
  }
  /**
   * wire-up this CgDriver to a CgClient and WebSocketBase to the given URL 
   * @param CgB a CgClient Class/constructor
   * @param WSB a WebSocketBase Class/constructor
   * @param url string URL to the target CgServer server
   * @param onOpen invoked when CgB<InMessage>/CgClient/WSB connection to server/URL is Open.
   * @returns this CgDriver
   */
  connectStack(
    CgB: new () => CgBase<OuterMessage>,
    WSB: new () => WebSocketBase<pbMessage, CgMessage>,
    url: string,
    onOpen?: (omDriver: CgDriver<OuterMessage>) => void): this 
  {
    let omDriver: CgDriver<OuterMessage> = this
    let cgBase = new CgB()
    let wsb: WebSocketBase<pbMessage, CgMessage> = new WSB()
    omDriver.cgBase = cgBase
    omDriver.wsbase = wsb
    omDriver.connectDnStream(cgBase)
    cgBase.connectDnStream(wsb)
    wsb.connectDnStream(url)
    wsb.ws.addEventListener('open', (ev) => onOpen(omDriver))
    return this
  }
  constructor(CgB: new () => CgBase<OuterMessage>,
    WSB: new () => WebSocketBase<pbMessage, CgMessage>,
    url: string,
    onOpen?: (cmClient: CgDriver<pbMessage>) => void) {
    super()
    this.connectStack(CgB, WSB, url, onOpen)
  }
  /** make CmCLient2: game-setup invokes via ParamLine: Network="yes" */
}