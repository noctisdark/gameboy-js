let System = require('./System'),
    {Memory} = require('./Memory'),
    {CPU} = require('./CPU'),
    {LCD, PPU} = require('./PPU'),
    {ROMCartridge} = require('./Cartridge');

let system = new System;
system.memory = new Memory(system);
system.cpu = new CPU(system); system.cpu.start();
system.video = new LCD(system); new PPU(system, system.video);

let IO = new Array(0x100); IO.fill(0)
system.IO = {
    get(x) { return IO[x]; },
    set(x, y) { return IO[x] = y; }
}

for ( let i = 0; i < 10000; i++ )
    system.cpu.step();