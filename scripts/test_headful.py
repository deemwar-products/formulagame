#!/usr/bin/env python3
"""
Headful Playwright check for the new press-and-hold gesture.

  press DOWN on a ball  →  charge ring + number visible
  hold ~250 ms          →  F ≈ 20 N, a ≈ 4 m/s² for 5 kg
  release               →  ball launches; GOAL banner appears
"""

from __future__ import annotations

import base64
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, Page

URL = "http://localhost:5173/formulagame/"
OUT = Path(__file__).resolve().parent.parent / "test-output"
OUT.mkdir(exist_ok=True)

W = 960
H = 600

# kick-scene.ts: startX=130, spacing=130, ballRadius varies → ballCenterY varies
# Magizhini 5kg: baseX=260, ballRadius=24, ballCenterY = baseY-radius+18 = 472-24+18 = 466
BALLS = {
    2:  (130, 472),    # Sreejan
    5:  (260, 466),    # Magizhini
    10: (390, 458),    # Sreevarshan
}
EMPTY = (600, 380)


def step(name: str) -> None:
    print(f"\n=== {name} ===")


def canvas_rect(page: Page) -> dict:
    return page.evaluate(
        """() => {
          const c = document.querySelector('canvas');
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        }"""
    )


def to_client(rect: dict, x: int, y: int) -> tuple[float, float]:
    sx = rect["width"] / W
    sy = rect["height"] / H
    return rect["left"] + x * sx, rect["top"] + y * sy


def snap(page: Page, name: str) -> None:
    path = OUT / f"{name}.png"
    data_url = page.evaluate(
        """() => {
          const c = document.querySelector('canvas');
          return c ? c.toDataURL('image/png') : null;
        }"""
    )
    if not data_url or not data_url.startswith("data:image/png;base64,"):
        print(f"  WARN: no canvas data for {name}")
        return
    payload = data_url.split(",", 1)[1]
    path.write_bytes(base64.b64decode(payload))
    print(f"  snap → {path.name}")


def main() -> int:
    errors: list[str] = []
    console_lines: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        page.on("console", lambda m: (
            console_lines.append(f"[{m.type}] {m.text}"),
            print(f"  console.{m.type}: {m.text}") if m.type in ("error", "warning") else None,
        ))
        page.on("pageerror", lambda e: (errors.append(str(e)), print(f"  PAGE ERROR: {e}")))

        step("load")
        page.goto(URL, wait_until="domcontentloaded", timeout=20000)
        time.sleep(2.0)
        rect = canvas_rect(page)
        print(f"  canvas: {rect}")
        snap(page, "01_initial")

        step("PRESS-and-HOLD on Magizhini 5kg (target a=4 → hold ~250 ms for F=20 N)")
        bx, by = to_client(rect, *BALLS[5])
        page.mouse.move(bx, by)
        page.mouse.down()
        time.sleep(0.20)
        snap(page, "02_charging_early")
        time.sleep(0.05)
        snap(page, "03_charging_target")

        step("release → ball flies on projectile arc")
        page.mouse.up()
        time.sleep(0.4)
        snap(page, "04_flying_a")
        time.sleep(0.4)
        snap(page, "05_flying_b")
        time.sleep(0.8)
        snap(page, "06_result")

        step("tap anywhere to advance, then PRESS-and-HOLD on Sreevarshan 10kg")
        page.mouse.click(*to_client(rect, *EMPTY))
        time.sleep(0.6)
        snap(page, "08_after_advance")

        bx, by = to_client(rect, *BALLS[10])
        page.mouse.move(bx, by)
        page.mouse.down()
        time.sleep(0.50)  # for 10kg need F=40N → 80 N/s × 0.5s = 40 N exactly
        snap(page, "09_charging_10kg")
        page.mouse.up()
        time.sleep(1.2)
        snap(page, "10_result_10kg")

        step("visible hold 3 s")
        time.sleep(3.0)
        browser.close()

    print("\n--- console (last 15) ---")
    for ln in console_lines[-15:]:
        print(f"  {ln}")

    print(f"\npage errors: {len(errors)}")
    for e in errors:
        print(f"  - {e}")
    print(f"screenshots: {OUT}")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
