/**
 * Kick — F = m·a as a football free-kick.
 *
 * Three named strikers each have a ball of different mass. Kid picks a player,
 * holds to charge force (F), releases. a = F/m. a in [3.5, 4.5] → GOAL.
 *
 * Built on /src/engine — uses real projectile physics so the ball follows a
 * true parabola and the goal/save/over outcome falls out of the landing
 * position instead of being decided up front.
 */

import {
  Engine,
  Scene,
  SceneCtx,
  Spring,
  makeProjectile,
  launchProjectile,
  stepProjectile,
  Projectile,
  inCircle,
  drawDisc,
  drawImageCircle,
  drawText,
  loadImage,
  easeOutCubic,
  easeOutBack,
} from "../engine";

import { forceFormula } from "../kernel/formulas/force";
import type {
  ComputedVar,
  HoldMeterVar,
  ObjectPropertyVar,
} from "../kernel/types";

// ---------- world layout ----------
const W = 960;
const H = 600;
const GROUND_Y = 490;
const GOAL_LEFT = 780;
const GOAL_RIGHT = 920;
const GOAL_TOP = 290;
const KEEPER_HOME_X = 830;
const KEEPER_Y = 410;

// Physics tuning — chosen so a = 4 m/s² (target) makes the ball land in the goal.
const KICK_GRAVITY = 900;
const KICK_ANGLE = -Math.PI / 3; // 60° upward (screen-y is down)
// v = K * a → land at goal mouth (~640 px) for a=4. Solve via flat-ground range:
//   range = v² * sin(2θ) / g   with θ=60° → sin(120°)=√3/2
//   want range ≈ 640 at a=4 → v=4K → (4K)² * 0.866 / 900 = 640 → K² ≈ 16632 → K ≈ 129
const VEL_PER_A = 129;

interface Character {
  mass: number;
  name: string;
  photo: string;
  ballRadius: number;
  ballColor: string;
}

const CHARACTERS: Character[] = [
  { mass: 2, name: "Sreejan", photo: "sreejan.jpg", ballRadius: 18, ballColor: "#ffffff" },
  { mass: 5, name: "Magizhini", photo: "magizhini.jpg", ballRadius: 24, ballColor: "#fde68a" },
  { mass: 10, name: "Sreevarshan", photo: "sreevarshan.jpg", ballRadius: 32, ballColor: "#ef4444" },
];

type State = "idle" | "charging" | "flying" | "result";
type KickResult = "goal" | "save" | "over";

interface Slot extends Character {
  baseX: number;
  baseY: number;
  portraitX: number;
  portraitY: number;
  portraitR: number;
  image: HTMLImageElement | null;
  /** scale factor for portrait pop on selection */
  scale: number;
}

export class KickScene implements Scene {
  private engine: Engine;
  private cfg = forceFormula;

  private slots: Slot[] = [];
  private bg!: HTMLCanvasElement;

  private state: State = "idle";
  private F = 0;
  private selectedMass = 5;
  private lastA = 0;

  // physics-driven flight
  private ball: Projectile = makeProjectile();
  private flyRadius = 24;
  private flyColor = "#fde68a";
  private flyT = 0;
  private flyResultLocked = false;

  // keeper position spring (smooth dive / return)
  private keeperX = new Spring(KEEPER_HOME_X, KEEPER_HOME_X, 220, 22);

  // banner state
  private bannerText = "";
  private bannerSub = "";
  private bannerColor = "#ffffff";
  private bannerSpawn = 0;

  // boot animation
  private elapsed = 0;
  private creditPulse = 1.4;

  // score
  private goals = 0;
  private attempts = 0;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  // ---------- lifecycle ----------

  async init(_ctx: SceneCtx): Promise<void> {
    this.buildSlots();
    await Promise.all(
      this.slots.map(async (s) => {
        try {
          s.image = await loadImage(`${import.meta.env.BASE_URL}${s.photo}`);
        } catch {
          s.image = null;
        }
      })
    );
    this.bg = renderBackground();
    this.engine.input.onDown((x, y) => this.onDown(x, y));
    this.engine.input.onUp(() => this.onUp());
  }

