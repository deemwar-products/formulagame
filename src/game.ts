/**
 * Kernel-zero (F = m · a) — raw Canvas 2D.
 *
 * No framework. Single requestAnimationFrame loop, logical 960x600 space,
 * DPR-aware backing store. Three named strikers, hold-and-release kick at
 * a goal, with a story shell (coach voice, score, goal/save/over banners).
 */

import { forceFormula } from "./kernel/formulas/force";
import type { ComputedVar, HoldMeterVar, ObjectPropertyVar } from "./kernel/types";

const W = 960;
const H = 600;
const GROUND_Y = 490;
const GOAL_LEFT = 780;
const GOAL_RIGHT = 920;
const GOAL_TOP = 290;
const KEEPER_HOME_X = 830;
const KEEPER_HOME_Y = 410;

type State = "idle" | "charging" | "flying" | "result";
type KickResult = "goal" | "save" | "over";

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

interface Slot extends Character {
  baseX: number;
  baseY: number;
  portraitX: number;
  portraitY: number;
  portraitR: number;
  image: HTMLImageElement | null;
}

interface CanvasBundle {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;
}

// ---------- bootstrap ----------

export async function startGame(host: HTMLElement): Promise<void> {
  const bundle = mountCanvas(host);
  const slots = buildSlots();
  // load photos in parallel; failure leaves image=null and we draw a coloured disc instead
  await Promise.all(
    slots.map(async (s) => {
      try {
        s.image = await loadImage(`${import.meta.env.BASE_URL}${s.photo}`);
      } catch {
        s.image = null;
      }
    })
  );
  const bg = renderBackground(bundle.dpr);
  const game = new Game(bundle, slots, bg);
  game.run();
}

function mountCanvas(host: HTMLElement): CanvasBundle {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const el = document.createElement("canvas");
  el.width = W * dpr;
  el.height = H * dpr;
  el.style.touchAction = "none";
  el.style.userSelect = "none";
  el.style.display = "block";
  el.style.background = "#0b1020";
  host.appendChild(el);
  applyFit(el);
  window.addEventListener("resize", () => applyFit(el));
  window.addEventListener("orientationchange", () => applyFit(el));

  const ctx = el.getContext("2d", { alpha: false, desynchronized: true })!;
  ctx.scale(dpr, dpr);
  return { el, ctx, dpr };
}

function applyFit(canvas: HTMLCanvasElement): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = W / H;
  let cssW = vw;
  let cssH = vw / aspect;
  if (cssH > vh) {
    cssH = vh;
    cssW = vh * aspect;
  }
  canvas.style.width = `${Math.floor(cssW)}px`;
  canvas.style.height = `${Math.floor(cssH)}px`;
}

