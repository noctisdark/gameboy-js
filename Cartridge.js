const fs = require('fs'); //or HTTPREquest

//start with basic
class ROMCartridge {
    constructor() {
        this.name = "ROM ONLY";
        this.buffer = null;
    }

    get(x) { return this.buffer[x]; }
    set(x, y) { return; } //can't write

    /* NOT IMPLEMENTED */
    ramGet(x) { return 0; }
    ramSet(x, y) { return 0; }
};

ROMCartridge.load = function(file) {
    return fetch(file).then(resp => resp.arrayBuffer()).then(buffer => {

        return new Promise((res, rej) => {
            /* specialise the buffer here */
            /* NO CONTROLLERS YET */
            let cartridge = new ROMCartridge;
            cartridge.buffer = new Uint8Array(buffer);
            for ( let i = cartridge.buffer.length; i < 0x7fff; i++ )
                cartridge.buffer.buffer[i] = 0;
            
            res(ROMCartridge.from(cartridge));
        });
    }).catch(err => {throw err;});
};

ROMCartridge.bootSequence = [
    0x31, 0xfe, 0xff, 0xaf, 0x21, 0xff, 0x9f, 0x32, 0xcb, 0x7c, 0x20, 0xfb, 0x21, 0x26, 0xff, 0x0e,
    0x11, 0x3e, 0x80, 0x32, 0xe2, 0x0c, 0x3e, 0xf3, 0xe2, 0x32, 0x3e, 0x77, 0x77, 0x3e, 0xfc, 0xe0,
    0x47, 0x11, 0x04, 0x01, 0x21, 0x10, 0x80, 0x1a, 0xcd, 0x95, 0x00, 0xcd, 0x96, 0x00, 0x13, 0x7b,
    0xfe, 0x34, 0x20, 0xf3, 0x11, 0xd8, 0x00, 0x06, 0x08, 0x1a, 0x13, 0x22, 0x23, 0x05, 0x20, 0xf9,
    0x3e, 0x19, 0xea, 0x10, 0x99, 0x21, 0x2f, 0x99, 0x0e, 0x0c, 0x3d, 0x28, 0x08, 0x32, 0x0d, 0x20,
    0xf9, 0x2e, 0x0f, 0x18, 0xf3, 0x67, 0x3e, 0x64, 0x57, 0xe0, 0x42, 0x3e, 0x91, 0xe0, 0x40, 0x04,
    0x1e, 0x02, 0x0e, 0x0c, 0xf0, 0x44, 0xfe, 0x90, 0x20, 0xfa, 0x0d, 0x20, 0xf7, 0x1d, 0x20, 0xf2,
    0x0e, 0x13, 0x24, 0x7c, 0x1e, 0x83, 0xfe, 0x62, 0x28, 0x06, 0x1e, 0xc1, 0xfe, 0x64, 0x20, 0x06,
    0x7b, 0xe2, 0x0c, 0x3e, 0x87, 0xe2, 0xf0, 0x42, 0x90, 0xe0, 0x42, 0x15, 0x20, 0xd2, 0x05, 0x20,
    0x4f, 0x16, 0x20, 0x18, 0xcb, 0x4f, 0x06, 0x04, 0xc5, 0xcb, 0x11, 0x17, 0xc1, 0xcb, 0x11, 0x17,
    0x05, 0x20, 0xf5, 0x22, 0x23, 0x22, 0x23, 0xc9, 0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b,
    0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d, 0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e,
    0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99, 0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 0xec, 0xcc,
    0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e, 0x3c, 0x42, 0xb9, 0xa5, 0xb9, 0xa5, 0x42, 0x3c,
    0x21, 0x04, 0x01, 0x11, 0xa8, 0x00, 0x1a, 0x13, 0xbe, 0x20, 0xfe, 0x23, 0x7d, 0xfe, 0x34, 0x20,
    0xf5, 0x06, 0x19, 0x78, 0x86, 0x23, 0x05, 0x20, 0xfb, 0x86, 0x20, 0xfe, 0x3e, 0x01, 0xe0, 0x50,
];

