/**
 * Physics — tiny, kernel-focused.
 *
 * Just enough for projectile motion (kick → arc → land) and 1-D springs
 * (charge ramp, smooth meter). No full physics engine — they cost 100 KB+
 * and we need 50 lines.
 */

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
}

export function makeProjectile(opts: Partial<Projectile> = {}): Projectile {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 900,
    drag: 0,
    ...opts,
  };
}

/** Launch with magnitude and angle (radians, 0 = right, +pi/2 = up in screen-down coords means -pi/2 here). */
export function launch(p: Projectile, speed: number, angleRad: number): void {
  p.vx = Math.cos(angleRad) * speed;
  p.vy = Math.sin(angleRad) * speed;
}

/** Forward Euler. Fine at 60 fps for short flights. */
export function stepProjectile(p: Projectile, dt: number): void {
  p.vy += p.gravity * dt;
  if (p.drag > 0) {
    const k = Math.exp(-p.drag * dt);
    p.vx *= k;
    p.vy *= k;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

/**
 * Spring — critically-damped-ish 1-D motion. Use for any value that should
 * "ease" toward a target without writing a custom tween.
 */
export class Spring {
  velocity = 0;
  constructor(
    public value: number,
    public target: number,
    public stiffness = 180,
    public damping = 18
  ) {}

  step(dt: number): void {
    const force = (this.target - this.value) * this.stiffness;
    const damp = -this.velocity * this.damping;
    this.velocity += (force + damp) * dt;
    this.value += this.velocity * dt;
  }

  set(v: number): void {
    this.value = v;
    this.velocity = 0;
  }
}

/** point ↔ circle, point ↔ rect — for hit testing. */
export function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

export function inRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}