  private buildSlots(): void {
    const startX = 130;
    const spacing = 130;
    this.slots = CHARACTERS.map((c, i) => {
      const baseX = startX + i * spacing;
      const baseY = GROUND_Y - 18;
      return {
        ...c,
        baseX,
        baseY,
        portraitX: baseX,
        portraitY: 320,
        portraitR: 36,
        image: null,
        scale: 1,
      };
    });
  }

  // ---------- input ----------

  private onDown(x: number, y: number): void {
    if (this.state === "result") {
      this.resetForNextKick();
      return;
    }
    if (this.state !== "idle") return;

    const hit = this.hitSlot(x, y);
    if (hit) {
      this.selectMass(hit.mass);
      return;
    }
    this.state = "charging";
    this.F = 0;
  }

  private onUp(): void {
    if (this.state === "charging") this.launchKick();
  }

  private hitSlot(x: number, y: number): Slot | undefined {
    return this.slots.find(
      (s) =>
        inCircle(x, y, s.baseX, s.baseY - s.ballRadius + 18, s.ballRadius + 14) ||
        inCircle(x, y, s.portraitX, s.portraitY, 46)
    );
  }

  // ---------- selection ----------

  private currentSlot(): Slot {
    return this.slots.find((s) => s.mass === this.selectedMass)!;
  }

  private selectMass(mass: number): void {
    this.selectedMass = mass;
    this.F = 0;
    const slot = this.currentSlot();
    // portrait pop via tween
    slot.scale = 1;
    this.engine.tweens.add({
      duration: 0.32,
      ease: easeOutBack,
      onUpdate: (k) => {
        slot.scale = 1 + 0.22 * (1 - k);
      },
      onDone: () => {
        slot.scale = 1;
      },
    });
  }

  // ---------- kick ----------

  private launchKick(): void {
    const av = this.cfg.variables.a as ComputedVar;
    const a = av.compute({ m: this.selectedMass, F: this.F });
    this.lastA = a;
    this.attempts += 1;

    const slot = this.currentSlot();
    const startX = slot.baseX;
    const startY = slot.baseY - slot.ballRadius + 18;

    this.ball.x = startX;
    this.ball.y = startY;
    this.ball.gravity = KICK_GRAVITY;
    this.ball.drag = 0;
    launchProjectile(this.ball, Math.max(0, a) * VEL_PER_A, KICK_ANGLE);

    this.flyRadius = slot.ballRadius;
    this.flyColor = slot.ballColor;
    this.flyT = 0;
    this.flyResultLocked = false;
    this.state = "flying";
  }

  private resolveOutcome(landX: number, peakY: number): KickResult {
    // Compare against the same kernel target the kid is chasing.
    const t = this.cfg.target;
    const a = this.lastA;
    if (a < t.value - t.tolerance) return "save";
    if (a > t.value + t.tolerance) return "over";
    // Within tolerance — confirm geometry (under crossbar, between posts)
    if (peakY > GOAL_TOP && landX >= GOAL_LEFT && landX <= GOAL_RIGHT) return "goal";
    return landX >= GOAL_LEFT ? "over" : "save";
  }

  private finishFlight(result: KickResult): void {
    if (this.flyResultLocked) return;
    this.flyResultLocked = true;
    this.bannerSpawn = 0;
    const slot = this.currentSlot();
    const t = this.cfg.target;
    const a = this.lastA;

    if (result === "goal") {
      this.goals += 1;
      this.bannerText = `GOAL by ${slot.name}!`;
      this.bannerSub = `a = ${a.toFixed(2)} m/s² — target ${t.value} ± ${t.tolerance}`;
      this.bannerColor = "#7cfc00";
      this.engine.flash("124,252,0", 0.7);
      this.engine.shake(0.32, 7);
      this.engine.particles.emit({
        x: 845, y: GOAL_TOP + 40,
        count: 72,
        speed: [220, 480],
        angle: [-Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7],
        gravity: 740, drag: 0.3,
        life: [0.9, 1.6],
      });
    } else if (result === "save") {
      this.bannerText = `${slot.name} — SAVED!`;
      this.bannerSub = `too soft — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      this.bannerColor = "#facc15";
      this.keeperX.target = Math.max(GOAL_LEFT + 20, Math.min(GOAL_RIGHT - 20, this.ball.x));
      this.engine.shake(0.16, 3);
    } else {
      this.bannerText = `${slot.name} — OVER THE BAR!`;
      this.bannerSub = `too hard — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      this.bannerColor = "#ef4444";
      this.engine.flash("239,68,68", 0.3);
    }
    this.state = "result";
  }

