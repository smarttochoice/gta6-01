// The wanted system and the police: crimes build heat across five stars,
// police cars spawn, chase and ram, and heat bleeds off once the player is out
// of sight. Caught on foot, slow and close, the player is BUSTED.
import { CITY, HEAT, VEHICLE } from './config.js';
import { clampInside, manhattanWaypoint, pushOutOfBuildings } from './city.js';
import { angleTo, clamp, dist, steerToward } from './util.js';
import { burst, hurtPlayer } from './combat.js';

// Heat needed for each star level, from the HEAT table.
export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 1; i <= 5; i += 1) if (heat >= HEAT.thresholds[i]) stars = i;
  return stars;
}

// Add heat for a crime, refresh the star count, and note the time so the
// decay clock knows the crime is fresh.
export function addHeat(state, amount) {
  const p = state.player;
  p.wantedHeat = Math.min(HEAT.cap, p.wantedHeat + amount);
  state.lastCrime = state.time;
  refreshStars(state);
}

export function refreshStars(state) {
  const p = state.player;
  const stars = starsForHeat(p.wantedHeat);
  if (stars > p.stars) state.events.push('siren');
  p.stars = stars;
}

// Spawn police on a road a little away from the player, never on top of them.
// angleCenter/spread pin the spawn direction: the shot stager puts the chase
// behind the player, so the frame catches a pursuit, not a pile-up.
export function spawnPolice(state, n, dMin = 420, dMax = 700, angleCenter = null, spread = Math.PI * 2) {
  const p = state.player;
  for (let i = 0; i < n; i += 1) {
    const a = angleCenter === null
      ? state.random.range(0, Math.PI * 2)
      : angleCenter + state.random.range(-spread, spread);
    const d = state.random.range(dMin, dMax);
    const x = clamp(p.x + Math.cos(a) * d, 60, CITY.size - 60);
    const y = clamp(p.y + Math.sin(a) * d, 60, CITY.size - 180);
    state.cars.push({
      id: state.nextId += 1, kind: 'police', x, y,
      angle: angleTo(x, y, p.x, p.y), speed: 200,
      color: '#22242e', health: VEHICLE.health, driver: true,
      cruise: HEAT.copSpeed, siren: state.random.range(0, 1),
    });
  }
  if (n > 0) state.events.push('siren');
}

export function updatePolice(state, dt, api) {
  const p = state.player;
  const want = HEAT.maxCops[p.stars] ?? 0;
  const cops = state.cars.filter((c) => c.kind === 'police');
  if (cops.length < want && p.stars > 0 && state.random.next() < dt * 2.0) spawnPolice(state, 1);
  if (p.stars === 0) {
    // No heat, no chase: cops give up and drive off once they are far away.
    for (const cop of [...cops]) {
      if (dist(cop.x, cop.y, p.x, p.y) > 900) {
        state.cars.splice(state.cars.indexOf(cop), 1);
      }
    }
  }
  for (const cop of state.cars.filter((c) => c.kind === 'police')) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    // Far away, chase along the roads; up close, cut straight at the player.
    const wp = d > 220 ? manhattanWaypoint(cop.x, cop.y, p.x, p.y) : p;
    const wantAngle = angleTo(cop.x, cop.y, wp.x, wp.y);
    cop.angle = steerToward(cop.angle, wantAngle, 3.0 * dt);
    const cruise = p.stars > 0 ? HEAT.copSpeed : 120;
    cop.speed += (cruise - cop.speed) * Math.min(1, 1.4 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    if (pushOutOfBuildings(state.city, cop, 26)) cop.speed *= 0.5;
    clampInside(cop, 26);
    // Ramming the player hurts.
    if (d < 52) {
      if (p.onFoot) {
        hurtPlayer(state, 26 * dt);
        if (state.random.next() < dt * 2) burst(state, p.x, p.y, 4, '#d94f3d', 120);
      } else {
        const car = api.playerCar();
        if (car) {
          car.health -= 5 * dt;
          car.speed *= Math.max(0, 1 - 1.2 * dt);
          if (state.random.next() < dt * 3) {
            burst(state, car.x, car.y, 5, '#ffd76a', 140);
            state.events.push('crash');
          }
        }
      }
    }
  }
  // Busted is judged once a step, not once a cop: with two cops on the
  // scene, one far cop must not cancel the near cop's arrest.
  const nearestCop = state.cars
    .filter((c) => c.kind === 'police')
    .reduce((best, c) => Math.min(best, dist(c.x, c.y, p.x, p.y)), Infinity);
  if (p.onFoot && nearestCop < HEAT.bustRange && p.speed < 60) {
    state.bustTimer += dt;
    if (state.bustTimer > HEAT.bustTime) {
      state.busted = true;
      state.over = true;
      state.overKind = 'busted';
      state.events.push('busted');
    }
  } else {
    state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
  }
}

// Out of sight, out of mind: heat bleeds off once no cop is near and no
// fresh crime happened in the last few seconds.
export function updateHeatDecay(state, dt) {
  const p = state.player;
  if (p.stars === 0) return;
  const nearCop = state.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 520);
  if (!nearCop && state.time - state.lastCrime > 5) {
    p.wantedHeat = Math.max(0, p.wantedHeat - HEAT.decayPerSecond * dt);
    refreshStars(state);
  }
}
