import Gameboy from "./Gameboy";
import ROMCartridge from "./Cartridge";
import Renderer from "./Renderer";

let gameboy = new Gameboy(),
  renderer;

(async () => {
  gameboy.cartridge = await ROMCartridge.load("./roms/Dr. Mario (World).gb");

  window.renderer = renderer = new Renderer(gameboy);
  renderer.attach(document.body);
  gameboy.boot();
  renderer.loop();
})();
