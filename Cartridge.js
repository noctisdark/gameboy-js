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
    cartridge.buffer = buffer;
    console.log(cartridge.buffer.length.toString(16))
    return cartridge;
};

module.exports = {ROMCartridge};