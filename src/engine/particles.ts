/**
 * Particles — small pool for celebration effects (confetti, sparks).
 * Single shared system per Engine; scenes call `emit()` and `update/render` run automatically.
 */

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  rot: number;
  spin: number;
  shape: "rect" | "circle";
}

export interface EmitOpts {
  x: number;
  y: number;
  count: number;
  colors?: string[];
  speed?: [number, number];
  angle?: [number, number]; // radians; 0 = right, -PI/2 = up
  size?: [number, number];
  life?: [number, number];
  gravity?: number;
  drag?: number;
  spin?: [number, number];
  shape?: "rect" | "circle";
}

const DEFAULT_COLORS = ["#7cfc00", "#facc15", "#ef4444", "#4fd1c5", "#ffffff", "#fde68a"];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class ParticleSystem {
  private pool: Particle[] = [];

  emit(opts: EmitOpts): void {
    const colors = opts.colors ?? DEFAULT_COLORS;
    const speedR = opts.speed ?? [180, 440];
    const angleR = opts.angle ?? [-Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6];
    const sizeR = opts.size ?? [4, 9];
    const lifeR = opts.life ?? [0.8, 1.5];
    const spinR = opts.spin ?? [-12, 12];
    const gravity = opts.gravity ?? 700;
    const drag = opts.drag ?? 0;
    const shape = opts.shape ?? "rect";

    for (let i = 0; i < opts.count; i++) {
      const p = this.acquire();
      const angle = rand(angleR[0], angleR[1]);
      const speed = rand(speedR[0], speedR[1]);
      p.alive = true;
      p.x = opts.x;
      p.y = opts.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = gravity;
      p.drag = drag;
      p.color = colors[(Math.random() * colors.length) | 0];
      p.size = rand(sizeR[0], sizeR[1]);
      p.maxLife = rand(lifeR[0], lifeR[1]);
      p.life = p.maxLife;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = rand(spinR[0], spinR[1]);
      p.shape = shape;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0) p.alive = false;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const a = Math.min(1, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }

  private acquire(): Particle {
    for (const p of this.pool) {
      if (!p.alive) return p;
    }
    const fresh: Particle = {
      alive: false,
      x: 0, y: 0, vx: 0, vy: 0,
      gravity: 0, drag: 0,
      color: "#fff", size: 6,
      life: 0, maxLife: 1,
      rot: 0, spin: 0,
      shape: "rect",
    };
    this.pool.push(fresh);
    return fresh;
  }
}
