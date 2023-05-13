class Renderer {
  constructor(system) {
    //FRONT END

    this.canvas = document.createElement("canvas");
    this.canvas.classList.add("gameboyRenderer");
    this.ctx = this.canvas.getContext("2d");
    this.imgData = this.ctx.getImageData(0, 0, 160, 144);

    //GAMEBOY
    this.system = system;
    system.renderer = this;
    system.requestRender = () => this.update();
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

    //helpers
    this.fps = document.createElement("div");
    this.tips = document.createElement("div");
    this.tips.innerHTML =
      "<h3>【﻿ｃｏｍｍａｎｄｓ】 ぴマ益:</h3><strong>【﻿ｕｐ】:</strong> Z<br/><strong>【﻿ｒｉｇｈｔ】:</strong> D<br/><strong>【﻿ｄｏｗｎ】:</strong> S<br><strong>【﻿ｌｅｆｔ】:</strong> Q<br/><strong>【﻿Ａ】 (どさテ):</strong> A<br/><strong>【﻿Ｂ】　(テ-ヿ):</strong> E<br/><strong>【﻿ｓｔａｒｔ】:</strong> P<br><strong>【﻿ｓｅｌｅｃｔ】:</strong> O";
  }

  attach(parent) {
    parent.appendChild(this.canvas);
    parent.appendChild(this.fps);
    parent.appendChild(this.tips);
  }

  update() {
    let screen = this.system.video.screen,
      imgData = this.imgData,
      data = imgData.data;

    for (let j = 0; j < 144; j++)
      for (let i = 0; i < 160; i++) {
        let idx = j * 160 + i,
          pixel = screen[idx];

        data[idx * 4 + 0] = this[pixel][0];
        data[idx * 4 + 1] = this[pixel][1];
        data[idx * 4 + 2] = this[pixel][2];
        data[idx * 4 + 3] = 255; //--unneeded
      }
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

      start = new Date();
      this.system.catch(456 * 154);
      this.ctx.putImageData(this.imgData, 0, 0);
    };

    requestAnimationFrame(_frame);
  }
}

export default Renderer;
