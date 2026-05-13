import Phaser from "phaser";
import { forceFormula } from "../kernel/formulas/force";
import type { ComputedVar, HoldMeterVar, ObjectPropertyVar } from "../kernel/types";

/**
 * KickScene — kernel-zero (F = m·a) as a football free-kick.
 *
 * Story: Coach tells the striker to kick at exactly 4 m/s² past the keeper.
 * Mechanic: pick a ball (mass), hold to charge force, release to launch.
 *   a = F / m. Land a in [3.5, 4.5] → GOAL. Lower → SAVED. Higher → OVER.
 * Variables stay visible: mass on the ball, charge meter while holding,
 * final a in the stats line after each kick.
 */

const W = 960;
const H = 600;
const GROUND_Y = 480;
const BALL_BASELINE_Y = GROUND_Y - 18;
const GOAL_LEFT = 780;
const GOAL_RIGHT = 920;
const GOAL_TOP = 280;
const KEEPER_HOME_X = 830;
const KEEPER_HOME_Y = 400;

type State = "idle" | "charging" | "flying" | "result";
type KickResult = "goal" | "save" | "over";

interface BallSlot {
  mass: number;
  baseX: number;
  baseY: number;
  radius: number;
  color: number;
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Arc;
}

export class KickScene extends Phaser.Scene {
  private cfg = forceFormula;
  private state: State = "idle";

  private F = 0;
  private selectedMass = 5;
  private lastA = 0;

  private balls: BallSlot[] = [];

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
  private hintText!: Phaser.GameObjects.Text;

  private goals = 0;
  private attempts = 0;

  constructor() {
    super("KickScene");
  }

  create(): void {
    this.drawBackground();
    this.drawGoalAndKeeper();
    this.drawHud();
    this.drawBalls();
    this.drawFlyBall();
    this.drawChargeOverlay();
    this.bindInput();
    this.selectMass(this.selectedMass);
  }

  // ---------- world ----------

