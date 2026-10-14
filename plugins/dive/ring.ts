// The ring text round «Ныряй наугад», drawn once onto a canvas (CSS turns the canvas, so
// nothing repaints per frame). 200-unit box, radius 80, text from 9 o'clock clockwise over the
// top, letters spaced to fill the circle (T§2.9).
export function drawRing(canvas: HTMLCanvasElement, text: string, cssSize: number, fontUnits: number, colour: string, family: string) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const px = Math.max(1, Math.round(cssSize * dpr));
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(px / 200, 0, 0, px / 200, 0, 0);
  ctx.clearRect(0, 0, 200, 200);
  ctx.fillStyle = colour;
  ctx.textBaseline = "alphabetic";
  const r = 80;
  const circle = 2 * Math.PI * r;
  const chars = Array.from(text);
  let size = fontUnits;
  let widths: number[] = [];
  // Shrink the type if the text would not fit round the circle.
  for (let i = 0; i < 8; i++) {
    ctx.font = `500 ${size}px ${family}`;
    widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= circle * 0.92) break;
    size *= 0.92;
  }
  const gap = (circle - widths.reduce((a, b) => a + b, 0)) / chars.length;
  let along = 0;
  chars.forEach((ch, i) => {
    const angle = Math.PI + (along + widths[i] / 2) / r;
    ctx.save();
    ctx.translate(100 + r * Math.cos(angle), 100 + r * Math.sin(angle));
    ctx.rotate(angle + Math.PI / 2);
    if (ch === "•") {
      // Separators are drawn, not typed (DESIGN.md).
      ctx.beginPath();
      ctx.arc(0, -size * 0.32, size * 0.15, 0, 2 * Math.PI);
      ctx.fill();
    } else ctx.fillText(ch, -widths[i] / 2, 0);
    ctx.restore();
    along += widths[i] + gap;
  });
}
