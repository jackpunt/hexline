import { CgBase, WebSocketBase } from "@thegraid/wspbclient";
import { HgMessage } from "src/proto/HgProto";
import { CgClient, GgMessage } from "./CgClient";

// Needed for all mixins
type Constructor<T = {}> = new (...args: any[]) => T;

////////////////////
// Example mixins
////////////////////

// A mixin that adds a property
function Timestamped<TBase extends Constructor>(Base: TBase) {
  return class TSB extends Base {
    timestamp = Date.now();
    eval(x: number) {
      return x*2
    }
    fmt(x: string) { return x+'?'}
  };
}

// a mixin that adds a property and methods
function Activatable<TBase extends Constructor<CgClient0<GgMessage>>>(Base: TBase) {
  // with default constructor() {super()}
  return class Activatable extends Base {
    isActivated = false;

    activate() {
      this.isActivated = true;
    }

    deactivate() {
      this.isActivated = false;
    }
  };
}

function CgRefMixin<InnerMessage extends GgMessage, TBase extends Constructor<CgClient<GgMessage>> >(Base: TBase) {
  return class RefereeBase extends Base {
    message: InnerMessage;
  }
}
function Ref<TBase extends Constructor<CgClient<GgMessage>>>(Base: TBase) {
  return class RefBase extends Base {
    
  }
}

////////////////////
// Usage to compose classes
////////////////////
class Corn {
  fmt(x: string) { return x+'kk'}
}
// Simple class
class CgClient0<GgMessage> {
  constructor(a?: any, b?: any, c?: any) {
    
  }
  message: GgMessage
  eval(x: number) {
    return x*x
  }
  fmt(x: number) { return x+2}
  name = '';
  size = 23;
}
class HgClient2 extends CgClient<HgMessage> {
  constructor(...args: any[]) { super(HgMessage, CgBase, WebSocketBase) }
  player: number
}

const RefClient = CgRefMixin(CgClient)
let refc = new RefClient(undefined)

const RefHgClient = CgRefMixin(HgClient2)
let refh = new RefHgClient()
let refhc: HgClient2 = refh
let p = refh.player

// User that is Timestamped
const TimestampedUser = Timestamped(CgClient0);
let tsu = new TimestampedUser()
let k = (tsu  instanceof Timestamped) ? tsu.fmt('2') : tsu.fmt(3)
let y = tsu.fmt('3')
let z = tsu.fmt(3)   


const ActivatableUser = Activatable(CgClient0)
let atu = new ActivatableUser()
atu.name = 'ffo'
atu.activate()
if (atu instanceof CgClient0) {
  atu.size = 3
}
//const ActivateableCorn = Activatable(Corn)

// User that is Timestamped and Activatable
const TimestampedActivatableUser = Timestamped(Activatable(CgClient0));
let tau = new TimestampedActivatableUser()

////////////////////
// Using the composed classes
////////////////////

const timestampedUserExample = new TimestampedUser();
console.log(timestampedUserExample.timestamp);

const timestampedActivatableUserExample = new TimestampedActivatableUser();
console.log(timestampedActivatableUserExample.timestamp);
console.log(timestampedActivatableUserExample.isActivated);