  private drawBackground(): void {
    // sky
    this.add.rectangle(W / 2, 0, W, GROUND_Y - 60, 0x1a2a5e, 1).setOrigin(0.5, 0);
    // crowd band — striped bars
    for (let i = 0; i < 40; i++) {
      const x = (i + 0.5) * (W / 40);
      const c = i % 2 === 0 ? 0x2c3e7c : 0x344a93;
      this.add.rectangle(x, 110, W / 40 - 2, 40, c, 1).setOrigin(0.5);
    }
    // pitch
    this.add.rectangle(W / 2, GROUND_Y, W, H - GROUND_Y + 80, 0x1f7a3a, 1).setOrigin(0.5, 0);
    // pitch stripes
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        this.add
          .rectangle((i + 0.5) * (W / 6), GROUND_Y + 30, W / 6, 80, 0x2a8a45, 1)
          .setOrigin(0.5);
      }
    }
    // ground line
    this.add.rectangle(W / 2, GROUND_Y, W, 3, 0xffffff, 0.6).setOrigin(0.5);
  }

  private drawGoalAndKeeper(): void {
    const postW = 6;
    // posts
    this.add
      .rectangle(GOAL_LEFT, (GOAL_TOP + GROUND_Y) / 2, postW, GROUND_Y - GOAL_TOP, 0xffffff, 1)
      .setOrigin(0.5);
    this.add
      .rectangle(GOAL_RIGHT, (GOAL_TOP + GROUND_Y) / 2, postW, GROUND_Y - GOAL_TOP, 0xffffff, 1)
      .setOrigin(0.5);
    // crossbar
    this.add
      .rectangle((GOAL_LEFT + GOAL_RIGHT) / 2, GOAL_TOP, GOAL_RIGHT - GOAL_LEFT + postW, postW, 0xffffff, 1)
      .setOrigin(0.5);
    // net — thin diagonal lines
    const netG = this.add.graphics();
    netG.lineStyle(1, 0xffffff, 0.35);
    for (let x = GOAL_LEFT + 8; x < GOAL_RIGHT; x += 14) {
      netG.lineBetween(x, GOAL_TOP + 4, x + 16, GROUND_Y - 4);
      netG.lineBetween(x + 16, GOAL_TOP + 4, x, GROUND_Y - 4);
    }

    // keeper — body + head
    this.keeperBody = this.add
      .rectangle(this.keeperHomeX, this.keeperHomeY, 32, 56, 0xfacc15, 1)
      .setStrokeStyle(2, 0x7a5a00);
    this.keeperHead = this.add
      .circle(this.keeperHomeX, this.keeperHomeY - 38, 14, 0xffe0b2, 1)
      .setStrokeStyle(2, 0x7a5a00);
  }

  private drawHud(): void {
    // title strip / coach
    this.add.rectangle(W / 2, 0, W, 70, 0x0b1020, 1).setOrigin(0.5, 0);
    this.add
      .text(20, 12, "COACH", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "12px",
        color: "#7a90d4",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.add
      .text(
        20,
        30,
        `"${this.cfg.voice.text.replace("crate", "ball")}"`,
        {
          fontFamily: "ui-serif, Georgia, serif",
          fontSize: "18px",
          color: "#e6e9ef",
          fontStyle: "italic",
          wordWrap: { width: W - 240 },
        }
      )
      .setOrigin(0, 0);

    this.scoreText = this.add
      .text(W - 20, 16, "GOALS  0 / 0", {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "20px",
        color: "#7cfc00",
        fontStyle: "bold",
      })
      .setOrigin(1, 0);

    // bottom stats line
    this.stats = this.add
      .text(W / 2, H - 14, "", {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "14px",
        color: "#a0a8bd",
      })
      .setOrigin(0.5, 1);

    this.hintText = this.add
      .text(W / 2, GOAL_TOP - 50, "pick a ball ↓   then HOLD to charge, RELEASE to kick", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "15px",
        color: "#e6e9ef",
        align: "center",
      })
      .setOrigin(0.5);

    // result banner (hidden)
    this.bannerText = this.add
      .text(W / 2, 220, "", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "64px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#0b1020",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);

    this.bannerSub = this.add
      .text(W / 2, 280, "", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "22px",
        color: "#e6e9ef",
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
  }

  private drawBalls(): void {
    const choices = (this.cfg.variables.m as ObjectPropertyVar).choices;
    const display = (this.cfg.variables.m as ObjectPropertyVar).display;
    // Three balls staged on the left side
    const startX = 110;
    const spacing = 90;
    const colors = [0xffffff, 0xfde68a, 0xef4444];
    const radii = [18, 24, 32];

    choices.forEach((mass, i) => {
      const baseX = startX + i * spacing;
      const baseY = BALL_BASELINE_Y - radii[i] + 18;

      const glow = this.add.circle(baseX, baseY, radii[i] + 8, 0xfacc15, 0);
      glow.setStrokeStyle(3, 0xfacc15, 0);

      const body = this.add.circle(baseX, baseY, radii[i], colors[i], 1);
      body.setStrokeStyle(2, 0x222222);

      const label = this.add
        .text(baseX, baseY + radii[i] + 14, `${mass} ${display}`, {
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: "14px",
          color: "#0b1020",
          backgroundColor: "#fde68a",
          padding: { left: 6, right: 6, top: 2, bottom: 2 },
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);

      this.balls.push({ mass, baseX, baseY, radius: radii[i], color: colors[i], body, label, glow });
    });
  }

  private drawFlyBall(): void {
    // hidden until launch
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

  private selectMass(mass: number): void {
    this.selectedMass = mass;
    this.F = 0;
    for (const b of this.balls) {
      const sel = b.mass === mass;
      b.glow.setStrokeStyle(3, 0xfacc15, sel ? 1 : 0);
      b.glow.fillAlpha = sel ? 0.18 : 0;
    }
    this.updateStats();
  }

  // ---------- input ----------

  private ballUnderPointer(p: Phaser.Input.Pointer): BallSlot | undefined {
    return this.balls.find((b) => {
      const dx = p.x - b.body.x;
      const dy = p.y - b.body.y;
      const r = b.radius + 12;
      return dx * dx + dy * dy <= r * r;
    });
  }

  private bindInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.state === "result") {
        this.resetForNextKick();
        return;
      }
      if (this.state !== "idle") return;

      // tap on a ball → select only (no charging)
      const hit = this.ballUnderPointer(pointer);
      if (hit) {
        this.selectMass(hit.mass);
        return;
      }
      // tap empty space → start charging
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

    const slot = this.balls.find((b) => b.mass === this.selectedMass)!;
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

    // land target per result
    if (result === "goal") {
      this.flyLandX = 845 + Phaser.Math.Between(-12, 12);
    } else if (result === "save") {
      this.flyLandX = 720; // short of goal, into keeper
    } else {
      this.flyLandX = W + 80; // off-screen high
    }
    this.flyPeakDelta = result === "over" ? 360 : 220;
    this.flyT = 0;
    this.flyDuration = result === "over" ? 1.0 : 0.85;

    // configure fly ball to match selected
    this.flyBall.setRadius(slot.radius);
    this.flyBall.setFillStyle(slot.color);
    this.flyBall.setStrokeStyle(2, 0x222222);
    this.flyBall.setPosition(this.flyStartX, this.flyStartY);
    this.flyBallLabel.setText(`${this.selectedMass} kg`);
    this.flyBallLabel.setPosition(this.flyStartX, this.flyStartY);
    this.flyBallLabel.setAlpha(1);

    // hide stationary ball during flight
    slot.body.setAlpha(0);
    slot.label.setAlpha(0);
    slot.glow.setAlpha(0);

    // clear charge UI
    this.chargeRing.clear();
    this.chargeText.setAlpha(0);

    this.state = "flying";
  }

  private evaluateLanding(): void {
    const t = this.cfg.target;
    const a = this.lastA;
    const slot = this.balls.find((b) => b.mass === this.selectedMass)!;

    let banner = "";
    let sub = "";
    let bannerColor = "#ffffff";

    if (this.pendingResult === "goal") {
      this.goals += 1;
      banner = "GOAL!";
      sub = `crowd erupts — a = ${a.toFixed(2)} m/s² (target ${t.value} ± ${t.tolerance})`;
      bannerColor = "#7cfc00";
      this.cameras.main.flash(180, 124, 252, 0, false);
      this.cameras.main.shake(220, 0.004);
    } else if (this.pendingResult === "save") {
      banner = "SAVED!";
      sub = `too soft — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      bannerColor = "#facc15";
      // keeper dives down to the ball
      this.tweens.add({
        targets: [this.keeperBody, this.keeperHead],
        x: this.flyLandX,
        duration: 220,
        ease: "Quad.easeOut",
      });
    } else {
      banner = "OVER THE BAR!";
      sub = `too hard — a = ${a.toFixed(2)} m/s² (need ${t.value} ± ${t.tolerance})`;
      bannerColor = "#ef4444";
    }

    this.bannerText.setText(banner).setColor(bannerColor).setAlpha(1);
    this.bannerSub.setText(sub).setAlpha(1);

    this.scoreText.setText(`GOALS  ${this.goals} / ${this.attempts}`);
    this.updateStats();

    // hint to retry
    this.time.delayedCall(900, () => {
      if (this.state === "result") {
        this.hintText.setText("tap anywhere — next ball").setAlpha(1);
      }
    });

    // restore selectable ball stack regardless
    slot.body.setAlpha(1);
    slot.label.setAlpha(1);
    slot.glow.setAlpha(1);

    this.state = "result";
  }

  private resetForNextKick(): void {
    this.bannerText.setAlpha(0);
    this.bannerSub.setAlpha(0);
    this.hintText.setText("pick a ball ↓   then HOLD to charge, RELEASE to kick").setAlpha(1);
    this.flyBall.setPosition(-100, -100);
    this.flyBallLabel.setPosition(-100, -100).setAlpha(0);
    // keeper home
    this.tweens.add({
      targets: [this.keeperBody, this.keeperHead],
      x: this.keeperHomeX,
      duration: 260,
      ease: "Quad.easeInOut",
    });
    // rotate to next ball
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

    // keeper sway when idle/charging
    if (this.state !== "flying") {
      const t = this.time.now / 600;
      const sway = Math.sin(t) * 30;
      this.keeperBody.x = this.keeperHomeX + sway;
      this.keeperHead.x = this.keeperHomeX + sway;
      this.keeperBody.y = this.keeperHomeY;
      this.keeperHead.y = this.keeperHomeY - 38;
    }

    // charging — F climbs, ring fills around selected ball
    if (this.state === "charging") {
      this.F = Math.min(hv.max, this.F + hv.ratePerSecond * dt);
      const slot = this.balls.find((b) => b.mass === this.selectedMass)!;
      const a = av.compute({ m: this.selectedMass, F: this.F });
      const pct = this.F / hv.max;
      this.chargeRing.clear();
      this.chargeRing.lineStyle(6, 0x7cfc00, 0.9);
      this.chargeRing.beginPath();
      this.chargeRing.arc(
        slot.baseX,
        slot.baseY,
        slot.radius + 14,
        -Math.PI / 2,
        -Math.PI / 2 + pct * Math.PI * 2
      );
      this.chargeRing.strokePath();
      this.chargeText
        .setText(`F = ${this.F.toFixed(0)} N    a = ${a.toFixed(2)} m/s²`)
        .setPosition(slot.baseX, slot.baseY - slot.radius - 38)
        .setAlpha(1);
    }

    // flying — animate trajectory
    if (this.state === "flying") {
      this.flyT += dt;
      const t = Math.min(this.flyT / this.flyDuration, 1);
      this.flyBall.x = this.flyStartX + (this.flyLandX - this.flyStartX) * t;
      // parabolic arc: peak at t=0.5
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
    const m = this.selectedMass;
    const a = this.lastA;
    const fNeeded = m * (this.cfg.target.value);
    this.stats.setText(
      `picked ${m} kg   ·   last a = ${a.toFixed(2)} m/s²   ·   F = m · a   →   to score: hold force near ${fNeeded.toFixed(0)} N`
    );
  }
}
