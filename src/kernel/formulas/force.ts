import type { GameKernelConfig } from "../types";

/**
 * F = m · a — kernel-zero.
 *
 * The kid picks a crate (mass), holds the mouse to build force,
 * and tries to land the crate's acceleration at exactly 4 m/s².
 */
export const forceFormula: GameKernelConfig = {
  formula: "F = m · a",
  variables: {
    m: {
      type: "object-property",
      display: "kg",
      choices: [2, 5, 10],
    },
    F: {
      type: "hold-meter",
      display: "N",
      min: 0,
      max: 100,
      ratePerSecond: 80,
      decayPerSecond: 120,
    },
    a: {
      type: "computed",
      display: "m/s²",
      compute: (vars) => {
        const m = vars.m;
        const F = vars.F;
        if (!m || m <= 0) return 0;
        return F / m;
      },
    },
  },
  target: {
    variable: "a",
    value: 4,
    tolerance: 0.5,
    sustainSeconds: 1.0,
  },
  reveal: "F = m · a",
  voice: {
    speaker: "Quartermaster",
    text: "Get this crate moving at 4 m/s² — we need it loaded by sunset.",
  },
};
