import Phaser from "phaser";
import { forceFormula } from "../kernel/formulas/force";
import type { ComputedVar, HoldMeterVar, ObjectPropertyVar } from "../kernel/types";

/**
 * KickScene — kernel-zero (F = m·a) as a football free-kick.
 *
 * Three strikers (Sreevarshan, Magizhini, Sreejan) each have a ball of
 * different mass. Kid picks a player, holds to charge force, releases to
 * launch. a = F / m. a in [3.5, 4.5] → GOAL. Lower → SAVED. Higher → OVER.
 */

const W = 960;
const H = 600;
const GROUND_Y = 490;
const BALL_BASELINE_Y = GROUND_Y - 18;
const GOAL_LEFT = 780;
const GOAL_RIGHT = 920;
const GOAL_TOP = 290;
const KEEPER_HOME_X = 830;
const KEEPER_HOME_Y = 410;

type State = "idle" | "charging" | "flying" | "result";
type KickResult = "goal" | "save" | "over";

interface CharacterDef {
  mass: number;
  name: string;
  photoKey: string;
  ballRadius: number;
  ballColor: number;
}

const CHARACTERS: CharacterDef[] = [
  { mass: 2, name: "Sreejan", photoKey: "sreejan", ballRadius: 18, ballColor: 0xffffff },
  { mass: 5, name: "Magizhini", photoKey: "magizhini", ballRadius: 24, ballColor: 0xfde68a },
  { mass: 10, name: "Sreevarshan", photoKey: "sreevarshan", ballRadius: 32, ballColor: 0xef4444 },
];

interface Slot extends CharacterDef {
  baseX: number;
  baseY: number;
  body: Phaser.GameObjects.Arc;
  ballLabel: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Arc;
  portrait: Phaser.GameObjects.Image;
  portraitRing: Phaser.GameObjects.Arc;
  nameLabel: Phaser.GameObjects.Text;
}

export class KickScene extends Phaser.Scene {
  private cfg = forceFormula;
  private state: State = "idle";

  private F = 0;
  private selectedMass = 5;
  private lastA = 0;

  private slots: Slot[] = [];

  private flyBall!: Phaser.GameObjects.Arc;
  private flyBallLabel!: Phaser.GameObjects.Text;
  private flyStartX = 0;
  private flyStartY = 0;
  private flyLandX = 0;
  private flyPeakDelta = 0;
  private flyT = 0;
  private flyDuration = 0.9;
  private pendingResult: KickResult = "save";

  private keeperBody!: Phaser.GameObjects.Rectangle;
  private keeperHead!: Phaser.GameObjects.Arc;
  private keeperHomeX = KEEPER_HOME_X;
  private keeperHomeY = KEEPER_HOME_Y;

  private chargeRing!: Phaser.GameObjects.Graphics;
  private chargeText!: Phaser.GameObjects.Text;

  private bannerText!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private stats!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private coachText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private creditText!: Phaser.GameObjects.Text;

  private goals = 0;
  private attempts = 0;

  constructor() {
    super("KickScene");
  }

  preload(): void {
    this.load.setBaseURL(import.meta.env.BASE_URL);
    for (const c of CHARACTERS) {
      this.load.image(c.photoKey, `${c.photoKey}.jpg`);
    }
  }

  create(): void {
    this.drawBackground();
    this.drawCredit();
    this.drawGoalAndKeeper();
    this.drawHud();
    this.drawCharacters();
    this.drawFlyBall();
    this.drawChargeOverlay();
    this.bindInput();
    this.selectMass(this.selectedMass);
    this.flashCredit();
  }

  // ---------- world ----------

