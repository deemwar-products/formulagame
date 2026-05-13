# THE KERNEL

*A universal template for turning any formula into a discovery game.*

---

## The Core Loop (every formula uses this)

```
┌─────────────────────────────────────────────────┐
│  1. OBJECTS exist with visible PROPERTIES        │
│  2. Kid CHOOSES which object to use             │
│  3. Kid APPLIES an input (hold, drag, tap)      │
│  4. Object RESPONDS visibly (moves, changes)    │
│  5. A TARGET demands a specific result          │
│  6. Kid TRIES, FAILS, ADJUSTS, SUCCEEDS         │
│  7. Formula REVEALS as the rule they used       │
└─────────────────────────────────────────────────┘
```

This loop works for **every formula in physics and math.** That's the kernel's power.

---

## The Five Pillars (non-negotiable for every formula)

### 1. Every variable in the formula must be a VISIBLE NUMBER on screen.

If the formula is `F = m · a`, the kid must see:
- `m` printed on the object (e.g., "5 kg")
- `F` shown as a meter that climbs while they push
- `a` displayed live as the object moves

If the formula is `v = u + at`, the kid must see:
- `u` shown as the starting speed of the object
- `a` shown as a dial they tune
- `t` shown as a timer ticking up
- `v` shown as the live current speed

**Rule: the kid never computes anything they can't see. The numbers are characters in the story.**

### 2. The kid must CHOOSE which object/parameter to use.

Multiple options on screen. Wrong choice = can't win. The choosing forces them to *think about which variable matters*. This is the puzzle layer.

For `F = m·a`: which mass to push?
For `v² = u² + 2as`: which starting velocity to launch with?
For `A = πr²`: which radius circle to fit?

### 3. The input must be PHYSICAL.

Hold to build force. Drag to set angle. Tap-tap-tap to add over time. The kid's body does the verb of the formula. Their hand becomes the variable.

- Force? **Hold the mouse down.**
- Time? **Wait — clock ticks.**
- Distance? **Drag.**
- Angle? **Rotate.**
- Mass? **Pick the heavier object.**

The mouse/finger *is* the variable. That's the kernel's deepest move.

### 4. The TARGET is a specific number the kid must hit.

Not "do well." Not "explore." A precise target: *"land at exactly 100. reach acceleration 5. make the timer say 3 seconds."* This creates failure states. Failure is the teacher.

### 5. The formula reveals as the LAW the kid was already obeying.

After enough successful rounds, the screen shows the kid a table of *their own gameplay data* — every attempt they made, with the variables filled in. Then asks: **"what's the rule?"** They derive it from their own data. Not from a textbook.

---

## The Universal Stage Architecture (3 acts, every formula)

### Act 1 — Play (3–4 minutes)
The kid plays the mechanic. Hits targets. Fails. Adjusts. They have no idea what they're learning. The formula is hidden. Variables are visible numbers on screen but not yet labelled with formula symbols.

### Act 2 — Notice (1–2 minutes)
The screen presents the kid's last 5 attempts as a **data table**. Columns: the variables. Rows: each attempt. The kid sees the pattern in their own play. The screen asks: *"what's the rule?"* Multiple choices or sliders to test their theory.

### Act 3 — Name (30 seconds)
The rule they derived gets a name: `F = m · a` or `v = u + at`. The screen replays their gameplay with the formula overlaid — every push, every result, the formula was running in the background the whole time. The kid sees: **"I was the formula."**

---

## The Formula Library (using the kernel)

Every one of these can be a game with the same kernel — only the mechanic changes:

| Formula | Kid's input | What's visible | The target |
|---|---|---|---|
| **F = m·a** | hold mouse to build force | mass on object, force meter, a-readout | hit acceleration X |
| **v = u + at** | tap to accelerate over time | starting v, acceleration dial, timer | reach velocity X |
| **s = ut + ½at²** | tune u and a | clock, position counter | land at distance X in time T |
| **W = F·s** | hold to push, drag distance | force meter, distance ruler | total work = X joules |
| **F = G·m₁m₂/r²** | drag two planets closer/apart | masses, distance, force-arrow | feel inverse-square |
| **PV = nRT** | pump a piston | pressure gauge, volume, temp | hit target pressure |
| **Area = ½·b·h** | drag triangle vertices | base, height, area-readout | match given area |
| **A = πr²** | drag circle radius | radius, area | fit specific area |
| **Pythagoras a² + b² = c²** | drag triangle legs | a, b, c | match hypotenuse |
| **y = mx + c** | drag line slope/intercept | m, c, y at chosen x | hit a point |
| **Ohm's V = IR** | dial voltage, swap resistors | V, I, R live | target current |
| **E = mc²** | (advanced) destroy mass | mass slider, energy bar | target energy |
| **PV diagrams** | compress gas | P, V live curves | thermodynamic cycle |

Every single one fits the kernel. Build the kernel once. Plug in any formula. Game.

---

## The Engineering Architecture

In code, this becomes a **Game template** with these slots:

```ts
GameKernel({
  formula: "F = m · a",
  variables: {
    m: { type: "object-property", display: "kg", choices: [2, 5, 10] },
    F: { type: "hold-meter", min: 0, max: 100, display: "N" },
    a: { type: "computed", compute: (F, m) => F / m, display: "m/s²" }
  },
  target: { variable: "a", value: 4, tolerance: 0.5 },
  levels: 12,
  reveal: "F = m · a"
})
```

Add a new formula? **Define new variables, new target, new compute function. The whole game framework is reused.**

This is the kernel as software. Once we build it right for `F = m·a`, the next formula (`v = u + at`, `W = F·s`, `A = πr²`) takes a fraction of the time. Months of curriculum become weeks of plugging into the template.

---

## The Curriculum Vision

A library of dozens of formula-games, all running the same kernel:

- **Physics**: F=ma, W=Fs, v=u+at, F=Gm₁m₂/r², PV=nRT, E=½mv²…
- **Maths**: y=mx+c, Pythagoras, A=πr², quadratic roots, sin/cos identities…
- **Chemistry**: pH = -log[H⁺], n = m/M, ideal gas law…
- **Biology**: rates of reaction, allele frequency (p² + 2pq + q² = 1)…

A kid playing through 50 of these games has *physically lived inside* the equations of school. Class 7 through Class 12, gamified, kernel-based, self-discovered.

---

## The Kernel's Promise

> **No formula is taught. Every formula is played.**
> **No symbol is memorised. Every symbol is earned.**
> **No textbook tells. The kid's own gameplay data reveals.**
