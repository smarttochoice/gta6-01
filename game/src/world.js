// SOLANO HEAT — the simulation: player on foot and by car, traffic, pedestrians,
// police and the wanted system, combat, pickups and the mission driver. The
// renderer only reads this state; the input module only writes `input`.
import { CAR, FIRST_ROAD, GRID, PEDESTRIANS, PITCH, PLAYER, STEP, TRAFFIC_CARS, WANTED, WORLD } from './config.js';
import { clampToCity, createCity, intersection, resolveBuildings, roadCenter } from './city.js';
import { createRandom } from './random.js';
import { MISSIONS } from './missions.js';

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8c33d', '#7dd93d', '#d9d9d9', '#8a5fd9', '#e07b39', '#39c2d9'];
const TRAFFIC_SPEED = 150;
let nextId = 1;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(angle, target, maxTurn) {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + Math.max(-maxTurn, Math.min(maxTurn, d));
}

// The next road waypoint on a Manhattan route from (fx, fy) to (tx, ty):
// drive along the current street to the target's avenue, then up the avenue.
export function roadWaypoint(fx, fy, tx, ty) {
  const index = (v) => Math.max(0, Math.min(GRID - 1, Math.round((v - FIRST_ROAD) / PITCH)));
  const itx = index(tx);
  const ity = index(ty);
  const icx = index(fx);
  const icy = index(fy);
  if (icx !== itx) return { x: roadCenter(itx), y: roadCenter(icy) };
  return { x: roadCenter(itx), y: roadCenter(ity) };
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const state = {
    seed, city, random,
    time: 0,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    events: [],
    missionIndex: 0,
    missionStep: 0,
    mission: null,
    missionState: {},
    missionFailed: false,
    busted: false,
    wasted: false,
    bustTimer: 0,
    lastCrime: -99,
    cashTimer: 0,
    over: false,
    overKind: null,
    stats: { earned: 0, stolen: 0, kills: 0 },
  };
  const world = { state, reset, step, enterCar, exitCar, addHeat, startMission, spawnPolice, debug };
  reset();
  return world;

  function reset() {
    state.time = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.events = [];
    state.missionIndex = 0;
    state.missionStep = 0;
    state.mission = null;
    state.missionState = {};
    state.missionFailed = false;
    state.busted = false;
    state.wasted = false;
    state.bustTimer = 0;
    state.lastCrime = -99;
    state.cashTimer = 0;
    state.over = false;
    state.overKind = null;
    state.stats = { earned: 0, stolen: 0, kills: 0 };
    const s = city.landmarks.spawn;
    state.player = {
      x: s.x, y: s.y, angle: -Math.PI / 2, health: PLAYER.health, armor: PLAYER.armor,
      onFoot: true, carId: null, speed: 0, cash: 0, wantedHeat: 0, stars: 0,
      fireTimer: 0, moving: false,
    };
    spawnTraffic();
    spawnParked();
    spawnPeds();
    spawnPickups();
    startMission(0);
  }

  // ---- spawning ------------------------------------------------------------
  function randomRoadPoint() {
    const along = random.int(0, 7);
    const across = random.int(0, 7);
    const vertical = random.next() < 0.5;
    return vertical
      ? { x: roadCenter(along), y: roadCenter(across) + random.range(-140, 140) }
      : { x: roadCenter(across) + random.range(-140, 140), y: roadCenter(along) };
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC_CARS; i += 1) {
      const p = randomRoadPoint();
      state.cars.push({
        id: nextId += 1, kind: 'traffic', x: p.x, y: p.y,
        angle: random.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
        speed: 0, color: random.pick(CAR_COLORS), health: CAR.health,
        driver: true, route: null, routeIndex: 0, cruise: random.range(130, 185),
      });
    }
  }

  function spawnParked() {
    // A few parked cars along roads, plus the yellow Comet GT for Job 2.
    for (let i = 0; i < 8; i += 1) {
      const p = randomRoadPoint();
      const vertical = random.next() < 0.5;
      state.cars.push({
        id: nextId += 1, kind: 'parked', x: p.x + (vertical ? 30 : 0), y: p.y + (vertical ? 0 : 30),
        angle: vertical ? Math.PI / 2 : 0, speed: 0,
        color: random.pick(CAR_COLORS), health: CAR.health, driver: false,
      });
    }
    const sc = city.landmarks.sportsCar;
    state.cars.push({
      id: nextId += 1, kind: 'sports', x: sc.x, y: sc.y, angle: Math.PI / 2, speed: 0,
      color: '#ffd21f', health: CAR.health, driver: false, special: true,
    });
  }

  function spawnPeds() {
    for (let i = 0; i < PEDESTRIANS; i += 1) {
    const p = randomRoadPoint();
      state.peds.push({
        id: nextId += 1, kind: 'civilian', x: p.x + random.range(-60, 60), y: p.y + random.range(-60, 60),
        angle: random.range(0, Math.PI * 2), speed: 0, health: 100,
        walkSpeed: random.range(55, 95), target: randomRoadPoint(), state: 'walk',
        stateTimer: 0, fireTimer: random.range(0.5, 1.5),
      });
    }
  }

  function spawnPickups() {
    for (let i = 0; i < 10; i += 1) {
      const p = randomRoadPoint();
      state.pickups.push({ x: p.x, y: p.y, kind: i < 7 ? 'cash' : i < 9 ? 'health' : 'repair', amount: i < 7 ? random.int(50, 150) : 40, bob: random.range(0, 6) });
    }
  }

  function spawnRivals(count, at) {
    for (let i = 0; i < count; i += 1) {
      state.peds.push({
        id: nextId += 1, kind: 'rival', x: at.x + random.range(-160, 160), y: at.y + random.range(-120, 120),
        angle: 0, speed: 0, health: 100, walkSpeed: 90, target: null, state: 'hunt',
        stateTimer: 0, fireTimer: random.range(0.4, 1.2),
      });
    }
  }

  // angleCenter/spread pin the spawn direction (the shot stager spawns the
  // chase behind the player, so the frame catches a pursuit, not a pile-up).
  function spawnPolice(n, dMin = 420, dMax = 700, angleCenter = null, spread = Math.PI * 2) {
    const p = state.player;
    for (let i = 0; i < n; i += 1) {
      // Spawn on a road a little away from the player, never on top of them.
      const a = angleCenter === null ? random.range(0, Math.PI * 2) : angleCenter + random.range(-spread, spread);
      const d = random.range(dMin, dMax);
      let x = p.x + Math.cos(a) * d;
      let y = p.y + Math.sin(a) * d;
      x = Math.max(60, Math.min(WORLD - 60, x));
      y = Math.max(60, Math.min(WORLD - 180, y));
      state.cars.push({
        id: nextId += 1, kind: 'police', x, y, angle: angleTo(x, y, p.x, p.y),
        speed: 200, color: '#22242e', health: CAR.health, driver: true,
        cruise: WANTED.copSpeed, siren: random.range(0, 1),
      });
    }
    if (n > 0) state.events.push('siren');
  }

  // ---- wanted ---------------------------------------------------------------
  function addHeat(amount) {
    const p = state.player;
    p.wantedHeat = Math.min(650, p.wantedHeat + amount);
    state.lastCrime = state.time;
    updateStars();
  }

  function updateStars() {
    const p = state.player;
    let stars = 0;
    for (let i = 1; i <= 5; i += 1) if (p.wantedHeat >= WANTED.stars[i]) stars = i;
    if (stars > p.stars) state.events.push('siren');
    p.stars = stars;
  }

  // ---- missions ---------------------------------------------------------------
  function startMission(index) {
    state.missionIndex = index;
    state.missionStep = 0;
    state.mission = MISSIONS[index] ?? null;
    state.missionState = {};
    state.missionFailed = false;
    if (!state.mission) return;
    state.events.push('mission');
    const first = state.mission.steps[0];
    if (first.kind === 'evade') {
      state.player.wantedHeat = 230;
      updateStars();
      spawnPolice(3);
    }
    if (first.kind === 'eliminate') {
      spawnRivals(first.count, city.landmarks[first.at]);
    }
  }

  function missionPoint(step) {
    if (step.at === 'stores') return city.landmarks.stores;
    return city.landmarks[step.at];
  }

  function completeMission() {
    const m = state.mission;
    state.player.cash += m.reward;
    state.stats.earned += m.reward;
    state.events.push('mission-complete');
    state.mission = null;
    if (state.missionIndex + 1 < MISSIONS.length) startMission(state.missionIndex + 1);
    else state.mission = { id: 'done', title: 'Solano Bay is yours', reward: 0, steps: [], briefing: [] };
  }

  function failMission(reason) {
    state.missionFailed = true;
    state.events.push('mission-failed');
    void reason;
  }

  function updateMission(dt) {
    const m = state.mission;
    if (!m || !m.steps || m.steps.length === 0 || state.missionFailed) return;
    const step = m.steps[state.missionStep];
    if (!step) return;
    const p = state.player;
    const ms = state.missionState;
    if (step.kind === 'goto') {
      const pt = missionPoint(step);
      const car = playerCar();
      const px = car ? car.x : p.x;
      const py = car ? car.y : p.y;
      if (dist(px, py, pt.x, pt.y) < step.radius) {
        if (step.needCar === 'sports' && (!car || car.kind !== 'sports')) {
          // Arrived without the Comet GT: the step does not advance.
        } else advanceStep();
      }
    } else if (step.kind === 'steal') {
      ms.timeLeft = (ms.timeLeft ?? step.timeLimit) - dt;
      const car = playerCar();
      if (car && car.kind === 'sports') advanceStep();
      else if (ms.timeLeft <= 0) failMission('time');
    } else if (step.kind === 'evade') {
      if (p.stars === 0) advanceStep();
    } else if (step.kind === 'eliminate') {
      if ((ms.kills ?? 0) >= step.count) advanceStep();
    } else if (step.kind === 'rob') {
      const stores = city.landmarks.stores;
      ms.robbed = ms.robbed ?? [false, false, false];
      ms.hold = ms.hold ?? 0;
      if (!p.onFoot) { ms.hold = 0; return; }
      for (let i = 0; i < stores.length; i += 1) {
        if (ms.robbed[i]) continue;
        if (dist(p.x, p.y, stores[i].x, stores[i].y) < 70) {
          ms.hold += dt;
          if (ms.hold >= step.holdSeconds) {
            ms.robbed[i] = true;
            ms.hold = 0;
            p.cash += 300;
            state.stats.earned += 300;
            addHeat(70);
            spawnPolice(1);
            state.events.push('robbed');
          }
          break;
        }
      }
      if (ms.robbed.every(Boolean)) {
        addHeat(160);
        spawnPolice(2);
        advanceStep();
      }
    }
  }

  function advanceStep() {
    const m = state.mission;
    state.missionStep += 1;
    state.missionState = {};
    if (state.missionStep >= m.steps.length) {
      completeMission();
      return;
    }
    const next = m.steps[state.missionStep];
    if (next.kind === 'eliminate') spawnRivals(next.count, city.landmarks[next.at]);
    if (next.kind === 'goto' && m.id === 'big-score') {
      // The escape leg: the whole bay is looking for the player now.
      state.player.wantedHeat = Math.max(state.player.wantedHeat, 390);
      updateStars();
    }
    state.events.push('mission');
  }

  // ---- entering / leaving cars ------------------------------------------------
  function playerCar() {
    if (!state.player.carId) return null;
    return state.cars.find((c) => c.id === state.player.carId) ?? null;
  }

  function nearestCar(maxDist) {
    const p = state.player;
    let best = null;
    let bestD = maxDist;
    for (const c of state.cars) {
      if (c.kind === 'police') continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function enterCar() {
    const p = state.player;
    if (!p.onFoot) return;
    const car = nearestCar(PLAYER.interactRange);
    if (!car) return;
    if (car.kind === 'traffic') {
      // Jacking a moving car: the driver bails and runs, the law notices.
      addHeat(40);
      state.stats.stolen += 1;
      const driver = {
        id: nextId += 1, kind: 'civilian', x: car.x + 30, y: car.y + 30, angle: 0, speed: 0,
        health: 100, walkSpeed: 150, target: randomRoadPoint(), state: 'flee', stateTimer: 4, fireTimer: 0,
      };
      state.peds.push(driver);
      car.kind = 'player';
    } else if (car.kind === 'sports' && state.mission?.id === 'hot-wheels') {
      addHeat(25);
      state.stats.stolen += 1;
      car.kind = 'sports';
    } else {
      car.kind = car.special ? 'sports' : 'player';
    }
    p.onFoot = false;
    p.carId = car.id;
    p.speed = 0;
    state.events.push('enter-car');
  }

  function exitCar() {
    const p = state.player;
    const car = playerCar();
    if (p.onFoot || !car) return;
    car.speed = 0;
    if (car.kind === 'player') car.kind = 'parked';
    const a = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(a) * 40;
    p.y = car.y + Math.sin(a) * 40;
    p.onFoot = true;
    p.carId = null;
    resolveBuildings(city, p, PLAYER.radius);
    clampToCity(p, PLAYER.radius);
    state.events.push('exit-car');
  }

  // ---- combat -----------------------------------------------------------------
  function damagePlayer(amount) {
    const p = state.player;
    let left = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, left);
      p.armor -= absorbed;
      left -= absorbed;
    }
    p.health -= left;
    if (p.health <= 0) {
      p.health = 0;
      state.wasted = true;
      state.over = true;
      state.overKind = 'wasted';
      state.events.push('wasted');
    }
  }

  function fireBullet(from, x, y, angle) {
    state.bullets.push({ x, y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900, life: 0.6, from });
    state.events.push('shot');
    if (from === 'player') addHeat(4);
    burst(x, y, 3, '#ffd76a', 90);
  }

  function burst(x, y, n, color, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random.range(0, Math.PI * 2);
      const s = random.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(0.25, 0.6), maxLife: 0.6, color, size: random.range(2, 5) });
    }
  }

  // ---- the step -----------------------------------------------------------------
  function step(dt, input) {
    if (state.over) return;
    state.time += dt;
    const p = state.player;
    p.fireTimer = Math.max(0, p.fireTimer - dt);

    updatePlayer(dt, input);
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateBullets(dt);
    updateParticles(dt);
    updatePickups(dt);
    updateWanted(dt);
    updateMission(dt);
    updateMissionFailRetry(input);

    // Cash pickups respawn slowly so the streets never run dry.
    state.cashTimer += dt;
    if (state.cashTimer > 45 && state.pickups.filter((k) => k.kind === 'cash').length < 6) {
      state.cashTimer = 0;
      const pt = randomRoadPoint();
      state.pickups.push({ x: pt.x, y: pt.y, kind: 'cash', amount: random.int(50, 150), bob: 0 });
    }
  }

  function updateMissionFailRetry(input) {
    if (state.missionFailed && input.confirm) {
      const index = state.missionIndex;
      startMission(index);
    }
  }

  function updatePlayer(dt, input) {
    const p = state.player;
    if (p.onFoot) {
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const len = Math.hypot(mx, my);
      p.moving = len > 0;
      if (len > 0) {
        mx /= len;
        my /= len;
        const speed = input.run ? PLAYER.run : PLAYER.walk;
        p.x += mx * speed * dt;
        p.y += my * speed * dt;
        p.speed = speed;
        if (!input.aiming) p.angle = Math.atan2(my, mx);
      } else {
        p.speed = 0;
      }
      if (input.aiming && input.aimX !== undefined) {
        p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      }
      if (input.enter) enterCar();
      if (input.shoot && p.fireTimer <= 0) {
        p.fireTimer = PLAYER.fireInterval;
        const a = input.aiming ? p.angle : p.angle;
        fireBullet('player', p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a);
      }
      resolveBuildings(city, p, PLAYER.radius);
      clampToCity(p, PLAYER.radius);
    } else {
      const car = playerCar();
      if (!car) { p.onFoot = true; return; }
      driveCar(car, dt, input, true);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = Math.abs(car.speed);
      if (input.enter) exitCar();
      if (car.health <= 0) {
        burst(car.x, car.y, 26, '#ff7a3d', 260);
        burst(car.x, car.y, 14, '#3a3a3a', 120);
        state.events.push('crash');
        const wreck = car;
        wreck.kind = 'wreck';
        wreck.speed = 0;
        p.onFoot = true;
        p.carId = null;
        p.x = wreck.x + 44;
        p.y = wreck.y;
        damagePlayer(15);
      }
    }
  }

  function driveCar(car, dt, input, isPlayer) {
    if (input.up) car.speed += CAR.accel * dt;
    if (input.down) {
      if (car.speed > 30) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (!input.up && !input.down) {
      car.speed -= Math.sign(car.speed) * 260 * dt;
      if (Math.abs(car.speed) < 8) car.speed = 0;
    }
    if (input.handbrake) car.speed *= Math.max(0, 1 - 3.2 * dt);
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const grip = car.speed >= 0 ? 1 : -1;
    // Steering stays usable at low speed, so a car pinned against a wall can
    // still turn away instead of sitting there while the police pile on.
    const steerAuthority = 0.35 + 0.65 * (Math.abs(car.speed) / CAR.maxSpeed);
    car.angle += steer * CAR.turnRate * steerAuthority * grip * dt * (input.handbrake ? 1.5 : 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const probe = { x: nx, y: ny };
    const hitWall = resolveBuildings(city, probe, 26);
    if (hitWall) {
      // A hard hit costs speed and health; a graze just slides along the wall,
      // so a car ground against a building by a police ram can still drive off.
      if (Math.abs(car.speed) > 240) {
        burst(car.x, car.y, 10, '#ffd76a', 200);
        state.events.push('crash');
        car.health -= 8;
        car.speed *= 0.45;
        if (isPlayer) addHeat(2);
      }
      // Slide along the wall instead of stopping dead.
      const blockedX = resolveBuildings(city, { x: nx, y: car.y }, 26);
      if (!blockedX) car.x = nx;
      else {
        const blockedY = resolveBuildings(city, { x: car.x, y: ny }, 26);
        if (!blockedY) car.y = ny;
      }
    } else {
      car.x = nx;
      car.y = ny;
    }
    clampToCity(car, 26);
    if (car.health < 45 && Math.random() < dt * 6) {
      state.particles.push({ x: car.x, y: car.y - 10, vx: random.range(-12, 12), vy: random.range(-46, -20), life: 0.8, maxLife: 0.8, color: '#555', size: 5 });
    }
  }

  function updateTraffic(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      if (!car.route || car.routeIndex >= car.route.length) {
        car.route = buildRoute(car);
        car.routeIndex = 0;
      }
      const target = car.route[car.routeIndex];
      if (!target) continue;
      const d = dist(car.x, car.y, target.x, target.y);
      if (d < 26) {
        car.routeIndex += 1;
        continue;
      }
      const want = angleTo(car.x, car.y, target.x, target.y);
      car.angle = turnToward(car.angle, want, 2.4 * dt);
      // Slow down for the car ahead, and for the player crossing.
      let cruise = car.cruise;
      for (const other of state.cars) {
        if (other === car || other.speed === 0) continue;
        const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
        const side = Math.abs((other.x - car.x) * Math.sin(car.angle) - (other.y - car.y) * Math.cos(car.angle));
        if (ahead > 0 && ahead < 90 && side < 34) { cruise = 0; break; }
      }
      const pd = dist(car.x, car.y, p.x, p.y);
      if (pd < 70 && p.speed > 200) cruise = Math.min(cruise, 60);
      car.speed += (cruise - car.speed) * Math.min(1, 1.6 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      resolveBuildings(city, car, 24);
      clampToCity(car, 24);
    }
    // Car-to-car bumps (traffic, police and the player's car).
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.kind === 'wreck' || b.kind === 'wreck') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d >= 46) continue;
        const push = (46 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 120) {
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd76a', 160);
          state.events.push('crash');
          a.health -= 4;
          b.health -= 4;
          if ((a.kind === 'player' || a.kind === 'sports' || b.kind === 'player' || b.kind === 'sports') && impact > 260) {
            addHeat(3);
          }
          const tmp = a.speed;
          a.speed = b.speed * 0.4;
          b.speed = tmp * 0.4;
        }
      }
    }
  }

  function buildRoute(car) {
    // A route is a short chain of intersections; the car follows road centrelines.
    const route = [];
    let ix = Math.max(0, Math.min(GRID - 1, Math.round((car.x - FIRST_ROAD) / PITCH)));
    let iy = Math.max(0, Math.min(GRID - 1, Math.round((car.y - FIRST_ROAD) / PITCH)));
    let vertical = Math.abs(car.x - roadCenter(ix)) < Math.abs(car.y - roadCenter(iy));
    for (let i = 0; i < 5; i += 1) {
      if (vertical) iy += random.next() < 0.5 ? 1 : -1;
      else ix += random.next() < 0.5 ? 1 : -1;
      ix = Math.max(0, Math.min(GRID - 1, ix));
      iy = Math.max(0, Math.min(GRID - 1, iy));
      route.push(intersection(ix, iy));
      vertical = !vertical;
    }
    return route;
  }

  function updatePolice(dt) {
    const p = state.player;
    const want = WANTED.maxCops[p.stars] ?? 0;
    const cops = state.cars.filter((c) => c.kind === 'police');
    if (cops.length < want && p.stars > 0 && Math.random() < dt * 2.0) spawnPolice(1);
    if (p.stars === 0) {
      // No heat, no heat: cops give up and drive off.
      for (const cop of cops) {
        if (dist(cop.x, cop.y, p.x, p.y) > 900) {
          state.cars.splice(state.cars.indexOf(cop), 1);
        }
      }
    }
    for (const cop of state.cars.filter((c) => c.kind === 'police')) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      // Far away, chase along the roads; up close, cut straight at the player.
      const wp = d > 220 ? roadWaypoint(cop.x, cop.y, p.x, p.y) : p;
      const wantAngle = angleTo(cop.x, cop.y, wp.x, wp.y);
      cop.angle = turnToward(cop.angle, wantAngle, 3.0 * dt);
      const cruise = p.stars > 0 ? WANTED.copSpeed : 120;
      cop.speed += (cruise - cop.speed) * Math.min(1, 1.4 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      const hitWall = resolveBuildings(city, cop, 26);
      if (hitWall) cop.speed *= 0.5;
      clampToCity(cop, 26);
      // Ramming the player hurts.
      if (d < 52) {
        if (p.onFoot) {
          // Run down on foot: steady damage while the cop is on top of them.
          damagePlayer(26 * dt);
          if (Math.random() < dt * 2) burst(p.x, p.y, 4, '#d94f3d', 120);
        } else {
          const car = playerCar();
          if (car) {
            car.health -= 5 * dt;
            car.speed *= Math.max(0, 1 - 1.2 * dt);
            if (Math.random() < dt * 3) {
              burst(car.x, car.y, 5, '#ffd76a', 140);
              state.events.push('crash');
            }
          }
        }
      }
      // Busted: on foot, slow, and a cop right on top of the player.
      if (p.onFoot && d < WANTED.bustRange && p.speed < 60) {
        state.bustTimer += dt;
        if (state.bustTimer > WANTED.bustTime) {
          state.busted = true;
          state.over = true;
          state.overKind = 'busted';
          state.events.push('busted');
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      ped.stateTimer -= dt;
      ped.fireTimer -= dt;
      const threat = dist(ped.x, ped.y, p.x, p.y);
      if (ped.kind === 'rival') {
        // Hunt the player: close in and shoot.
        const d = threat;
        if (d < 420) {
          ped.angle = angleTo(ped.x, ped.y, p.x, p.y);
          if (d > 130) {
            ped.x += Math.cos(ped.angle) * ped.walkSpeed * 1.6 * dt;
            ped.y += Math.sin(ped.angle) * ped.walkSpeed * 1.6 * dt;
          } else if (ped.fireTimer <= 0) {
            ped.fireTimer = random.range(1.0, 1.6);
            fireBullet('rival', ped.x + Math.cos(ped.angle) * 16, ped.y + Math.sin(ped.angle) * 16, ped.angle + random.range(-0.12, 0.12));
          }
        } else if (ped.target) {
          ped.angle = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
          ped.x += Math.cos(ped.angle) * ped.walkSpeed * dt;
          ped.y += Math.sin(ped.angle) * ped.walkSpeed * dt;
          if (dist(ped.x, ped.y, ped.target.x, ped.target.y) < 30) ped.target = null;
        }
        resolveBuildings(city, ped, 12);
        clampToCity(ped, 12);
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
        if (ped.stateTimer <= 0) { ped.state = 'walk'; ped.target = randomRoadPoint(); }
      } else {
        if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
          ped.target = randomRoadPoint();
        }
        ped.angle = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
        ped.x += Math.cos(ped.angle) * ped.walkSpeed * dt;
        ped.y += Math.sin(ped.angle) * ped.walkSpeed * dt;
        // A speeding car or a gunshot nearby sends civilians running.
        const car = playerCar();
        if (threat < 130 && p.speed > 240) { ped.state = 'flee'; ped.stateTimer = 3; }
        else if (car && dist(ped.x, ped.y, car.x, car.y) < 90 && Math.abs(car.speed) > 300) { ped.state = 'flee'; ped.stateTimer = 3; }
      }
      resolveBuildings(city, ped, 12);
      clampToCity(ped, 12);
      // Run over by a car: down they go, and the law notices.
      for (const car of state.cars) {
        if (car.kind === 'wreck' || Math.abs(car.speed) < 60) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < 34 && ped.state !== 'down') {
          ped.state = 'down';
          ped.stateTimer = 4;
          ped.health -= 60;
          burst(ped.x, ped.y, 8, '#d94f3d', 120);
          if (car.kind === 'player' || car.kind === 'sports') {
            addHeat(25);
            if (ped.health <= 0) { addHeat(20); state.stats.kills += 1; }
          }
          if (ped.health <= 0) removePed(ped);
          break;
        }
      }
    }
  }

  function removePed(ped) {
    const i = state.peds.indexOf(ped);
    if (i >= 0) state.peds.splice(i, 1);
  }

  function updateBullets(dt) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && hitsBuildingNow(b.x, b.y)) {
        burst(b.x, b.y, 4, '#ffd76a', 120);
        dead = true;
      }
      if (!dead) {
        if (b.from === 'player') {
          for (const ped of [...state.peds]) {
            if (dist(b.x, b.y, ped.x, ped.y) < 16) {
              ped.health -= PLAYER.shotDamage;
              burst(b.x, b.y, 6, '#d94f3d', 130);
              dead = true;
              if (ped.health <= 0) {
                state.stats.kills += 1;
                if (ped.kind === 'rival') {
                  state.missionState.kills = (state.missionState.kills ?? 0) + 1;
                  addHeat(10);
                } else {
                  addHeat(40);
                }
                removePed(ped);
              } else if (ped.kind === 'civilian') {
                ped.state = 'flee';
                ped.stateTimer = 4;
              }
              break;
            }
          }
          if (!dead) {
            for (const car of state.cars) {
              if (car.kind === 'player' || car.kind === 'sports') continue;
              if (dist(b.x, b.y, car.x, car.y) < 30) {
                car.health -= PLAYER.shotDamage;
                burst(b.x, b.y, 5, '#ffd76a', 130);
                dead = true;
                if (car.kind === 'police') addHeat(12);
                if (car.health <= 0 && car.kind === 'police') {
                  burst(car.x, car.y, 20, '#ff7a3d', 220);
                  car.kind = 'wreck';
                  car.speed = 0;
                  addHeat(60);
                }
                break;
              }
            }
          }
        } else {
          // A rival's bullet can only hurt the player, on foot or in the car.
          const car = playerCar();
          const tx = car ? car.x : p.x;
          const ty = car ? car.y : p.y;
          if (dist(b.x, b.y, tx, ty) < (car ? 30 : 15)) {
            if (car) car.health -= 6;
            else damagePlayer(8);
            burst(b.x, b.y, 4, '#d94f3d', 110);
            dead = true;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function hitsBuildingNow(x, y) {
    for (const b of city.buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
    return false;
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = state.player;
    const car = playerCar();
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const k = state.pickups[i];
      k.bob += dt;
      const tx = car ? car.x : p.x;
      const ty = car ? car.y : p.y;
      if (dist(k.x, k.y, tx, ty) < 40) {
        if (k.kind === 'cash') {
          p.cash += k.amount;
          state.stats.earned += k.amount;
        } else if (k.kind === 'health') {
          p.health = Math.min(PLAYER.health, p.health + k.amount);
        } else if (k.kind === 'repair' && car) {
          car.health = Math.min(CAR.health, car.health + 50);
        }
        state.events.push('pickup');
        state.pickups.splice(i, 1);
      }
    }
  }

  function updateWanted(dt) {
    const p = state.player;
    if (p.stars === 0) return;
    // Out of sight, out of mind: heat bleeds off once no cop is near and no
    // fresh crime happened in the last few seconds.
    const nearCop = state.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 520);
    if (!nearCop && state.time - state.lastCrime > 5) {
      p.wantedHeat = Math.max(0, p.wantedHeat - WANTED.decayPerSecond * dt);
      updateStars();
    }
  }

  // ---- debug hooks for the playtest harness (also handy while playing) ------
  function debug() {
    return {
      teleport(x, y) {
        const p = state.player;
        const car = playerCar();
        if (car) { car.x = x; car.y = y; car.speed = 0; p.x = x; p.y = y; }
        else { p.x = x; p.y = y; }
      },
      setStars(n) {
        state.player.wantedHeat = n <= 0 ? 0 : WANTED.stars[n];
        updateStars();
      },
      startMission(i) { startMission(i); },
      state: () => state,
    };
  }
}
