//Non resizable FIFO

class FIFO {
  constructor(size) {
    this.size = size;
    this.buffer = new Array(size);
    this.reset();
  }

  push(x) {
    this.buffer[this.tail] = x;
    if (this.length && this.head == this.tail)
      this.head = (this.head + 1) % this.size;

    this.tail = (this.tail + 1) % this.size;
    this.length = Math.min(this.length + 1, this.size);
  }

  //no checks -- fix
  put(off, x) {
    let idx = (this.head + off) % this.size;
    this.buffer[idx] = x;
  }

  get(off) {
    let idx = (this.head + off) % this.size;
    return this.buffer[idx];
  }

  pop() {
    if (!this.length) return null;
    let ret = this.buffer[this.head];
    this.head = (this.head + 1) % this.size;
    this.length = Math.max(this.length - 1, 0);
    return ret;
  }

  reset() {
    this.length = 0;
    this.head = this.tail = 0;
  }
}

export default FIFO;
