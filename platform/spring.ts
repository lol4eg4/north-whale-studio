// The site's spring: mass-spring-damper k=200, c=16 (11 % overshoot), integrated with 1 ms
// steps and sampled 60 times over 0.95 s into a CSS linear() easing.
export function springSamples(k = 200, c = 16, n = 60, duration = 0.95): number[] {
  let x = 0;
  let v = 0;
  let t = 0;
  const dt = 1 / 1000;
  const points: number[] = [];
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * duration;
    while (t < target) {
      v += (-k * (x - 1) - c * v) * dt;
      x += v * dt;
      t += dt;
    }
    points.push(+x.toFixed(4));
  }
  points[n] = 1;
  return points;
}

export function springEasing(supportsLinear: boolean): { easing: string; duration: number } {
  return supportsLinear
    ? { easing: `linear(${springSamples().join(",")})`, duration: 950 }
    : { easing: "cubic-bezier(.34,1.56,.64,1)", duration: 750 };
}