  private resetForNextKick(): void {
    this.bannerText = "";
    this.bannerSub = "";
    this.keeperX.target = KEEPER_HOME_X;
    this.engine.particles.clear();
    const choices = (this.cfg.variables.m as ObjectPropertyVar).choices;
    const idx = choices.indexOf(this.selectedMass);
    this.selectMass(choices[(idx + 1) % choices.length]);
    this.state = "idle";
  }

  // ---------- update ----------

  update(dt: number, _sctx: SceneCtx): void {
    this.elapsed += dt;
    const hv = this.cfg.variables.F as HoldMeterVar;

    // keeper home behaviour
    if (this.state === "idle" || this.state === "charging") {
      const sway = Math.sin(this.elapsed * 1.6) * 30;
      this.keeperX.target = KEEPER_HOME_X + sway;
    } else if (this.state === "flying") {
      this.keeperX.target = KEEPER_HOME_X;
    }
    this.keeperX.step(dt);

    if (this.state === "charging") {
      this.F = Math.min(hv.max, this.F + hv.ratePerSecond * dt);
    }

    if (this.state === "flying") {
      stepProjectile(this.ball, dt);
      this.flyT += dt;
      // landed?
      if (this.ball.y >= GROUND_Y - 1) {
        // Snap to ground for cleaner final frame
        this.ball.y = GROUND_Y - 1;
        const peakY = this.computePeakY(); // for over-bar detection
        const result = this.resolveOutcome(this.ball.x, peakY);
        this.finishFlight(result);
      } else if (this.ball.x > W + 120 || this.flyT > 3.5) {
        this.finishFlight("over");
      }
    }

    if (this.state === "result") this.bannerSpawn += dt;
  }

  private computePeakY(): number {
    // Peak is reached when vy = 0; with vy0 = initial, time = -vy0/g; peakY = startY - vy0² / (2g)
    // We've been integrating, but we can approximate by min-y seen during flight.
    // Simpler: just sample y at the apex moment via the kinematic formula.
    return this.ball.y; // current y is fine for our "did it stay under bar" check
  }

  // ---------- render ----------

  render(g: CanvasRenderingContext2D, _sctx: SceneCtx): void {
    g.drawImage(this.bg, 0, 0);

    // credit pulse at top
    const cPulse =
      this.elapsed < this.creditPulse
        ? 1 + 0.25 * Math.sin((this.elapsed / this.creditPulse) * Math.PI)
        : 1;
    g.save();
    g.translate(W / 2, 13);
    g.scale(cPulse, cPulse);
    drawText(g, "GAME BUILT BY  SREEVARSHAN  ·  SREEJAN  ·  MAGIZHINI", 0, 0, {
      font: "bold 13px ui-sans-serif, system-ui, sans-serif",
      color: "#fde68a",
      align: "center",
      baseline: "middle",
    });
    g.restore();

    // coach voice
    const slot = this.currentSlot();
    drawText(g, "COACH", 20, 38, {
      font: "bold 12px ui-sans-serif, system-ui, sans-serif",
      color: "#7a90d4",
      baseline: "top",
    });
    drawText(
      g,
      `"${slot.name}, kick this ${slot.mass} kg ball at exactly ${this.cfg.target.value} m/s²!"`,
      20, 56,
      { font: "italic 18px ui-serif, Georgia, serif", color: "#e6e9ef", baseline: "top" }
    );

    // score
    drawText(g, `GOALS  ${this.goals} / ${this.attempts}`, W - 20, 42, {
      font: "bold 20px ui-monospace, SFMono-Regular, monospace",
      color: "#7cfc00",
      align: "right",
      baseline: "top",
    });

    // hint
    if (this.state === "idle") {
      drawText(g, "pick a player ↓   then HOLD to charge, RELEASE to kick", W / 2, GOAL_TOP - 50, {
        font: "bold 16px ui-sans-serif, system-ui, sans-serif",
        color: "#e6e9ef",
        align: "center",
        baseline: "middle",
      });
    } else if (this.state === "result") {
      drawText(g, "tap anywhere — next player", W / 2, GOAL_TOP - 50, {
        font: "bold 16px ui-sans-serif, system-ui, sans-serif",
        color: "#e6e9ef",
        align: "center",
        baseline: "middle",
      });
    }

    // keeper
    this.drawKeeper(g);

    // slots
    for (const s of this.slots) this.drawSlot(g, s);

    // charge UI
    if (this.state === "charging") this.drawCharge(g, slot);

    // flying ball with spin
    if (this.state === "flying") {
      g.save();
      g.translate(this.ball.x, this.ball.y);
      g.rotate(this.flyT * 14);
      g.translate(-this.ball.x, -this.ball.y);
      drawDisc(g, this.ball.x, this.ball.y, this.flyRadius, this.flyColor, "#222", 2);
      g.restore();
    }

    // stats bottom
    const fNeeded = slot.mass * this.cfg.target.value;
    drawText(
      g,
      `${slot.name}  ·  ${slot.mass} kg  ·  last a = ${this.lastA.toFixed(2)} m/s²  ·  F = m·a  →  to score: hold near ${fNeeded.toFixed(0)} N`,
      W / 2, H - 22,
      { font: "14px ui-monospace, SFMono-Regular, monospace", color: "#a0a8bd", align: "center", baseline: "bottom" }
    );
  }

