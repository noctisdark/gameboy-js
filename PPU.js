import FIFO from "./FIFO";

class PPU {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this.VRAM = new Array(0x2000);
    this.VRAM.fill(0);
    this.pixels = new Array(160 * 144);
    this.pixels.fill(0);
    // 4 bytes per sprite

    // Byte 0 - Y position
    //   Specifies the sprites vertical position on the screen (minus 16).
    //   An off-screen value (for example, Y=0 or Y>=160) hides the sprite.
    // Byte 1 - X position
    //   Specifies the sprites horizontal position on the screen (minus 8).
    //   An off-screen value (X=0 or X>=168) hides the sprite,
    //   but the sprite still affects the priority ordering
    // Byte 2 - Tile/Pattern Number
    //   Specifies the sprites Tile Number (00-FF). This (unsigned) value selects a
    //   tile from memory at 8000h-8FFFh.
    //   In 8x16 mode, the lower bit of the tile number is ignored.
    //   IE: the upper 8x8 tile is "NN AND FEh", and the lower 8x8 tile is "NN OR 01h".
    // Byte 3 - Attributes/Flags
    //   Bit7   OBJ-to-BG Priority (0=OBJ Above BG, 1=OBJ Behind BG color 1-3)
    //     (Used for both BG and Window. BG color 0 is always behind OBJ)
    //   Bit6   Y flip          (0=Normal, 1=Vertically mirrored)
    //   Bit5   X flip          (0=Normal, 1=Horizontally mirrored)
    //   Bit4   Palette number  **Non CGB Mode Only** (0=OBP0, 1=OBP1)
    this.OAM = new Array(0xa0);
    this.OAM.fill(0);
    // Bit 7 - LCD Display Enable             (0=Off, 1=On)
    // Bit 6 - Window Tile Map Display Select (0=9800-9BFF, 1=9C00-9FFF)
    // Bit 5 - Window Display Enable          (0=Off, 1=On)
    // Enabling the window makes Mode 3 slightly longer on scanlines where it's visible
    // The window becomes visible (if enabled) when positions are set in range
    // WX=0..166,WY=0..143.
    // Bit 4 - BG & Window Tile Data Select   (0=8800-97FF, 1=8000-8FFF)
    // Bit 3 - BG Tile Map Display Select     (0=9800-9BFF, 1=9C00-9FFF)
    // Bit 2 - OBJ (Sprite) Size              (0=8x8, 1=8x16)
    // Bit 1 - OBJ (Sprite) Display Enable    (0=Off, 1=On)
    // Bit 0 - BG Display (0=Off, 1=On)
    //When Bit 0 is cleared, both background and window become blank (white),
    //and the Window Display Bit is ignored in that case. Only Sprites may still
    //be displayed (if enabled in Bit 1).
    this._LCDC = 0x00; //addr 0xff40
    //Bit 6 - LYC=LY Coincidence Interrupt (1=Enable) (Read/Write)
    //Bit 5 - Mode 2 OAM Interrupt         (1=Enable) (Read/Write)
    //Bit 4 - Mode 1 V-Blank Interrupt     (1=Enable) (Read/Write)
    //Bit 3 - Mode 0 H-Blank Interrupt     (1=Enable) (Read/Write)
    //Bit 2 - Coincidence Flag  (0:LYC<>LY, 1:LYC=LY) (Read Only)
    //Bit 1-0 - Mode Flag       (Mode 0-3, see below) (Read Only)
    //  0: During H-Blank
    //  1: During V-Blank
    //  2: During Searching OAM
    //  3: During Transferring Data to LCD Driver
    this._STAT = 0x00; //addr 0xff41
    // Specifies the position in the 256x256 pixels BG map (32x32 tiles)
    // which is to be displayed at the upper/left LCD display position.
    // Values in range from 0-255 may be used for X/Y each, the video controller
    // automatically wraps back to the upper (left) position in BG map when drawing
    // exceeds the lower (right) border of the BG map area.
    this.SCY = 0; //addr 0ff42
    this.SCX = 0; //addr 0xff43
    //The LY indicates the vertical line to which the present data is transferred
    //to the LCD Driver. The LY can take on any value between 0 through 153.
    //  The values between 144 and 153 indicate the V-Blank period.
    this._LY = 0; //addr 0xff44
    //The Game Boy permanently compares the value of the LYC and LY registers.
    //When both values are identical, the coincident bit in the STAT register
    //becomes set, and (if enabled) a STAT interrupt is requested.
    this.LYC = 0; //addr 0xff45
    //window upper position
    this.WY = 0; //addr 0xff4a
    //window left position -7
    this._WX = 0; //addr 0xff4b
    //This register assigns gray shades to the color numbers of the BG and Window tiles.
    //Bit 7-6 - Shade for Color Number 3
    //Bit 5-4 - Shade for Color Number 2
    //Bit 3-2 - Shade for Color Number 1
    //Bit 1-0 - Shade for Color Number 0
    this.BGP = 0b11100100; //addr 0xff47
    //This register assigns gray shades for sprite palette 0, lower two bits aren't used
    this.OBP0 = 0; //addr 0xff48
    this.OBP1 = 0; //addr 0xff49
    this._DMA = 0; //addr 0xff46

