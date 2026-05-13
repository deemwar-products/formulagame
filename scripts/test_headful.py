#!/usr/bin/env python3
"""
Headful Playwright smoke test for kernel-zero — the KICK scene.

Verifies one full kick attempt: load → select ball → charge → release →
flight → result banner. Reports console errors.
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

GAME_W = 960
GAME_H = 600

# KickScene.drawBalls — startX=110, spacing=90
BALL_X = {2: 110, 5: 200, 10: 290}
BALL_Y = 450
HOLD_X = 500
HOLD_Y = 350


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
    sx = rect["width"] / GAME_W
    sy = rect["height"] / GAME_H
    return rect["left"] + x * sx, rect["top"] + y * sy


def screenshot(page: Page, name: str) -> None:
    """Grab the Phaser canvas directly — avoids Playwright's full-page font/animation wait."""
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
    print(f"  screenshot → {path.name}")


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

        step("1. load")
        page.goto(URL, wait_until="domcontentloaded", timeout=20000)
        time.sleep(2.0)
        rect = canvas_rect(page)
        print(f"  canvas: {rect}")
        screenshot(page, "01_initial")

        step("2. pick 5 kg ball — selects only, NO charge starts")
        bx, by = to_client(rect, BALL_X[5], BALL_Y)
        page.mouse.click(bx, by)
        time.sleep(0.5)
        screenshot(page, "02_selected_5kg")

        step("3. mouse.down on empty space → start charging; hold ~250 ms (F→20 N → a≈4)")
        hx, hy = to_client(rect, HOLD_X, HOLD_Y)
        page.mouse.move(hx, hy)
        page.mouse.down()
        time.sleep(0.13)
        screenshot(page, "03_charging_early")
        time.sleep(0.13)
        screenshot(page, "04_charging_target")

        step("4. release → launch")
        page.mouse.up()
        time.sleep(0.3)
        screenshot(page, "05_flying")

        step("5. wait for landing + result banner (flight ≤ 0.85 s)")
        time.sleep(1.4)
        screenshot(page, "06_result")

        step("6. tap to retry (advances to next ball)")
        page.mouse.click(hx, hy)
        time.sleep(0.6)
        screenshot(page, "07_reset_ready")

        step("7. visible hold for 4 seconds before closing")
        time.sleep(4.0)
        browser.close()

    print("\n--- console (last 20) ---")
    for ln in console_lines[-20:]:
        print(f"  {ln}")

    print("\n--- summary ---")
    print(f"  page errors: {len(errors)}")
    for e in errors:
        print(f"    - {e}")
    print(f"  screenshots: {OUT}")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