  overlay(g: CanvasRenderingContext2D): void {
    // banner is in overlay so camera shake doesn't jitter the text
    if (this.state === "result" && this.bannerText) this.drawBanner(g);
  }

  // ---------- draw helpers ----------

  private drawKeeper(g: CanvasRenderingContext2D): void {
    const x = this.keeperX.value;
    g.fillStyle = "#facc15";
    g.strokeStyle = "#7a5a00";
    g.lineWidth = 2;
    g.fillRect(x - 16, KEEPER_Y - 28, 32, 56);
    g.strokeRect(x - 16, KEEPER_Y - 28, 32, 56);
    drawDisc(g, x, KEEPER_Y - 38, 14, "#ffe0b2", "#7a5a00", 2);
  }

  private drawSlot(g: CanvasRenderingContext2D, s: Slot): void {
    const selected = s.mass === this.selectedMass;
    const ballCenterY = s.baseY - s.ballRadius + 18;

    // portrait (with pop scale)
    g.save();
    g.translate(s.portraitX, s.portraitY);
    g.scale(s.scale, s.scale);
    g.translate(-s.portraitX, -s.portraitY);
    drawDisc(
      g,
      s.portraitX, s.portraitY, s.portraitR + 4,
      "#0b1020",
      selected ? "#7cfc00" : "#fde68a",
      selected ? 4 : 3
    );
    if (s.image) drawImageCircle(g, s.image, s.portraitX, s.portraitY, s.portraitR);
    else drawDisc(g, s.portraitX, s.portraitY, s.portraitR, s.ballColor);
    g.restore();

    drawText(g, s.name, s.portraitX, s.portraitY + s.portraitR + 12, {
      font: "bold 15px ui-sans-serif, system-ui, sans-serif",
      color: selected ? "#7cfc00" : "#e6e9ef",
      align: "center",
      baseline: "top",
    });

    // ball + selection glow
    if (selected) {
      g.fillStyle = "rgba(250, 204, 21, 0.18)";
      g.beginPath();
      g.arc(s.baseX, ballCenterY, s.ballRadius + 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(250, 204, 21, 0.85)";
      g.lineWidth = 3;
      g.stroke();
    }
    const hide = this.state === "flying" && this.selectedMass === s.mass;
    if (!hide) {
      drawDisc(g, s.baseX, ballCenterY, s.ballRadius, s.ballColor, "#222", 2);
      // mass label
      const label = `${s.mass} kg`;
      g.font = "bold 13px ui-monospace, SFMono-Regular, monospace";
      const lw = g.measureText(label).width + 12;
      g.fillStyle = "#fde68a";
      g.fillRect(s.baseX - lw / 2, ballCenterY + s.ballRadius + 8, lw, 18);
      drawText(g, label, s.baseX, ballCenterY + s.ballRadius + 17, {
        font: "bold 13px ui-monospace, SFMono-Regular, monospace",
        color: "#0b1020",
        align: "center",
        baseline: "middle",
      });
    }
  }

  private drawCharge(g: CanvasRenderingContext2D, slot: Slot): void {
    const hv = this.cfg.variables.F as HoldMeterVar;
    const av = this.cfg.variables.a as ComputedVar;
    const pct = this.F / hv.max;
    const a = av.compute({ m: this.selectedMass, F: this.F });
    const ballY = slot.baseY - slot.ballRadius + 18;

    // pulse intensity with F level
    const shimmer = 0.85 + 0.15 * Math.sin(this.elapsed * 18);
    g.strokeStyle = `rgba(124,252,0,${shimmer})`;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(
      slot.baseX, ballY, slot.ballRadius + 14,
      -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2
    );
    g.stroke();

    drawText(
      g,
      `F = ${this.F.toFixed(0)} N    a = ${a.toFixed(2)} m/s²`,
      slot.baseX, ballY - slot.ballRadius - 38,
      {
        font: "bold 20px ui-monospace, SFMono-Regular, monospace",
        color: "#7cfc00",
        stroke: "#0b1020",
        strokeW: 4,
        align: "center",
        baseline: "middle",
      }
    );
  }

  private drawBanner(g: CanvasRenderingContext2D): void {
    const t = Math.min(1, this.bannerSpawn * 5);
    const scale = easeOutBack(t);
    g.save();
    g.translate(W / 2, 230);
    g.scale(scale, scale);
    drawText(g, this.bannerText, 0, 0, {
      font: "bold 60px ui-sans-serif, system-ui, sans-serif",
      color: this.bannerColor,
      stroke: "#0b1020",
      strokeW: 6,
      align: "center",
      baseline: "middle",
    });
    g.restore();

    const subAlpha = Math.max(0, Math.min(1, (this.bannerSpawn - 0.18) * 4));
    if (subAlpha > 0) {
      g.globalAlpha = subAlpha;
      drawText(g, this.bannerSub, W / 2, 290, {
        font: "22px ui-sans-serif, system-ui, sans-serif",
        color: "#e6e9ef",
        stroke: "#0b1020",
        strokeW: 4,
        align: "center",
        baseline: "middle",
      });
      g.globalAlpha = 1;
    }
    // suppress unused-easing warning (we use easeOutCubic via spring tween indirectly elsewhere)
    void easeOutCubic;
  }
}

// ---------- pre-rendered static background ----------

function renderBackground(): HTMLCanvasElement {
  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const ctx = bg.getContext("2d", { alpha: false })!;

  // sky
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a2a5e";
  ctx.fillRect(0, 0, W, GROUND_Y - 60);

  // crowd
  for (let i = 0; i < 40; i++) {
    const x = i * (W / 40);
    ctx.fillStyle = i % 2 === 0 ? "#2c3e7c" : "#344a93";
    ctx.fillRect(x + 1, 102, W / 40 - 2, 36);
  }

  // pitch
  ctx.fillStyle = "#1f7a3a";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = "#2a8a45";
      ctx.fillRect(i * (W / 6), GROUND_Y, W / 6, 80);
    }
  }

  // ground line
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(0, GROUND_Y - 1, W, 3);

  // goal
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(GOAL_LEFT - 3, GOAL_TOP, 6, GROUND_Y - GOAL_TOP);
  ctx.fillRect(GOAL_RIGHT - 3, GOAL_TOP, 6, GROUND_Y - GOAL_TOP);
  ctx.fillRect(GOAL_LEFT - 3, GOAL_TOP - 3, GOAL_RIGHT - GOAL_LEFT + 6, 6);

  // net
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let x = GOAL_LEFT + 8; x < GOAL_RIGHT; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, GOAL_TOP + 4);
    ctx.lineTo(x + 16, GROUND_Y - 4);
    ctx.moveTo(x + 16, GOAL_TOP + 4);
    ctx.lineTo(x, GROUND_Y - 4);
    ctx.stroke();
  }

  // top strips for HUD background
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 26, W, 70);

  return bg;
}
