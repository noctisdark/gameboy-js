let System = require('./System'),
    {Serial} = require('./Serial'),
    {Timer} = require('./Timer'),
    {LCD, PPU} = require('./PPU'),
    {CPU} = require('./CPU'),
    {Memory} = require('./Memory'),
    {ROMCartridge} = require('./Cartridge'),
    {Joypad} = require('./Joypad'),
    {Renderer} = require('./Renderer');

let system = new System, cpu, serial, joypad, timer, renderer;


(async () => {
	system.memory = new Memory(system);
	cpu = new CPU(system); system.cpu.start();
	system.video = new LCD(system);
	system.cartridge = await ROMCartridge.load("./roms/Dr. Mario (World).gb");
	console.log(system.cartridge);
	serial = new Serial(system); timer = new Timer(system);
	joypad = new Joypad(system); Joypad.enable();
	serial.device = { //doesn't work, avoid the bugs
	    exchange(bit) {
	        this.byte = (this.byte << 1) | bit;
	        this.idx %= 8;
	        if ( this.idx == 0 ) {
	            this.bytes.push(this.byte);
	            this.byte = 0;
	        }
	        return 0;
	    }, idx: 0, byte: 0, bytes: []
	};


	renderer = new Renderer(system);
	renderer.attach(document.body)
	renderer.loop();
})();