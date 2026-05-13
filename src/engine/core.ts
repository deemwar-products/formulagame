/**
 * Engine — DPR-aware canvas, requestAnimationFrame loop, a single active Scene.
 * Tailored to the kernel: small, sync-friendly, dependency-free.
 */

import { Input } from "./input";
import { TweenManager } from "./tween";
import { ParticleSystem } from "./particles";

export interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  input: Input;
  tweens: TweenManager;
  particles: ParticleSystem;
  width: number;
  height: number;
}

export interface Scene {
  init(ctx: SceneCtx): void | Promise<void>;
  update(dt: number, ctx: SceneCtx): void;
  render(g: CanvasRenderingContext2D, ctx: SceneCtx): void;
  /** Optional screen-space overlay (drawn after camera shake restore). */
  overlay?(g: CanvasRenderingContext2D, ctx: SceneCtx): void;
  destroy?(): void;
}

export interface EngineOpts {
  width: number;
  height: number;
  maxDpr?: number;
  background?: string;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly input: Input;
  readonly tweens = new TweenManager();
  readonly particles = new ParticleSystem();
  readonly width: number;
  readonly height: number;

  // camera shake
  private shakeT = 0;
  private shakeMag = 0;
  private shakeMax = 0;
  private flashAlpha = 0;
  private flashRgb = "0,0,0";

  private scene: Scene | null = null;
  private running = false;
  private lastT = 0;
  private dpr: number;

  constructor(host: HTMLElement, opts: EngineOpts) {
    this.width = opts.width;
    this.height = opts.height;
    this.dpr = Math.min(opts.maxDpr ?? 2, window.devicePixelRatio || 1);

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.touchAction = "none";
    this.canvas.style.userSelect = "none";
    this.canvas.style.display = "block";
    this.canvas.style.background = opts.background ?? "#0b1020";
    host.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true })!;
    this.ctx.scale(this.dpr, this.dpr);

    this.input = new Input(this.canvas, this.width, this.height);
    this.fit();
    window.addEventListener("resize", () => this.fit());
    window.addEventListener("orientationchange", () => this.fit());
  }

  private fit(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = this.width / this.height;
    let cssW = vw;
    let cssH = vw / aspect;
    if (cssH > vh) {
      cssH = vh;
      cssW = vh * aspect;
    }
    this.canvas.style.width = `${Math.floor(cssW)}px`;
    this.canvas.style.height = `${Math.floor(cssH)}px`;
  }

  async setScene(scene: Scene): Promise<void> {
    if (this.scene?.destroy) this.scene.destroy();
    this.scene = scene;
    await scene.init(this.sceneCtx());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastT) / 1000, 0.05);
      this.lastT = now;
      this.step(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  shake(seconds: number, magnitude: number): void {
    this.shakeT = seconds;
    this.shakeMax = seconds;
    this.shakeMag = magnitude;
  }

  flash(rgb: string, alpha: number): void {
    this.flashRgb = rgb;
    this.flashAlpha = alpha;
  }

  private sceneCtx(): SceneCtx {
    return {
      ctx: this.ctx,
      input: this.input,
      tweens: this.tweens,
      particles: this.particles,
      width: this.width,
      height: this.height,
    };
  }

  private step(dt: number): void {
    if (!this.scene) return;
    const sctx = this.sceneCtx();

    // update
    this.tweens.update(dt);
    this.particles.update(dt);
    this.scene.update(dt, sctx);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.4);

    // render with optional camera shake
    const g = this.ctx;
    g.save();
    if (this.shakeT > 0 && this.shakeMax > 0) {
      const k = this.shakeT / this.shakeMax;
      const sx = (Math.random() - 0.5) * this.shakeMag * k * 2;
      const sy = (Math.random() - 0.5) * this.shakeMag * k * 2;
      g.translate(sx, sy);
    }
    this.scene.render(g, sctx);
    this.particles.render(g);
    g.restore();

    // screen-space overlay (no shake)
    this.scene.overlay?.(g, sctx);
    if (this.flashAlpha > 0) {
      g.fillStyle = `rgba(${this.flashRgb}, ${this.flashAlpha})`;
      g.fillRect(0, 0, this.width, this.height);
    }
  }
}
