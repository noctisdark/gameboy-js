class APUTimer {
  //A timer generates an output clock every N input clocks, where N is the timer's period.
  // If a timer's rate is given as a frequency, its period is 4194304/frequency in Hz.
  // Each timer has an internal counter that is decremented on each input clock.
  // When the counter becomes zero, it is reloaded with the period and an output clock is generated.

  constructor(period) {
    this.period = period;
    this.counter = period;
  }

  cycle() {
    this.period--;
    if (this.period == 0) {
      this.counter = this.period;
      return true;
    }
    return false;
  }
}

let mapping = {
  NR10_ADDR: 0xff10,
  NR11_ADDR: 0xff11,
  NR12_ADDR: 0xff12,
  NR13_ADDR: 0xff13,
  NR14_ADDR: 0xff14,

  NR21_ADDR: 0xff16,
  NR22_ADDR: 0xff17,
  NR23_ADDR: 0xff18,
  NR24_ADDR: 0xff19,

  NR30_ADDR: 0xff1a,
  NR31_ADDR: 0xff1b,
  NR32_ADDR: 0xff1c,
  NR33_ADDR: 0xff1d,
  NR34_ADDR: 0xff1e,

  NR41_ADDR: 0xff20,
  NR42_ADDR: 0xff21,
  NR43_ADDR: 0xff22,
  NR44_ADDR: 0xff23,

  WAVE_PATTERN_START: 0xff30,
  WAVE_PATTERN_END: 0xff3f,
};

class Channel_1 {
  get NR10() {
    return this.memory[mapping.NR10_ADDR];
  }
  get NR11() {
    return this.memory[mapping.NR11_ADDR];
  }
  get NR12() {
    return this.memory[mapping.NR12_ADDR];
  }
  get NR13() {
    return this.memory[mapping.NR13_ADDR];
  }
  get NR14() {
    return this.memory[mapping.NR14_ADDR];
  }
  //Unused NR15

  //Sweep time(update rate) (if 0, sweeping is off)
  get sweepTime() {
    return (this.NR11 & 0x70) >> 4;
  }
  set sweepTime(x) {
    this.memory[mapping.NR10_ADDR] &= 0b10001111;
    this.memory[mapping.NR10_ADDR] |= x << 4;
  }

  //Sweep Direction (1: decrease, 0: increase)
  get sweepDirection() {
    return (this.NR11 & 0x8) >> 3;
  }
  set sweepDirection(x) {
    if (x) this.memory[mapping.NR10_ADDR] |= 1 << 3;
    else this.memory[mapping.NR10_ADDR] &= 0b11110111;
  }

  //Sweep amount (if 0, sweeping is off)
  get sweepAmount() {
    return this.NR11 & 0x7;
  }
  //X(t) = X(t-1) +/- X(t-1)/2^n, n is the number of sweepShift n/128Hz
  set sweepAmount(x) {
    this.memory[mapping.NR10_ADDR] &= 0b11111000;
    this.memory[mapping.NR10_ADDR] |= x;
  }

  //7-6	Wave pattern duty (only on channels 1 and 2)
  //5-0	Length counter load register

  //00: 12.5% ( _-------_-------_------- )
  //01: 25%   ( __------__------__------ )
  //10: 50%   ( ____----____----____---- ) (normal)
  //11: 75%   ( ______--______--______-- )
  //Sound Length = (64-t1)*(1/256) seconds
  //The Length value is used only if Bit 6 in NR14 is set.

  get duty() {
    return (this.NR11 & 0xc0) >> 6;
  }
  get lengthCounter() {
    return this.NR11 & 0x3f;
  } //t1
  set duty(x) {
    this.memory[mapping.NR11_ADDR] =
      (x << 6) | (this.memory[mapping.NR11_ADDR] & 0x3f);
  }
  set lengthCounter(x) {
    this.memory[mapping.NR11_ADDR] &= 0b11100000;
    this.memory[mapping.NR11_ADDR] |= x;
  }

  // 7-4	(Initial) Channel Volume
  // 3	Volume sweep direction (0: down; 1: up)
  // 2-0	Length of each step in sweep (if 0, sweeping is off)
  // NOTE: each step is n/64 seconds long, where n is 1-7
  get initialVolume() {
    return (this.NR12 & 0xf0) >> 4;
  }
  set initialVolume(x) {
    this.memory[mapping.NR12_ADDR] &= 0b00001111;
    this.memory[mapping.NR12_ADDR] |= x << 4;
  }

  get volumeSweepDirection() {
    return (this.NR12 & 0x8) >> 3;
  }
  set volumeSweepDirection(x) {
    if (x) this.memory[mapping.NR12_ADDR] |= 1 << 3;
    else this.memory[mapping.NR12_ADDR] &= 0b11110111;
  }

