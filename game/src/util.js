// Small geometry helpers the simulation and the renderer both use. Nothing
// here knows about the game; it is just points, angles and clamping.
export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Turn `angle` toward `target` by at most `maxTurn` radians, taking the short
// way around the circle.
export function steerToward(angle, target, maxTurn) {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + Math.max(-maxTurn, Math.min(maxTurn, d));
}

// Wrap an angle into (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
