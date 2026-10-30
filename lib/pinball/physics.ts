// Small 2D physics kit for the pinball table: a circle ball against capsules
// (segments with radius) and circles. Everything is in table units.
export type Vec = { x: number; y: number };
export const vec = (x: number, y: number): Vec => ({ x, y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const length = (a: Vec) => Math.hypot(a.x, a.y);
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });

export type Ball = { pos: Vec; vel: Vec; r: number };

/** approach is how fast the ball was moving into the surface (positive = real hit). */
export type Contact = { n: Vec; point: Vec; approach: number };

export const REST_THRESHOLD = 40;

/**
 * Rolling resistance for a ball touching a surface: bleeds tangential speed (relative to the
 * surface) at `rate` per second, so it is independent of the physics step size.
 */
export function applyFriction(ball: Ball, n: Vec, dt: number, rate = 1.2, surfaceVel?: Vec) {
  const tx = -n.y, ty = n.x;
  const vt = (ball.vel.x - (surfaceVel?.x ?? 0)) * tx + (ball.vel.y - (surfaceVel?.y ?? 0)) * ty;
  const k = Math.min(1, rate * dt);
  ball.vel.x -= vt * k * tx; ball.vel.y -= vt * k * ty;
}

export function clampSpeed(ball: Ball, max: number) {
  const s = Math.hypot(ball.vel.x, ball.vel.y);
  if (s > max) { const k = max / s; ball.vel.x *= k; ball.vel.y *= k; }
}

/**
 * Resolve the ball against a point obstacle of radius R (used by capsules and circles).
 * surfaceVel gives the obstacle's velocity at the contact point (moving flippers).
 * oneWay is the normal of the only solid face; the ball passes freely from the other side.
 */
function resolve(ball: Ball, qx: number, qy: number, R: number, e: number, surfaceVel?: (p: Vec) => Vec, oneWay?: Vec): Contact | null {
  let dx = ball.pos.x - qx, dy = ball.pos.y - qy;
  let d = Math.hypot(dx, dy);
  const minD = R + ball.r;
  if (d >= minD) return null;
  if (d < 1e-6) { dx = 0; dy = -1; d = 1; }
  const nx = dx / d, ny = dy / d;
  let svx = 0, svy = 0;
  if (surfaceVel) { const sv = surfaceVel({ x: qx, y: qy }); svx = sv.x; svy = sv.y; }
  const vn = (ball.vel.x - svx) * nx + (ball.vel.y - svy) * ny;
  if (oneWay && (nx * oneWay.x + ny * oneWay.y < 0 || vn >= 0)) return null;
  const pen = minD - d;
  ball.pos.x += nx * pen; ball.pos.y += ny * pen;
  if (vn < 0) {
    const bounce = -vn < REST_THRESHOLD ? 0 : e;
    const j = -(1 + bounce) * vn;
    ball.vel.x += j * nx; ball.vel.y += j * ny;
  }
  return { n: { x: nx, y: ny }, point: { x: qx, y: qy }, approach: -vn };
}

/** Capsule from a to b, radius ra at a tapering to rb at b. */
export function collideCapsule(ball: Ball, a: Vec, b: Vec, ra: number, rb: number, e: number, surfaceVel?: (p: Vec) => Vec, oneWay?: Vec): Contact | null {
  const abx = b.x - a.x, aby = b.y - a.y;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? ((ball.pos.x - a.x) * abx + (ball.pos.y - a.y) * aby) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const R = ra + (rb - ra) * t;
  // Cheap reject before the full resolve.
  const qx = a.x + abx * t, qy = a.y + aby * t;
  const reach = R + ball.r;
  if (Math.abs(ball.pos.x - qx) > reach || Math.abs(ball.pos.y - qy) > reach) return null;
  return resolve(ball, qx, qy, R, e, surfaceVel, oneWay);
}

export function collideCircle(ball: Ball, c: Vec, R: number, e: number): Contact | null {
  const reach = R + ball.r;
  if (Math.abs(ball.pos.x - c.x) > reach || Math.abs(ball.pos.y - c.y) > reach) return null;
  return resolve(ball, c.x, c.y, R, e);
}

export type FlipperBody = { pivot: Vec; length: number; angle: number; angularVel: number; baseR: number; tipR: number };

export function flipperTip(f: FlipperBody): Vec {
  return { x: f.pivot.x + Math.cos(f.angle) * f.length, y: f.pivot.y + Math.sin(f.angle) * f.length };
}

/** Velocity of a point on the flipper: angular velocity times the perpendicular lever arm. */
export function flipperSurfaceVelocity(f: FlipperBody) {
  return (p: Vec): Vec => ({ x: -(p.y - f.pivot.y) * f.angularVel, y: (p.x - f.pivot.x) * f.angularVel });
}

export function collideFlipper(ball: Ball, f: FlipperBody, e: number): Contact | null {
  return collideCapsule(ball, f.pivot, flipperTip(f), f.baseR, f.tipR, e, flipperSurfaceVelocity(f));
}

/** Move a flipper toward its target angle at a fixed angular speed and record the resulting angular velocity. */
export function stepFlipper(f: FlipperBody, target: number, speed: number, dt: number) {
  const diff = target - f.angle;
  const maxStep = speed * dt;
  const step = Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
  f.angle += step;
  f.angularVel = dt > 0 ? step / dt : 0;
}
