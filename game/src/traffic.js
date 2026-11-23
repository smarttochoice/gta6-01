// Traffic and pedestrians: cars that cruise the road grid and stop for the
// car ahead, parked cars to steal, civilians who stroll the sidewalks and run
// from danger, and the rival gang that hunts the player on the pier.
import { CITY, CROWD, VEHICLE } from './config.js';
import { clampInside, crossroads, pushOutOfBuildings, roadAt, roadIndex } from './city.js';
import { angleTo, clamp, dist, steerToward } from './util.js';
import { burst, fireShot } from './combat.js';

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8c33d', '#7dd93d', '#d9d9d9', '#8a5fd9', '#e07b39', '#39c2d9'];
const PED_COLORS = ['#e8e0d0', '#d95f8a', '#5fa8d9', '#e0a05f', '#8a7fd9', '#6fbf6a'];

// A random point on a road, for spawning and for wandering targets.
export function randomRoadPoint(random) {
  const along = random.int(0, CITY.grid - 1);
  const across = random.int(0, CITY.grid - 1);
  if (random.chance(0.5)) {
    return { x: roadAt(along), y: roadAt(across) + random.range(-140, 140) };
  }
  return { x: roadAt(across) + random.range(-140, 140), y: roadAt(along) };
}

function nextCarId(state) {
  state.nextId += 1;
  return state.nextId;
}

export function spawnTraffic(state) {
  const { random } = state;
  for (let i = 0; i < CROWD.trafficCars; i += 1) {
    const p = randomRoadPoint(random);
    state.cars.push({
      id: nextCarId(state), kind: 'traffic', x: p.x, y: p.y,
      angle: random.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      speed: 0, color: random.pick(CAR_COLORS), health: VEHICLE.health,
      driver: true, route: null, routeIndex: 0, cruise: random.range(130, 185),
    });
  }
}

export function spawnParked(state) {
  const { random } = state;
  for (let i = 0; i < CROWD.parkedCars; i += 1) {
    const p = randomRoadPoint(random);
    const vertical = random.chance(0.5);
    state.cars.push({
      id: nextCarId(state), kind: 'parked',
      x: p.x + (vertical ? 30 : 0), y: p.y + (vertical ? 0 : 30),
      angle: vertical ? Math.PI / 2 : 0, speed: 0,
      color: random.pick(CAR_COLORS), health: VEHICLE.health, driver: false,
    });
  }
  // The yellow Comet GT for Job 2, parked uptown where the mission expects it.
  const sc = state.city.spots.sportsCar;
  state.cars.push({
    id: nextCarId(state), kind: 'sports', x: sc.x, y: sc.y, angle: Math.PI / 2, speed: 0,
    color: '#ffd21f', health: VEHICLE.health, driver: false, special: true,
  });
}

export function spawnWalkers(state) {
  const { random } = state;
  for (let i = 0; i < CROWD.pedestrians; i += 1) {
    const p = randomRoadPoint(random);
    state.peds.push({
      id: nextCarId(state), kind: 'civilian',
      x: p.x + random.range(-60, 60), y: p.y + random.range(-60, 60),
      angle: random.range(0, Math.PI * 2), speed: 0, health: 100,
      walkSpeed: random.range(55, 95), target: randomRoadPoint(random), state: 'walk',
      stateTimer: 0, fireTimer: random.range(0.5, 1.5),
      color: PED_COLORS[i % PED_COLORS.length],
    });
  }
}

// Drop any rivals still standing, so restarting the pier job never fields
// two gangs at once.
export function clearRivals(state) {
  state.peds = state.peds.filter((ped) => ped.kind !== 'rival');
}