ROMCartridge.from = function(cartridge) {
    let type = cartridge.buffer[0x147],
        ROMSize = cartridge.buffer[0x148],
        RAMSize = cartridge.buffer[0x149],
        supported = [0, 1, 2, 3, 5, 6];

    console.log('type:', type)
    if ( supported.indexOf(type) == -1 )
        throw "Unimplemented";

    if ( type == 0 ) //ROM ONLY
        return cartridge;
    if ( type < 4 ) { //MBC1
        let nBanks = (2 << ROMSize);
        let nRAMs = 1 << ROMSize;
        let cart = new MBC1Cartridge;

        cart.ram = new Uint8Array(0x2000 * nRAMs);
        cart.buffer = new Uint8Array(nBanks * 0x4000);
        cart.ram.fill(0);
        cart.buffer.fill(0);

        for ( let i = 0; i < cartridge.buffer.length; i++ )
            cart.buffer[i] = cartridge.buffer[i];

        return cart;
    }

    if ( type == 5 || type == 6) { //MBC2
        let nBanks = (2 << ROMSize);
        let nRAMs = 1 << ROMSize;
        let cart = new MBC2Cartridge;

        cart.ram = new Uint8Array(0x2000 * nRAMs);
        cart.buffer = new Uint8Array(nBanks * 0x4000);
        cart.ram.fill(0);
        cart.buffer.fill(0);

        for ( let i = 0; i < cartridge.buffer.length; i++ )
            cart.buffer[i] = cartridge.buffer[i];

        return cart;
    }
};


class MBC1Cartridge extends ROMCartridge {
    constructor() {
        super();
        this.name = "MBC1";
        this.ram = [];

        this.ramEnabled = 0;
        this.ROMBankL = 1; this.ROMBank = 1;
        this.RAMBank = 0; //also high 2-bits
        this.mode = 0;

        this.ROMOff = 0x4000;
        this.RAMOff = 0;
    }

    get(x) {
        if ( x <= 0x3fff ) {
            return this.buffer[x];
        } else {
            return this.buffer[(x&0x3fff) + this.ROMOff];
        }
    }

    //optimise
    set(x, y) {
        if ( 0 <= x && x <= 0x1fff ) {
            this.ramEnabled = (y & 0xf) == 0xa;
        } else if ( 0x2000 <= x && x <= 0x3fff ) {
            this.ROMBankL = (y & 0x1f) || 1;
            this.ROMBank = (this.ROMBank & 0x60) + this.ROMBankL;
            this.ROMOff = this.ROMBank * 0x4000;
        } else if ( 0x4000 <= x && x <= 0x5fff ) {
            this.RAMBank = y & 3;
            if ( !this.mode ) {
                this.ROMBank = (this.RAMBank << 5) + this.ROMBankL;
            } else {
                this.ROMBank = this.ROMBankL;
                this.RAMOff = this.RAMBank * 0x2000;
            }

            this.ROMOff = this.ROMBank * 0x4000;
        } else {
            this.mode = y & 1;
            if ( this.mode ) {
                this.ROMBank &= ~0x60;
                this.RAMOff = this.RAMBank * 0x2000;
            } else {
                this.ROMBank |= (this.RAMBank << 5);
                this.RAMOff = 0;
            }

            this.ROMOff = this.ROMBank * 0x4000;
        }
    }

    //bad branch -- try to find another solution
    ramGet(x) {
        if ( !this.ramEnabled )
            return 0xff;

        return this.ram[this.RAMOff + (x&0x1fff)];
    }
    ramSet(x, y) {
        if ( !this.ramEnabled )
            return;

        return this.ram[this.RAMOff + (x&0x1fff)]= y;
    }
};



class MBC2Cartridge extends ROMCartridge {
    constructor() {
        super();
        this.name = "MBC2";
        this.ram = [];

        this.ramEnabled = 0;
        this.ROMBank = 0;

        this.ROMOff = 0x4000;
    }

    get(x) {
        if ( x <= 0x3fff ) {
            return this.buffer[x];
        } else {
            return this.buffer[(x&0x3fff) + this.ROMOff];
        }
    }

    //optimise
    set(x, y) {
        if ( 0 <= x && x <= 0x1fff ) {
            this.ramEnabled = !(x & 0x100) && y;
        } else if ( 0x2000 <= x && x <= 0x3fff ) {
            if ( x & 0x100 ) {
                this.ROMBank = y & 0xf;
                this.ROMOff = this.ROMBank * 0x4000;
            }
        }
    }

    //bad branch -- try to find another solution
    ramGet(x) {
        if ( !this.ramEnabled || x > 0x1ff )
            return 0xff;

        return this.ram[this.RAMOff + (x&0x1fff)];
    }
    
    ramSet(x, y) {
        if ( !this.ramEnabled || x > 0x1ff )
            return;

        return this.ram[(x&0x1ff)]= y & 0xf;
    }
};
//DOESNT WORKK

module.exports = {ROMCartridge};