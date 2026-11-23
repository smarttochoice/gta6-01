// Staged screenshots behind ?shot=start|chase|mission|wanted. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { FIRST_ROAD, GRID, PITCH, STEP } from './config.js';
import { roadCenter } from './city.js';

// The next road waypoint on a Manhattan route to (tx, ty): along the current
// street to the target's avenue, then up the avenue — the same route the
// police chase on, so the autopilot drives roads, never through buildings.
function roadWaypoint(fx, fy, tx, ty) {
  const index = (v) => Math.max(0, Math.min(GRID - 1, Math.round((v - FIRST_ROAD) / PITCH)));
  const itx = index(tx);
  const ity = index(ty);
  const icx = index(fx);
  const icy = index(fy);
  if (icx !== itx) return { x: roadCenter(itx), y: roadCenter(icy) };
  return { x: roadCenter(itx), y: roadCenter(ity) };
}

function driveInput(state, tx, ty) {
  const car = state.cars.find((c) => c.id === state.player.carId);
  if (!car) return { up: false, down: false, left: false, right: false };
  const wp = roadWaypoint(car.x, car.y, tx, ty);
  let d = Math.atan2(wp.y - car.y, wp.x - car.x) - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return {
    up: true, down: false,
    left: d < -0.08, right: d > 0.08,
    handbrake: Math.abs(d) > 1.1 && Math.abs(car.speed) > 260,
    run: false, enter: false, shoot: false, aiming: false,
  };
}

function walkInput(state, tx, ty) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 24) return { up: false, down: false, left: false, right: false, enter: true };
  return {
    up: dy < -14, down: dy > 14, left: dx < -14, right: dx > 14,
    run: d > 200, enter: d < 70, shoot: false, aiming: false,
  };
}

function nearestParkedCar(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const c of state.cars) {
    if (c.kind !== 'parked' && c.kind !== 'sports') continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// Step the world with the autopilot for `seconds`, then return the screen to draw.
export function stageShot(name, world) {
  const state = world.state;
  const stepN = (seconds, inputFn) => {
    for (let i = 0; i < seconds / STEP; i += 1) {
      if (state.over) break;
      world.step(STEP, inputFn(state));
    }
  };
  // Get the player into a car: walk to the nearest parked car and take it.
  const getInCar = () => {
    for (let i = 0; i < 12 / STEP; i += 1) {
      if (!state.player.onFoot) break;
      const car = nearestParkedCar(state);
      if (!car) break;
      world.step(STEP, walkInput(state, car.x, car.y));
    }
  };

  if (name === 'chase') {
    world.reset();
    getInCar();
    world.debug().setStars(3);
    const docks = state.city.landmarks.docks;
    // Cops start behind the player, in pursuit down the same road.
    const behind = Math.atan2(state.player.y - docks.y, state.player.x - docks.x);
    world.spawnPolice(2, 320, 480, behind, 0.7);
    stepN(3.5, (s) => driveInput(s, docks.x, docks.y));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // Job 4, the pier shootout: on foot, rivals closing in, HUD objective live.
    // The autopilot aims with a jitter and a short run, so the frame catches the
    // shootout mid-fight instead of after the last rival drops.
    for (const seconds of [2.0, 1.5, 1.0]) {
      world.reset();
      world.startMission(3);
      const pier = state.city.landmarks.pier;
      world.debug().teleport(pier.x - 260, pier.y - 60);
      stepN(seconds, (s) => {
        let target = null;
        let bestD = Infinity;
        for (const ped of s.peds) {
          if (ped.kind !== 'rival') continue;
          const d = Math.hypot(ped.x - s.player.x, ped.y - s.player.y);
          if (d < bestD) { bestD = d; target = ped; }
        }
        if (!target) return { up: false, down: false, left: false, right: false };
        // Strafe sideways at range while firing, with a shaky aim.
        const a = Math.atan2(target.y - s.player.y, target.x - s.player.x);
        const strafe = a + Math.PI / 2;
        const jx = Math.sin(s.time * 7) * 46;
        const jy = Math.cos(s.time * 5) * 46;
        return {
          up: Math.sin(strafe) < -0.3, down: Math.sin(strafe) > 0.3,
          left: Math.cos(strafe) < -0.3, right: Math.cos(strafe) > 0.3,
          shoot: true, aiming: true, aimX: target.x + jx, aimY: target.y + jy,
        };
      });
      if (!state.over) return { screen: SCREEN_PLAY };
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'wanted') {
    world.reset();
    getInCar();
    world.debug().setStars(4);
    const safe = state.city.landmarks.safehouse;
    const behind = Math.atan2(state.player.y - safe.y, state.player.x - safe.x);
    world.spawnPolice(4, 320, 480, behind, 0.9);
    stepN(3, (s) => driveInput(s, safe.x, safe.y));
    return { screen: SCREEN_PLAY };
  }
  // Default: the title screen over a living city.
  world.reset();
  stepN(5, () => ({ up: false, down: false, left: false, right: false }));
  return { screen: SCREEN_TITLE };
}
