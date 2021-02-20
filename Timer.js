const System = require('./System');

class Timer {
    constructor(system) {
        this.system = system; system.timer = this;
        this._DIV = 0; //Divider Register
        this._TIMA = 0; //Timer Counter
        this.TMA = 0; //Timer Modulo
        this.TAC = 0; //Timer Control
        this.bit = 0;
        this.untilReload = -1;
    }

    //called each cycle
    tick() {
        if ( this.untilReload == 0 ) {
            this.TIMA = this.TMA;
            this.system.requestInterrupt(2);
            this.untilReload = -1; //disable
        }

        if ( this.untilReload > 0 ) this.untilReload--;

        this.DIV = (this.DIV + 1) & 0xffff;
        let mode = ((this.TAC & 0b11) - 1) & 0b11,
            shift = 3 + 2*mode,
            enable = this.TAC & 0b100;
        
        let value = ((this.DIV & (1 << shift)) >> shift) & enable;
        if ( this.bit == 1 && value == 0 ) { //falling edge
            this.TIMA = (this.TIMA + 1) & 0xff;
            //this.system.cancelInterrupt(2); //--optimise
            if ( this.TIMA == 0 )
                this.untilReload = 4;
        }
        
        this.bit = value;
    }

    get DIV() { return (this._DIV & 0xff00) >> 8; }
    set DIV(x) { this._DIV = 0; }

    get TIMA() { return this._TIMA; }
    set TIMA(x) { 
        if ( this.untilReload > 0) this.untilReload = -1;
        return this._TIMA = x;
    }

    get(addr) {
        switch (addr & 0x000f) {
            case 4: //Divider Register
                return (this.DIV & 0xff00) >> 8;
            case 5:
                return this.TIMA;
            case 6:
                return this.TMA;
            case 7:
                return this.TAC;
        
            default:
                throw "Unknown Timer Register";
        }
    }

    set(addr, x) {
        switch (addr & 0x000f) {
            case 4: //Divider Register
                return this.DIV = 0;
            case 5:
                //disable only if written before the 4 cycles elapsed
                if ( this.untilReload > 0) this.untilReload = -1;
                return this.TIMA = x;
            case 6:
                return this.TMA = x;
            case 7:
                return this.TAC = x;
        
            default:
                throw "Unknown Timer Register";
        }
    }
};

module.exports = {Timer};