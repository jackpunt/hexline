import { WebSocketBase, pbMessage, CgMessage, AckPromise, CgBase, CgMessageOpts, CgType, stime, BaseDriver, DataBuf, EzPromise } from "@thegraid/wspbclient";
import { Rost } from "src/proto/HgProto";

function stringData(data: DataBuf<any>) {
  let ary = new Uint8Array(data)
  let k = ary.filter((v: number) => v >= 32 && v < 127)
  return String.fromCharCode(...k)
}
export enum GgType {
  none = 0,
  next = 6,
  undo = 7,
  join = 8,
  chat = 9
}
interface GgMessage extends pbMessage { 
  type: GgType | any; // any compatible enum...
  client: number; 
  player: number; 
  name: string;
  clientto: number;
  roster: Rost[];
  /** type as a string (vs enum value) */
  get msgType(): string
}

// declare module '../proto/GgProto' {
//   interface GgMessage { msgType: string }
// }
/** augment proto with accessor 'msgType => string' */
export function addEnumTypeString(ggMessage, anEnum: any = GgType, accessor = 'msgType') {
  Object.defineProperty(ggMessage.prototype, accessor, {
    /** GgMessage.type as a string. */
    get: function () { return anEnum[this.type] }
  })
}

export type rost = {name: string, client: number, player: number}
type GGMK = Exclude<keyof GgMessage, Partial<keyof pbMessage> | "serialize">
export type GgMessageOpts = Partial<Pick<GgMessage, GGMK>>

// try make a Generic CgClient that wraps a CgBase for a given GgMessage/pbMessage type.
// OuterMessage is like: HgMessage or CmMessage: share basic messages:
// CgProto Ack/Nak, send_send, send_join(group); wsmessage -> parseEval
// OuterMessage: send_join(name, opts), eval_join(Rost), send_message->send_send, undo?, chat?, param?
// inject a deserializer!
// OH! we extend CgDriver with the application-specific proto driver/client, using these methods to talk to CgBase
export class CgClient<OuterMessage extends GgMessage> extends BaseDriver<GgMessage, never> {
  wsbase: WebSocketBase<pbMessage, pbMessage>;
  cgBase: CgBase<OuterMessage>; // === this.dnstream
  declare deserialize: (buf: DataBuf<OuterMessage>) => OuterMessage
  omc: new (opts: any) => OuterMessage
  /**
   * Create a web socket stack
   * @param OmC OuterMessage class/constructor(opts); With: OmC.deserialize(DataBuf) -> OuterMessage
   * @param CgB CgBase constructor
   * @param WSB WebSocketBase constructor
   * @param url web socket URL
   * @param onOpen callback when webSocket is open: onOpen(this) => void
   */
  constructor(
    //OmD: (buf: DataBuf<OuterMessage>) => OuterMessage,
    OmC: new (opts: any) => OuterMessage,
    CgB: new () => CgBase<OuterMessage> = CgBase,
    WSB: new () => WebSocketBase<pbMessage, CgMessage> = WebSocketBase,
    url?: string,
    onOpen?: (cgClient: CgClient<OuterMessage>) => void) {
    super()
    //if (!Object.hasOwn(OmC.prototype, 'msgType'))
    if (!OmC.prototype.hasOwnProperty('msgType')) 
      addEnumTypeString(OmC) // Failsafe: msg.msgType => enum{none = 0}(msg.type)
    this.omc = OmC
    let deserial = OmC['deserialize'] as ((buf: DataBuf<OuterMessage>) => OuterMessage)
    let deserial0 = (buf: DataBuf<CgMessage>) => {
      try {
        //console.log(stime(this, `.deserialize buf =`), buf)
        return deserial(buf)
      } catch (err) {
        console.error(stime(this, `.deserialize: failed`), stringData(buf), buf, err)
        return undefined // not a useful OuterMessage
      }
    }
    this.deserialize = deserial0
    url && this.connectStack(CgB, WSB, url, onOpen)
  }

  get isOpen() { return !!this.wsbase && this.wsbase.ws && this.wsbase.ws.readyState == this.wsbase.ws.OPEN }

