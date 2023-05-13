// Needs fixing

class Serial {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this._SB = 0;
    this._SC = 0;
    this.clock = new Serial.InternalClock();
    this.device = this.initDevice();
    this.__blarrg = [];
  }

  get SB() {
    return this._SB;
  }
  set SB(x) {
    this.__blarrg.push(x);
    this._SB = x;
  }

  get SC() {
    return this._SC;
  }
  set SC(x) {
    if ((x & 1) != this.clock.id)
      //shift-clock
      this.clock = Serial.getClock(x & 1);

    this._SC = x;
  }

  initDevice() {
    this.device = {
      //doesn't work, avoid the bugs
      exchange(bit) {
        this.byte = (this.byte << 1) | bit;
        this.idx %= 8;
        if (this.idx == 0) {
          this.bytes.push(this.byte);
          this.byte = 0;
        }
        return 0;
      },
      idx: 0,
      byte: 0,
      bytes: [],
    };
  }

  tick() {
    let edge = this.clock.state;
    this.clock.tick();
    edge = !edge && this.clock.state;
    if (this._SC & 0x80 && edge) {
      //transfer is on
      //this.gameboy.cancelInterrupt(3);
      let bit = this.device.exchange((this.SB & 0x80) >> 7);
      this.SB = ((this.SB << 1) & 0xff) | bit;
      if (this.device.idx == 0) {
        //complete
        this._SC &= ~0x80;
        this.gameboy.requestInterrupt(3);
      }
    }
  }
}

//8192Hz

Serial.InternalClock = class {
  constructor() {
    this.count = 0;
    this.id = 1;
  }

  tick() {
    this.count = this.count + 1; //& 0xffff;
  }

  get state() {
    return (this.count & (1 << 12)) >> 12;
  }
};

Serial.getClock = function (id) {
  if (id == 0) return new Serial.InternalClock();
  throw "External Clock Unimplemented";
};

export default Serial;
