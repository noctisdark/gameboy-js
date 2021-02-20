const System = require('./System');
const FIFO = require('./FIFO');
const { readSync } = require('fs');

class LCD {
    constructor(system) {
        this.system = system; system.video = this;
        this.VRAM = new Array(0x2000); this.VRAM.fill(0);
        this.screen = new Array(160*144); this.screen.fill(0);
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
        this.OAM = new Array(0xa0); this.OAM.fill(0)
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
        this.SCY = 0;     //addr 0ff42
        this.SCX = 0;     //addr 0xff43
        //The LY indicates the vertical line to which the present data is transferred
        //to the LCD Driver. The LY can take on any value between 0 through 153.
        //  The values between 144 and 153 indicate the V-Blank period.
        this._LY = 0;      //addr 0xff44
        //The Game Boy permanently compares the value of the LYC and LY registers.
        //When both values are identical, the coincident bit in the STAT register
        //becomes set, and (if enabled) a STAT interrupt is requested.
        this.LYC = 0;     //addr 0xff45
        //window upper position
        this.WY = 0;      //addr 0xff4a
        //window left position -7
        this._WX = 0;      //addr 0xff4b 
        //This register assigns gray shades to the color numbers of the BG and Window tiles.
        //Bit 7-6 - Shade for Color Number 3
        //Bit 5-4 - Shade for Color Number 2
        //Bit 3-2 - Shade for Color Number 1
        //Bit 1-0 - Shade for Color Number 0
        this.BGP = 0b11100100;    //addr 0xff47
        //This register assigns gray shades for sprite palette 0, lower two bits aren't used
        this.OBP0 = 0;   //addr 0xff48
        this.OBP1 = 0;   //addr 0xff49
        this._DMA = 0;   //addr 0xff46
        
        /* PPU Logic */
        this.remainingCycles = this.scanlineCycles = 0; //remaining cycles to catch up to CPU
        this.triggers = new Array(256); this.triggers.fill(null);
        this.VRAMAcess = this.OAMAccess = true;
        this.windowState = {inside: false, willTrigger: null, counter: -1};
        this.OAMState = null;
        this.started = false;
        this.scrollOut = 0;

        this.BGState = {
            state: 0, addr: null, high: null, low: null,
            FIFO: new FIFO(8),
            wait: []
        };

        this.interruptCondition = false;
        this.reportZero = false;
    }

    get LCDC() { return this._LCDC; }
    set LCDC(x) {
        if ( !(x & 0x80) ) { this.shutdown(); }
        else { this.getAccess(); }
        this._LCDC = x;
        
        if ( this._LCDC & 0x20 ) { //trigger to avoid computing
            if ( this._WX -7 >= 0 ) {
                this.windowState.willTrigger = null;
                this.triggers[this._WX-7] = [LCD.Triggers.WINDOW];
            } else {this.windowState.willTrigger = [LCD.Triggers.WINDOW]; }
        } else {
            this.triggers[this._WX-7] = null;
            this.willTrigger = null;
            this.windowState.inside = false;
        }
    }

    //make function of trigger setting
    get STAT() { return this._STAT; }
    set STAT(x) {
        this._STAT = (x & 0xf8) | this._STAT & 0x7;
    }

    get LY() { if ( this.reportZero ) {return 0;} return this._LY; }
    set LY(y) { ; } //not writable

    get WX() { return this._WX; }
    set WX(x) {
        //set trigger if window enabled
        if ( this._LCDC & 0x20 ) {
            if ( this._WX -7 >= 0 ) {
                this.windowState.willTrigger = null;
                this.triggers[this._WX-7] = null;
                this.triggers[x-7] = [LCD.Triggers.WINDOW];
            } else { this.windowState.willTrigger = [LCD.Triggers.WINDOW]; }
        }

        this._WX = x;
    }

    get DMA() { return this._DMA; }
    set DMA(x) {
        this._DMA = (x & 0xff) << 8;
        this.startDMA();
    }

    startDMA() {
        // Always doable
        // 640 cycles -- doesn't stall CPU but only access to HRAM is available to CPU
        let addr = this._DMA;
        for ( let i = 0; i < 0x9f; i++ )
            this.OAM[i] = this.system.memory.get(addr++);
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
        this.system.shouldCatchupPPU = true;
        if ( !this.VRAMAcess ) {return 0xff}; //can't access VRAM
        return this.VRAM[x];
    }

