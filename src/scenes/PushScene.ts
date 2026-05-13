import Phaser from "phaser";
import { forceFormula } from "../kernel/formulas/force";
import type { ComputedVar, HoldMeterVar, ObjectPropertyVar } from "../kernel/types";

const W = 960;
const H = 600;

interface Crate {
  mass: number;
  baseX: number;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Rectangle;
  vx: number;
}

export class PushScene extends Phaser.Scene {
  private cfg = forceFormula;

  private F = 0;
  private held = false;
  private selectedMass = 5;
  private sustainTimer = 0;
  private won = false;

  private crates: Crate[] = [];

  private forceBarFill!: Phaser.GameObjects.Rectangle;

  private readoutF!: Phaser.GameObjects.Text;
  private readoutM!: Phaser.GameObjects.Text;
  private readoutA!: Phaser.GameObjects.Text;
  private targetIndicator!: Phaser.GameObjects.Text;
  private sustainBarFill!: Phaser.GameObjects.Rectangle;
  private holdHint!: Phaser.GameObjects.Text;
  private winText?: Phaser.GameObjects.Text;
  private winSub?: Phaser.GameObjects.Text;

  constructor() {
    super("PushScene");
  }

  create(): void {
    this.drawVoicePanel();
    this.drawTitle();
    this.drawCrates();
    this.drawForceMeter();
    this.drawReadouts();
    this.drawTargetAndSustain();
    this.drawHint();
    this.bindInput();
  }

  // ---------- drawing ----------