  /** CgBase.ack_promise: Promise with .message from last send_send (or leave, join) 
   * is .resolved when an Ack/Nak is receieved.
   */
  get ack_promise(): AckPromise { return (this.dnstream as CgBase<OuterMessage>).ack_promise}
  get client_id(): number { return this.cgBase.client_id }
  
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
      console.warn(stime(this, `.sendCgAck: duplicate Ack(${cause})`), this.message_to_ack.message)
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
   * @param message a GgMessage to be wrapped
   * @param cgOpts -- if not supplied, the default for nocc: is undefined, so ref is not self-copied
   */
  send_message(message: OuterMessage, cgOpts?: CgMessageOpts, ackPromise?: AckPromise): AckPromise {
    // TODO: default cgOpts = { nocc: true }
    // note: sendCgAck() & sendCgNak() are not processed by this code.
    // queue new requests until previous request is ack'd:
    if (!this.message_to_ack.resolved) {
      this.log && console.log(stime(this, `.send_message: need_to_ack`), { message, message_to_ack: this.message_to_ack.message })
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
    onOpen?: (omDriver: CgClient<OuterMessage>) => void): this 
  {
    let omDriver: CgClient<OuterMessage> = this
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

  /** 
   * Send CmMessage, get Ack, then wait for a CmMessage that matches predicate.
   * @return promise to be fulfill'd by first message matching predicate.
   * @param sendMessage function to send a message and return an AckPromise
   * @param pred a predicate to recognise the CmMessage response (and fullfil promise)
   */
  sendAndReceive(sendMessage: () => AckPromise, 
    pred: (msg: OuterMessage) => boolean = () => true): EzPromise<OuterMessage> {
    let listenForCmReply =  (ev: MessageEvent<DataBuf<OuterMessage>>) => {
      let cmm = this.deserialize(ev.data)
      if (pred(cmm)) {
        this.log && console.log(stime(this, ".listenForCmReply: fulfill="), cmm)
        this.removeEventListener('message', listenForCmReply)
        cmPromise.fulfill(cmm)
      }
    }
    let cmPromise = new EzPromise<OuterMessage>()
    this.addEventListener('message', listenForCmReply)
    let ackPromise = sendMessage()
    ackPromise.then((ack) => {
      if (!ack.success) { 
        this.removeEventListener('message', listenForCmReply)
        cmPromise.reject(ack.cause) 
      }
    })
    return cmPromise
  }
  /** make a Game-specific 'join' message... */
  make_join(name: string, opts: GgMessageOpts = {}): OuterMessage {
    return new this.omc({ ...opts, name: name, type: GgType.join }) // include other required args
  } 
  /** send Join request to referee.
   * 
   * See also: sendAndReceive() to obtain the response Join fromReferee
   * (which will come to eval_join anyway, with name & player_id)
   */
  send_join(name: string, opts: GgMessageOpts = {}): AckPromise {
    let message = this.make_join(name, opts)
    return this.send_message(message, { client_id: 0 }) // to Referee only.
  }

  /**
   * When Cg 'send' message rec'd: dispatchMessageEvent, deserialize and parseEval
   * Set message.client = wrapper.client_from
   * @param data 
   * @param wrapper the outer pbMessage (CgProto.type == send)
   * @override BaseDriver 
   */
  override wsmessage(data: DataBuf<OuterMessage>, wrapper?: CgMessage): void {
    this.message_to_ack = new AckPromise(wrapper)
    this.log && console.log(stime(this, `.wsmessage: data = `), { data })
    this.dispatchMessageEvent(data)     // inform listeners
    let message = this.deserialize(data)
    message.client = wrapper.client_from // message is from: client_from
    message.clientto = wrapper.client_id // capture the client_to field
    this.log && console.log(stime(this, ".wsmessage:"), message.msgType, message)
    this.parseEval(message, wrapper)
  }

  override parseEval(message: GgMessage, cgmsg?: CgMessage) {
    let type = message.type
    // validate player & srcCont/stack, then:

    switch (type) {
      case GgType.none: { this.eval_none(message); break }
      case GgType.chat: { this.eval_chat(message); break }
      case GgType.join: { this.eval_join(message); break }
      case GgType.undo: { this.eval_undo(message); break }
      case GgType.next: { this.eval_next(message); break }
    }
    // default ACK for everthing:
    if (!this.message_to_ack.resolved) this.sendCgAck(message.msgType)
  }

  /**
   * do nothing, not expected
   */
  eval_none(message: GgMessage) {
    this.sendCgAck("none")
  }
  /** display 'cause' in scrolling TextElement */
  eval_chat(message: GgMessage) {
    this.sendCgAck("chat")
  }

  /** all the known players (& observers: player<0) cm-ref controls. */
  roster: Array<rost> = []
  updateRoster(roster: Rost[]) {
    this.roster = roster.map(rost => { return {player: rost.player, client: rost.client, name: rost.name}})
  }
  /** update roster */
  eval_join(message: GgMessage) {
    this.log && console.log(stime(this, ".eval_join:"), message)
    this.updateRoster(message.roster)
    this.log && console.log(stime(this, ".eval_join: roster"), this.roster)
    this.sendCgAck("join")
  }
  /** invoke table.undo */
  eval_undo(message: GgMessage) {
    //this.table.undoIt()
    this.sendCgAck("undo")
  }

  /** invoke table.setNextPlayer(n) */
  eval_next(message: GgMessage) {
    let player = message.player
    //this.table.setNextPlayer(player) // ndx OR undefined ==> -1
    this.sendCgAck("next")
  }
}


class RefCgBase<OuterMessage extends pbMessage> extends CgBase<OuterMessage> {
  /** when Client leaves Group, notify Referee. */
  override eval_leave(message: CgMessage) {
    this.log && console.log(stime(this, ".eval_leave"), message)
    if (this.upstream instanceof CgReferee) { // should be true... who else is using RefCgBase??
      this.upstream.eval_leave(message)
    }
    super.eval_leave(message)
  }
}

export class CgReferee<OuterMessage extends GgMessage> extends CgClient<OuterMessage> {
  /** specialized CgDriver for Referee. */
  constructor(OmC: new () => OuterMessage, CgB = RefCgBase, WSB = WebSocketBase, url?: string, onOpen?: (cgReferee: CgReferee<OuterMessage>) => void) {
    super(OmC) // CmReferee()
    if (url !== undefined) this.connectStack(CgB, WSB, url, onOpen)
  }
  /**
   * Connect CmReferee to given URL.
   * @param onOpen inform caller that CG connection Stack is open
   * @param onJoin inform caller that CmReferee has joined CG
   * @returns the CmReferee (like the constructor...)
   */
  joinGroup(url: string, group: string, onOpen: (cmClient: CgClient<OuterMessage>) => void, onJoin?: (ack: CgMessage) => void): this {
    // Stack: CmClient=this=CmReferee; CgClient=CgRefClient; WebSocketBase -> url
    this.connectStack(RefCgBase, WebSocketBase, url, (refClient: CgReferee<OuterMessage>) => {
      onOpen(refClient)
      refClient.cgBase.send_join(group, 0, "referee").then((ack: CgMessage) => {
        this.log && console.log(stime(this, `.joinGroup: ack =`), ack)
        this.roster.push({ client: ack.client_id, player: -1, name: "referee" })
        onJoin && onJoin(ack)
      })
    })
    return this
  }

  /** special invocation from CgRefClient */
  eval_leave(msg: CgMessage) {
    let { client_id, cause, group } = msg
    let rindex = this.roster.findIndex(pr => pr.client === client_id)
    let pr: rost = this.roster[rindex]
    // remove from roster, so they can join again! [or maybe just nullify rost.name?]
    if (rindex !== -1) this.roster.splice(rindex, 1)
    let roster = this.roster.map(pr => new Rost({client: pr.client, player: pr.player, name: pr.name}))
    this.log && console.log(stime(this, ".eval_leave: roster"), this.roster)
    this.sendCgAck("leave")
    // QQQQ: should we tell the other players? send_join(roster)
    this.send_roster(pr)  // noting that 'pr' will not appear in roster...
  }

  override eval_join(message: OuterMessage) {
    let client = message.client // wrapper.client_from
    let name = message.name
    this.log && console.log(stime(this, ".eval_join"), name, message, this.roster)
    if (message.clientto !== 0) {
      this.sendCgNak("send join to ref only", {client_id: client});
      return;
    }
    if (this.roster.find(pr => (pr.name === message.name))) {
      this.sendCgNak("name in use: "+message.name, {client_id: client})
      return
    }
    let next_pid = () => [ 0, 1, 2, 3 ].find(pid => !this.roster.find(pr => pr.player === pid))
    let player = next_pid()

    if (player === undefined) {
      this.sendCgNak("game full", {client_id: client}) // try join as observer
      return
    }

    // add client/player/name to roster:
    let pr = { client: client, player: player, name: name };
    this.roster.push(pr)
    this.log && console.log(stime(this, ".eval_join: roster"), this.roster)

    // send_join(player, roster) to Group, so everyone knows all the players.
    this.sendCgAck("joined", {client_id: client}) // ... not an ACK to tell server to sendToOthers...
    this.log && console.log(stime(this, ".eval_join: assign player"), pr)
    this.send_roster(pr)
  }

  send_roster(pr: rost) {
    let {name, client, player} = pr
    let roster = this.roster.map(pr => new Rost({client: pr.client, player: pr.player, name: pr.name}))
    this.send_join(name, {client, player, roster}) // fromReferee to Group.
  }
  /** send join with roster to everyone. */
  override send_join(name: string, opts: GgMessageOpts = {}): AckPromise {
    let message = this.make_join(name, opts)
    this.log && console.log(stime(this, ".send_join"), message)
    return this.send_message(message, { nocc: true }) // from Referee
  }

}
