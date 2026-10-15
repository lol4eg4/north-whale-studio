import { describe, expect, test } from "bun:test";
import { camera, circleHitsBox, clampPull, fall, gravity, isBank, isRocket, keyPull, launch, layout, maxSpeed, pointsFor, quickPull, SPEED, TARGET_POINTS } from "../physics.ts";

describe("slingshot physics", () => {
  test("a pull becomes a launch the other way; the band stretches only so far", () => {
    expect(clampPull(300, 400, 170)).toEqual({ x: 102, y: 136 });
    expect(clampPull(30, 40, 170)).toEqual({ x: 30, y: 40 });
    expect(launch({ x: 10, y: 5 }, 170, 1000)).toBeNull(); // under 16 px: back to rest
    const full = launch({ x: 0, y: 170 }, 170, 1000)!;
    expect(full.power).toBe(1);
    expect(full.vx).toBeCloseTo(0);
    expect(full.vy).toBeCloseTo(-1000 * SPEED);
    const half = launch({ x: -85, y: 0 }, 170, 1000)!;
    expect(half.ux).toBe(1);
    expect(half.speed).toBeCloseTo(1000 * SPEED * 0.5 ** 0.9);
    expect(launch({ x: 0, y: 900 }, 170, 1000)!.power).toBe(1); // power never above 1
  });

  test("gravity pulls the whale down every step; vmax just clears the top of the screen", () => {
    const g = gravity(900);
    expect(g).toBeCloseTo(1035);
    const b = { x: 0, y: 0, vx: 100, vy: -500 };
    fall(b, g, 0.1);
    expect(b.vy).toBeCloseTo(-396.5);
    expect(b.x).toBeCloseTo(10);
    expect(b.y).toBeCloseTo(-39.65);
    const v = maxSpeed(g, 700, 100, 900) / 1.04;
    expect(v * v / (2 * g)).toBeCloseTo(800); // rises 700 px of screen + the whale's height
  });

  test("the whale's circle against a piece's box", () => {
    const box = { left: 100, top: 100, right: 200, bottom: 150 };
    expect(circleHitsBox(150, 125, 5, box)).toBe(true); // inside
    expect(circleHitsBox(90, 125, 12, box)).toBe(true); // touching the left side
    expect(circleHitsBox(90, 125, 8, box)).toBe(false);
    expect(circleHitsBox(95, 95, 7.2, box)).toBe(true); // corner: distance 7.07
    expect(circleHitsBox(95, 95, 7, box)).toBe(false);
  });

  test("only the studio name scores", () => {
    expect(pointsFor({ target: true })).toBe(TARGET_POINTS);
    expect(TARGET_POINTS).toBe(100);
    expect(pointsFor({})).toBe(0);
    expect(pointsFor(undefined)).toBe(0);
  });

  test("steep firm shots become rockets, firm flat ones bank", () => {
    expect(isRocket(0, -1, 0.8)).toBe(true);
    expect(isRocket(0, -1, 0.3)).toBe(false); // too soft
    expect(isRocket(-0.71, -0.71, 1)).toBe(false); // 45 degrees: aimed, not a rocket
    expect(isBank(-0.71, -0.71, 1)).toBe(true);
    expect(isBank(-1, 0.5, 1)).toBe(false); // aimed down
  });

  test("sling beside the copy when wide, under it when narrow, with a phone floor", () => {
    const wide = layout(1440, 720, 64, 400, 860);
    expect(wide.side).toBe(true);
    expect(wide.S).toBe(112);
    expect(wide.ground).toBe(656);
    expect(wide.R.x).toBeCloseTo(1123.2); // 78 % of the width, clear of the dock
    expect(wide.maxPull).toBe(170);
    expect(layout(1440, 720, 64, 400, 600).R.x).toBeCloseTo(600 + 112 * 2.4); // beside a narrower copy
    expect(layout(1024, 654, 64, 340, 560).R.x).toBe(724); // the dock's corner stays clear
    const phone = layout(390, 780, 140, 330, 300);
    expect(phone.side).toBe(false);
    expect(phone.R.x).toBeCloseTo(117);
    expect(phone.ground).toBe(640);
    expect(phone.R.y + phone.S * 1.35).toBeCloseTo(640); // the stem stands on the ground
    const tight = layout(390, 640, 140, 420, 300); // little room under the copy: smaller sling
    expect(tight.S).toBeLessThan(phone.S);
  });

  test("arrow keys pull a tenth of the band; Enter alone shoots up and to the right", () => {
    let p = keyPull({ x: 0, y: 0 }, "ArrowDown", 170)!;
    p = keyPull(p, "ArrowLeft", 170)!;
    expect(p).toEqual({ x: -17, y: 17 });
    const shot = launch(p, 170, 1000)!;
    expect(shot.vx).toBeGreaterThan(0);
    expect(shot.vy).toBeLessThan(0);
    expect(keyPull(p, "Enter", 170)).toBeNull();
    for (let i = 0; i < 20; i++) p = keyPull(p, "ArrowDown", 170)!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(170);
    const q = launch(quickPull(170, 0.5, 0.5), 170, 1000)!;
    expect(q.ux).toBeGreaterThan(0);
    expect(q.uy).toBeLessThan(0);
    expect(q.power).toBeGreaterThanOrEqual(0.85);
  });

  test("the rocket's camera starts slowly and never scrolls above the top", () => {
    let [cam, v] = [3000, 0];
    [cam, v] = camera(cam, v, 3200, -900, 0, 0.8, 900, 1 / 60);
    expect(Math.abs(v)).toBeLessThan(1); // smoothstep start: no jump
    for (let i = 0; i < 600; i++) [cam, v] = camera(cam, v, 20, -900, 2 + i / 60, 0.8, 900, 1 / 60);
    expect(cam).toBeGreaterThanOrEqual(0);
    expect(cam).toBeLessThan(5);
  });
});