  private drawTitle(): void {
    this.add
      .text(W / 2, 22, "Formula Game — F = m · a", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "18px",
        color: "#8d99b5",
      })
      .setOrigin(0.5, 0);
  }

  private drawVoicePanel(): void {
    const panel = this.add.rectangle(W / 2, 80, W - 80, 76, 0x141a32, 1);
    panel.setStrokeStyle(2, 0x2a3358);
    panel.setOrigin(0.5);

    this.add
      .text(60, 56, this.cfg.voice.speaker.toUpperCase(), {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "13px",
        color: "#7a90d4",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);

    this.add
      .text(60, 78, `"${this.cfg.voice.text}"`, {
        fontFamily: "ui-serif, Georgia, serif",
        fontSize: "20px",
        color: "#e6e9ef",
        fontStyle: "italic",
        wordWrap: { width: W - 140 },
      })
      .setOrigin(0, 0);
  }

  private drawCrates(): void {
    const choices = (this.cfg.variables.m as ObjectPropertyVar).choices;
    const display = (this.cfg.variables.m as ObjectPropertyVar).display;
    const cy = 360;
    const spacing = 180;
    const startX = W / 2 - ((choices.length - 1) * spacing) / 2;

    choices.forEach((mass, i) => {
      const baseX = startX + i * spacing;

      const sizeScale = 0.7 + (mass / 10) * 0.6; // visual mass hint
      const wPx = 90 * sizeScale;
      const hPx = 70 * sizeScale;

      const glow = this.add.rectangle(baseX, cy, wPx + 14, hPx + 14, 0xfacc15, 0);
      glow.setStrokeStyle(3, 0xfacc15, 0);

      const rect = this.add.rectangle(baseX, cy, wPx, hPx, 0x8a6a3c, 1);
      rect.setStrokeStyle(3, 0x4a3a20);
      rect.setInteractive({ useHandCursor: true });

      const label = this.add
        .text(baseX, cy, `${mass} ${display}`, {
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: "20px",
          color: "#1a0e00",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      const crate: Crate = { mass, baseX, rect, label, glow, vx: 0 };

      rect.on("pointerdown", (p: Phaser.Input.Pointer) => {
        this.selectMass(mass);
        p.event.stopPropagation();
      });

      this.crates.push(crate);
    });

    this.selectMass(this.selectedMass);

    // ground line
    this.add.rectangle(W / 2, 410, W - 100, 2, 0x2a3358).setOrigin(0.5);
  }

  private selectMass(mass: number): void {
    if (this.won) return;
    this.selectedMass = mass;
    for (const c of this.crates) {
      const isSel = c.mass === mass;
      c.glow.setStrokeStyle(3, 0xfacc15, isSel ? 1 : 0);
      c.glow.fillAlpha = isSel ? 0.08 : 0;
      // reset motion of all crates when re-selecting
      c.vx = 0;
      c.rect.x = c.baseX;
      c.label.x = c.baseX;
      c.glow.x = c.baseX;
    }
    this.F = 0;
    this.sustainTimer = 0;
  }

  private drawForceMeter(): void {
    const mx = 70;
    const my = 470;
    const meterH = 200;
    const meterW = 32;

    // label
    this.add
      .text(mx, my - meterH - 22, "FORCE", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "12px",
        color: "#7a90d4",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // outline (origin bottom-center)
    this.add
      .rectangle(mx, my, meterW, meterH, 0x141a32, 1)
      .setOrigin(0.5, 1)
      .setStrokeStyle(2, 0x2a3358);

    // fill (origin bottom-center, height varies)
    this.forceBarFill = this.add
      .rectangle(mx, my, meterW - 6, 0, 0x4fd1c5, 1)
      .setOrigin(0.5, 1);

    // tick at target force (F_target = m_target * a_target — but m is chosen, so just label range)
    this.add
      .text(mx, my + 8, "0 N", {
        fontFamily: "ui-monospace, monospace",
        fontSize: "11px",
        color: "#7a90d4",
      })
      .setOrigin(0.5, 0);

    const hv = this.cfg.variables.F as HoldMeterVar;
    this.add
      .text(mx, my - meterH - 4, `${hv.max} N`, {
        fontFamily: "ui-monospace, monospace",
        fontSize: "11px",
        color: "#7a90d4",
      })
      .setOrigin(0.5, 1);
  }

  private drawReadouts(): void {
    const rx = W - 200;
    const ry = 220;
    const lineH = 56;

    const label = (txt: string, y: number) =>
      this.add
        .text(rx, y, txt, {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: "13px",
          color: "#7a90d4",
          fontStyle: "bold",
        })
        .setOrigin(0, 0);

    const readout = (y: number, color: string) =>
      this.add
        .text(rx, y + 14, "", {
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: "32px",
          color,
        })
        .setOrigin(0, 0);

    label("FORCE  (your hand)", ry);
    this.readoutF = readout(ry, "#4fd1c5");

    label("MASS  (the crate you picked)", ry + lineH);
    this.readoutM = readout(ry + lineH, "#facc15");

    label("ACCELERATION  (live)", ry + lineH * 2);
    this.readoutA = readout(ry + lineH * 2, "#a78bfa");
  }

  private drawTargetAndSustain(): void {
    const tx = W - 200;
    const ty = 150;
    this.targetIndicator = this.add
      .text(tx, ty, "", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "16px",
        color: "#facc15",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);

    // sustain bar
    const sx = W / 2 - 200;
    const sy = 550;
    this.add
      .rectangle(sx, sy, 400, 14, 0x141a32, 1)
      .setStrokeStyle(2, 0x2a3358)
      .setOrigin(0, 0.5);
    this.sustainBarFill = this.add
      .rectangle(sx + 2, sy, 0, 10, 0x7cfc00, 1)
      .setOrigin(0, 0.5);
    this.add
      .text(W / 2, sy - 18, "HOLD a in range to LOAD the crate", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "12px",
        color: "#7a90d4",
      })
      .setOrigin(0.5, 1);
  }

  private drawHint(): void {
    this.holdHint = this.add
      .text(W / 2, 200, "↓ click a crate to pick it ↓\nthen HOLD mouse anywhere to push", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "14px",
        color: "#8d99b5",
        align: "center",
      })
      .setOrigin(0.5);
  }

  private bindInput(): void {
    this.input.on("pointerdown", () => {
      if (this.won) {
        this.resetForRetry();
        return;
      }
      this.held = true;
      this.holdHint.setAlpha(0);
    });
    this.input.on("pointerup", () => {
      this.held = false;
    });
    this.input.on("pointerupoutside", () => {
      this.held = false;
    });
  }

  // ---------- update loop ----------

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05); // cap to avoid spikes
    const hv = this.cfg.variables.F as HoldMeterVar;
    const av = this.cfg.variables.a as ComputedVar;
    const tgt = this.cfg.target;

    // F builds/decays
    if (this.held && !this.won) {
      this.F += hv.ratePerSecond * dt;
    } else {
      this.F -= hv.decayPerSecond * dt;
    }
    this.F = Phaser.Math.Clamp(this.F, hv.min, hv.max);

    const a = av.compute({ m: this.selectedMass, F: this.F });

    // crate motion: selected crate slides right at v that integrates a
    for (const c of this.crates) {
      if (c.mass === this.selectedMass) {
        const visualScale = 18; // px/s per (m/s²)
        c.vx += a * visualScale * dt;
        // soft drag — bleed v over ~0.8s
        c.vx *= Math.pow(0.4, dt);
        c.rect.x += c.vx * dt;
        if (c.rect.x > W - 80) c.rect.x = W - 80;
        if (c.rect.x < c.baseX) c.rect.x = c.baseX;
        c.label.x = c.rect.x;
        c.glow.x = c.rect.x;
      }
    }

    // force bar fill height
    this.forceBarFill.height = (this.F / hv.max) * 200;

    // sustain target
    const inRange = Math.abs(a - tgt.value) <= tgt.tolerance;
    if (inRange && !this.won) {
      this.sustainTimer += dt;
      this.targetIndicator.setText(
        `TARGET  a = ${tgt.value.toFixed(1)} m/s²   ✓ in range`
      );
      this.targetIndicator.setColor("#7cfc00");
    } else if (!this.won) {
      this.sustainTimer = Math.max(0, this.sustainTimer - dt * 0.5);
      this.targetIndicator.setText(
        `TARGET  a = ${tgt.value.toFixed(1)} ± ${tgt.tolerance} m/s²`
      );
      this.targetIndicator.setColor("#facc15");
    }
    this.sustainBarFill.width = Math.min(this.sustainTimer / tgt.sustainSeconds, 1) * 396;

    // readouts
    this.readoutF.setText(`${this.F.toFixed(1)} N`);
    this.readoutM.setText(`${this.selectedMass} kg`);
    this.readoutA.setText(`${a.toFixed(2)} m/s²`);

    // win
    if (!this.won && this.sustainTimer >= tgt.sustainSeconds) {
      this.handleWin();
    }
  }

  // ---------- win / reset ----------

  private handleWin(): void {
    this.won = true;
    this.held = false;
    this.cameras.main.flash(220, 124, 252, 0, false);

    this.winText = this.add
      .text(W / 2, H / 2 - 30, "✅  Crate loaded.", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "44px",
        color: "#7cfc00",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.winSub = this.add
      .text(W / 2, H / 2 + 28, "click anywhere — try another crate", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "16px",
        color: "#e6e9ef",
      })
      .setOrigin(0.5);
  }

  private resetForRetry(): void {
    this.won = false;
    this.F = 0;
    this.sustainTimer = 0;
    this.winText?.destroy();
    this.winSub?.destroy();
    this.winText = undefined;
    this.winSub = undefined;
    // rotate to next mass automatically — encourages exploration
    const choices = (this.cfg.variables.m as ObjectPropertyVar).choices;
    const idx = choices.indexOf(this.selectedMass);
    const next = choices[(idx + 1) % choices.length];
    this.selectMass(next);
  }
}