  private drawBackground(): void {
    this.add.rectangle(W / 2, 0, W, GROUND_Y - 60, 0x1a2a5e, 1).setOrigin(0.5, 0);
    for (let i = 0; i < 40; i++) {
      const x = (i + 0.5) * (W / 40);
      const c = i % 2 === 0 ? 0x2c3e7c : 0x344a93;
      this.add.rectangle(x, 120, W / 40 - 2, 36, c, 1).setOrigin(0.5);
    }
    this.add.rectangle(W / 2, GROUND_Y, W, H - GROUND_Y + 80, 0x1f7a3a, 1).setOrigin(0.5, 0);
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        this.add
          .rectangle((i + 0.5) * (W / 6), GROUND_Y + 30, W / 6, 80, 0x2a8a45, 1)
          .setOrigin(0.5);
      }
    }
    this.add.rectangle(W / 2, GROUND_Y, W, 3, 0xffffff, 0.6).setOrigin(0.5);
  }

  private drawCredit(): void {
    // Credit strip at very top — persistent
    this.add.rectangle(W / 2, 0, W, 26, 0x000000, 0.55).setOrigin(0.5, 0).setDepth(50);
    this.creditText = this.add
      .text(W / 2, 13, "GAME BUILT BY  SREEVARSHAN  ·  SREEJAN  ·  MAGIZHINI", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "13px",
        color: "#fde68a",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);
  }

  private flashCredit(): void {
    // Briefly pulse credit at start so it gets seen
    this.creditText.setScale(1.0);
    this.tweens.add({
      targets: this.creditText,
      scale: 1.25,
      duration: 600,
      yoyo: true,
      repeat: 1,
      ease: "Quad.easeInOut",
    });
  }

  private drawGoalAndKeeper(): void {
    const postW = 6;
    this.add
      .rectangle(GOAL_LEFT, (GOAL_TOP + GROUND_Y) / 2, postW, GROUND_Y - GOAL_TOP, 0xffffff, 1)
      .setOrigin(0.5);
    this.add
      .rectangle(GOAL_RIGHT, (GOAL_TOP + GROUND_Y) / 2, postW, GROUND_Y - GOAL_TOP, 0xffffff, 1)
      .setOrigin(0.5);
    this.add
      .rectangle((GOAL_LEFT + GOAL_RIGHT) / 2, GOAL_TOP, GOAL_RIGHT - GOAL_LEFT + postW, postW, 0xffffff, 1)
      .setOrigin(0.5);
    const netG = this.add.graphics();
    netG.lineStyle(1, 0xffffff, 0.35);
    for (let x = GOAL_LEFT + 8; x < GOAL_RIGHT; x += 14) {
      netG.lineBetween(x, GOAL_TOP + 4, x + 16, GROUND_Y - 4);
      netG.lineBetween(x + 16, GOAL_TOP + 4, x, GROUND_Y - 4);
    }

    this.keeperBody = this.add
      .rectangle(this.keeperHomeX, this.keeperHomeY, 32, 56, 0xfacc15, 1)
      .setStrokeStyle(2, 0x7a5a00);
    this.keeperHead = this.add
      .circle(this.keeperHomeX, this.keeperHomeY - 38, 14, 0xffe0b2, 1)
      .setStrokeStyle(2, 0x7a5a00);
  }

  private drawHud(): void {
    // Coach voice strip below the credit
    this.add.rectangle(W / 2, 26, W, 70, 0x0b1020, 1).setOrigin(0.5, 0);
    this.add
      .text(20, 38, "COACH", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "12px",
        color: "#7a90d4",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.coachText = this.add
      .text(20, 54, "", {
        fontFamily: "ui-serif, Georgia, serif",
        fontSize: "18px",
        color: "#e6e9ef",
        fontStyle: "italic",
        wordWrap: { width: W - 240 },
      })
      .setOrigin(0, 0);

    this.scoreText = this.add
      .text(W - 20, 42, "GOALS  0 / 0", {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "20px",
        color: "#7cfc00",
        fontStyle: "bold",
      })
      .setOrigin(1, 0);

    // Stats line — moved up from H-14 to avoid mobile-letterbox clipping
    this.stats = this.add
      .text(W / 2, H - 22, "", {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "14px",
        color: "#a0a8bd",
      })
      .setOrigin(0.5, 1);

    this.hintText = this.add
      .text(W / 2, GOAL_TOP - 50, "pick a player ↓   then HOLD to charge, RELEASE to kick", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "16px",
        color: "#e6e9ef",
        align: "center",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.bannerText = this.add
      .text(W / 2, 230, "", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "60px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#0b1020",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);

    this.bannerSub = this.add
      .text(W / 2, 290, "", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "22px",
        color: "#e6e9ef",
        stroke: "#0b1020",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
  }

  private drawCharacters(): void {
    const startX = 130;
    const spacing = 130;
    CHARACTERS.forEach((c, i) => {
      const baseX = startX + i * spacing;
      const baseY = BALL_BASELINE_Y - c.ballRadius + 18;

      // photo portrait — circular masked
      const portraitY = 320;
      const portraitR = 36;
      const portraitRing = this.add.circle(baseX, portraitY, portraitR + 4, 0x0b1020, 1);
      portraitRing.setStrokeStyle(3, 0xfde68a);

      const portrait = this.add.image(baseX, portraitY, c.photoKey);
      portrait.setDisplaySize(portraitR * 2, portraitR * 2);
      const maskShape = this.make.graphics({ x: 0, y: 0 });
      maskShape.fillStyle(0xffffff);
      maskShape.fillCircle(baseX, portraitY, portraitR);
      portrait.setMask(maskShape.createGeometryMask());

      const nameLabel = this.add
        .text(baseX, portraitY + portraitR + 12, c.name, {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: "15px",
          color: "#e6e9ef",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);

      // ball
      const glow = this.add.circle(baseX, baseY, c.ballRadius + 8, 0xfacc15, 0);
      glow.setStrokeStyle(3, 0xfacc15, 0);

      const body = this.add.circle(baseX, baseY, c.ballRadius, c.ballColor, 1);
      body.setStrokeStyle(2, 0x222222);

      const ballLabel = this.add
        .text(baseX, baseY + c.ballRadius + 10, `${c.mass} kg`, {
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: "13px",
          color: "#0b1020",
          backgroundColor: "#fde68a",
          padding: { left: 6, right: 6, top: 1, bottom: 1 },
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);

      this.slots.push({
        ...c,
        baseX,
        baseY,
        body,
        ballLabel,
        glow,
        portrait,
        portraitRing,
        nameLabel,
      });
    });
  }

  private drawFlyBall(): void {
    this.flyBall = this.add.circle(-100, -100, 18, 0xffffff, 1).setStrokeStyle(2, 0x222222);
    this.flyBallLabel = this.add
      .text(-100, -100, "", {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "11px",
        color: "#0b1020",
        backgroundColor: "#fde68a",
        padding: { left: 4, right: 4, top: 1, bottom: 1 },
      })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  private drawChargeOverlay(): void {
    this.chargeRing = this.add.graphics();
    this.chargeText = this.add
      .text(0, 0, "", {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "20px",
        color: "#7cfc00",
        fontStyle: "bold",
        stroke: "#0b1020",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  // ---------- selection ----------

  private currentSlot(): Slot {
    return this.slots.find((s) => s.mass === this.selectedMass)!;
  }

  private selectMass(mass: number): void {
    this.selectedMass = mass;
    this.F = 0;
    for (const s of this.slots) {
      const sel = s.mass === mass;
      s.glow.setStrokeStyle(3, 0xfacc15, sel ? 1 : 0);
      s.glow.fillAlpha = sel ? 0.18 : 0;
      s.portraitRing.setStrokeStyle(sel ? 4 : 3, sel ? 0x7cfc00 : 0xfde68a);
      s.nameLabel.setColor(sel ? "#7cfc00" : "#e6e9ef");
    }
    const slot = this.currentSlot();
    this.coachText.setText(
      `"${slot.name}, kick this ${slot.mass} kg ball at exactly 4 m/s²!"`
    );
    this.updateStats();
  }

  // ---------- input ----------

  private slotUnderPointer(p: Phaser.Input.Pointer): Slot | undefined {
    return this.slots.find((s) => {
      // accept taps on the ball OR the portrait area for mobile-friendly target
      const dxBall = p.x - s.body.x;
      const dyBall = p.y - s.body.y;
      const rBall = s.ballRadius + 16;
      if (dxBall * dxBall + dyBall * dyBall <= rBall * rBall) return true;
      const dxPort = p.x - s.portrait.x;
      const dyPort = p.y - s.portrait.y;
      const rPort = 44;
      return dxPort * dxPort + dyPort * dyPort <= rPort * rPort;
    });
  }

  private bindInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.state === "result") {
        this.resetForNextKick();
        return;
      }
      if (this.state !== "idle") return;

      const hit = this.slotUnderPointer(pointer);
      if (hit) {
        this.selectMass(hit.mass);
        return;
      }
      this.state = "charging";
      this.F = 0;
      this.hintText.setAlpha(0);
    });

    this.input.on("pointerup", () => {
      if (this.state === "charging") this.launchKick();
    });
    this.input.on("pointerupoutside", () => {
      if (this.state === "charging") this.launchKick();
    });
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

    const t = this.cfg.target;
    let result: KickResult;
    if (a >= t.value - t.tolerance && a <= t.value + t.tolerance) {
      result = "goal";
    } else if (a < t.value - t.tolerance) {
      result = "save";
    } else {
      result = "over";
    }
    this.pendingResult = result;

    if (result === "goal") {
      this.flyLandX = 845 + Phaser.Math.Between(-12, 12);
    } else if (result === "save") {
      this.flyLandX = 720;
    } else {
      this.flyLandX = W + 80;
    }
    this.flyPeakDelta = result === "over" ? 360 : 220;
    this.flyT = 0;
    this.flyDuration = result === "over" ? 1.0 : 0.85;

    this.flyBall.setRadius(slot.ballRadius);
    this.flyBall.setFillStyle(slot.ballColor);
    this.flyBall.setStrokeStyle(2, 0x222222);
    this.flyBall.setPosition(this.flyStartX, this.flyStartY);
    this.flyBallLabel.setText(`${this.selectedMass} kg`);
    this.flyBallLabel.setPosition(this.flyStartX, this.flyStartY);
    this.flyBallLabel.setAlpha(1);

    slot.body.setAlpha(0);
    slot.ballLabel.setAlpha(0);
    slot.glow.setAlpha(0);

    this.chargeRing.clear();
    this.chargeText.setAlpha(0);

    this.state = "flying";
  }

  private evaluateLanding(): void {
    const t = this.cfg.target;
    const a = this.lastA;
    const slot = this.currentSlot();

    let banner = "";
    let sub = "";
    let bannerColor = "#ffffff";

    if (this.pendingResult === "goal") {
      this.goals += 1;
      banner = `GOAL by ${slot.name}!`;
      sub = `a = ${a.toFixed(2)} m/s² — target ${t.value} ± ${t.tolerance}`;
      bannerColor = "#7cfc00";
      this.cameras.main.flash(180, 124, 252, 0, false);
      this.cameras.main.shake(220, 0.004);
    } else if (this.pendingResult === "save") {
      banner = `${slot.name} — SAVED!`;
      sub = `too soft — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      bannerColor = "#facc15";
      this.tweens.add({
        targets: [this.keeperBody, this.keeperHead],
        x: this.flyLandX,
        duration: 220,
        ease: "Quad.easeOut",
      });
    } else {
      banner = `${slot.name} — OVER THE BAR!`;
      sub = `too hard — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      bannerColor = "#ef4444";
    }

    this.bannerText.setText(banner).setColor(bannerColor).setAlpha(1);
    this.bannerSub.setText(sub).setAlpha(1);

    this.scoreText.setText(`GOALS  ${this.goals} / ${this.attempts}`);
    this.updateStats();

    this.time.delayedCall(900, () => {
      if (this.state === "result") {
        this.hintText.setText("tap anywhere — next player").setAlpha(1);
      }
    });

    slot.body.setAlpha(1);
    slot.ballLabel.setAlpha(1);
    slot.glow.setAlpha(1);

    this.state = "result";
  }

  private resetForNextKick(): void {
    this.bannerText.setAlpha(0);
    this.bannerSub.setAlpha(0);
    this.hintText
      .setText("pick a player ↓   then HOLD to charge, RELEASE to kick")
      .setAlpha(1);
    this.flyBall.setPosition(-100, -100);
    this.flyBallLabel.setPosition(-100, -100).setAlpha(0);
    this.tweens.add({
      targets: [this.keeperBody, this.keeperHead],
      x: this.keeperHomeX,
      duration: 260,
      ease: "Quad.easeInOut",
    });
    const choices = (this.cfg.variables.m as ObjectPropertyVar).choices;
    const idx = choices.indexOf(this.selectedMass);
    this.selectMass(choices[(idx + 1) % choices.length]);
    this.state = "idle";
  }

  // ---------- update loop ----------

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const hv = this.cfg.variables.F as HoldMeterVar;
    const av = this.cfg.variables.a as ComputedVar;

    if (this.state !== "flying") {
      // throttle keeper sway to every ~50 ms — invisible to the eye, saves draw calls
      const t = this.time.now / 600;
      const sway = Math.sin(t) * 30;
      this.keeperBody.x = this.keeperHomeX + sway;
      this.keeperHead.x = this.keeperHomeX + sway;
    }

    if (this.state === "charging") {
      this.F = Math.min(hv.max, this.F + hv.ratePerSecond * dt);
      const slot = this.currentSlot();
      const a = av.compute({ m: this.selectedMass, F: this.F });
      const pct = this.F / hv.max;
      // redraw ring; cheap relative to a full scene render
      this.chargeRing.clear();
      this.chargeRing.lineStyle(6, 0x7cfc00, 0.95);
      this.chargeRing.beginPath();
      this.chargeRing.arc(
        slot.baseX,
        slot.baseY,
        slot.ballRadius + 14,
        -Math.PI / 2,
        -Math.PI / 2 + pct * Math.PI * 2
      );
      this.chargeRing.strokePath();
      this.chargeText
        .setText(`F = ${this.F.toFixed(0)} N    a = ${a.toFixed(2)} m/s²`)
        .setPosition(slot.baseX, slot.baseY - slot.ballRadius - 38)
        .setAlpha(1);
    } else if (this.chargeText.alpha > 0) {
      // hide charge UI when no longer charging
      this.chargeRing.clear();
      this.chargeText.setAlpha(0);
    }

    if (this.state === "flying") {
      this.flyT += dt;
      const t = Math.min(this.flyT / this.flyDuration, 1);
      this.flyBall.x = this.flyStartX + (this.flyLandX - this.flyStartX) * t;
      this.flyBall.y = this.flyStartY - 4 * this.flyPeakDelta * t * (1 - t);
      this.flyBallLabel.x = this.flyBall.x;
      this.flyBallLabel.y = this.flyBall.y;
      if (t >= 1) {
        this.evaluateLanding();
      }
    }
  }

  // ---------- helpers ----------

  private updateStats(): void {
    const slot = this.currentSlot();
    const fNeeded = slot.mass * this.cfg.target.value;
    this.stats.setText(
      `${slot.name}  ·  ${slot.mass} kg  ·  last a = ${this.lastA.toFixed(2)} m/s²  ·  F = m · a  →  to score: hold near ${fNeeded.toFixed(0)} N`
    );
  }
}
