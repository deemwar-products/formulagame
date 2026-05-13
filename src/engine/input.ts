/**
 * Input — unified pointer (mouse + touch) abstraction over a canvas.
 *
 * Coordinates are reported in the engine's logical space (0..width, 0..height),
 * not screen pixels. Uses setPointerCapture so a hold that drags off canvas
 * still receives its release event.
 */

export type PointerHandler = (x: number, y: number) => void;

export class Input {
  x = 0;
  y = 0;
  isDown = false;

  private downCb: PointerHandler | null = null;
  private upCb: PointerHandler | null = null;
  private moveCb: PointerHandler | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private worldW: number,
    private worldH: number
  ) {
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.isDown = true;
      this.map(e.clientX, e.clientY);
      this.downCb?.(this.x, this.y);
    });
    canvas.addEventListener("pointermove", (e) => {
      this.map(e.clientX, e.clientY);
      this.moveCb?.(this.x, this.y);
    });
    const release = (e: PointerEvent) => {
      if (!this.isDown) return;
      this.isDown = false;
      this.map(e.clientX, e.clientY);
      this.upCb?.(this.x, this.y);
    };
    canvas.addEventListener("pointerup", (e) => {
      e.preventDefault();
      release(e);
    });
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private map(cx: number, cy: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.x = ((cx - r.left) / r.width) * this.worldW;
    this.y = ((cy - r.top) / r.height) * this.worldH;
  }

  onDown(cb: PointerHandler): void {
    this.downCb = cb;
  }
  onUp(cb: PointerHandler): void {
    this.upCb = cb;
  }
  onMove(cb: PointerHandler): void {
    this.moveCb = cb;
  }
}