export function spawnRivals(state, count, at) {
  const { random } = state;
  for (let i = 0; i < count; i += 1) {
    state.peds.push({
      id: nextCarId(state), kind: 'rival',
      x: at.x + random.range(-160, 160), y: at.y + random.range(-120, 120),
      angle: 0, speed: 0, health: 100, walkSpeed: 90, target: null, state: 'hunt',
      stateTimer: 0, fireTimer: random.range(0.4, 1.2), color: '#c22f2f',
    });
  }
}

// A route is a short chain of intersections; the car follows road centrelines.
function buildRoute(state, car) {
  const { random } = state;
  const route = [];
  let ix = roadIndex(car.x);
  let iy = roadIndex(car.y);
  let vertical = Math.abs(car.x - roadAt(ix)) < Math.abs(car.y - roadAt(iy));
  for (let i = 0; i < 5; i += 1) {
    if (vertical) iy += random.chance(0.5) ? 1 : -1;
    else ix += random.chance(0.5) ? 1 : -1;
    ix = clamp(ix, 0, CITY.grid - 1);
    iy = clamp(iy, 0, CITY.grid - 1);
    route.push(crossroads(ix, iy));
    vertical = !vertical;
  }
  return route;
}

export function updateTraffic(state, dt, api) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    if (!car.route || car.routeIndex >= car.route.length) {
      car.route = buildRoute(state, car);
      car.routeIndex = 0;
    }
    const target = car.route[car.routeIndex];
    if (!target) continue;
    if (dist(car.x, car.y, target.x, target.y) < 26) {
      car.routeIndex += 1;
      continue;
    }
    const want = angleTo(car.x, car.y, target.x, target.y);
    car.angle = steerToward(car.angle, want, 2.4 * dt);
    // Slow down for the car ahead, and for the player crossing at speed.
    let cruise = car.cruise;
    for (const other of state.cars) {
      if (other === car || other.speed === 0) continue;
      const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
      const side = Math.abs((other.x - car.x) * Math.sin(car.angle) - (other.y - car.y) * Math.cos(car.angle));
      if (ahead > 0 && ahead < 90 && side < 34) { cruise = 0; break; }
    }
    if (dist(car.x, car.y, p.x, p.y) < 70 && p.speed > 200) cruise = Math.min(cruise, 60);
    car.speed += (cruise - car.speed) * Math.min(1, 1.6 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    pushOutOfBuildings(state.city, car, 24);
    clampInside(car, 24);
  }
  // Car-to-car bumps: traffic, police and the player's car all push apart.
  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      const a = state.cars[i];
      const b = state.cars[j];
      if (a.kind === 'wreck' || b.kind === 'wreck') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= 46) continue;
      // Parked, wrecked and special cars never move: a bump shoves the other
      // car the whole way instead of dragging a parked car off the road.
      const aFixed = a.kind === 'parked' || a.kind === 'sports' || a.kind === 'wreck';
      const bFixed = b.kind === 'parked' || b.kind === 'sports' || b.kind === 'wreck';
      const push = 46 - d;
      const nx = dx / d;
      const ny = dy / d;
      if (!aFixed && !bFixed) {
        a.x -= nx * push / 2;
        a.y -= ny * push / 2;
        b.x += nx * push / 2;
        b.y += ny * push / 2;
      } else if (aFixed && !bFixed) {
        b.x += nx * push;
        b.y += ny * push;
      } else if (!aFixed && bFixed) {
        a.x -= nx * push;
        a.y -= ny * push;
      }
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 120) {
        burst(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd76a', 160);
        state.events.push('crash');
        a.health -= 4;
        b.health -= 4;
        const playerInvolved = a.kind === 'player' || a.kind === 'sports' || b.kind === 'player' || b.kind === 'sports';
        if (playerInvolved && impact > 260) api.heat(3);
        const tmp = a.speed;
        a.speed = b.speed * 0.4;
        b.speed = tmp * 0.4;
      }
    }
  }
  // Parked, wrecked and special cars never move on their own, so a bump must
  // never shove one into a building where it can never be reached again.
  for (const car of state.cars) {
    if (car.kind === 'parked' || car.kind === 'sports' || car.kind === 'wreck') {
      pushOutOfBuildings(state.city, car, 24);
      clampInside(car, 24);
    }
  }
}

