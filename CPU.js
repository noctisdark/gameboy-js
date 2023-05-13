class CPU {
  constructor(gameboy) {
    //main memory
    this.gameboy = gameboy;
    this.memory = gameboy.memory;

    //register file
    this.reset();
  }

  reset() {
    this.RF = [0, 0, 0, 0, 0, 0, 0, 0]; // A F B C D E H L
    this.PC = this.SP = 0;
    this.IME = false;
    this.shouldSetIME = false;
    this.cycles = 0; //number of cycles the CPU is ahead of the PPU
    this.remainingCycles = 0; //remaining cycles to run
    this.halted = false;
  }

  get Z() {
    return (this.RF[1] & 0x80) >> 7;
  }
  get N() {
    return (this.RF[1] & 0x40) >> 6;
  }
  get H() {
    return (this.RF[1] & 0x20) >> 5;
  }
  get C() {
    return (this.RF[1] & 0x10) >> 4;
  }

  set Z(x) {
    if (x) {
      this.RF[1] |= 1 << 7;
    } else {
      this.RF[1] &= ~(1 << 7);
    }
  }
  set N(x) {
    if (x) {
      this.RF[1] |= 1 << 6;
    } else {
      this.RF[1] &= ~(1 << 6);
    }
  }
  set H(x) {
    if (x) {
      this.RF[1] |= 1 << 5;
    } else {
      this.RF[1] &= ~(1 << 5);
    }
  }
  set C(x) {
    if (x) {
      this.RF[1] |= 1 << 4;
    } else {
      this.RF[1] &= ~(1 << 4);
    }
  }

  set flag(x) {
    this.RF[1] = x << 4;
  }
  get flag() {
    return this.RF[1] >> 4;
  }

  get IF() {
    return this.memory.get(0xff0f);
  }
  get IE() {
    return this.memory.get(0xffff);
  }

  set IF(x) {
    this.memory.set(0xff0f, x);
  }
  set IE(x) {
    this.memory.set(0xffff, x);
  }

  get HL() {
    return this.RF[7] | (this.RF[6] << 8);
  }
  get BC() {
    return this.RF[3] | (this.RF[2] << 8);
  }
  get DE() {
    return this.RF[5] | (this.RF[4] << 8);
  }
  get AF() {
    return this.RF[1] | (this.RF[0] << 8);
  }

  set HL(x) {
    this.RF[7] = x & 0xff;
    this.RF[6] = (x & 0xff00) >> 8;
  }

  set BC(x) {
    this.RF[3] = x & 0xff;
    this.RF[2] = (x & 0xff00) >> 8;
  }

  set DE(x) {
    this.RF[5] = x & 0xff;
    this.RF[4] = (x & 0xff00) >> 8;
  }

  set AF(x) {
    this.RF[1] = x & 0xf0; //zero 4 bits
    this.RF[0] = (x & 0xff00) >> 8;
  }

  pop8() {
    return this.memory.get(++this.SP);
  }

  push8(x) {
    return this.memory.set(this.SP--, x);
  }

  pop16() {
    let l = this.memory.get(this.SP++),
      h = this.memory.get(this.SP++);
    return l | (h << 8);
  }

  push16(x) {
    let h = (x & 0xff00) >> 8,
      l = x & 0xff;
    this.memory.set(--this.SP, h);
    this.memory.set(--this.SP, l);
    return x;
  }

  get8() {
    return this.memory.get(this.PC++);
  }

  get16() {
    let l = this.memory.get(this.PC++),
      h = this.memory.get(this.PC++);
    return l | (h << 8);
  }

  add(x, y) {
    let s = x + y,
      z = (s & 0xff) == 0,
      h = (x & 0xf) + (y & 0xf) > 0xf,
      c = s > 0xff;

    this.RF[0] = s & 0xff;
    this.flag = (z << 3) | (h << 1) | c;
  }

  adc(x, y) {
    let s = x + y + this.C,
      z = (s & 0xff) == 0,
      h = (x & 0xf) + (y & 0xf) + this.C > 0xf,
      c = s > 0xff;

    this.RF[0] = s & 0xff;
    this.flag = (z << 3) | (h << 1) | c;
  }

  sub(x, y) {
    let s = x + CPU.twos8(y),
      z = (s & 0xff) == 0,
      h = (x & 0xf) + CPU.twos4(y) <= 0xf,
      c = s <= 0xff;

    this.RF[0] = s & 0xff;
    this.flag = (z << 3) | (1 << 2) | (h << 1) | c;
  }

  sbc(x, y) {
    let s = x + (this.C ? CPU.compl8(y) : CPU.twos8(y)),
      z = (s & 0xff) == 0,
      h = (x & 0xf) + (this.C ? CPU.compl4(y) : CPU.twos4(y)) <= 0xf,
      c = s <= 0xff;

    this.RF[0] = s & 0xff;
    this.flag = (z << 3) | (1 << 2) | (h << 1) | c;
  }

  and(x, y) {
    this.RF[0] = x & y;
    this.flag = ((this.RF[0] == 0) << 3) | (1 << 1);
  }

  xor(x, y) {
    this.RF[0] = x ^ y;
    this.flag = (this.RF[0] == 0) << 3;
  }

  or(x, y) {
    this.RF[0] = x | y;
    this.flag = (this.RF[0] == 0) << 3;
  }

  cp(x, y) {
    let s = x + CPU.twos8(y),
      z = (s & 0xff) == 0,
      h = (x & 0xf) + CPU.twos4(y) <= 0xf,
      c = s <= 0xff;

    this.flag = (z << 3) | (1 << 2) | (h << 1) | c;
  }

  inc(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      s = x + 1,
      z = (s & 0xff) == 0,
      h = (x & 0xf) + 1 > 0xf;

    this.RF[CPU.LD_POS[idx]] = s & 0xff;
    this.flag = (z << 3) | (h << 1) | this.C;
  }

  incHL() {
    let x = this.memory.get(this.HL),
      s = x + 1,
      z = (s & 0xff) == 0,
      h = (x & 0xf) + 1 > 0xf;

    this.memory.set(this.HL, s & 0xff);
    this.flag = (z << 3) | (h << 1) | this.C;
  }

  dec(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      s = x + CPU.twos8(1),
      z = (s & 0xff) == 0,
      h = (x & 0xf) + CPU.twos4(1) <= 0xf;

    this.RF[CPU.LD_POS[idx]] = s & 0xff;
    this.flag = (z << 3) | (1 << 2) | (h << 1) | this.C;
  }

  decHL() {
    let x = this.memory.get(this.HL),
      s = x + CPU.twos8(1),
      z = (s & 0xff) == 0,
      h = (x & 0xf) + CPU.twos4(1) <= 0xf;

    this.memory.set(this.HL, s & 0xff);
    this.flag = (z << 3) | (1 << 2) | (h << 1) | this.C;
  }

  addHL(y) {
    let x = this.HL,
      s = x + y,
      h = (x & 0xfff) + (y & 0xfff) > 0xfff,
      c = s > 0xffff;

    this.HL = s & 0xffff;
    this.flag = (this.Z << 3) | (h << 1) | c;
  }

  rlca() {
    let x = this.RF[0],
      b0 = (x & 0x80) >> 7,
      res = (x << 1) | b0,
      c = res & 0x100;

    this.RF[0] = res & 0xff;
    this.flag = c >> 8;
  }

  rla() {
    let x = this.RF[0],
      res = (x << 1) | this.C,
      c = res & 0x100;

    this.RF[0] = res & 0xff;
    this.flag = c >> 8;
  }

  rrca() {
    let x = this.RF[0],
      c = x & 1,
      res = x >> 1;

    this.RF[0] = res | (c << 7); //no need to & with 0xff
    this.flag = c;
  }

  rra() {
    let x = this.RF[0],
      c7 = this.C,
      c = x & 1,
      res = (x >> 1) | (c7 << 7);

    this.RF[0] = res; //no need to & with 0xff
    this.flag = c;
  }

  daa() {
    let x = this.RF[0],
      a = (x & 0xf0) >> 4,
      b = x & 0xf,
      correction = 0,
      n = this.N,
      h = this.H,
      c = this.C,
      z;

    if (h || (!n && b >= 0xa)) correction |= 6;

    if (c || (!n && x >= 0x9a)) {
      correction |= 0x60;
      c = 1;
    }

    this.RF[0] += n ? -correction : correction;
    this.RF[0] &= 0xff;
    z = this.RF[0] == 0;
    this.flag = (z << 3) | (n << 2) | c;
  }

  scf() {
    this.flag = (this.Z << 3) | 1;
  }

  cpl() {
    this.RF[0] = ~this.RF[0] & 0xff;
    this.flag = (this.Z << 3) | (1 << 2) | (1 << 1) | this.C;
  }

  ccf() {
    this.flag = (this.Z << 3) | !this.C;
  }

  rlc(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      b0 = (x & 0x80) >> 7,
      res = (x << 1) | b0;

    this.RF[CPU.LD_POS[idx]] = res & 0xff;
    this.flag = ((this.RF[CPU.LD_POS[idx]] == 0) << 3) | b0;
  }

  rlcHL() {
    let x = this.memory.get(this.HL),
      b0 = (x & 0x80) >> 7,
      res = (x << 1) | b0;

    this.memory.set(this.HL, res & 0xff);
    this.flag = ((this.memory.get(this.HL) == 0) << 3) | b0;
  }

  rrc(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      c = x & 1,
      res = (x >> 1) | (c << 7);

    this.RF[CPU.LD_POS[idx]] = res; //no need to & 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  rrcHL() {
    let x = this.memory.get(this.HL),
      c = x & 1,
      res = (x >> 1) | (c << 7);

    this.memory.set(this.HL, res); //no need to & 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  rl(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      b0 = this.C,
      res = (x << 1) | b0,
      c = res & 0x100;

    this.RF[CPU.LD_POS[idx]] = res & 0xff;
    this.flag = ((this.RF[CPU.LD_POS[idx]] == 0) << 3) | (c >> 8);
  }

  rlHL() {
    let x = this.memory.get(this.HL),
      b0 = this.C,
      res = (x << 1) | b0,
      c = res & 0x100;

    this.memory.set(this.HL, res & 0xff);
    this.flag = ((this.memory.get(this.HL) == 0) << 3) | (c >> 8);
  }

  rr(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      c7 = this.C,
      c = x & 1,
      res = (x >> 1) | (c7 << 7);

    this.RF[CPU.LD_POS[idx]] = res; //no need to & with 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  rrHL() {
    let x = this.memory.get(this.HL),
      c7 = this.C,
      c = x & 1,
      res = (x >> 1) | (c7 << 7);

    this.memory.set(this.HL, res); //no need to & with 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  sla(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      c = x & 0x80,
      res = (x << 1) & 0xff;

    this.RF[CPU.LD_POS[idx]] = res; //no need to & with 0xff
    this.flag = ((res == 0) << 3) | (c >> 7);
  }

  slaHL() {
    let x = this.memory.get(this.HL),
      c = x & 0x80,
      res = (x << 1) & 0xff;

    this.memory.set(this.HL, res); //no need to & with 0xff
    this.flag = ((res == 0) << 3) | (c >> 7);
  }

  sra(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      b7 = x & 0x80,
      c = x & 1,
      res = b7 | (x >> 1);

    this.RF[CPU.LD_POS[idx]] = res; //no need to & with 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  sraHL() {
    let x = this.memory.get(this.HL),
      b7 = x & 0x80,
      c = x & 1,
      res = b7 | (x >> 1);

    this.memory.set(this.HL, res); //no need to & with 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  swap(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      upper = x & 0xf0,
      lower = x & 0xf,
      res = (lower << 4) | (upper >> 4);

    this.RF[CPU.LD_POS[idx]] = res; //no need to & with 0xff
    this.flag = (res == 0) << 3;
  }

  swapHL() {
    let x = this.memory.get(this.HL),
      upper = x & 0xf0,
      lower = x & 0xf,
      res = (lower << 4) | (upper >> 4);

    this.memory.set(this.HL, res); //no need to & with 0xff
    this.flag = (res == 0) << 3;
  }

  srl(idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      c = x & 1,
      res = x >> 1;

    this.RF[CPU.LD_POS[idx]] = res; //no need to & with 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  srlHL() {
    let x = this.memory.get(this.HL),
      c = x & 1,
      res = x >> 1;

    this.memory.set(this.HL, res); //no need to & with 0xff
    this.flag = ((res == 0) << 3) | c;
  }

  bit(n, idx) {
    let x = this.RF[CPU.LD_POS[idx]],
      b = (x & (1 << n)) >> n;

    this.flag = (!b << 3) | (1 << 1) | this.C;
  }

  bitHL(n) {
    let x = this.memory.get(this.HL),
      b = (x & (1 << n)) >> n;

    this.flag = (!b << 3) | (1 << 1) | this.C;
  }

  res(n, idx) {
    this.RF[CPU.LD_POS[idx]] &= ~(1 << n);
  }

  resHL(n) {
    this.memory.set(this.HL, this.memory.get(this.HL) & ~(1 << n));
  }

  set(n, idx) {
    this.RF[CPU.LD_POS[idx]] |= 1 << n;
  }

  setHL(n) {
    this.memory.set(this.HL, this.memory.get(this.HL) | (1 << n));
  }

  //used after stop instruction
  stop() {
    throw "stopped";
  }

  //used after halt instruction
  halt() {
    this.halted = true;
  }

  execute(inst) {
    let addr, cc, r8, n;

    switch (inst) {
      case 0:
        this.cycles += 4;
        break;

      //JUMPS
      case 0x18: //JR r8
        r8 = CPU.signed8(this.get8());
        this.PC += r8;
        this.cycles += 12;
        break;

      case 0x20: //JR NZ, r8
      case 0x28: //JR Z, r8
        r8 = CPU.signed8(this.get8());
        cc = inst & 0x8 ? this.Z : !this.Z;
        if (cc) {
          this.PC += r8;
          this.cycles += 12;
        } else {
          this.cycles += 8;
        }
        break;

      case 0x30: //JR NC, r8
      case 0x38: //JR C, r8
        r8 = CPU.signed8(this.get8());
        cc = inst & 0x8 ? this.C : !this.C;
        if (cc) {
          this.PC += r8;
          this.cycles += 12;
        } else {
          this.cycles += 8;
        }
        break;

      case 0xc0: //RET NZ
      case 0xc8: //RET Z
        cc = inst & 0x8 ? this.Z : !this.Z;
        if (cc) {
          addr = this.pop16();
          this.PC = addr;
          this.cycles += 20;
        } else {
          this.cycles += 8;
        }
        break;

      case 0xd0: //RET NC
      case 0xd8: //RET C
        cc = inst & 0x8 ? this.C : !this.C;
        if (cc) {
          addr = this.pop16();
          this.PC = addr;
          this.cycles += 20;
        } else {
          this.cycles += 8;
        }
        break;

      case 0xc9: //RET
        addr = this.pop16();
        this.PC = addr;
        this.cycles += 16;
        break;

      case 0xc2: //JP NZ, a16
      case 0xca: //JP Z, a16
        addr = this.get16();
        cc = inst & 0x8 ? this.Z : !this.Z;
        if (cc) {
          this.PC = addr;
          this.cycles += 16;
        } else {
          this.cycles += 12;
        }
        break;

      case 0xd2: //JP NC, a16
      case 0xda: //JP C, a16
        addr = this.get16();
        cc = inst & 0x8 ? this.C : !this.C;
        if (cc) {
          this.PC = addr;
          this.cycles += 16;
        } else {
          this.cycles += 12;
        }
        break;

      case 0xc3: //JP a16
        addr = this.get16();
        this.PC = addr;
        this.cycles += 16;
        break;

      case 0xd9: //RETI
        addr = this.pop16();
        this.PC = addr;
        this.IME = true;
        this.cycles += 16;
        break;

      case 0xe9: // JP HL
        //console.log('jumping to HL');
        this.PC = this.HL;
        this.cycles += 4;
        break;

      case 0xc4: //CALL NZ, a16
      case 0xcc: //CALL Z, a16
        addr = this.get16();
        cc = inst & 0x8 ? this.Z : !this.Z;
        if (cc) {
          this.push16(this.PC);
          this.PC = addr;
          this.cycles += 24;
        } else {
          this.cycles += 12;
        }
        break;

      case 0xd4: //CALL NC, a16
      case 0xdc: //CALL C, a16
        addr = this.get16();
        cc = inst & 0x8 ? this.C : !this.C;
        if (cc) {
          this.push16(this.PC);
          this.PC = addr;
          this.cycles += 24;
        } else {
          this.cycles += 12;
        }
        break;

      case 0xcd: //CALL a16
        addr = this.get16();
        this.push16(this.PC);
        this.PC = addr;
        this.cycles += 24;
        break;

      case 0xc7:
      case 0xcf:
      case 0xd7:
      case 0xdf:
      case 0xe7:
      case 0xef:
      case 0xf7:
      case 0xff:
        addr = (inst & 0xf0) - 0xc0 + ((inst & 0xf) == 0xf ? 0x8 : 0);
        this.push16(this.PC);
        this.PC = addr;
        this.cycles += 4;
        break;

      // 8-bit LOADS
      case 0x40:
      case 0x41:
      case 0x42:
      case 0x43:
      case 0x44:
      case 0x45:
      case 0x47: //LD B, X
        this.RF[2] = this.RF[CPU.LD_POS[inst - 0x40]];
        this.cycles += 4;
        break;

      case 0x46: //LD B, (HL)
        this.RF[2] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x48:
      case 0x49:
      case 0x4a:
      case 0x4b:
      case 0x4c:
      case 0x4d:
      case 0x4f: //LD C, X
        this.RF[3] = this.RF[CPU.LD_POS[inst - 0x48]];
        this.cycles += 4;
        break;

      case 0x4e: //LD C, (HL)
        this.RF[3] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x50:
      case 0x51:
      case 0x52:
      case 0x53:
      case 0x54:
      case 0x55:
      case 0x57: //LD D, X
        this.RF[4] = this.RF[CPU.LD_POS[inst - 0x50]];
        this.cycles += 4;
        break;

      case 0x56: //LD D, (HL)
        this.RF[4] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x58:
      case 0x59:
      case 0x5a:
      case 0x5b:
      case 0x5c:
      case 0x5d:
      case 0x5f: //LD E, X
        this.RF[5] = this.RF[CPU.LD_POS[inst - 0x58]];
        this.cycles += 4;
        break;

      case 0x5e: //LD E, (HL)
        this.RF[5] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x60:
      case 0x61:
      case 0x62:
      case 0x63:
      case 0x64:
      case 0x65:
      case 0x67: //LD H, X
        this.RF[6] = this.RF[CPU.LD_POS[inst - 0x60]];
        this.cycles += 4;
        break;

      case 0x66: //LD H, (HL)
        this.RF[6] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x68:
      case 0x69:
      case 0x6a:
      case 0x6b:
      case 0x6c:
      case 0x6d:
      case 0x6f: //LD L, X
        this.RF[7] = this.RF[CPU.LD_POS[inst - 0x68]];
        this.cycles += 4;
        break;

      case 0x6e: //LD L, (HL)
        this.RF[7] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x70:
      case 0x71:
      case 0x72:
      case 0x73:
      case 0x74:
      case 0x75:
      case 0x77: //LD (HL), X
        this.memory.set(this.HL, this.RF[CPU.LD_POS[inst - 0x70]]);
        this.cycles += 8;
        break;

      case 0x78:
      case 0x79:
      case 0x7a:
      case 0x7b:
      case 0x7c:
      case 0x7d:
      case 0x7f: //LD A, X
        this.RF[0] = this.RF[CPU.LD_POS[inst - 0x78]];
        this.cycles += 4;
        break;

      case 0x7e: //LD A, (HL)
        this.RF[0] = this.memory.get(this.HL);
        this.cycles += 8;
        break;

      case 0x02: //LD (BC), A
        this.memory.set(this.BC, this.RF[0]);
        this.cycles += 8;
        break;
      case 0x12: //LD (DE), A
        this.memory.set(this.DE, this.RF[0]);
        this.cycles += 8;
        break;
      case 0x22: //LD (HL+), A
        this.memory.set(this.HL++, this.RF[0]);
        this.cycles += 8;
        break;
      case 0x32: //LD (HL-), A
        this.memory.set(this.HL--, this.RF[0]);
        this.cycles += 8;
        break;

      case 0x06: //LD B, d8
        this.RF[2] = this.get8();
        this.cycles += 8;
        break;
      case 0x16: //LD D, d8
        this.RF[4] = this.get8();
        this.cycles += 8;
        break;
      case 0x26: //LD H, d8
        this.RF[6] = this.get8();
        this.cycles += 8;
        break;
      case 0x36: //LD (HL), d8
        this.memory.set(this.HL, this.get8());
        this.cycles += 12;
        break;

      case 0x0a: //LD A, (BC)
        this.RF[0] = this.memory.get(this.BC);
        this.cycles += 8;
        break;
      case 0x1a: //LD A, (DE)
        this.RF[0] = this.memory.get(this.DE);
        this.cycles += 8;
        break;
      case 0x2a: //LD A, (HL+)
        this.RF[0] = this.memory.get(this.HL++);
        this.cycles += 8;
        break;
      case 0x3a: //LD A, (HL-)
        this.RF[0] = this.memory.get(this.HL--);
        this.cycles += 8;
        break;

      case 0x0e: //LD C, d8
        this.RF[3] = this.get8();
        this.cycles += 8;
        break;
      case 0x1e: //LD E, d8
        this.RF[5] = this.get8();
        this.cycles += 8;
        break;
      case 0x2e: //LD L, d8
        this.RF[7] = this.get8();
        this.cycles += 8;
        break;
      case 0x3e: //LD A, d8
        this.RF[0] = this.get8();
        this.cycles += 8;
        break;

      case 0xe0: //LDH (a8), A
        r8 = this.get8();
        this.memory.set(0xff00 + r8, this.RF[0]);
        this.cycles += 12;
        break;
      case 0xf0: //LDH A, (a8)
        r8 = this.get8();
        this.RF[0] = this.memory.get(0xff00 + r8);
        this.cycles += 12;
        break;

      case 0xe2: //LD (C), A
        this.memory.set(0xff00 + this.RF[3], this.RF[0]);
        this.cycles += 8;
        break;
      case 0xf2: //LD A, (C)
        this.RF[0] = this.memory.get(0xff00 + this.RF[3]);
        this.cycles += 8;
        break;

      case 0xea: //LD (a16), A
        addr = this.get16();
        this.memory.set(addr, this.RF[0]);
        this.cycles += 16;
        break;
      case 0xfa: //LD A, (a16)
        addr = this.get16();
        this.RF[0] = this.memory.get(addr);
        this.cycles += 16;
        break;

      // 16-bit LOAD
      case 0x01: //LD BC, d16
        addr = this.get16();
        this.BC = addr;
        this.cycles += 12;
        break;
      case 0x11: //LD DE, d16
        addr = this.get16();
        this.DE = addr;
        this.cycles += 12;
        break;
      case 0x21: //LD HL, d16
        addr = this.get16();
        this.HL = addr;
        this.cycles += 12;
        break;
      case 0x31: //LD SP, d16
        addr = this.get16();
        this.SP = addr;
        this.cycles += 12;
        break;

      case 0x08: //LD (a16), SP
        addr = this.get16();
        this.memory.set(addr, this.SP & 0xff);
        this.memory.set(addr + 1, this.SP >> 8);
        this.cycles += 20;
        break;

      case 0xc1: //POP BC
        this.BC = this.pop16();
        this.cycles += 12;
        break;
      case 0xd1: //POP DE
        this.DE = this.pop16();
        this.cycles += 12;
        break;
      case 0xe1: //POP HL
        this.HL = this.pop16();
        this.cycles += 12;
        break;
      case 0xf1: //POP AF
        this.AF = this.pop16();
        this.cycles += 12;
        break;

      case 0xc5: //PUSH BC
        this.push16(this.BC);
        this.cycles += 12;
        break;
      case 0xd5: //PUSH DE
        this.push16(this.DE);
        this.cycles += 12;
        break;
      case 0xe5: //PUSH HL
        this.push16(this.HL);
        this.cycles += 12;
        break;
      case 0xf5: //PUSH AF
        this.push16(this.AF);
        this.cycles += 12;
        break;

      case 0xf8: //LD HL, SP+r8 //--optimize if works
        n = this.get8();
        r8 = CPU.signed8(n);
        this.flag =
          (((this.SP & 0xf) + (n & 0xf) > 0xf) << 1) |
          ((this.SP & 0xff) + n > 0xff);
        this.HL = (this.SP + r8) & 0xffff;
        this.cycles += 12;
        break;

      case 0xf9: //LD SP, HL
        this.SP = this.HL;
        this.cycles += 8;
        break;

      // 8-bit arith/logic
      case 0x80:
      case 0x81:
      case 0x82:
      case 0x83:
      case 0x84:
      case 0x85:
      case 0x87: //ADD A, X
        this.add(this.RF[0], this.RF[CPU.LD_POS[inst - 0x80]]);
        this.cycles += 4;
        break;

      case 0x86: //ADD A, (HL)
        this.add(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xc6: //ADD A, d8
        r8 = this.get8();
        this.add(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0x88:
      case 0x89:
      case 0x8a:
      case 0x8b:
      case 0x8c:
      case 0x8d:
      case 0x8f: //ADC A, X
        this.adc(this.RF[0], this.RF[CPU.LD_POS[inst - 0x88]]);
        this.cycles += 4;
        break;

      case 0x8e: //ADC A, (HL)
        this.adc(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xce: //ADC A, d8
        r8 = this.get8();
        this.adc(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0x90:
      case 0x91:
      case 0x92:
      case 0x93:
      case 0x94:
      case 0x95:
      case 0x97: //SUB A, X
        this.sub(this.RF[0], this.RF[CPU.LD_POS[inst - 0x90]]);
        this.cycles += 4;
        break;

      case 0x96: //SUB A, (HL)
        this.sub(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xd6: //SUB A, d8
        r8 = this.get8();
        this.sub(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0x98:
      case 0x99:
      case 0x9a:
      case 0x9b:
      case 0x9c:
      case 0x9d:
      case 0x9f: //SBC A, X
        this.sbc(this.RF[0], this.RF[CPU.LD_POS[inst - 0x98]]);
        this.cycles += 4;
        break;

      case 0x9e: //SBC A, (HL)
        this.sbc(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xde: //SBC A, d8
        r8 = this.get8();
        this.sbc(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0xa0:
      case 0xa1:
      case 0xa2:
      case 0xa3:
      case 0xa4:
      case 0xa5:
      case 0xa7: //AND A, X
        this.and(this.RF[0], this.RF[CPU.LD_POS[inst - 0xa0]]);
        this.cycles += 4;
        break;

      case 0xa6: //AND A, (HL)
        this.and(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xe6: //AND A, d8
        r8 = this.get8();
        this.and(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0xa8:
      case 0xa9:
      case 0xaa:
      case 0xab:
      case 0xac:
      case 0xad:
      case 0xaf: //XOR A, X
        this.xor(this.RF[0], this.RF[CPU.LD_POS[inst - 0xa8]]);
        this.cycles += 4;
        break;

      case 0xae: //XOR A, (HL)
        this.xor(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xee: //XOR A, d8
        r8 = this.get8();
        this.xor(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0xb0:
      case 0xb1:
      case 0xb2:
      case 0xb3:
      case 0xb4:
      case 0xb5:
      case 0xb7: //OR A, X
        this.or(this.RF[0], this.RF[CPU.LD_POS[inst - 0xb0]]);
        this.cycles += 4;
        break;

      case 0xb6: //OR A, (HL)
        this.or(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xf6: //OR A, d8
        r8 = this.get8();
        this.or(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0xb8:
      case 0xb9:
      case 0xba:
      case 0xbb:
      case 0xbc:
      case 0xbd:
      case 0xbf: //CP A, X
        this.cp(this.RF[0], this.RF[CPU.LD_POS[inst - 0xb8]]);
        this.cycles += 4;
        break;

      case 0xbe: //cp A, (HL)
        this.cp(this.RF[0], this.memory.get(this.HL));
        this.cycles += 8;
        break;

      case 0xfe: //CP d8
        r8 = this.get8();
        this.cp(this.RF[0], r8);
        this.cycles += 8;
        break;

      case 0x04:
      case 0x0c:
      case 0x14:
      case 0x1c:
      case 0x24:
      case 0x2c:
      case 0x3c: //INC X
        this.inc((inst - 0x04) / 0x08);
        this.cycles += 4;
        break;

      case 0x34: //INC (HL)
        this.incHL();
        this.cycles += 12;
        break;

      case 0x05:
      case 0x0d:
      case 0x15:
      case 0x1d:
      case 0x25:
      case 0x2d:
      case 0x3d: //DEC X
        this.dec((inst - 0x05) / 0x08);
        this.cycles += 4;
        break;

      case 0x35: //DEC (HL)
        this.decHL();
        this.cycles += 12;
        break;

      case 0x27: //DAA
        this.daa();
        this.cycles += 4;
        break;
      case 0x2f: //CPL
        this.cpl();
        this.cycles += 4;
        break;

      case 0x37: //SCF
        this.scf();
        this.cycles += 4;
        break;
      case 0x3f: //CPL
        this.ccf();
        this.cycles += 4;
        break;

      // 16-bit arith/logic
      case 0x03: //inc BC
        this.BC += 1;
        this.cycles += 8;
        break;
      case 0x0b: //dec BC
        this.BC -= 1;
        this.cycles += 8;
        break;
      case 0x09: //ADD HL, BC
        this.addHL(this.BC);
        this.cycles += 8;
        break;

      case 0x13: //inc DE
        this.DE += 1;
        this.cycles += 8;
        break;
      case 0x1b: //dec DE
        this.DE -= 1;
        this.cycles += 8;
        break;
      case 0x19: //ADD HL, DE
        this.addHL(this.DE);
        this.cycles += 8;
        break;

      case 0x23: //inc HL
        this.HL += 1;
        this.cycles += 8;
        break;
      case 0x2b: //dec HL
        this.HL -= 1;
        this.cycles += 8;
        break;
      case 0x29: //ADD HL, HL
        this.addHL(this.HL);
        this.cycles += 8;
        break;

      case 0x33: //inc SP
        this.SP = (this.SP + 1) & 0xffff;
        this.cycles += 8;
        break;
      case 0x3b: //dec SP
        this.SP = (this.SP - 1) & 0xffff;
        this.cycles += 8;
        break;
      case 0x39: //ADD HL, SP
        this.addHL(this.SP);
        this.cycles += 8;
        break;

      case 0xe8: //add SP, s8
        n = this.get8();
        r8 = CPU.signed8(n);
        this.flag =
          (((this.SP & 0xf) + (n & 0xf) > 0xf) << 1) |
          ((this.SP & 0xff) + n > 0xff);
        this.SP = (this.SP + r8) & 0xffff;
        this.cycles += 16;
        break;

      //Bit operations
      case 0x07: //RLCA
        this.rlca();
        break;
      case 0x17: //RLA
        this.rla();
        break;

      case 0x0f: //RRCA
        this.rrca();
        break;
      case 0x1f: //RRA
        this.rra();
        break;

      //Misc / control
      case 0x00: //NOP
        this.cycles += 4;
        break;

      case 0x10: //STOP
        this.get8();
        this.stop();
        this.cycles += 4;
        break;

      case 0xf3: //DI
        this.IME = false;
        this.cycles += 4;
        break;

      case 0xfb: //EI
        //console.log('setting EI')
        this.shouldSetIME = true;
        this.cycles += 4;
        return;

      case 0xcb:
        r8 = this.get8();
        this.cycles += 4;
        this.executeCB(r8);
        break;

      case 0x76: //HALT
        this.halt();
        this.cycles += 4;
        break;

      default:
        throw (
          "Unknown opcode " +
          inst.toString(16) +
          " at address " +
          (--this.PC).toString(16)
        );
        break;
    }
  }

  executeCB(inst) {
    //console.log('CB address', this.PC-1, 'inst', inst.toString(16));
    let n, r8;

    switch (inst) {
      case 0x00:
      case 0x01:
      case 0x02:
      case 0x03:
      case 0x04:
      case 0x05:
      case 0x07: //RLC X
        this.rlc(inst - 0x0);
        this.cycles += 8;
        break;

      case 0x06: // RLC (HL)
        this.rlcHL();
        this.cycles += 16;
        break;

      case 0x08:
      case 0x09:
      case 0x0a:
      case 0x0b:
      case 0x0c:
      case 0x0d:
      case 0x0f: //RRC X
        this.rrc(inst - 0x8);
        this.cycles += 8;
        break;

      case 0x0e: // RRC (HL)
        this.rrcHL();
        this.cycles += 16;
        break;

      case 0x10:
      case 0x11:
      case 0x12:
      case 0x13:
      case 0x14:
      case 0x15:
      case 0x17: //RL X
        this.rl(inst - 0x10);
        this.cycles += 8;
        break;

      case 0x16: // RL (HL)
        this.rlHL();
        this.cycles += 16;
        break;

      case 0x18:
      case 0x19:
      case 0x1a:
      case 0x1b:
      case 0x1c:
      case 0x1d:
      case 0x1f: //RR X
        this.rr(inst - 0x18);
        this.cycles += 8;
        break;

      case 0x1e: // RR (HL)
        this.rrHL();
        this.cycles += 16;
        break;

      case 0x20:
      case 0x21:
      case 0x22:
      case 0x23:
      case 0x24:
      case 0x25:
      case 0x27: //SLA X
        this.sla(inst - 0x20);
        this.cycles += 8;
        break;

      case 0x26: // SLA (HL)
        this.slaHL();
        this.cycles += 16;
        break;

      case 0x28:
      case 0x29:
      case 0x2a:
      case 0x2b:
      case 0x2c:
      case 0x2d:
      case 0x2f: //SRA X
        this.sra(inst - 0x28);
        this.cycles += 8;
        break;

      case 0x2e: // RR (HL)
        this.sraHL();
        this.cycles += 16;
        break;

      case 0x30:
      case 0x31:
      case 0x32:
      case 0x33:
      case 0x34:
      case 0x35:
      case 0x37: //SWAP X
        this.swap(inst - 0x30);
        this.cycles += 8;
        break;

      case 0x36: // SWAP (HL)
        this.swapHL();
        this.cycles += 16;
        break;

      case 0x38:
      case 0x39:
      case 0x3a:
      case 0x3b:
      case 0x3c:
      case 0x3d:
      case 0x3f: //SRL X
        this.srl(inst - 0x38);
        this.cycles += 8;
        break;

      case 0x3e: // RR (HL)
        this.srlHL();
        this.cycles += 16;
        break;

      //BIT N, X
      case 0x40:
      case 0x50:
      case 0x60:
      case 0x70:
      case 0x41:
      case 0x51:
      case 0x61:
      case 0x71:
      case 0x42:
      case 0x52:
      case 0x62:
      case 0x72:
      case 0x43:
      case 0x53:
      case 0x63:
      case 0x73:
      case 0x44:
      case 0x54:
      case 0x64:
      case 0x74:
      case 0x45:
      case 0x55:
      case 0x65:
      case 0x75:
      case 0x47:
      case 0x57:
      case 0x67:
      case 0x77:
      case 0x48:
      case 0x58:
      case 0x68:
      case 0x78:
      case 0x49:
      case 0x59:
      case 0x69:
      case 0x79:
      case 0x4a:
      case 0x5a:
      case 0x6a:
      case 0x7a:
      case 0x4b:
      case 0x5b:
      case 0x6b:
      case 0x7b:
      case 0x4c:
      case 0x5c:
      case 0x6c:
      case 0x7c:
      case 0x4d:
      case 0x5d:
      case 0x6d:
      case 0x7d:
      case 0x4f:
      case 0x5f:
      case 0x6f:
      case 0x7f:
        n = parseInt((inst - 0x40) / 0x8);
        r8 = (inst & 0xf) % 0x8;
        //console.log('BIT', n, r8);
        this.bit(n, r8);
        this.cycles += 8;
        break;

      //BIT n, (HL)
      case 0x46:
      case 0x4e:
      case 0x56:
      case 0x5e:
      case 0x66:
      case 0x6e:
      case 0x76:
      case 0x7e:
        n = parseInt((inst - 0x40) / 0x8);
        this.bitHL(n);
        this.cycles += 16;
        break;

      //RES N, X
      case 0x80:
      case 0x90:
      case 0xa0:
      case 0xb0:
      case 0x81:
      case 0x91:
      case 0xa1:
      case 0xb1:
      case 0x82:
      case 0x92:
      case 0xa2:
      case 0xb2:
      case 0x83:
      case 0x93:
      case 0xa3:
      case 0xb3:
      case 0x84:
      case 0x94:
      case 0xa4:
      case 0xb4:
      case 0x85:
      case 0x95:
      case 0xa5:
      case 0xb5:
      case 0x87:
      case 0x97:
      case 0xa7:
      case 0xb7:
      case 0x88:
      case 0x98:
      case 0xa8:
      case 0xb8:
      case 0x89:
      case 0x99:
      case 0xa9:
      case 0xb9:
      case 0x8a:
      case 0x9a:
      case 0xaa:
      case 0xba:
      case 0x8b:
      case 0x9b:
      case 0xab:
      case 0xbb:
      case 0x8c:
      case 0x9c:
      case 0xac:
      case 0xbc:
      case 0x8d:
      case 0x9d:
      case 0xad:
      case 0xbd:
      case 0x8f:
      case 0x9f:
      case 0xaf:
      case 0xbf:
        n = parseInt((inst - 0x80) / 0x8);
        r8 = (inst & 0xf) % 0x8;
        //console.log('RES', n, r8)
        this.res(n, r8);
        this.cycles += 8;
        break;

      //RES n, (HL)
      case 0x86:
      case 0x8e:
      case 0x96:
      case 0x9e:
      case 0xa6:
      case 0xae:
      case 0xb6:
      case 0xbe:
        n = parseInt((inst - 0x80) / 0x8);
        this.resHL(n);
        this.cycles += 16;
        break;

      //SET N, X
      case 0xc0:
      case 0xd0:
      case 0xe0:
      case 0xf0:
      case 0xc1:
      case 0xd1:
      case 0xe1:
      case 0xf1:
      case 0xc2:
      case 0xd2:
      case 0xe2:
      case 0xf2:
      case 0xc3:
      case 0xd3:
      case 0xe3:
      case 0xf3:
      case 0xc4:
      case 0xd4:
      case 0xe4:
      case 0xf4:
      case 0xc5:
      case 0xd5:
      case 0xe5:
      case 0xf5:
      case 0xc7:
      case 0xd7:
      case 0xe7:
      case 0xf7:
      case 0xc8:
      case 0xd8:
      case 0xe8:
      case 0xf8:
      case 0xc9:
      case 0xd9:
      case 0xe9:
      case 0xf9:
      case 0xca:
      case 0xda:
      case 0xea:
      case 0xfa:
      case 0xcb:
      case 0xdb:
      case 0xeb:
      case 0xfb:
      case 0xcc:
      case 0xdc:
      case 0xec:
      case 0xfc:
      case 0xcd:
      case 0xdd:
      case 0xed:
      case 0xfd:
      case 0xcf:
      case 0xdf:
      case 0xef:
      case 0xff:
        n = parseInt((inst - 0xc0) / 0x8);
        r8 = (inst & 0xf) % 0x8;
        //console.log('SET', n, r8)
        this.set(n, r8);
        this.cycles += 8;
        break;

      //RES n, (HL)
      case 0xc6:
      case 0xce:
      case 0xd6:
      case 0xde:
      case 0xe6:
      case 0xee:
      case 0xf6:
      case 0xfe:
        n = parseInt((inst - 0xc0) / 0x8);
        this.setHL(n);
        this.cycles += 16;
        break;

      default:
        break;
    }
  }

  interruptProcedure(addr) {
    //(2 machine cycles pass while nothing occurs, presumably the CPU is executing NOPs
    //during this time).
    this.cycles += 8;
    //The current PC is pushed onto the stack, this process consumes 2 more machine cycles.
    this.push16(this.PC);
    this.cycles += 8;
    //The high byte of the PC is set to 0, the low byte is set to the address of the
    //handler ($40,$48,$50,$58,$60). This consumes one last machine cycle
    //console.log('going to addr', addr.toString(16))
    this.PC = addr;
    this.cycles += 4;
  }

  checkInterrupt() {
    //handle interrupts
    if (!this.IME) return false;
    //V-Blank Interrupt, highest priority

    if (this.IF == 0) return (this.gameboy.shouldCheckInterrupt = false);

    if (this.IF & 1 && this.IE & 1) {
      this.IME = false;
      this.IF &= ~1;
      //console.log('removed V Blank IF');
      this.interruptProcedure(0x40);
      return true;
    }

    //LCD STAT
    if (this.IF & 2 && this.IE & 2) {
      this.IME = false;
      this.IF &= ~2;
      this.interruptProcedure(0x48);
      return true;
    }

    //Timer
    if (this.IF & 4 && this.IE & 4) {
      this.IME = false;
      this.IF &= ~4;
      this.interruptProcedure(0x50);
      return true;
    }

    //Serial
    if (this.IF & 8 && this.IE & 8) {
      this.IME = false;
      this.IF &= ~8;
      this.interruptProcedure(0x58);
      return true;
    }

    //Joypad
    if (this.IF & 16 && this.IE & 16) {
      this.IME = false;
      this.IF &= ~16;
      this.interruptProcedure(0x60);
      return true;
    }

    return false;
  }

  step() {
    if (this.gameboy.shouldCheckInterrupt) this.checkInterrupt();

    if (this.shouldSetIME) {
      //EI
      this.execute(this.get8());
      this.IME = true;
      this.shouldSetIME = false;
    } else {
      //normal execution
      this.execute(this.get8());
    }
  }

  catch(remainingCycles) {
    this.remainingCycles = remainingCycles;
    this.cycles = 0;
    while (this.remainingCycles > 0) {
      this.step();
      this.remainingCycles -= this.cycles; // --optimise, by setting cycles of last inst for exemple
      this.cycles = 0;
    }

    if (this.remainingCycles < 0) this.cycles = -this.remainingCycles;
    this.remainingCycles = 0;
  }

  static signed8(x) {
    if (x > 0x7f) return x - 256;
    return x;
  }

  static signed16(x) {
    if (x > 0x7fff) return x - 65536;
    return x;
  }

  static twos8(x) {
    return (~x & 0xff) + 1;
  }

  static compl8(x) {
    return ~x & 0xff;
  }

  static twos4(x) {
    return (~x & 0xf) + 1;
  }

  static compl4(x) {
    return ~x & 0xf;
  }
}

// A F B C D E H L <-> B C D E H L (HL) A
CPU.LD_POS = [2, 3, 4, 5, 6, 7, -1, 0];
CPU.LD_NAMES = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];

export default CPU;
//TODO: interrupts, priorities and the Interrupt Service Routine
//TODO: write test to cover all non-similar instruction

// --optimise Maybe a way to compute h from s