  get volumeSweepStepLength() {
    return this.NR12 & 0x7;
  }
  set volumeSweepStepLength(x) {
    this.memory[mapping.NR12_ADDR] &= 0b11111000;
    this.memory[mapping.NR12_ADDR] |= x;
  }

  setChannel(x) {
    //1 = restart sound
    if (x) this.memory[mapping.NR14_ADDR] |= 1 << 7;
    else this.memory[mapping.NR14_ADDR] &= 0b01111111;
  }

  get counterSelection() {
    return (this.NR14 & 0x40) >> 6;
  }

  set counterSelection(x) {
    //1 = stop when length in NR11 expires
    if (x) this.memory[mapping.NR14_ADDR] |= 1 << 6;
    else this.memory[mapping.NR14_ADDR] &= 0b10111111;
  }

  set frequencyLSB(x) {
    this.memory[mapping.NR13_ADDR] = x;
  }

  set frequencyMSB(x) {
    this.memory[mapping.NR14_ADDR] &= 0b11111000;
    this.memory[mapping.NR14_ADDR] |= x;
  }

  get frequency() {
    let x = this.NR13 | ((this.NR14 & 0x7) << 8);
    return 131072 / (2048 - x);
  }

  constructor(memory) {
    this.memory = memory;
  }
}

class Channel_2 {
  get NR21() {
    return this.memory[mapping.NR21_ADDR];
  }
  get NR22() {
    return this.memory[mapping.NR22_ADDR];
  }
  get NR23() {
    return this.memory[mapping.NR23_ADDR];
  }
  get NR24() {
    return this.memory[mapping.NR24_ADDR];
  }

  get duty() {
    return (this.NR21 & 0xc0) >> 6;
  }
  get lengthCounter() {
    return this.N211 & 0x3f;
  } //t1
  set duty(x) {
    this.memory[mapping.NR21_ADDR] = (x << 6) | (this.NR21 & 0x3f);
  }
  set lengthCounter(x) {
    this.memory[mapping.NR21_ADDR] |= x;
  }

  get initialVolume() {
    return (this.NR22 & 0xf0) >> 4;
  }
  set initialVolume(x) {
    this.memory[mapping.NR22_ADDR] &= 0b00001111;
    this.memory[mapping.NR22_ADDR] |= x << 4;
  }

  get volumeSweepDirection() {
    return (this.NR22 & 0x8) >> 3;
  }
  set volumeSweepDirection(x) {
    if (x) this.memory[mapping.NR22_ADDR] |= 1 << 3;
    else this.memory[mapping.NR22_ADDR] &= 0b11110111;
  }

  get volumeSweepStepLength() {
    return this.NR22 & 0x7;
  }
  set volumeSweepStepLength(x) {
    this.memory[mapping.NR22_ADDR] &= 0b11111000;
    this.memory[mapping.NR22_ADDR] |= x;
  }

  setChannel(x) {
    //1 = restart sound
    if (x) this.memory[mapping.NR24_ADDR] |= 1 << 7;
    else this.memory[mapping.NR24_ADDR] &= 0b01111111;
  }

  get counterSelection() {
    return (this.NR44 & 0x40) >> 6;
  }

  set counterSelection(x) {
    //1 = stop when length in NR11 expires
    if (x) this.memory[mapping.NR44_ADDR] |= 1 << 6;
    else this.memory[mapping.NR44_ADDR] &= 0b10111111;
  }

  set frequencyLSB(x) {
    this.memory[mapping.NR23_ADDR] = x;
  }

  set frequencyMSB(x) {
    this.memory[mapping.NR24_ADDR] &= 0b11111000;
    this.memory[mapping.NR24_ADDR] |= x;
  }

  get frequency() {
    let x = this.NR23 | ((this.NR24 & 0x7) << 8);
    return 131072 / (2048 - x);
  }

  constructor(memory) {
    this.memory = memory;
  }
}

class Channel_3 {
  get NR30() {
    return this.memory[mapping.NR30_ADDR];
  }
  get NR31() {
    return this.memory[mapping.NR31_ADDR];
  }
  get NR32() {
    return this.memory[mapping.NR32_ADDR];
  }
  get NR33() {
    return this.memory[mapping.NR33_ADDR];
  }
  get NR34() {
    return this.memory[mapping.NR34_ADDR];
  }

  get masterStatus() {
    return this.NR30 & 0x80 ? 1 : 0;
  }
  set masterStatus(x) {
    //1 playback
    if (x) this.memory[mapping.NR30_ADDR] |= 1 << 7;
    else this.memory[mapping.NR30_ADDR] &= 0b01111111;
  }