    //optimise memory access conditions
    set(x, y) {
        this.system.shouldCatchupPPU = true;
        if ( !this.VRAMAcess ) {return;} //can't access VRAM
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
        this.system.shouldCatchupPPU = true;
        if ( !this.OAMAccess ) return 0xff; //can't access OAM
        return this.OAM[x];
    }

    setOAM(x, y) {
        this.system.shouldCatchupPPU = true;
        if ( !this.OAMAccess ) return; //can't access OAM
        this.OAM[x] = y;
    }

    /* PPU State */
    //Run CPU for a given amount of cycles

    catch(remaining) {
        if ( !(this._LCDC & 0x80) )
            return;

        if ( !this.started ) {
            this.started = true;
            this.checkCollision();
            this.enterScanline();
            this.switchMode(2);
        }
        
        this.remainingCycles = remaining;
        this.run();
    }

    switchMode(n) {
        this._STAT &= ~(0b11); //delete current state
        this._STAT |= n; //copy new state
        this.getAccess(); //update access
        //console.log('enter mode', n, this.remainingCycles);
        switch (n) {
            case 3:
                //No LCD Interrupt
                this.prepareRendering();
                break;
            
            case 2:
                this.toggleInterrupt(this._STAT & 0x20);
                break;

            case 1:
                this.system.requestInterrupt(0);
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
                    if ( complete ) {
                        //this.OAMResult = this.getOAMResult();
                        this.switchMode(3);
                    }
                    break;
                
                case 3:
                    complete = this.stepRendering();
                    //!!!WARNING, PPU IS TAKING 166 CLOCKS INSTEAD OF 172 -- ah no it's 168, what do to with the remaining pixels

                    if ( complete ) //GO HBLANK
                        this.switchMode(0);    
                    break;
                
                case 0:
                    //console.log('HBLANK');
                    complete = this.stepHBlank();
                    if ( complete ) {
                        this.incrementLine();
                        if ( this._LY < 144 ) // GO OAM SCAN
                            this.switchMode(2);
                        else this.switchMode(1); // GO VBLANK
                    }
                    break;
                case 1:
                    //console.log('VBLANK');
                    complete = this.stepVBlank();
                    if ( complete ) {
                        this.incrementLine();
                        if ( this._LY == 0 ) {
                            //this.system.cancelInterrupt(0);
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
        let d = Math.min(80 - this.scanlineCycles, this.remainingCycles), complete;
        complete = d == (80 - this.scanlineCycles);
        this.remainingCycles -= d; this.scanlineCycles += d;
        return complete;
    }

    // 80 cycles
    // oam.x != 0
    // LY + 16 >= oam.y
    // LY + 16 < oam.y

    getOAMResult() {
        //Sprites not enabled
        //OAM.y > 0 && OAM.y < 160
        //OAM.x > 0 && OAM.x < 168
        let priorities = new Array(10), count = 0; priorities.fill(null);
        if ( !(this._LCDC & 2) ) return priorities; 
        for ( let addr = 0x00; addr <= 0x9c; addr += 4 ) {
            let y = this._getOAM(addr) - 16, //adjust to line
                x = this._getOAM(addr+1) - 8,
                tileNumber = this._getOAM(addr+2),
                flags = this._getOAM(addr+3);
            
            //hidden sprites
            if ( x <= 0 || x >= 168 || this._LY < y || this._LY > y + (this.LCDC & 0x4 ? 16 : 8))
                continue; 
            
            //visible sprite, up to 10
            //compute priority, the highest draws last
            let pmax = 9;
            for ( let i = priorities.length-1; i >0 ; i-- ) {
                //in case of the equality, the other object came first and won
                if ( priorities[i] && x >= priorities[i][0] )
                    pmax = i-1;
            }

            this.shiftLeftIndex(priorities, pmax, [x, y, tileNumber, flags]);
            count++;
            if ( count == 10 ) break;
        }

        return priorities;
    }

    shiftLeftIndex(list, idx, x) {
        if ( list[idx] )
            for ( let i = 0; i < idx; i++ )
                list[i] = list[i+1];
        list[idx] = x;
    }

    prepareRendering() {
        this.currentX = 0; this.nextX = 0;
        this.scrollOut = this.SCX % 8;
    }

    getBackgroundTile() {        
        let fetcherX = (this.nextX + (this.SCX >> 3)) & 0x1f,
            fetcherY = (this.SCY + this._LY) & 0xff;
        
        this.nextX += 1;
        let base = 0x9800;
        if ( this._LCDC & 0x8 ) 
            base = 0x9c00;
        
        let tileNumber = this._get(base + (fetcherY >> 3)*32 + fetcherX - 0x8000), addr;
        if ( !(this._LCDC & 0x10) && tileNumber < 0x80 ) addr = 0x9000 + tileNumber*16 + 2*(fetcherY%8);
        else addr = 0x8000 + tileNumber*16 + 2*(fetcherY%8);
        return addr;
    }

    getWindowTile() {
        let fetcherX = this.nextX - (((this._WX - 7)/8) | 0),
            fetcherY = this.windowState.counter;
                
        this.nextX += 1;
        let base = 0x9800;
        if ( this._LCDC & 0x40 ) 
            base = 0x9c00;
        
        let tileNumber = this._get(base + ((fetcherY/8)|0)*32 + fetcherX - 0x8000), addr;
        if ( this._LCDC & 0x10 ) addr = 0x8000 + tileNumber*16 + 2*(fetcherY%8);
        else addr = 0x9000 + LCD.signed8(tileNumber)*16 + 2*(fetcherY%8);   
        return addr;
    }

    computePixels(low, high, out) {
        let ret = out || [];
        for ( let i = 0; i < 8; i++ )        
            ret.push((((high & (1 << i)) >> i) << 1) | ((low & (1 << i)) >> i)); 
        return ret;
    }

    fetchStep() {
        this.fetchStepBG();
    }

    fetchStepBG() {
        switch (this.BGState.state) {
            case 0: //Step 1, get tile
                if ( this.windowState.inside )
                    this.BGState.addr = this.getWindowTile();
                else this.BGState.addr = this.getBackgroundTile();
                this.BGState.state = 1;
                break;
            
            case 1: //Step 2, get lower bits
                this.BGState.low = this._get(this.BGState.addr - 0x8000);
                this.BGState.state = 2;
                break;
            
            case 2: //Step 3, get higher bits
                this.BGState.high = this._get(this.BGState.addr+1 - 0x8000);
                this.BGState.state = 3;
                break;

            case 3: //Step 4, assemble pixels, try to push
                this.computePixels(this.BGState.low, this.BGState.high, this.BGState.wait);
                this.BGState.state = 4;
            case 4: //Pseudostep 5, try to push pixels into the FIFO, stall until it's possible
                // --- experimental fix
                if ( this.BGState.FIFO.length == 0) {
                    for ( let i = 8; i > 0; i-- )
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

    tryPush() {
        if ( this.BGState.FIFO.length ) { //consume pixel
            if ( this.scrollOut ) {
                // waste a pixel
                //console.log('scrolling out')
                this.BGState.FIFO.pop();
                this.scrollOut--;
            } else {
                // render
                let pixel = this.BGState.FIFO.pop(), idx = this.currentX++;
                if ( this._LCDC & 1 ) //--optimize
                    this.screen[this._LY*160+idx] = (this.BGP & (0b11 << (2*pixel))) >> 2*pixel;
                
            }
        }
    }

    stepRendering() {
        while ( this.remainingCycles && this.currentX < 158) {
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
        if ( this.remainingCycles ) { //last push
            this.remainingCycles -= 1;
            this.scanlineCycles += 1;
            this.checkTriggers();
            this.fetchStep();
            this.tryPush();
            //might push outside -- optimise this
            if ( this.remainingCycles && this.currentX < 160 ) {
                this.remainingCycles -= 1;
                this.scanlineCycles += 1;
                this.checkTriggers();
                this.tryPush();
            } else { //end of line

            }
        }

        //console.log('X:', this.currentX, 'FIFO:', this.BGState.FIFO.length, 'Cycles:', this.scanlineCycles - 80)

        let complete = false;
        if ( this.currentX == 160 ) {
            complete = true;
        }; return complete;
    }

    stepHBlank() { //TEST THIS
        let d = Math.min(456 - this.scanlineCycles, this.remainingCycles),
            complete = d == 456 - this.scanlineCycles;
        this.remainingCycles -= d; this.scanlineCycles += d;
        return complete;
    }

    stepVBlank() { //TEST THIS
        let d = Math.min(456 - this.scanlineCycles, this.remainingCycles),
            complete = d == 456 - this.scanlineCycles;
        this.remainingCycles -= d; this.scanlineCycles += d;
        return complete;
    }

    
    /* LINE CONTROL */

    //Check collision between LYC and LY
    //Can be optimised, won't do it now
    checkCollision() {
        //console.log(this.LY, this.LYC);
        if ( this._LY == this.LYC ) {
            this._STAT |= (1 << 2);
            //console.log('######################################################################')
            this.toggleInterrupt(this._STAT & 0x40);
        } else {
            //this.system.cancelInterrupt(1);
            this._STAT &= ~(1 << 2);
        }
    }

    checkTriggers() {
        let trigger = this.triggers[this.currentX] || (this.currentX == 0 && this.windowState.willTrigger);
        if ( !trigger ) return;

        //console.log('--------- found trigger -------------')
        if ( trigger[0] == LCD.Triggers.WINDOW && !this.windowState.inside && this._LY >= this.WY )
            this.triggerWindow();
    }

    triggerWindow() {
        this.windowState.inside = true;
        this.windowState.counter += 1;
        this.nextX = ((this._WX-7)/8) | 0; //restart rendering 
        this.scrollOut = Math.max(0, 7 - this.WX);
        this.resetBG();
        //console.log('>>>>>>>>>> TRIGGER WINDOW', this.windowState.counter, this.WX, this.WY);
    }

    //!!!! increment window
    incrementLine() {
        this._LY++;
        if ( this._LY == 153 )
            this.reportZero = true;
        
        if ( this._LY == 154 ) { //wait 4 cycles before !!!
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
        this.OAMResult = null;
        //position of the pixel to draw, -- should change definition
        this.currentX = 0;
        //next 8 pixels, used in getTile
        this.nextX = 0;

        //reset params
        this.resetWindow();
        this.resetBG();
    }

    /* RESET Mechanics */
    resetBG() {
        this.BGState.state = 0;
        this.BGState.FIFO.reset();
    }

    resetWindow() {
        this.windowState.inside = false;
    }

    toggleInterrupt(value) {
        value = value ? true : false;
        if ( !this.interruptCondition && value )
            this.system.requestInterrupt(1);
        
        this.interruptCondition = value;
    }

    static signed8(x) {
        if ( x > 0x7f )
            return -(1 << 7) + (x & 0x7f);
        return x;
    }
};

class PPU {
    constructor(system, video) {
        //ACCESS TO MAIN MEMORY
        this.system = system;
        this.video = video; video.ppu = this;
        
        //cycles
        this.OAMResult = null;
        
        //starting mode
        this.switchMode(2);
        this.resetLine();
        //pixels to take out each line, if SCX = 7, we ignore 7 of the 8 we fetched
        this.scrollOut = 0;

        //Background & Window FIFO
        this.BGState = {
            state: 0, addr: null, high: null, low: null,
            FIFO: new FIFO(16),
            wait: []
        };
    }

    //Utility function to switch modes, also sets interrupts
    //ISSUE: disable interrupts on mode leave ?

    //Run for the remaining cycles

    prepareRendering() {
        this.currentX = 0; this.nextX = 0;
        this.scrollOut = this.SCX % 8;
    }

    stepRendering() {
        while ( this.remainingCycles && this.currentX < 158) {
            this.remainingCycles -= 2;
            this.scanlineCycles += 2;
            this.fetchStep();
            this.tryPush();
            this.tryPush();
        }

        //might cause a problem if fetch not ready
        //DIAGNOSE DURING ROM TESTS
        if ( this.remainingCycles ) { //last push
            this.remainingCycles -= 2;
            this.scanlineCycles += 2;
            this.fetchStep();
            this.tryPush();
            //might push outside -- optimise this
            if ( this.currentX <  160 )
                this.tryPush();
        }


        let complete = false;
        if ( this.currentX == 160 ) {
            complete = true;
        }; return complete;
    }

    //return tile number, inside window to avoid redundancy
    getTile() {
        let fetcherX = this.insideWindow ? (this.nextX - ((this.video.WX - 7)/8 | 0)) : ((((this.video.SCX/8)|0) + this.nextX) & 0x1f),
            fetcherY = this.insideWindow ? (this.video.LY - this.video.WY) : ((this.video.SCY + this.video.LY) & 0xff);
        
        this.nextX += 1;
        let base = 0x9800;
        if ( ((this.video.LCDC & 0x8) && (!this.insideWindow)) || ((this.video.LCDC & 0x40) && (this.insideWindow)))
            base = 0x9c00;
        
        //console.log('in window ?', this.insideWindow, this.video.LCDC & 0x8, this.video.LCDC & 0x40, this.video.LCDC & 0x20, this.video.WX, this.video.WY);

        //this is the tile number, _get because VRAM isn't accessible from the outside
        let tileNumber = this.video._get(base + ((fetcherY/8)|0)*32 + fetcherX - 0x8000);
        let mode = (this.video.LCDC & 0x10) >> 4, addr;
        //console.log('base is', base.toString(16), 'tileNumber is', tileNumber, 'address mode is', mode);
        if ( mode ) { //unsigned addressing mode
            addr = 0x8000 + tileNumber*16 + 2*(fetcherY%8);
        } else { //signed addressing mode
            addr = 0x9000 + PPU.signed8(tileNumber)*16 + 2*(fetcherY%8);
        }

        return addr;
    }

    // getSprites(i) {
    //     let tileNumber = this.currentSprites[i][2],
    //         y = this.currentSprites[i][1] - (this.currentSprites[i][3] & 0x40 ? ((this.video._LCDC & 0x4 ? 16 : 8)) :  this.video._LY),
    //         addr = 0x8000 + tileNumber*16 + 2*(y%8);;
        
    //     return addr;
    // }

    //Utility function to reset background FIFO, used when entering a window
    //Utility function to reset sprite FIFO, used when entering a new scanline
    resetOAM() {
        
    }

    //only background for now
    fetchStep() {
        this.fetchStepBG();
        // console.log('fetch step');
        // if ( this.currentFIFO == this.BGState)
        //     this.fetchStepBG();
        // else
        //     this.fetchStepOAM();
    }

    // fetchStepOAM() {
    //     // Maybe needed ? check if we sould return to BGState
    //     // //sprites not enabled
    //     // if ( !(this.video._LCDC & 2) ) return;
        
    //     switch (this.OAMState.state) {
    //         case 0:
    //             console.log('state 0');
    //             this.OAMState.addr = this.getSprites(this.OAMState.idx);
    //             this.OAMState.state = 1;
    //             break;
    //         case 1:
    //             this.OAMState.low = this.video._get(this.OAMState.addr - 0x8000);
    //             this.OAMState.state = 2;
    //             break;
    //         case 2:
    //             this.OAMState.high = this.video._get(this.OAMState.addr+1 - 0x8000);
    //             this.OAMState.state = 3;
    //             break;
    //         case 3: //Step 4, assemble pixels, try to push
    //             console.log('statu suri');
    //             this.composePixels(this.OAMState.low, this.OAMState.high, this.OAMState.wait, this.currentSprites[this.OAMState.idx][3] & 0x20);
    //             if ( ++this.OAMState.idx == this.OAMState.loop )
    //                 this.OAMState.state = 4;
    //             else {this.OAMState.state = 0; break};
    //         case 4: //Pseudostep 5, try to push pixels into the FIFO, stall until it's possible
    //             this.OAMState.requestPush = true;
    //             if ( this.OAMState.FIFO.length <= 8 ) {
    //                 for ( let i = 0; i < 8; i++ )
    //                     this.OAMState.FIFO.push(this.OAMState.wait.pop());
    //                 this.OAMState.state = 0;
    //                 this.OAMState.idx = 0;
    //                 this.OAMState.loop = 0;
    //                 this.OAMState.done = true;
    //             } break;
    //         case 5: //pause, if needed
    //             break;
        
    //         default:
    //             break;
    //     }
    // }

    //only this for now
    fetchStepBG() {
        switch (this.BGState.state) {
            case 0: //Step 1, get tile
                this.BGState.addr = this.getTile();
                console.log('got tile addr', this.BGState.addr.toString(16));
                this.BGState.state = 1;
                break;
            
            case 1: //Step 2, get lower bits
                this.BGState.low = this.video._get(this.BGState.addr - 0x8000);
                console.log('got tile low', this.BGState.low)
                this.BGState.state = 2;
                break;
            
            case 2: //Step 3, get higher bits
                this.BGState.high = this.video._get(this.BGState.addr+1 - 0x8000);
                console.log('got tile high', this.BGState.high)
                this.BGState.state = 3;
                break;

            case 3: //Step 4, assemble pixels, try to push
                this.computePixels(this.BGState.low, this.BGState.high, this.BGState.wait);
                console.log('assembled pixels', this.BGState.wait)
                this.BGState.state = 4;
            case 4: //Pseudostep 5, try to push pixels into the FIFO, stall until it's possible
                console.log('try push to FIFO');
                if ( this.BGState.FIFO.length <= 8 ) {
                    for ( let i = 0; i < 8; i++ )
                        this.BGState.FIFO.push(this.BGState.wait.pop());
                    this.BGState.state = 0;
                } break;
            case 5: //pause, if needed
                break;
        
            default:
                break;
        }
    }

    //return pixels bit from high/low values, coloring is done later with palette
    computePixels(low, high, push) {
        let ret = push || [];
        for ( let i = 8; i >= 0; i-- ) {
            let pixel = (((high & (1 << i)) << 1) | (low & (1 << i))) >> i;
            ret.push(pixel); 
        };
        return ret;
    }
    
    // Push pixels to the screen
    tryPush() {
        //handle loading
        if ( !this.windowStarted && (this.video.LCDC & 0x20) && this.currentX >= (this.video.WX-7) && (this.video.LY >= this.video.WY) ) {
            //console.log('hit window')
            // When WX is 0 and the SCX & 7 > 0 mode 3 is shortened by 1 cycle -- !!!! NOT ACCOUNTED & UNCHECKED
            // When the window has already started rendering there is a bug that occurs when WX is changed mid-scanline.
            // When the value of WX changes after the window has started rendering and the new value of WX is reached again,
            // a pixel with color value of 0 and the lowest priority is pushed onto the background FIFO
            // Currently not account for
            this.windowStarted = true;
            this.insideWindow = true;
            this.nextX = ((this.video.WX - 7) / 8) | 0; //restart rendering 
            this.scrollOut += Math.max(0, 7 - this.video.WX);
            this.resetBG();
        }

        //--------------------v maybe here
        if ( this.BGState.FIFO.length >= 8) { //consume pixel
            //console.log(this.currentX, (this.video.WX-7), '|', this.video.LY, this.video.WY)
            if ( this.scrollOut ) {
                //When SCX & 7 > 0 and there is a sprite at X coordinate 0 of the current scanline then mode 3 is lengthened.
                //The amount of cycles this lengthens mode 3 by is whatever the lower 3 bits of SCX are.
                //After this penalty is applied object fetching may be aborted. Note that the timing of the penalty is not confirmed.
                //It may happen before or after waiting for the fetcher
                // waste a pixel
                this.BGState.FIFO.pop();
                this.scrollOut--;
            } else {
                // render
                let pixel = this.BGState.FIFO.pop(), idx = this.currentX++;
                this.video.screen[this.video.LY*160+idx] = (this.video.BGP & (0b11 << (2*pixel))) >> 2*pixel;// -- CORRECT TRUE VALUE
            }
        } else { ; } //nothing
    }

    static signed8(x) {
        if ( x > 0x7f )
            return x - 256;
        return x;
    }
};

LCD.Triggers = {
    WINDOW: 1,
    SPRITE: 2
}

module.exports = {LCD, PPU};
// Note that foreground sprites don't use color 0 - it's transparent instead.
// Currently there is no blocking memory access during different LCD periods
// But if this causes some problems, it could be patched fairly easily

//FIFO pushes one pixel per clock, pauses unless it contains more than 8
//Fetch 3 clocks to fetch 8 pixels, pauses in 4th cycles, except space in the FIFO

// !!! Account for hidden windows, currently only disabled ones

// !!! 8 PIXEL FIFO, 16 might cause time problems