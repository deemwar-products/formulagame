/**
 * Tweens — small easing library + a manager that updates active tweens.
 * Used for keeper dives, banner pop-in, charge ring shimmer, etc.
 */

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export interface Tween {
  duration: number;
  ease: Easing;
  onUpdate: (t: number) => void;
  onDone?: () => void;
  elapsed: number;
}

export class TweenManager {
  private active: Tween[] = [];

  add(opts: Omit<Tween, "elapsed">): void {
    this.active.push({ ...opts, elapsed: 0 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.elapsed = Math.min(t.duration, t.elapsed + dt);
      const k = t.duration > 0 ? t.elapsed / t.duration : 1;
      t.onUpdate(t.ease(k));
      if (t.elapsed >= t.duration) {
        t.onDone?.();
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.active.length = 0;
  }
}
