// Slingshot physics: pure numbers, no DOM, so the finale and its tests share them.
// Units are px and seconds. The sling lives in section coordinates; a flight runs in viewport
// coordinates (the rocket in page coordinates while the page follows it).
//
//   tip L      tip R          S = sling scale unit, R = pocket at rest
//      \  R   /               pull = pocket - R, clamped to maxPull
//       \ |  /                launch = opposite the pull, speed vmax*SPEED*power^.9
//        joint
//          |
//   ======base====== ground   (floor px of mint below)

export interface Vec {
  x: number;
  y: number;
}
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Body extends Vec {
  vx: number;
  vy: number;
}

export interface Geometry {
  W: number;
  H: number;
  side: boolean; // sling beside the copy (wide) or under it
  S: number;
  R: Vec; // pocket rest point
  ground: number; // y of the ground's top edge
  maxPull: number;
  whaleW: number;
  whaleH: number;
  rad: number; // the whale's collision circle
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const smoothstep = (k: number) => {
  const t = clamp(k, 0, 1);
  return t * t * (3 - 2 * t);
};

export const REST_TILT = -0.35; // the whale sits nose-up in the sling
const WHALE_ASPECT = 260 / 180; // site/whale.svg viewBox

// Sling size and place for a section of W x H with `floor` px of ground; the copy block ends at
// copyBottom (and copyRight on wide screens), measured without any drag offset.
export function layout(W: number, H: number, floor: number, copyBottom: number, copyRight: number): Geometry {
  const side = W >= 900;
  let S = clamp(Math.min(W * 0.22, H * 0.17), 56, 112);
  if (!side) S = Math.min(S, Math.max(44, (H - floor - copyBottom - 16) / 2.55));
  const ground = H - floor;
  // Wide: right of the copy, clear of the dock in the bottom-right corner.
  const x = side ? clamp(copyRight + S * 2.4, W * 0.6, Math.min(W * 0.78, W - 300)) : W * 0.3;
  const whaleW = S * 1.34;
  return {
    W,
    H,
    side,
    S,
    R: { x, y: ground - S * 1.35 },
    ground,
    maxPull: clamp(Math.min(W, H) * 0.24, 80, 170),
    whaleW,
    whaleH: whaleW / WHALE_ASPECT,
    rad: S * 0.38,
  };
}

export const gravity = (viewportH: number) => viewportH * 1.15;

// The speed that would just carry the whale from the pocket over the top of the screen.
export const maxSpeed = (g: number, pocketScreenY: number, whaleH: number, viewportH: number) =>
  Math.sqrt(2 * g * Math.max(pocketScreenY + whaleH, viewportH * 0.6)) * 1.04;

// Full pull = 1.5 x vmax (the reference has 1.2): the studio name sits in the sticky top bar,
// and a 45-degree shot from the sling has to reach it.
export const SPEED = 1.5;

export function clampPull(dx: number, dy: number, maxPull: number): Vec {
  const len = Math.hypot(dx, dy);
  if (len <= maxPull) return { x: dx, y: dy };
  return { x: (dx / len) * maxPull, y: (dy / len) * maxPull };
}

export interface Shot {
  vx: number;
  vy: number;
  ux: number;
  uy: number;
  power: number; // 0..1
  speed: number;
}

// A pull under 16 px is not a shot: the whale goes back to rest.
export function launch(pull: Vec, maxPull: number, vmax: number): Shot | null {
  const len = Math.hypot(pull.x, pull.y);
  if (len < 16) return null;
  const power = Math.min(1, len / maxPull);
  const ux = -pull.x / len;
  const uy = -pull.y / len;
  const speed = vmax * SPEED * power ** 0.9;
  return { vx: ux * speed, vy: uy * speed, ux, uy, power, speed };
}

// A firm shot within 30 degrees of straight up flies up the page (the page follows); a firm
// shot not aimed up banks off the side of the screen and then flies up.
export const isRocket = (ux: number, uy: number, power: number) => uy < 0 && Math.abs(ux) < 0.5 && power > 0.35;
export const isBank = (ux: number, uy: number, power: number) => !isRocket(ux, uy, power) && power > 0.5 && uy < 0.35;

// One step of free flight (semi-implicit Euler, no air drag).
export function fall(b: Body, g: number, dt: number) {
  b.vy += g * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

// Damped spring toward a target: returns the new position and velocity.
export function spring(p: number, v: number, target: number, k: number, c: number, dt: number): [number, number] {
  const nv = v + (-k * (p - target) - c * v) * dt;
  return [p + nv * dt, nv];
}

// Circle against a box: nearest point of the box to the centre.
export function circleHitsBox(cx: number, cy: number, r: number, b: Box): boolean {
  const nx = clamp(cx, b.left, b.right);
  const ny = clamp(cy, b.top, b.bottom);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

export const TARGET_POINTS = 100;
export const pointsFor = (info: { target?: boolean } | undefined) => (info?.target ? TARGET_POINTS : 0);

// Arrow keys pull the whale back a tenth of the band at a time; the shot goes the other way.
const KEY_DIR: Record<string, Vec> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
export function keyPull(pull: Vec, key: string, maxPull: number): Vec | null {
  const d = KEY_DIR[key];
  if (!d) return null;
  return clampPull(pull.x + d.x * maxPull * 0.1, pull.y + d.y * maxPull * 0.1, maxPull);
}

// Enter without aiming: a quick shot up and to the right, 47-68 degrees above the horizon.
export function quickPull(maxPull: number, r1: number, r2: number): Vec {
  const a = -Math.PI * (0.26 + r1 * 0.12);
  const p = (0.85 + r2 * 0.15) * maxPull;
  return { x: -Math.cos(a) * p, y: -Math.sin(a) * p };
}

// The rocket's camera (T§5.7): page scroll that keeps the whale at 45 % of the screen, with a
// soft stop near the top and a slow start. Returns the new scroll position and its speed.
export function camera(cam: number, camV: number, whaleY: number, whaleVy: number, t: number, ramp: number, vh: number, dt: number): [number, number] {
  const D = 0.6 * vh;
  const want = whaleY - vh * 0.45;
  const tgt = want >= D ? want : D * Math.exp(want / D - 1);
  const f = smoothstep(t / ramp);
  const v = camV + (Math.max(f * (whaleVy + (tgt - cam) * 2), -cam * 3) - camV) * Math.min(1, dt * 6);
  return [Math.max(0, cam + v * dt), v];
}