    /* PPU Logic */
    this.remainingCycles = this.scanlineCycles = 0; //remaining cycles to catch up to CPU
    this.triggers = new Array(256);
    this.triggers.fill(null);
    this.VRAMAcess = this.OAMAccess = true;
    this.windowState = { inside: false, willTrigger: null, counter: -1 };
    this.OAMState = null;
    this.started = false;
    this.scrollOut = 0;

    this.BGState = {
      state: 0,
      addr: null,
      high: null,
      low: null,
      FIFO: new FIFO(16),
      wait: [],
    };

    this.OAMState = {
      state: 0,
      addr: null,
      high: null,
      low: null,
      idx: 0,
      count: 0,
      FIFO: new FIFO(8),
      triggerState: 0,
      wait: new Array(8),
    };

    this.interruptCondition = false;
    this.reportZero = false;
    this.spriteSize = 8;
    this.edge = false;
    this.lastEdge = false;
  }

  get LCDC() {
    return this._LCDC;
  }
  set LCDC(x) {
    if (!(x & 0x80)) {
      this.shutdown();
    } else {
      this.getAccess();
    }
    if (x & 0x4) {
      this.spriteSize = 16;
    } else {
      this.spriteSize = 8;
    }
    if (x & 0x2) {
      /*nothing, next frame will them them*/
    } else {
      this.removeSpriteTriggers();
    } //-- asymetric behaviour ? should read more about this

    this._LCDC = x;

    if (x & 0x20)
      //triggers to avoid computing at each frame
      this.setWindowTrigger(-1);
    else this.removeWindowTrigger();
  }

  //make function of trigger setting
  get STAT() {
    return this._STAT;
  }
  set STAT(x) {
    this._STAT = (x & 0xf8) | (this._STAT & 0x7);
  }

  get LY() {
    if (this.reportZero) {
      return 0;
    }
    return this._LY;
  }
  set LY(y) {} //not writable

  get WX() {
    return this._WX;
  }
  set WX(x) {
    //set trigger if window enabled
    if (this._LCDC & 0x20) this.setWindowTrigger(x);

    this._WX = x;
  }

  get DMA() {
    return this._DMA;
  }
  set DMA(x) {
    this._DMA = (x & 0xff) << 8;
    this.startDMA();
  }

  startDMA() {
    // Always doable
    // 640 cycles -- doesn't stall CPU but only access to HRAM is available to CPU
    let addr = this._DMA;
    for (let i = 0; i < 0x9f; i++)
      this.OAM[i] = this.gameboy.memory.get(addr++);
  }

  shutdown() {
    this.VRAMAcess = this.OAMAccess = true;
    this._STAT &= ~0b11;
    this._LY = 0;
    this.scanlineCycles = 0;
    this.resetBG();
    this.resetWindow();
    this.triggers.fill(null);
    this.started = false;
  }

  getAccess() {
    let mode = this._STAT & 0x3;
    this.OAMAccess = mode <= 1;
    this.VRAMAcess = mode != 3;
  }

  _get(x) {
    return this.VRAM[x];
  }

  _set(x, y) {
    this.VRAM[x] = y;
  }

  //optimise memory access conditions
  get(x) {
    this.gameboy.shouldCatchupPPU = true;
    if (!this.VRAMAcess) {
      return 0xff;
    } //can't access VRAM
    return this.VRAM[x];
  }

  //optimise memory access conditions
  set(x, y) {
    this.gameboy.shouldCatchupPPU = true;
    if (!this.VRAMAcess) {
      return;
    } //can't access VRAM
    this.VRAM[x] = y;
  }

  _getOAM(x) {
    return this.OAM[x];
  }

  _setOAM(x) {
    this.OAM[x] = y;
  }

  //optimise memory acess conditions
  getOAM(x) {
    this.gameboy.shouldCatchupPPU = true;
    if (!this.OAMAccess) return 0xff; //can't access OAM
    return this.OAM[x];
  }

  setOAM(x, y) {
    this.gameboy.shouldCatchupPPU = true;
    if (!this.OAMAccess) return; //can't access OAM
    this.OAM[x] = y;
  }

  /* PPU State */
  //Run CPU for a given amount of cycles

  catch(remaining) {
    if (!(this._LCDC & 0x80)) return;

    if (!this.started) {
      this.started = true;
      this.checkCollision();
      this.enterScanline();
      this.switchMode(2);
    }

    this.remainingCycles = remaining;
    this.run();
  }

  updateRenderingEdge(val) {
    this.lastEdge = this.edge;
    this.edge = val;
  }

  switchMode(n) {
    //console.log('switch mode', n)
    this._STAT &= ~0b11; //delete current state
    this._STAT |= n; //copy new state
    this.getAccess(); //update access
    this.updateRenderingEdge(false);
    switch (n) {
      case 3:
        //No LCD Interrupt
        this.prepareRendering();
        break;

      case 2:
        this.toggleInterrupt(this._STAT & 0x20);
        break;

      case 1:
        this.updateRenderingEdge(true);
        if (!this.lastEdge && this.edge) this.gameboy.requestRender();

        this.gameboy.requestInterrupt(0);
        this.toggleInterrupt(this._STAT & 0x08);
        break;

      case 0:
        this.toggleInterrupt(this._STAT & 0x10);
        break;

      default:
        break;
    }
  }

  run() {
    let complete;
    while (this.remainingCycles > 0) {
      switch (this._STAT & 0x3) {
        case 2:
          complete = this.stepOAM();
          if (complete) {
            this.removeSpriteTriggers();
            if (this._LCDC & 2) this.setSpriteTriggers(this.getOAMResult());
            this.switchMode(3);
          }
          break;

        case 3:
          complete = this.stepRendering();
          //!!!WARNING, PPU IS TAKING 166 CLOCKS INSTEAD OF 172 -- ah no it's 168, what do to with the remaining pixels

          if (complete)
            //GO HBLANK
            this.switchMode(0);
          break;

        case 0:
          //console.log('HBLANK');
          complete = this.stepHBlank();
          if (complete) {
            this.incrementLine();
            if (this._LY < 144)
              // GO OAM SCAN
              this.switchMode(2);
            else this.switchMode(1); // GO VBLANK
          }
          break;
        case 1:
          //console.log('VBLANK');
          complete = this.stepVBlank();
          if (complete) {
            this.incrementLine();
            if (this._LY == 0) {
              //this.gameboy.cancelInterrupt(0);
              this.switchMode(2);
              this.windowState.counter = -1;
            }
          }
          break;
        default:
          break;
      }
    }
  }

  /*  LOGIC OF THE PPU  */

  stepOAM() {
    let d = Math.min(80 - this.scanlineCycles, this.remainingCycles),
      complete;
    complete = d == 80 - this.scanlineCycles;
    this.remainingCycles -= d;
    this.scanlineCycles += d;
    return complete;
  }

  // 80 cycles
  // oam.x != 0
  //OAM.y > 0 && OAM.y < 160
  //OAM.x > 0 && OAM.x < 168

  //if behaviour confirmed, optimize
  getOAMResult() {
    let priorities = new Array(10),
      count = 0;
    priorities.fill(null);
    if (!(this._LCDC & 2)) return priorities;
    for (let addr = 0x00; addr <= 0x9c; addr += 4) {
      let y = this._getOAM(addr) - 16, //adjust to line
        x = this._getOAM(addr + 1) - 8,
        tileNumber = this._getOAM(addr + 2),
        flags = this._getOAM(addr + 3);

      //hidden sprites
      if (x <= 0 || x >= 168 || this._LY < y || this._LY >= y + this.spriteSize)
        continue;

      //visible sprite, up to 10
      //compute priority, the highest draws last
      let pmax = 9;
      for (let i = priorities.length - 1; i > 0; i--) {
        //in case of the equality, the other object came first and won
        if (priorities[i] && x > priorities[i][0]) pmax = i - 1;
      }

      this.shiftLeftIndex(priorities, pmax, [x, y, tileNumber, flags]);
      count++;
      if (count == 10) break;
    }

    return priorities;
  }

  removeWindowTrigger() {
    let idx = this._WX - 7,
      trigger = this.triggers[idx];
    if (trigger) {
      if (trigger[0] == PPU.Triggers.WINDOW)
        //ONLY WINDOW, remove
        this.triggers[idx] = null;
      //SPRITE OR BOTH
      else this.triggers[idx][0] = PPU.Triggers.SPRITE;
    }

    this.willTrigger = null;
    this.windowState.inside = false;
  }

  setWindowTrigger(x) {
    if (this._WX - 7 >= 0) {
      //-- check the equality
      this.windowState.willTrigger = null;
      if (x >= 0) {
        this.triggers[this._WX - 7] = null;
        this._WX = x;
      }
      if (!this.triggers[this._WX - 7])
        this.triggers[this._WX - 7] = [PPU.Triggers.WINDOW];
      else this.triggers[this._WX - 7][0] = PPU.Triggers.BOTH;
    } else {
      this.windowState.willTrigger = [PPU.Triggers.WINDOW];
    }
  }

  removeSpriteTriggers() {
    for (let i = 0; i < 256; i++) {
      let trigger = this.triggers[i];
      if (!trigger) continue;

      if (trigger[0] == PPU.Triggers.SPRITE) this.triggers[i] = null;
      else {
        //window or both
        trigger[0] = PPU.Triggers.WINDOW;
        if (trigger[1]) trigger.pop();
      }
    }
  }

  setSpriteTriggers(priorities) {
    for (let i = priorities.length - 1; i >= 0; i--) {
      let sprite = priorities[i],
        trigger;
      if (!sprite) continue;
      trigger = this.triggers[sprite[0]];

      if (!trigger) {
        this.triggers[sprite[0]] = [PPU.Triggers.SPRITE, [sprite]];
        continue;
      }

      if (trigger[0] == PPU.Triggers.WINDOW) {
        trigger[0] = PPU.Triggers.BOTH;
        trigger.push([sprite]);
      } else {
        //either sprite or both
        trigger[1].push(sprite);
      }
    }
  }

  shiftLeftIndex(list, idx, x) {
    if (list[idx]) for (let i = 0; i < idx; i++) list[i] = list[i + 1];
    list[idx] = x;
  }

  prepareRendering() {
    this.currentX = 0;
    this.nextX = 0;
    this.scrollOut = this.SCX % 8;
  }

  getBackgroundTile() {
    let fetcherX = (this.nextX + (this.SCX >> 3)) & 0x1f,
      fetcherY = (this.SCY + this._LY) & 0xff;

    this.nextX += 1;
    let base = 0x9800;
    if (this._LCDC & 0x8) base = 0x9c00;

    let tileNumber = this._get(base + (fetcherY >> 3) * 32 + fetcherX - 0x8000),
      addr;
    if (this._LCDC & 0x10) addr = 0x8000 + tileNumber * 16 + 2 * (fetcherY % 8);
    else addr = 0x9000 + PPU.signed8(tileNumber) * 16 + 2 * (fetcherY % 8);
    return addr;
  }

  getWindowTile() {
    let fetcherX = this.nextX - (((this._WX - 7) / 8) | 0),
      fetcherY = this.windowState.counter;

    this.nextX += 1;
    let base = 0x9800;
    if (this._LCDC & 0x40) base = 0x9c00;

    let tileNumber = this._get(
        base + ((fetcherY / 8) | 0) * 32 + fetcherX - 0x8000
      ),
      addr;
    if (this._LCDC & 0x10) addr = 0x8000 + tileNumber * 16 + 2 * (fetcherY % 8);
    else addr = 0x9000 + PPU.signed8(tileNumber) * 16 + 2 * (fetcherY % 8);
    return addr;
  }

  getSpriteTile(sprite) {
    let fetcherY =
        sprite[3] & 0x40
          ? this.spriteSize - 1 - (this._LY - sprite[1])
          : this._LY - sprite[1],
      upper = fetcherY < 8,
      tileNumber =
        this.spriteSize == 16
          ? upper
            ? sprite[2] & 0xfe
            : sprite[2] | 0x01
          : sprite[2],
      addr = 0x8000 + tileNumber * 16 + 2 * (fetcherY % 8);

    return addr;
  }

  computePixels(low, high, out) {
    let ret = out || [];
    for (let i = 0; i < 8; i++)
      ret.push((((high & (1 << i)) >> i) << 1) | ((low & (1 << i)) >> i));
    return ret;
  }

  composePixels(low, high, sprite, out) {
    //account for flipX
    let ret = out || [0, 0, 0, 0, 0, 0, 0, 0],
      count = 0,
      i = sprite[3] & 0x20 ? 7 : 0,
      inc = sprite[3] & 0x20 ? -1 : 1;

    //---//console.log('before touch', ret);
    while (count < 8) {
      let pixel = (((high & (1 << i)) >> i) << 1) | ((low & (1 << i)) >> i),
        pre = ret[count];

      //---//console.log('pre', pre)
      //write over when the pixel is not translucent
      if (!pre || pixel != 0) ret[count] = [pixel, sprite[3]];

      //---//console.log(i, inc, count, '@', pixel, ret)
      i += inc;
      count++;
    }

    return ret;
  }

  fetchStep() {
    //do we really have to fetch when bg is disabled ? --check later
    if (this.OAMState.triggerState == 1 && this.BGState.FIFO.length >= 8)
      this.fetchStepOAM();
    else this.fetchStepBG();
  }

  fetchStepBG() {
    switch (this.BGState.state) {
      case 0: //Step 1, get tile
        if (this.windowState.inside) this.BGState.addr = this.getWindowTile();
        else this.BGState.addr = this.getBackgroundTile();
        this.BGState.state = 1;
        break;

      case 1: //Step 2, get lower bits
        this.BGState.low = this._get(this.BGState.addr - 0x8000);
        this.BGState.state = 2;
        break;

      case 2: //Step 3, get higher bits
        this.BGState.high = this._get(this.BGState.addr + 1 - 0x8000);
        this.BGState.state = 3;
        break;

      case 3: //Step 4, assemble pixels, try to push
        this.computePixels(
          this.BGState.low,
          this.BGState.high,
          this.BGState.wait
        ); //--modify the function to remove param .wait
        this.BGState.state = 4;
      case 4: //Pseudostep 5, try to push pixels into the FIFO, stall until it's possible
        // --- experimental fix
        if (this.BGState.FIFO.length <= 8) {
          for (let i = 8; i > 0; i--)
            this.BGState.FIFO.push(this.BGState.wait.pop());

          this.BGState.state = 0;
        }
        break;
      case 5: //pause, if needed
        break;

      default:
        break;
    }
  }

  fetchStepOAM() {
    switch (this.OAMState.state) {
      case 0: //Step 1, get tile
        //---//console.log('fetching sprites at', this.currentX, '->',this.triggers[this.currentX][1])
        this.OAMState.addr = this.getSpriteTile(
          this.triggers[this.currentX][1][this.OAMState.idx]
        );
        this.OAMState.state = 1;
        break;

      case 1: //Step 2, get lower bits
        //---//console.log('step 1')
        this.OAMState.low = this._get(this.OAMState.addr - 0x8000);
        this.OAMState.state = 2;
        break;

      case 2: //Step 3, get higher bits
        //---//console.log('step 2')
        this.OAMState.high = this._get(this.OAMState.addr + 1 - 0x8000);
        this.OAMState.state = 3;
        break;

      case 3:
        //---//console.log('step 3');
        //---//console.log('im guessing', this.OAMState.idx + 1, this.OAMState.count)
        this.composePixels(
          this.OAMState.low,
          this.OAMState.high,
          this.triggers[this.currentX][1][this.OAMState.idx],
          this.OAMState.wait
        );
        if (++this.OAMState.idx == this.OAMState.count) this.OAMState.state = 4;
        else {
          this.OAMState.state = 0;
          break;
        }

      case 4: //Pseudostep 5, try to push pixels into the FIFO, stall until it's possible
        //shouldn't override existing pixels
        //-> should override translucent pixels, but doesn't here
        // for ( let i = 7; i >= 0; i-- ) {
        //     let obj = this.OAMState.FIFO.get(i);
        //     if ( !obj || !obj[0] )
        //         this.OAMState.FIFO.put(i, this.OAMState.wait[i]);
        // }

        let split = 7 - this.OAMState.FIFO.length;
        for (let i = 7; i > split; i--) {
          let obj = this.OAMState.FIFO.get(7 - i);
          if (!obj || !obj[0])
            this.OAMState.FIFO.put(7 - i, this.OAMState.wait[i]);
        }

        for (let i = split; i >= 0; i--)
          this.OAMState.FIFO.push(this.OAMState.wait[i]);

        this.OAMState.triggerState = 2;
        break;

      default:
        break;
    }
  }

  getSpritePixel(p, attr) {
    let pal = attr & 0x10 ? this.OBP1 : this.OBP0;
    //console.log('at', this._LY, this.currentX, 'will get sprite pixel from', p, pal.toString(2), attr.toString(2), '=>', (pal & (0b11 << (2*p))) >> 2*p);
    return (pal & (0b11 << (2 * p))) >> (2 * p);
  }

  getBackgroundPixel(p) {
    //console.log('at', this._LY, this.currentX, 'will get', this.windowState.inside ? 'window' : 'background' ,'pixel', p, '=>', (this.BGP & (0b11 << (2*p))) >> 2*p);
    return (this.BGP & (0b11 << (2 * p))) >> (2 * p);
  }

  combinePixels() {
    let bgp = this.BGState.FIFO.pop(),
      [obp, attr] = this.OAMState.FIFO.pop();

    if (obp == 0) return this.getBackgroundPixel(bgp);

    if (!(attr & 0x80) || bgp == 0)
      //obj above
      return this.getSpritePixel(obp, attr);
    //background above
    else return this.getBackgroundPixel(bgp);
  }

  tryPush() {
    //---//console.log('try push', this.BGState.FIFO.length, this.OAMState.triggerState);
    if (this.BGState.FIFO.length >= 8 && this.OAMState.triggerState != 1) {
      //consume pixel
      if (this.scrollOut) {
        // waste a pixel
        //console.log('scrolling out')
        this.BGState.FIFO.pop();
        this.scrollOut--;
      } else {
        // render
        // allow sprite rendering
        this.OAMState.triggerState = 0;

        let pixel,
          idx = this.currentX++;

        if (this._LCDC & 1) {
          if (this.OAMState.FIFO.length) pixel = this.combinePixels();
          else pixel = this.getBackgroundPixel(this.BGState.FIFO.pop());
        } else {
          if (this.OAMState.FIFO.length)
            pixel = this.getSpritePixel(...this.OAMState.FIFO.pop());
          else pixel = 0;
        }

        this.pixels[this._LY * 160 + idx] = pixel;
      }
    }
  }

  stepRendering() {
    while (this.remainingCycles && this.currentX < 158) {
      this.remainingCycles -= 2;
      this.scanlineCycles += 2;
      this.checkTriggers();
      this.tryPush();
      this.checkTriggers();
      this.tryPush();
      this.fetchStep();
    }

    //now, this.currentX <= 158

    //might cause a problem if fetch not ready / also check the 158 condition
    //DIAGNOSE DURING ROM TESTS
    if (this.remainingCycles) {
      //last push
      this.remainingCycles -= 1;
      this.scanlineCycles += 1;
      this.checkTriggers();
      this.fetchStep();
      this.tryPush();
      //might push outside -- optimise this
      if (this.remainingCycles && this.currentX < 160) {
        this.remainingCycles -= 1;
        this.scanlineCycles += 1;
        this.checkTriggers();
        this.tryPush();
      } else {
        //end of line
      }
    }

    let complete = false;
    if (this.currentX == 160) {
      complete = true;
    }
    return complete;
  }

  stepHBlank() {
    //TEST THIS
    let d = Math.min(456 - this.scanlineCycles, this.remainingCycles),
      complete = d == 456 - this.scanlineCycles;
    this.remainingCycles -= d;
    this.scanlineCycles += d;
    return complete;
  }

  stepVBlank() {
    //TEST THIS
    let d = Math.min(456 - this.scanlineCycles, this.remainingCycles),
      complete = d == 456 - this.scanlineCycles;
    this.remainingCycles -= d;
    this.scanlineCycles += d;
    return complete;
  }

  /* LINE CONTROL */

  //Check collision between LYC and LY
  //Can be optimised, won't do it now
  checkCollision() {
    //console.log(this.LY, this.LYC);
    if (this._LY == this.LYC) {
      this._STAT |= 1 << 2;
      this.toggleInterrupt(this._STAT & 0x40);
    } else {
      //this.gameboy.cancelInterrupt(1);
      this._STAT &= ~(1 << 2);
    }
  }

  //optimize later, i believe we can do something but it's no so much
  checkTriggers() {
    let trigger =
      this.triggers[this.currentX] ||
      (this.currentX == 0 && this.windowState.willTrigger);
    if (!trigger) return;

    // if ( trigger[0] & PPU.Triggers.WINDOW )
    //     console.log('found window trigger', trigger, 'at', this.currentX, this._LY, this.WY);

    // if ( trigger[0] & PPU.Triggers.SPRITE )
    //     console.log('found sprite trigger', trigger, 'at', this.currentX);

    //console.log('--------- found trigger -------------')
    if (
      trigger[0] & PPU.Triggers.WINDOW &&
      this._LY >= this.WY &&
      !this.windowState.inside
    )
      //<=======
      this.triggerWindow(); //
    //unlike window, this contains only visible -- maybe do this same for window and save one comparaison //
    if (trigger[0] & PPU.Triggers.SPRITE && this.OAMState.triggerState == 0)
      this.triggerSprites();
  }

  triggerSprites() {
    this.OAMState.triggerState = 1;
    this.OAMState.state = 0;
    //this.OAMState.FIFO.reset();
    this.OAMState.idx = 0;
    this.OAMState.count = this.triggers[this.currentX][1].length;
    this.OAMState.wait.fill(null);
  }

  triggerWindow() {
    this.windowState.inside = true;
    this.windowState.counter += 1;
    this.nextX = ((this._WX - 7) / 8) | 0; //restart rendering
    this.scrollOut = Math.max(0, 7 - this.WX);
    this.resetBG();
  }

  //!!!! increment window
  incrementLine() {
    this._LY++;
    if (this._LY == 153) this.reportZero = true;

    if (this._LY == 154) {
      //wait 4 cycles before !!!
      this.reportZero = false;
      this._LY = 0;
    }

    this.checkCollision();
    this.enterScanline();
  }

  resetLine() {
    this._LY = 0;
    this.checkCollision();
    this.enterScanline();
  }

  //Utility function to set a new scanline, delicate because of the catchup
  enterScanline() {
    this.scanlineCycles = 0;
    // Result OAM Result
    //position of the pixel to draw, -- should change definition
    this.currentX = 0;
    //next 8 pixels, used in getTile
    this.nextX = 0;

    //reset params
    this.resetWindow();
    this.resetBG();
    this.resetOAM();
  }

  /* RESET Mechanics */
  resetBG() {
    this.BGState.state = 0;
    this.BGState.FIFO.reset();
  }

  resetOAM() {
    this.OAMState.state = 0;
    this.OAMState.triggerState = 0;
    this.OAMState.FIFO.reset();
    this.OAMState.idx = this.OAMState.count = 0;
  }

  resetWindow() {
    this.windowState.inside = false;
  }

  toggleInterrupt(value) {
    value = value ? true : false;
    if (!this.interruptCondition && value) this.gameboy.requestInterrupt(1);

    this.interruptCondition = value;
  }

  static signed8(x) {
    if (x > 0x7f) return -(1 << 7) + (x & 0x7f);
    return x;
  }
}

PPU.Triggers = {
  WINDOW: 1,
  SPRITE: 2,
  BOTH: 3, //IMPLEMENT THIS, with &
};

export default PPU;

// Note that foreground sprites don't use color 0 - it's transparent instead.
// Currently there is no blocking memory access during different LCD periods
// But if this causes some problems, it could be patched fairly easily

//FIFO pushes one pixel per clock, pauses unless it contains more than 8
//Fetch 3 clocks to fetch 8 pixels, pauses in 4th cycles, except space in the FIFO

// !!! Account for hidden windows, currently only disabled ones

// !!! 8 PIXEL FIFO, 16 might cause time problems
