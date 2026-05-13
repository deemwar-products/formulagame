/**
 * GameKernel — the universal config shape every formula-game obeys.
 *
 * Each formula declares its variables; each variable has a `type` that
 * binds it to one of the kernel's input primitives. See KERNEL.md.
 */

export type VariableType =
  | "object-property"   // kid picks one of a fixed set (e.g. mass: 2/5/10 kg)
  | "hold-meter"        // kid holds input device; value climbs while held
  | "dial"              // kid tunes a value with a knob/slider
  | "drag"              // kid drags to set distance/length
  | "tap-time"          // kid taps repeatedly; time accumulates
  | "computed";         // derived from other variables every frame

export interface ObjectPropertyVar {
  type: "object-property";
  display: string;
  choices: number[];
}

export interface HoldMeterVar {
  type: "hold-meter";
  display: string;
  min: number;
  max: number;
  /** Newtons per second of holding. Tunes the input feel. */
  ratePerSecond: number;
  /** Decay per second when not held (0 = sticky, large = snappy). */
  decayPerSecond: number;
}

export interface ComputedVar {
  type: "computed";
  display: string;
  /** Pure function of currently-bound variable values. */
  compute: (vars: Record<string, number>) => number;
}

export type VariableDef = ObjectPropertyVar | HoldMeterVar | ComputedVar;

export interface Target {
  /** Variable name whose value the kid must hit. */
  variable: string;
  /** Target value. */
  value: number;
  /** Acceptable deviation (±). */
  tolerance: number;
  /** Seconds the kid must hold within tolerance to win. */
  sustainSeconds: number;
}

export interface VoiceLine {
  /** Spoken by the in-world narrator. Frames the target without naming the formula. */
  text: string;
  /** Character/role saying it (e.g. "Quartermaster"). */
  speaker: string;
}

export interface GameKernelConfig {
  formula: string;
  /** Map of variable name → definition. */
  variables: Record<string, VariableDef>;
  target: Target;
  /** Per-level overrides (target.value etc.). Kernel-zero ignores. */
  levels?: Array<Partial<Target>>;
  /** Revealed in Act 3. */
  reveal: string;
  /** Story-layer voice. Kernel-zero uses just one line. */
  voice: VoiceLine;
}
