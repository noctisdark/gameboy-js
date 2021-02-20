//Non CGB Mode
//CGB Mode contains switchables, check later
class Memory {
    constructor(system) {
        this.system = system;
        this.system.memory = this;
        this.RAM = new Array(0x2000 + (0x7f)); //work ram + highram
        this.RAM.fill(0);
        this.IE = 0xff;
        //init components
        //...
        //...
    }

    get(x) {
        //console.log('read address', x.toString(16));
        if ( x <= 0x7fff) { //cartridge handle
            return this.system.cartridge.get(x);
        } else if ( 0x8000 <= x && x <= 0x9fff ) { //video ram
            return this.system.video.get(x - 0x8000);
        } else if ( 0xa000 <= x && x <= 0xbfff ) { //external ram, if exists
            return this.system.cartridge.ramGet(x - 0xa000);
        } else if ( 0xe000 <= x && x <= 0xfdff ) {
            //memory mirror 0xe000-0xfdff (unusable) and 0xc000-0xddff (actual ram)
            return this.RAM[x - 0xe000];
        } else if ( 0xc000 <= x && x <= 0xdfff ) {
            return this.RAM[x - 0xc000];
        } else if ( 0xfe00 <= x && x <= 0xfe9f ) { //OAM
            return this.system.video.getOAM(x - 0xfe00);
        } else if ( 0xff00 <= x && x <= 0xff7f ) { //IO
            return this.system.get(x);
        } else if ( 0xff80 <= x && x <= 0xfffe ) { //High RAM
            return this.RAM[0x2000 + x - 0xff80];
        } else if ( x == 0xffff ) { return this.IE; }
    }

    set(x, y) {
        //console.log('set address', x.toString(16), y.toString(16));
        if ( x <= 0x7fff) { //cartridge
            this.system.cartridge.set(x, y);
        } else if ( 0x8000 <= x && x <= 0x9fff ) { //video ram
            this.system.video.set(x-0x8000, y);
        } else if ( 0xa000 <= x && x <= 0xbfff ) { //external ram, if exists
            this.system.cartridge.ramSet(x, y);
        } else if ( 0xe000 <= x && x <= 0xfdff ) {
            //memory mirror 0xe000-0xfdff (unused) and 0xc000-0xddff (actual ram)
            this.RAM[x - 0xe000] = y;
        } else if ( 0xc000 <= x && x <= 0xdfff ) {
            this.RAM[x - 0xc000] = y;
        } else if ( 0xfe00 <= x && x <= 0xfe9f ) { //OAM
            this.system.video.setOAM(x-0xfe00, y);
        } else if ( 0xff00 <= x && x <= 0xff7f ) { //IO
            this.system.set(x, y);
        } else if ( 0xff80 <= x && x <= 0xfffe ) { //High RAM
            this.RAM[0x2000 + x - 0xff80] = y;
        } else if ( x == 0xffff ) {
            this.IE = y;
        }
    }
};

module.exports = {Memory};