function removePed(state, ped) {
  const i = state.peds.indexOf(ped);
  if (i >= 0) state.peds.splice(i, 1);
}

export function updateWalkers(state, dt, api) {
  const p = state.player;
  const car = p.carId ? state.cars.find((c) => c.id === p.carId) ?? null : null;
  for (const ped of [...state.peds]) {
    ped.stateTimer -= dt;
    ped.fireTimer -= dt;
    const threat = dist(ped.x, ped.y, p.x, p.y);
    if (ped.kind === 'rival') {
      // Hunt the player: close in and shoot from range.
      if (threat < 420) {
        ped.angle = angleTo(ped.x, ped.y, p.x, p.y);
        if (threat > 130) {
          ped.x += Math.cos(ped.angle) * ped.walkSpeed * 1.6 * dt;
          ped.y += Math.sin(ped.angle) * ped.walkSpeed * 1.6 * dt;
        } else if (ped.fireTimer <= 0) {
          ped.fireTimer = state.random.range(1.0, 1.6);
          fireShot(state, 'rival', ped.x + Math.cos(ped.angle) * 16, ped.y + Math.sin(ped.angle) * 16,
            ped.angle + state.random.range(-0.12, 0.12));
        }
      } else if (ped.target) {
        ped.angle = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
        ped.x += Math.cos(ped.angle) * ped.walkSpeed * dt;
        ped.y += Math.sin(ped.angle) * ped.walkSpeed * dt;
        if (dist(ped.x, ped.y, ped.target.x, ped.target.y) < 30) ped.target = null;
      }
      pushOutOfBuildings(state.city, ped, 12);
      clampInside(ped, 12);
      continue;
    }
    if (ped.state === 'down') {
      if (ped.stateTimer <= 0) {
        ped.state = 'flee';
        ped.stateTimer = 3;
      }
      continue;
    }
    if (ped.state === 'flee') {
      const away = angleTo(p.x, p.y, ped.x, ped.y);
      ped.angle = away;
      ped.x += Math.cos(away) * ped.walkSpeed * 2.1 * dt;
      ped.y += Math.sin(away) * ped.walkSpeed * 2.1 * dt;
      if (ped.stateTimer <= 0) { ped.state = 'walk'; ped.target = randomRoadPoint(state.random); }
    } else {
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
        ped.target = randomRoadPoint(state.random);
      }
      ped.angle = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.x += Math.cos(ped.angle) * ped.walkSpeed * dt;
      ped.y += Math.sin(ped.angle) * ped.walkSpeed * dt;
      // A speeding car or a gunshot nearby sends civilians running.
      if (threat < 130 && p.speed > 240) { ped.state = 'flee'; ped.stateTimer = 3; }
      else if (car && dist(ped.x, ped.y, car.x, car.y) < 90 && Math.abs(car.speed) > 300) {
        ped.state = 'flee'; ped.stateTimer = 3;
      }
    }
    pushOutOfBuildings(state.city, ped, 12);
    clampInside(ped, 12);
    // Run over by a car: down they go, and the law notices.
    for (const c of state.cars) {
      if (c.kind === 'wreck' || Math.abs(c.speed) < 60) continue;
      if (dist(ped.x, ped.y, c.x, c.y) < 34 && ped.state !== 'down') {
        ped.state = 'down';
        ped.stateTimer = 4;
        ped.health -= 60;
        burst(state, ped.x, ped.y, 8, '#d94f3d', 120);
        if (c.kind === 'player' || c.kind === 'sports') {
          api.heat(25);
          if (ped.health <= 0) { api.heat(20); state.stats.kills += 1; }
        }
        if (ped.health <= 0) removePed(state, ped);
        break;
      }
    }
  }
}
