import roms from "./roms/roms.json";
import ROMCartridge from "./Cartridge";
import Gameboy from "./Gameboy";

class Renderer {
  constructor(gameboy) {
    //FRONT END

    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.imgData = this.ctx.getImageData(0, 0, 160, 144);

    //GAMEBOY
    this.setGameboy(gameboy);
    this.canvas.width = 160;
    this.canvas.height = 144;

    //COLORS
    this[3] = [0xf5, 0x96, 0xb4];
    this[2] = [0xc4, 0x78, 0x90];
    this[1] = [0x7a, 0x4b, 0x5a];
    this[0] = [0x31, 0x1e, 0x24];

    //put initial screen
    this.update();
    this.ctx.putImageData(this.imgData, 0, 0);

    //select
    this.select = this.createSelect();

    //helpers
    this.fps = document.createElement("div");
    this.tips = document.createElement("div");
    this.tips.innerHTML =
      "<h3>【﻿ｃｏｍｍａｎｄｓ】 ぴマ益:</h3><strong>【﻿ｕｐ】:</strong> Z<br/><strong>【﻿ｒｉｇｈｔ】:</strong> D<br/><strong>【﻿ｄｏｗｎ】:</strong> S<br><strong>【﻿ｌｅｆｔ】:</strong> Q<br/><strong>【﻿Ａ】 (どさテ):</strong> A<br/><strong>【﻿Ｂ】　(テ-ヿ):</strong> E<br/><strong>【﻿ｓｔａｒｔ】:</strong> P<br><strong>【﻿ｓｅｌｅｃｔ】:</strong> O";
  }

  setGameboy(gameboy) {
    this.gameboy = gameboy;
    this.gameboy.requestRender = () => this.update();
  }

  attach(parent) {
    const canvasContainer = document.createElement("div");
    canvasContainer.classList.add("gameboyRenderer");
    canvasContainer.appendChild(this.select);
    canvasContainer.appendChild(this.canvas);
    parent.appendChild(canvasContainer);

    const tipsContainer = document.createElement("div");
    tipsContainer.classList.add("tips");
    tipsContainer.appendChild(this.fps);
    tipsContainer.appendChild(this.tips);

    parent.appendChild(tipsContainer);
  }

  update() {
    let pixels = this.gameboy.ppu.pixels,
      outputImageData = this.imgData.data;

    for (let j = 0; j < 144; j++)
      for (let i = 0; i < 160; i++) {
        let idx = j * 160 + i,
          pixel = pixels[idx];

        outputImageData[idx * 4 + 0] = this[pixel][0];
        outputImageData[idx * 4 + 1] = this[pixel][1];
        outputImageData[idx * 4 + 2] = this[pixel][2];
        outputImageData[idx * 4 + 3] = 255; //--unneeded
      }
  }

  step(n) {
    this.gameboy.catch(n);
    this.ctx.putImageData(this.imgData, 0, 0);
  }

  loop() {
    let start,
      diff,
      fps = 0,
      avg = 60;

    let _frame = () => {
      window.requestAnimationFrame(_frame);
      if (start) {
        diff = new Date() - start;
        fps = 1000 / diff;
        avg = 0.01 * fps + 0.99 * avg;
        this.fps.innerHTML =
          "<strong>【﻿ｆｐｓ】　胃汚流</strong>: " +
          avg.toPrecision(3) +
          "ムゕ億";
      }

      if (this.gameboy.halted) return;
      start = new Date();
      this.gameboy.catch(456 * 154);
      this.ctx.putImageData(this.imgData, 0, 0);
    };

    requestAnimationFrame(_frame);
  }

  createSelect() {
    const select = document.createElement("select");
    for (const [key, value] of Object.entries(roms)) {
      const option = document.createElement("option");
      option.value = value;
      option.innerText = key;
      select.appendChild(option);
    }

    select.addEventListener("change", (e) => this.onGameChange(e.target.value));
    return select;
  }

  async onGameChange(gameUrl) {
    this.gameboy.shutdown();
    const cartridge = await ROMCartridge.load(gameUrl);
    const gameboy = new Gameboy();
    gameboy.cartridge = cartridge;
    this.setGameboy(gameboy);
    this.gameboy.boot();
  }
}

export default Renderer;
