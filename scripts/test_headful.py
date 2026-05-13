#!/usr/bin/env python3
"""
Headful Playwright smoke test for the kick scene.

Runs two passes — desktop viewport and iPhone-like mobile viewport — and
captures Phaser canvas screenshots at each step. The mobile pass uses a
narrower viewport to verify the FIT-scale and touch input both work.
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

# KickScene.drawCharacters — startX=130, spacing=130
SLOT_X = {2: 130, 5: 260, 10: 390}
PORTRAIT_Y = 320  # photo y in scene coords
BALL_Y = 460      # approx
HOLD_X = 600
HOLD_Y = 380


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


def run_pass(p, label: str, viewport: dict, file_prefix: str) -> int:
    print(f"\n########  {label}  (viewport {viewport['width']}x{viewport['height']})")
    errors: list[str] = []
    console_lines: list[str] = []

    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context(viewport=viewport, has_touch=True, is_mobile=("mobile" in label.lower()))
    page = ctx.new_page()
    page.on("console", lambda m: (
        console_lines.append(f"[{m.type}] {m.text}"),
        print(f"  console.{m.type}: {m.text}") if m.type in ("error", "warning") else None,
    ))
    page.on("pageerror", lambda e: (errors.append(str(e)), print(f"  PAGE ERROR: {e}")))

    step("load")
    page.goto(URL, wait_until="domcontentloaded", timeout=20000)
    time.sleep(2.5)  # photos + first frame
    rect = canvas_rect(page)
    print(f"  canvas rect: {rect}")
    snap(page, f"{file_prefix}_01_initial")

    step("tap Magizhini (5 kg)")
    bx, by = to_client(rect, SLOT_X[5], PORTRAIT_Y)
    page.mouse.click(bx, by)
    time.sleep(0.4)
    snap(page, f"{file_prefix}_02_selected")

    step("tap Sreevarshan (10 kg)")
    bx, by = to_client(rect, SLOT_X[10], PORTRAIT_Y)
    page.mouse.click(bx, by)
    time.sleep(0.4)
    snap(page, f"{file_prefix}_03_selected_sreevarshan")

    step("hold empty space to charge")
    hx, hy = to_client(rect, HOLD_X, HOLD_Y)
    page.mouse.move(hx, hy)
    page.mouse.down()
    time.sleep(0.18)
    snap(page, f"{file_prefix}_04_charging")
    time.sleep(0.18)
    snap(page, f"{file_prefix}_05_charging_more")
    page.mouse.up()

    step("flight")
    time.sleep(0.5)
    snap(page, f"{file_prefix}_06_flying")
    time.sleep(1.5)
    snap(page, f"{file_prefix}_07_result")

    step("visible hold 2 s")
    time.sleep(2.0)

    browser.close()
    print(f"  page errors in {label}: {len(errors)}")
    for e in errors:
        print(f"    - {e}")
    return 0 if not errors else 2


def main() -> int:
    with sync_playwright() as p:
        # Desktop pass
        rc1 = run_pass(p, "DESKTOP", {"width": 1280, "height": 800}, "desk")
        # Mobile pass — iPhone 13-ish portrait
        rc2 = run_pass(p, "MOBILE", {"width": 390, "height": 844}, "mob")

    print(f"\nscreenshots in: {OUT}")
    return rc1 | rc2


if __name__ == "__main__":
    sys.exit(main())
