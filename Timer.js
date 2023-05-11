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
            this._TIMA = this.TMA;
            this.system.requestInterrupt(2);
            this.untilReload = -1; //disable
        }

        if ( this.untilReload > 0 ) this.untilReload--;

        this._DIV = (this._DIV + 1) & 0xffff;
        let mode = ((this.TAC & 0b11) - 1) & 0b11,
            shift = 3 + 2*mode,
            enable = this.TAC & 0b100;
        
        let value = enable && ((this._DIV & (1 << shift)) >> shift);
        if ( this.bit == 1 && value == 0 ) { //falling edge
            this._TIMA = (this._TIMA + 1) & 0xff;
            if ( this._TIMA == 0 )
                this.untilReload = 4;
        }
        this.bit = value;
    }

    catch(n) { //maybe timing issues here -> if interrupt stop
        while (n--)
            this.tick();
    }

    get DIV() { return (this._DIV & 0xff00) >> 8; }
    set DIV(x) { this._DIV = 0; }

    get TIMA() { return this._TIMA; }
    set TIMA(x) { 
        if ( this.untilReload > 0) this.untilReload = -1;
        return this._TIMA = x;
    }

};

module.exports = {Timer};