  //sound length = (256 - t1)/256, this is t1
  //used only if b 6 in NR34 is set
  get lengthCounter() {
    return this.NR31 & 0xff;
  }

  //Possible Output levels are:
  // 0: Mute (No sound)
  // 1: 100% Volume (Produce Wave Pattern RAM Data as it is)
  // 2:  50% Volume (Produce Wave Pattern RAM data shifted once to the right)
  // 3:  25% Volume (Produce Wave Pattern RAM data shifted twice to the right)
  get volume() {
    return (this.NR32 & 0x60) >> 5;
  }
  set volume(x) {
    this.memory[mapping.NR32_ADDR] &= 0b10011111;
    this.memory[mapping.NR32_ADDR] |= x << 5;
  }

  setChannel(x) {
    //1 = restart sound
    if (x) this.memory[mapping.NR34_ADDR] |= 1 << 7;
    else this.memory[mapping.NR34_ADDR] &= 0b01111111;
  }

  setCounterSelection(x) {
    //1 = stop when length in NR11 expires
    if (x) this.memory[mapping.NR34_ADDR] |= 1 << 6;
    else this.memory[mapping.NR34_ADDR] &= 0b10111111;
  }

  set frequencyLSB(x) {
    this.memory[mapping.NR33_ADDR] = x;
  }

  set frequencyMSB(x) {
    this.memory[mapping.NR34_ADDR] &= 0b11111000;
    this.memory[mapping.NR34_ADDR] |= x;
  }

  get frequency() {
    let x = this.NR33 | ((this.NR34 & 0x7) << 8);
    return 65536 / (2048 - x);
  }

  //0xff30 -> 0xff3f Wave pattern stored in RAM

  constructor(memory) {
    this.memory = memory;
  }
}

class Channel_4 {
  get NR41() {
    return this.memory[mapping.NR41_ADDR];
  }
  get NR42() {
    return this.memory[mapping.NR42_ADDR];
  }
  get NR43() {
    return this.memory[mapping.NR43_ADDR];
  }
  get NR44() {
    return this.memory[mapping.NR44_ADDR];
  }

  restartChannel(x) {
    if (x) this.memory[0xff23] |= 1 << 7;
    else this.memory[0xff23] &= 0b01111111;
  }

  get lengthCounter() {
    return this.NR41 & 0x3f;
  }
  set lengthCounter(x) {
    this.memory[mapping.NR41_ADDR] &= 0b11000000;
    this.memory[mapping.NR41_ADDR] |= x;
  }

  get volume() {
    return (this.NR42 & 0xf0) >> 4;
  }
  set volume(x) {
    this.memory[mapping.NR42_ADDR] &= 0b00001111;
    this.memory[mapping.NR42_ADDR] |= x << 4;
  }

  get volumeSweepDirection() {
    return (this.NR42 & 0x8) >> 3;
  }
  set volumeSweepDirection(x) {
    if (x) this.memory[mapping.NR42_ADDR] |= 1 << 3;
    else this.memory[mapping.NR42_ADDR] &= 0b11110111;
  }

  get volumeSweepStepLength() {
    return this.NR42 & 0x7;
  }
  4;
  set volumeSweepStepLength(x) {
    this.memory[mapping.NR42_ADDR] &= 0b11111000;
    this.memory[mapping.NR42_ADDR] |= x;
  }

  get shiftClockFrequency() {
    return (this.NR43 & 0xf0) >> 4;
  }
  set shiftClockFrequency(x) {
    this.memory[mapping.NR43_ADDR] &= 0b00001111;
    this.memory[mapping.NR43_ADDR] |= x << 4;
  }

  get shiftRegisterWidth() {
    return this.NR43 & 0x8 ? 15 : 7;
  }
  set shiftRegisterWidth(x) {
    if (x) this.memory[mapping.NR42_ADDR] |= 1 << 3;
    else this.memory[mapping.NR42_ADDR] &= 0b11110111; //0=15bits, 1=7bits
  }

  get dividingRatio() {
    return this.NR43 & 0x7;
  }
  set dividingRatio(x) {
    this.memory[mapping.NR43_ADDR] &= 0b11111000;
    this.memory[mapping.NR43_ADDR] |= x;
  }

  get frequency() {
    let s = this.shiftClockFrequency(),
      r = this.dividingngRatio();

    if (!r) r = 0.5;
    return 524288 / (r * 2 * (s + 1));
  }

  constructor(memory) {
    this.memory = memory;
  }
}

class APU {
  // sound registers mapped to 0xFF10-0xFF3F in main memory
  // channel has five logical registers, NRx0-NRx4, though some don't use NRx0.
  // Reference to the value in a register means the last value written to it.

  // TODO : Sound Control Registers

  constructor(memory) {
    this.memory = memory;
  }
}
