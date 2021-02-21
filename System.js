const { CPU } = require("./CPU");

class System {
    constructor() {
        this.memory = null;
        this.cartridge = null;
        this.cpu = null;
        this.video = null;
        this.IO = null;
        this.shouldCheckInterrupt = false;
        this.IF = 0;

        //used now for missing IO Devices
        this.slots = new Array(0x100); this.slots.fill(0);
    }

    boot() { /* ?? */  }

    catchCPU() {
        let remaining = this.video.ppu.cycles;
        this.video.ppu.cycles = 0;
        this.cpu.catch(remaining);
    }

    //IO Set/GET
    get(x) {
        if ( this.cpu.cycles && 0x40 <= (x & 0xff) && (x & 0xff) <= 0x4b )
            this.shouldCatchupPPU = true;
        
        switch (x&0xff) {
            case 0x40:
                return this.video.LCDC;
            case 0x41:
                return this.video.STAT;
            case 0x42:
                return this.video.SCY;
            case 0x43:
                return this.video.SCX;
            case 0x44:
                return this.video.LY;
            case 0x45:
                return this.video.LYC;
            case 0x46:
                return this.video.DMA;
            case 0x47:
                return this.video.BGP;
            case 0x48:
                return this.video.OBP0;
            case 0x49:
                return this.video.OBP1;
            case 0x4a:
                return this.video.WY;
            case 0x4b:
                return this.video.WX;
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
        if ( this.cpu.cycles && 0x40 <= (x & 0xff) && (x & 0xff) <= 0x4b )
            this.shouldCatchupPPU = true;
        
        switch (x&0xff) {
            case 0x40:
                return this.video.LCDC=y;
            case 0x41:
                return this.video.STAT=y;
            case 0x42:
                return this.video.SCY=y;
            case 0x43:
                return this.video.SCX=y;
            case 0x44:
                return this.video.LY=y;
            case 0x45:
                return this.video.LYC=y;
            case 0x46:
                return this.video.DMA=y;
            case 0x47:
                return this.video.BGP=y;
            case 0x48:
                return this.video.OBP0=y;
            case 0x49:
                return this.video.OBP1=y;
            case 0x4a:
                return this.video.WY=y;
            case 0x4b:
                return this.video.WX=y;
            case 0x04:
                return this.timer.DIV=y;
            case 0x05:
                return this.timer.TIMA=y;
            case 0x06:
                return this.timer.TMA=y;
            case 0x07:
                return this.timer.TAC=y;
            case 0x01:
                return this.serial.SB=y;
            case 0x02:
                return this.serial.SC=y;
            case 0x0f:
                this.IF=y;
                break;
            default:
                return this.slots[x & 0xff]=y;
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
        if ( this.memory.IE & (1 << number) )
            this.cpu.halted = false; //remove halt state
        
        this.shouldCheckInterrupt = true;
    }

    cancelInterrupt(number) {
        this.shouldCatchupCPU = true;
        this.memory.set(0xff0f, this.memory.get(0xff0f) &~ (1 << number)); //cancel interrupt
    }

    getInterrupt(number) {
        return (this.memory.get(0xff0f) & (1 << number)) >> number;
    }
};

module.exports = System;