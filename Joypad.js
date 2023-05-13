class Joypad {
  constructor(system) {
    this.system = system;
    system.joypad = this;
    Joypad.handles.push(this);

    this.state = 0xff; // low button, high direction
    this._register = 0b11111111;
    window.joypad = this;
  }

  get register() {
    return this._register;
  }
  set register(x) {
    this._register &= ~0b00110000;
    this._register |= x & 0b00110000;
    this.applyState();
  }

  destroy() {
    let idx = Joypad.handles.indexOf(this);
    if (idx != -1) Joypad.handles.splice(idx, 1);
  }

  updateState(idx, val) {
    let bit = this.state & (1 << idx),
      button = this._register & 0x20,
      direction = this._register & 0x10;

    if (val) this.state |= 1 << idx;
    else this.state &= ~(1 << idx);

    if (idx < 4 && !button && bit && !val) this.system.requestInterrupt(4);
    if (idx >= 4 && !direction && bit && !val) this.system.requestInterrupt(4);

    this.applyState();
  }

  applyState() {
    let button = this._register & 0x20,
      direction = this._register & 0x10;

    this._register |= 0b1111; //clear all

    if (!button)
      //button selections
      this._register &= this.state & 0xf;

    if (!direction)
      //button selections
      this._register &= (this.state >> 4) & 0xf;
  }
}

Joypad.enable = function () {
  let handler = (e) => {
    let press = e.type == "keydown";
    switch (e.keyCode) {
      case 90:
        for (let handle of this.handles) handle.updateState(6, !press);
        break;

      case 68:
        for (let handle of this.handles) handle.updateState(4, !press);
        break;

      case 83:
        for (let handle of this.handles) handle.updateState(7, !press);
        break;

      case 81:
        for (let handle of this.handles) handle.updateState(5, !press);
        break;

      case 65:
        for (let handle of this.handles) handle.updateState(0, !press);
        break;

      case 69:
        for (let handle of this.handles) handle.updateState(1, !press);
        break;

      case 79:
        for (let handle of this.handles) handle.updateState(2, !press);
        break;

      case 80:
        for (let handle of this.handles) handle.updateState(3, !press);
        break;
    }
  };

  window.addEventListener("keydown", handler);
  window.addEventListener("keyup", handler);
};

Joypad.handles = [];

export default Joypad;
