import CPU from "./CPU";
import ROMCartridge from "./Cartridge";
import Memory from "./Memory";
import PPU from "./PPU";
import Serial from "./Serial";
import Joypad from "./Joypad";
import Timer from "./Timer";

class Gameboy {
  constructor() {
    this.memory = new Memory(this);
    this.cpu = new CPU(this);
    this.ppu = new PPU(this);
    this.serial = new Serial(this);
    this.joypad = new Joypad(this);
    this.timer = new Timer(this);
    this.cartridge = null;
    this.IO = null;
    this.requestRender = () => null;
    this.shouldCheckInterrupt = false;
    this.IF = 0;

    // reset cpu for good measures
    this.cpu.reset();

    //used now for missing IO Devices
    this.slots = new Array(0x100);
    this.slots.fill(0);
    this.shouldRender = false;
    this.bytes = new Array(256);
    this.halted = true;
  }

  boot() {
    Joypad.enable();
    this.cpu.reset();
    for (let i = 0; i < 0x100; i++) {
      this.bytes[i] = this.cartridge.buffer[i];
      this.cartridge.buffer[i] = ROMCartridge.bootSequence[i];
    }

    this.halted = false;
  }

  shutdown() {
    this.joypad.destroy();
    this.halted = true;
  }

  //IO Set/GET
  //$ff50 to turnoff boot mode
  get(x) {
    if (this.cpu.cycles && 0x40 <= (x & 0xff) && (x & 0xff) <= 0x4b)
      this.shouldCatchupPPU = true;

    switch (x & 0xff) {
      case 0x00:
        return this.joypad.register;
      case 0x40:
        return this.ppu.LCDC;
      case 0x41:
        return this.ppu.STAT;
      case 0x42:
        return this.ppu.SCY;
      case 0x43:
        return this.ppu.SCX;
      case 0x44:
        return this.ppu.LY;
      case 0x45:
        return this.ppu.LYC;
      case 0x46:
        return this.ppu.DMA;
      case 0x47:
        return this.ppu.BGP;
      case 0x48:
        return this.ppu.OBP0;
      case 0x49:
        return this.ppu.OBP1;
      case 0x4a:
        return this.ppu.WY;
      case 0x4b:
        return this.ppu.WX;
      case 0x04:
        return this.timer.DIV;
      case 0x05:
        return this.timer.TIMA;
      case 0x06:
        return this.timer.TMA;
      case 0x07:
        return this.timer.TAC;
      case 0x01:
        return this.serial.SB;
      case 0x02:
        return this.serial.SC;
      case 0x0f:
        return this.IF;
      default:
        return this.slots[x & 0xff];
    }
  }

  set(x, y) {
    if (this.cpu.cycles && 0x40 <= (x & 0xff) && (x & 0xff) <= 0x4b)
      this.shouldCatchupPPU = true;

    switch (x & 0xff) {
      case 0x00:
        return (this.joypad.register = y);
      case 0x40:
        return (this.ppu.LCDC = y);
      case 0x41:
        return (this.ppu.STAT = y);
      case 0x42:
        return (this.ppu.SCY = y);
      case 0x43:
        return (this.ppu.SCX = y);
      case 0x44:
        return (this.ppu.LY = y);
      case 0x45:
        return (this.ppu.LYC = y);
      case 0x46:
        return (this.ppu.DMA = y);
      case 0x47:
        return (this.ppu.BGP = y);
      case 0x48:
        return (this.ppu.OBP0 = y);
      case 0x49:
        return (this.ppu.OBP1 = y);
      case 0x4a:
        return (this.ppu.WY = y);
      case 0x4b:
        return (this.ppu.WX = y);
      case 0x04:
        return (this.timer.DIV = y);
      case 0x05:
        return (this.timer.TIMA = y);
      case 0x06:
        return (this.timer.TMA = y);
      case 0x07:
        return (this.timer.TAC = y);
      case 0x01:
        return (this.serial.SB = y);
      case 0x02:
        return (this.serial.SC = y);
      case 0x0f:
        this.IF = y;
        break;
      case 0x50:
        if (y != 1) return;
        for (let i = 0; i < 0x100; i++)
          this.cartridge.buffer[i] = this.bytes[i];
        break;
      default:
        return (this.slots[x & 0xff] = y);
    }
  }

  //these two currenly are only used by PPU, condition should be set somewhere else
  requestInterrupt(number) {
    this.shouldCatchupCPU = true;
    this.memory.set(0xff0f, this.memory.get(0xff0f) | (1 << number)); //request interrupt

    //The HALT mode is exited when the corresponding flag in the IE register is also set
    //Regardless of the value of IME -- the difference is whether we should service
    //an interrupt or now
    // !!! move check interrupts here
    if (this.memory.IE & (1 << number)) this.cpu.halted = false; //remove halt state

    this.shouldCheckInterrupt = true;
  }

  cancelInterrupt(number) {
    this.shouldCatchupCPU = true;
    this.memory.set(0xff0f, this.memory.get(0xff0f) & ~(1 << number)); //cancel interrupt
  }

  getInterrupt(number) {
    return (this.memory.get(0xff0f) & (1 << number)) >> number;
  }

  /* IMPLEMENT CATCH UP, CRITICAL */
  step() {
    if (this.cpu.halted) {
      this.timer.catch(4);
      this.ppu.catch(4);
      return 4;
    }

    let diff = this.cpu.cycles;
    this.cpu.step();
    diff = this.cpu.cycles - diff;

    this.timer.catch(diff);
    this.ppu.catch(diff);
    return diff;
  }

  //not accurate but okay for now
  catch(steps) {
    while (steps > 0) steps -= this.step();
  }
}

export default Gameboy;
