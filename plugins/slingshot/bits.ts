// Confetti, rings and stars drawn on a canvas (T§5.5b): the sticker theme of the finale.
export interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // size (rings and stars: radius)
  life: number;
  decay: number;
  rot: number;
  spin: number;
  color: string;
  shape: "pill" | "dot" | "square" | "ring" | "star";
  grav: number; // share of gravity
  grow: number; // radius growth per second (rings, stars)
}

export function createBits(palette: () => string[]) {
  const list: Bit[] = [];
  let n = 0;
  const shapes = ["pill", "dot", "square"] as const;

  return {
    get count() {
      return list.length;
    },
    clear() {
      list.length = 0;
    },
    // A burst away from (ux, uy): the shot's recoil, a landing, a pop.
    burst(x: number, y: number, count: number, ux: number, uy: number, k = 1, spread = 2.4) {
      const colors = palette();
      for (let i = 0; i < count; i++) {
        const a = Math.atan2(-uy, -ux) + (Math.random() - 0.5) * spread;
        const s = (60 + Math.random() * 260) * k;
        list.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 60,
          r: 5 + Math.random() * 7,
          life: 1,
          decay: 0.7 + Math.random() * 0.5,
          rot: Math.random() * 6,
          spin: (Math.random() - 0.5) * 10,
          color: colors[n % colors.length],
          shape: shapes[n++ % 3],
          grav: 0.6,
          grow: 0,
        });
      }
    },
    ring(x: number, y: number, r: number, decay: number, color: string, grow: number) {
      list.push({ x, y, vx: 0, vy: 0, r, life: 1, decay, rot: 0, spin: 0, color, shape: "ring", grav: 0, grow });
    },
    star(x: number, y: number, r: number, decay: number, color: string) {
      list.push({ x, y, vx: 0, vy: 0, r, life: 1, decay, rot: 0, spin: 1.5, color, shape: "star", grav: 0, grow: r * 0.5 });
    },
    step(dt: number, g: number) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.life -= b.decay * dt;
        if (b.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        b.vy += b.grav * g * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.spin * dt;
        b.r += b.grow * dt * (b.shape === "ring" ? b.life : 1);
      }
    },
    draw(c: CanvasRenderingContext2D, dy = 0) {
      for (const b of list) {
        c.save();
        c.globalAlpha = Math.max(0, Math.min(1, b.life));
        c.translate(b.x, b.y - dy);
        c.rotate(b.rot);
        if (b.shape === "ring") {
          c.beginPath();
          c.arc(0, 0, b.r, 0, Math.PI * 2);
          c.lineWidth = Math.max(1, b.r * 0.18 * b.life);
          c.strokeStyle = b.color;
          c.stroke();
        } else {
          c.beginPath();
          if (b.shape === "star") {
            for (let i = 0; i < 24; i++) {
              const rr = i % 2 ? b.r * 0.62 : b.r;
              const a = (i / 24) * Math.PI * 2;
              c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            c.closePath();
          } else if (b.shape === "dot") c.arc(0, 0, b.r * 0.6, 0, Math.PI * 2);
          else if (b.shape === "pill") c.roundRect(-b.r, -b.r * 0.4, b.r * 2, b.r * 0.8, b.r * 0.4);
          else c.rect(-b.r * 0.6, -b.r * 0.6, b.r * 1.2, b.r * 1.2);
          c.fillStyle = b.color;
          c.lineWidth = b.shape === "star" ? 4 : 2.5;
          c.strokeStyle = "#fff";
          c.stroke();
          c.fill();
        }
        c.restore();
      }
    },
  };
}
export type Bits = ReturnType<typeof createBits>;
