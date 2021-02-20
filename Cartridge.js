const fs = require('fs'); //or HTTPREquest

//start with basic
class ROMCartridge {
    constructor() {
        this.type = 0;
        this.name = "ROM ONLY";
        this.buffer = null;
    }

    get(x) { return this.buffer[x]; }
    set(x, y) { return; } //can't write

    /* NOT IMPLEMENTED */
    ramGet(x) { return 0; }
    ramSet(x) { return 0; }
};

ROMCartridge.load = function(file) {
    let buffer = fs.readFileSync(file);
    /* specialise the buffer here */
    /* NO CONTROLLERS YET */
    let cartridge = new ROMCartridge;
    cartridge.buffer = [...buffer];
    for ( let i = buffer.length; i < 0x7fff; i++ )
        cartridge.buffer[i] = 0;
    
    return cartridge;
};

module.exports = {ROMCartridge};