function buildSlots(): Slot[] {
  const startX = 130;
  const spacing = 130;
  return CHARACTERS.map((c, i) => {
    const baseX = startX + i * spacing;
    const baseY = GROUND_Y - 18 - c.ballRadius + 18;
    return {
      ...c,
      baseX,
      baseY,
      portraitX: baseX,
      portraitY: 320,
      portraitR: 36,
      image: null,
    };
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

// ---------- pre-rendered background ----------

function renderBackground(_dpr: number): HTMLCanvasElement {
  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const ctx = bg.getContext("2d", { alpha: false })!;

  // sky
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a2a5e";
  ctx.fillRect(0, 0, W, GROUND_Y - 60);

  // crowd stripes
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

  // goal posts + crossbar
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(GOAL_LEFT - 3, GOAL_TOP, 6, GROUND_Y - GOAL_TOP);
  ctx.fillRect(GOAL_RIGHT - 3, GOAL_TOP, 6, GROUND_Y - GOAL_TOP);
  ctx.fillRect(GOAL_LEFT - 3, GOAL_TOP - 3, GOAL_RIGHT - GOAL_LEFT + 6, 6);

  // net diagonal lines
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

  // credit strip — at the very top
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, 26);

  // coach voice strip placeholder
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 26, W, 70);

  return bg;
}

// ---------- game ----------

class Game {
  private bundle: CanvasBundle;
  private slots: Slot[];
  private bg: HTMLCanvasElement;

  private state: State = "idle";
  private F = 0;
  private selectedMass = 5;
  private lastA = 0;
  private cfg = forceFormula;

  // flight state
  private flyT = 0;
  private flyDuration = 0.85;
  private flyStartX = 0;
  private flyStartY = 0;
  private flyLandX = 0;
  private flyPeakDelta = 220;
  private flyResult: KickResult = "save";
  private flyBallRadius = 24;
  private flyBallColor = "#fde68a";

  // outcome ui
  private bannerText = "";
  private bannerSub = "";
  private bannerColor = "#ffffff";

  // keeper sway state
  private keeperX = KEEPER_HOME_X;

  // animations
  private elapsed = 0;
  private creditPulseEnd = 0;
  private goals = 0;
  private attempts = 0;
  private hintFlash = true;

  // input
  private pointerActive = false;

  constructor(bundle: CanvasBundle, slots: Slot[], bg: HTMLCanvasElement) {
    this.bundle = bundle;
    this.slots = slots;
    this.bg = bg;
    this.bindInput();
    this.coachLine();
    this.creditPulseEnd = 1.3; // seconds from start
  }

  // ---------- main loop ----------

  run(): void {
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.elapsed += dt;
      this.update(dt);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---------- input ----------

  private bindInput(): void {
    const c = this.bundle.el;
    const toGame = (clientX: number, clientY: number): [number, number] => {
      const r = c.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      const y = ((clientY - r.top) / r.height) * H;
      return [x, y];
    };

    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.pointerActive = true;
      const [x, y] = toGame(e.clientX, e.clientY);
      this.onPointerDown(x, y);
    });
    c.addEventListener("pointerup", (e) => {
      e.preventDefault();
      if (this.pointerActive) {
        this.pointerActive = false;
        this.onPointerUp();
      }
    });
    c.addEventListener("pointercancel", () => {
      if (this.pointerActive) {
        this.pointerActive = false;
        this.onPointerUp();
      }
    });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onPointerDown(x: number, y: number): void {
    if (this.state === "result") {
      this.resetForNextKick();
      return;
    }
    if (this.state !== "idle") return;

    const hit = this.slotUnderPointer(x, y);
    if (hit) {
      this.selectMass(hit.mass);
      return;
    }
    this.state = "charging";
    this.F = 0;
    this.hintFlash = false;
  }

  private onPointerUp(): void {
    if (this.state === "charging") this.launchKick();
  }

  private slotUnderPointer(x: number, y: number): Slot | undefined {
    return this.slots.find((s) => {
      const dxBall = x - s.baseX;
      const dyBall = y - s.baseY;
      const rBall = s.ballRadius + 16;
      if (dxBall * dxBall + dyBall * dyBall <= rBall * rBall) return true;
      const dxPort = x - s.portraitX;
      const dyPort = y - s.portraitY;
      const rPort = 46;
      return dxPort * dxPort + dyPort * dyPort <= rPort * rPort;
    });
  }

  // ---------- selection ----------

  private currentSlot(): Slot {
    return this.slots.find((s) => s.mass === this.selectedMass)!;
  }

  private selectMass(mass: number): void {
    this.selectedMass = mass;
    this.F = 0;
    this.coachLine();
  }

  private coachLine(): void {
    // re-renders on every frame in render(); the value lives on currentSlot()
  }

  // ---------- kick ----------

  private launchKick(): void {
    const av = this.cfg.variables.a as ComputedVar;
    const a = av.compute({ m: this.selectedMass, F: this.F });
    this.lastA = a;
    this.attempts += 1;

    const slot = this.currentSlot();
    this.flyStartX = slot.baseX;
    this.flyStartY = slot.baseY;
    this.flyBallRadius = slot.ballRadius;
    this.flyBallColor = slot.ballColor;

    const t = this.cfg.target;
    let result: KickResult;
    if (a >= t.value - t.tolerance && a <= t.value + t.tolerance) result = "goal";
    else if (a < t.value - t.tolerance) result = "save";
    else result = "over";
    this.flyResult = result;

    if (result === "goal") this.flyLandX = 845 + (Math.random() * 24 - 12);
    else if (result === "save") this.flyLandX = 720;
    else this.flyLandX = W + 80;

    this.flyPeakDelta = result === "over" ? 360 : 220;
    this.flyT = 0;
    this.flyDuration = result === "over" ? 1.0 : 0.85;

    this.state = "flying";
  }

  private evaluateLanding(): void {
    const slot = this.currentSlot();
    const t = this.cfg.target;
    const a = this.lastA;
    if (this.flyResult === "goal") {
      this.goals += 1;
      this.bannerText = `GOAL by ${slot.name}!`;
      this.bannerSub = `a = ${a.toFixed(2)} m/s² — target ${t.value} ± ${t.tolerance}`;
      this.bannerColor = "#7cfc00";
    } else if (this.flyResult === "save") {
      this.bannerText = `${slot.name} — SAVED!`;
      this.bannerSub = `too soft — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      this.bannerColor = "#facc15";
      // keeper dive
      this.keeperDiveTo = this.flyLandX;
    } else {
      this.bannerText = `${slot.name} — OVER THE BAR!`;
      this.bannerSub = `too hard — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      this.bannerColor = "#ef4444";
    }
    this.state = "result";
  }

  private resetForNextKick(): void {
    this.bannerText = "";
    this.bannerSub = "";
    this.keeperDiveTo = null;
    const choices = (this.cfg.variables.m as ObjectPropertyVar).choices;
    const idx = choices.indexOf(this.selectedMass);
    this.selectMass(choices[(idx + 1) % choices.length]);
    this.state = "idle";
    this.hintFlash = true;
  }

  // ---------- update ----------

  private keeperDiveTo: number | null = null;

  private update(dt: number): void {
    const hv = this.cfg.variables.F as HoldMeterVar;

    // keeper position
    if (this.state === "result" && this.keeperDiveTo != null) {
      this.keeperX += (this.keeperDiveTo - this.keeperX) * Math.min(1, 8 * dt);
    } else if (this.state === "flying") {
      // stay at home during flight
      this.keeperX += (KEEPER_HOME_X - this.keeperX) * Math.min(1, 6 * dt);
    } else {
      const sway = Math.sin(this.elapsed * 1.6) * 30;
      this.keeperX = KEEPER_HOME_X + sway;
    }

    if (this.state === "charging") {
      this.F = Math.min(hv.max, this.F + hv.ratePerSecond * dt);
    }

    if (this.state === "flying") {
      this.flyT += dt;
      if (this.flyT >= this.flyDuration) {
        this.evaluateLanding();
      }
    }
  }

  // ---------- render ----------

  private render(): void {
    const ctx = this.bundle.ctx;
    // 1. background — blit the prerendered canvas (single bitmap copy)
    ctx.drawImage(this.bg, 0, 0);

    // 2. credit text (pulses briefly at start)
    const creditScale =
      this.elapsed < this.creditPulseEnd
        ? 1 + 0.25 * Math.sin((this.elapsed / this.creditPulseEnd) * Math.PI)
        : 1;
    ctx.save();
    ctx.translate(W / 2, 13);
    ctx.scale(creditScale, creditScale);
    ctx.font = "bold 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#fde68a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GAME BUILT BY  SREEVARSHAN  ·  SREEJAN  ·  MAGIZHINI", 0, 0);
    ctx.restore();

    // 3. coach voice line
    const slot = this.currentSlot();
    ctx.fillStyle = "#7a90d4";
    ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("COACH", 20, 38);

    ctx.fillStyle = "#e6e9ef";
    ctx.font = "italic 18px ui-serif, Georgia, serif";
    const line = `"${slot.name}, kick this ${slot.mass} kg ball at exactly ${this.cfg.target.value} m/s²!"`;
    ctx.fillText(line, 20, 56);

    // 4. score
    ctx.fillStyle = "#7cfc00";
    ctx.font = "bold 20px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`GOALS  ${this.goals} / ${this.attempts}`, W - 20, 42);

    // 5. hint above the players
    if (this.state === "idle" && this.hintFlash) {
      ctx.fillStyle = "#e6e9ef";
      ctx.font = "bold 16px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("pick a player ↓   then HOLD to charge, RELEASE to kick", W / 2, GOAL_TOP - 50);
    } else if (this.state === "result") {
      ctx.fillStyle = "#e6e9ef";
      ctx.font = "bold 16px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("tap anywhere — next player", W / 2, GOAL_TOP - 50);
    }

    // 6. keeper
    this.drawKeeper(ctx, this.keeperX, KEEPER_HOME_Y);

    // 7. characters (portrait + ball + labels)
    for (const s of this.slots) {
      this.drawSlot(ctx, s);
    }

    // 8. charge UI
    if (this.state === "charging") {
      this.drawChargeRing(ctx, slot);
    }

    // 9. flying ball
    if (this.state === "flying") {
      const t = Math.min(this.flyT / this.flyDuration, 1);
      const bx = this.flyStartX + (this.flyLandX - this.flyStartX) * t;
      const by = this.flyStartY - 4 * this.flyPeakDelta * t * (1 - t);
      this.drawBall(ctx, bx, by, this.flyBallRadius, this.flyBallColor, `${this.selectedMass} kg`);
    }

    // 10. result banner
    if (this.state === "result" && this.bannerText) {
      this.drawBanner(ctx);
    }

    // 11. stats line at bottom
    this.drawStats(ctx, slot);
  }

  private drawKeeper(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // body
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#7a5a00";
    ctx.lineWidth = 2;
    ctx.fillRect(x - 16, y - 28, 32, 56);
    ctx.strokeRect(x - 16, y - 28, 32, 56);
    // head
    ctx.beginPath();
    ctx.arc(x, y - 38, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe0b2";
    ctx.fill();
    ctx.stroke();
  }

  private drawSlot(ctx: CanvasRenderingContext2D, s: Slot): void {
    const selected = s.mass === this.selectedMass;

    // portrait ring
    ctx.fillStyle = "#0b1020";
    ctx.strokeStyle = selected ? "#7cfc00" : "#fde68a";
    ctx.lineWidth = selected ? 4 : 3;
    ctx.beginPath();
    ctx.arc(s.portraitX, s.portraitY, s.portraitR + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // portrait image (circular clip)
    if (s.image) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.portraitX, s.portraitY, s.portraitR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        s.image,
        s.portraitX - s.portraitR,
        s.portraitY - s.portraitR,
        s.portraitR * 2,
        s.portraitR * 2
      );
      ctx.restore();
    } else {
      // fallback disc
      ctx.fillStyle = s.ballColor;
      ctx.beginPath();
      ctx.arc(s.portraitX, s.portraitY, s.portraitR, 0, Math.PI * 2);
      ctx.fill();
    }

    // name
    ctx.fillStyle = selected ? "#7cfc00" : "#e6e9ef";
    ctx.font = "bold 15px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(s.name, s.portraitX, s.portraitY + s.portraitR + 12);

    // selection glow around ball
    if (selected) {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.baseX, s.baseY, s.ballRadius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(250, 204, 21, 0.18)";
      ctx.beginPath();
      ctx.arc(s.baseX, s.baseY, s.ballRadius + 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // ball (hide while ITS ball is flying)
    const hideBall = this.state === "flying" && this.selectedMass === s.mass;
    if (!hideBall) {
      this.drawBall(ctx, s.baseX, s.baseY, s.ballRadius, s.ballColor, `${s.mass} kg`);
    }
  }

  private drawBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fill: string,
    label: string
  ): void {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // label below ball
    ctx.fillStyle = "#fde68a";
    const labelW = ctx.measureText(label).width + 12;
    ctx.fillRect(x - labelW / 2, y + r + 8, labelW, 18);
    ctx.fillStyle = "#0b1020";
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y + r + 17);
  }

  private drawChargeRing(ctx: CanvasRenderingContext2D, slot: Slot): void {
    const hv = this.cfg.variables.F as HoldMeterVar;
    const av = this.cfg.variables.a as ComputedVar;
    const pct = this.F / hv.max;
    const a = av.compute({ m: this.selectedMass, F: this.F });

    ctx.strokeStyle = "#7cfc00";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(
      slot.baseX,
      slot.baseY,
      slot.ballRadius + 14,
      -Math.PI / 2,
      -Math.PI / 2 + pct * Math.PI * 2
    );
    ctx.stroke();

    // text above ball
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0b1020";
    ctx.fillStyle = "#7cfc00";
    ctx.font = "bold 20px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const txt = `F = ${this.F.toFixed(0)} N    a = ${a.toFixed(2)} m/s²`;
    ctx.strokeText(txt, slot.baseX, slot.baseY - slot.ballRadius - 38);
    ctx.fillText(txt, slot.baseX, slot.baseY - slot.ballRadius - 38);
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#0b1020";
    ctx.fillStyle = this.bannerColor;
    ctx.font = "bold 60px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(this.bannerText, W / 2, 230);
    ctx.fillText(this.bannerText, W / 2, 230);

    ctx.lineWidth = 4;
    ctx.fillStyle = "#e6e9ef";
    ctx.font = "22px ui-sans-serif, system-ui, sans-serif";
    ctx.strokeText(this.bannerSub, W / 2, 290);
    ctx.fillText(this.bannerSub, W / 2, 290);
  }

  private drawStats(ctx: CanvasRenderingContext2D, slot: Slot): void {
    const fNeeded = slot.mass * this.cfg.target.value;
    ctx.fillStyle = "#a0a8bd";
    ctx.font = "14px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      `${slot.name}  ·  ${slot.mass} kg  ·  last a = ${this.lastA.toFixed(2)} m/s²  ·  F = m · a  →  to score: hold near ${fNeeded.toFixed(0)} N`,
      W / 2,
      H - 22
    );
  }
}
