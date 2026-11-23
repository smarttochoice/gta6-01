// SOLANO HEAT — the simulation: the player on foot and by car, the mission
// driver, and the one fixed step that runs every system in order. Traffic,
// police and combat live in their own modules; this file wires them together
// and owns the player, the cars the player drives, and the story.
import { CROWD, FOOT, HEAT, VEHICLE } from './config.js';
import { buildCity, clampInside, pushOutOfBuildings } from './city.js';
import { createRandom } from './random.js';
import { MISSIONS } from './missions.js';
import { dist } from './util.js';
import { randomRoadPoint, spawnParked, spawnTraffic, spawnWalkers, spawnRivals, clearRivals, updateTraffic, updateWalkers } from './traffic.js';
import { addHeat, refreshStars, spawnPolice, updateHeatDecay, updatePolice } from './police.js';
import { burst, fireShot, hurtPlayer, updateBullets, updateParticles, updatePickups } from './combat.js';

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const state = {
    seed, city, random,
    time: 0,
    nextId: 1,
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
  const world = { state, reset, step, enterCar, exitCar, addHeat: (n) => addHeat(state, n), startMission, spawnPolice: (...a) => spawnPolice(state, ...a), debug };
  reset();
  return world;

  function reset() {
    state.time = 0;
    state.nextId = 1;
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
    const s = city.spots.spawn;
    state.player = {
      x: s.x, y: s.y, angle: -Math.PI / 2, health: FOOT.health, armor: FOOT.armor,
      onFoot: true, carId: null, speed: 0, cash: 0, wantedHeat: 0, stars: 0,
      fireTimer: 0, moving: false,
    };
    spawnTraffic(state);
    spawnParked(state);
    spawnWalkers(state);
    spawnPickups();
    startMission(0);
  }

  function spawnPickups() {
    for (let i = 0; i < CROWD.pickups; i += 1) {
      const p = randomRoadPoint(random);
      state.pickups.push({
        x: p.x, y: p.y,
        kind: i < 7 ? 'cash' : i < 9 ? 'health' : 'repair',
        amount: i < 7 ? random.int(50, 150) : 40,
        bob: random.range(0, 6),
      });
    }
  }

  // ---- the player's car -----------------------------------------------------
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
    const car = nearestCar(FOOT.grabRange);
    if (!car) return;
    if (car.kind === 'traffic') {
      // Jacking a moving car: the driver bails and runs, the law notices.
      addHeat(state, 40);
      state.stats.stolen += 1;
      state.peds.push({
        id: state.nextId += 1, kind: 'civilian', x: car.x + 30, y: car.y + 30,
        angle: 0, speed: 0, health: 100, walkSpeed: 150,
        target: randomRoadPoint(random), state: 'flee', stateTimer: 4, fireTimer: 0,
        color: '#e8e0d0',
      });
      car.kind = 'player';
    } else if (car.kind === 'sports' && state.mission?.id === 'hot-wheels') {
      addHeat(state, 25);
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
    pushOutOfBuildings(city, p, FOOT.radius);
    clampInside(p, FOOT.radius);
    state.events.push('exit-car');
  }

  // One car, one input, one step: acceleration, braking, steering with
  // speed-dependent authority, and sliding along walls instead of stopping.
  function driveCar(car, dt, input, isPlayer) {
    if (input.up) car.speed += VEHICLE.accel * dt;
    if (input.down) {
      if (car.speed > 30) car.speed -= VEHICLE.brake * dt;
      else car.speed -= VEHICLE.reverseAccel * dt;
    }
    if (!input.up && !input.down) {
      car.speed -= Math.sign(car.speed) * 260 * dt;
      if (Math.abs(car.speed) < 8) car.speed = 0;
    }
    if (input.handbrake) car.speed *= Math.max(0, 1 - 3.2 * dt);
    car.speed = Math.max(-VEHICLE.topReverse, Math.min(VEHICLE.topSpeed, car.speed));
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const grip = car.speed >= 0 ? 1 : -1;
    // Steering stays usable at low speed, so a car pinned against a wall can
    // still turn away instead of sitting there while the police pile on.
    const authority = 0.35 + 0.65 * (Math.abs(car.speed) / VEHICLE.topSpeed);
    car.angle += steer * VEHICLE.turnRate * authority * grip * dt * (input.handbrake ? 1.5 : 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const probe = { x: nx, y: ny };
    if (pushOutOfBuildings(city, probe, 26)) {
      // A hard hit costs speed and health; a graze just slides along the wall.
      if (Math.abs(car.speed) > 240) {
        burst(state, car.x, car.y, 10, '#ffd76a', 200);
        state.events.push('crash');
        car.health -= 8;
        car.speed *= 0.45;
        if (isPlayer) addHeat(state, 2);
      }
      const blockedX = pushOutOfBuildings(city, { x: nx, y: car.y }, 26);
      if (!blockedX) car.x = nx;
      else {
        const blockedY = pushOutOfBuildings(city, { x: car.x, y: ny }, 26);
        if (!blockedY) car.y = ny;
      }
    } else {
      car.x = nx;
      car.y = ny;
    }
    clampInside(car, 26);
    if (car.health < 45 && random.next() < dt * 6) {
      state.particles.push({
        x: car.x, y: car.y - 10, vx: random.range(-12, 12), vy: random.range(-46, -20),
        life: 0.8, maxLife: 0.8, color: '#555', size: 5,
      });
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
        const speed = input.run ? FOOT.run : FOOT.walk;
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
        p.fireTimer = FOOT.fireInterval;
        const a = p.angle;
        fireShot(state, 'player', p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a,
          { heat: (n) => addHeat(state, n) });
      }
      pushOutOfBuildings(city, p, FOOT.radius);
      clampInside(p, FOOT.radius);
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
        burst(state, car.x, car.y, 26, '#ff7a3d', 260);
        burst(state, car.x, car.y, 14, '#3a3a3a', 120);
        state.events.push('crash');
        car.kind = 'wreck';
        car.speed = 0;
        p.onFoot = true;
        p.carId = null;
        p.x = car.x + 44;
        p.y = car.y;
        hurtPlayer(state, 15);
      }
    }
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
      refreshStars(state);
      spawnPolice(state, 3);
    }
    if (first.kind === 'eliminate') {
      clearRivals(state);
      spawnRivals(state, first.count, city.spots[first.at]);
    }
  }

  function missionPoint(step) {
    if (step.at === 'stores') return city.spots.stores;
    return city.spots[step.at];
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

  function failMission() {
    state.missionFailed = true;
    state.events.push('mission-failed');
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
    if (next.kind === 'eliminate') {
      clearRivals(state);
      spawnRivals(state, next.count, city.spots[next.at]);
    }
    if (next.kind === 'goto' && m.id === 'big-score') {
      // The escape leg: the whole bay is looking for the player now.
      state.player.wantedHeat = Math.max(state.player.wantedHeat, 390);
      refreshStars(state);
    }
    state.events.push('mission');
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
        // Arrived without the Comet GT: the step does not advance.
        if (step.needCar !== 'sports' || (car && car.kind === 'sports')) advanceStep();
      }
    } else if (step.kind === 'steal') {
      ms.timeLeft = (ms.timeLeft ?? step.timeLimit) - dt;
      const car = playerCar();
      if (car && car.kind === 'sports') advanceStep();
      else if (ms.timeLeft <= 0) failMission();
    } else if (step.kind === 'evade') {
      if (p.stars === 0) advanceStep();
    } else if (step.kind === 'eliminate') {
      if ((ms.kills ?? 0) >= step.count) advanceStep();
    } else if (step.kind === 'rob') {
      const stores = city.spots.stores;
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
            addHeat(state, 70);
            spawnPolice(state, 1);
            state.events.push('robbed');
          }
          break;
        }
      }
      if (ms.robbed.every(Boolean)) {
        addHeat(state, 160);
        spawnPolice(state, 2);
        advanceStep();
      }
    }
  }

  // ---- the step -----------------------------------------------------------------
  function step(dt, input) {
    if (state.over) return;
    state.time += dt;
    const p = state.player;
    p.fireTimer = Math.max(0, p.fireTimer - dt);

    updatePlayer(dt, input);
    updateTraffic(state, dt, { heat: (n) => addHeat(state, n) });
    updatePolice(state, dt, { playerCar });
    updateWalkers(state, dt, { heat: (n) => addHeat(state, n) });
    updateBullets(state, dt, {
      heat: (n) => addHeat(state, n),
      playerCar,
      rivalDown: () => { state.missionState.kills = (state.missionState.kills ?? 0) + 1; },
      removePed: (ped) => {
        const i = state.peds.indexOf(ped);
        if (i >= 0) state.peds.splice(i, 1);
      },
    });
    updateParticles(state, dt);
    updatePickups(state, dt, { playerCar });
    updateHeatDecay(state, dt);
    updateMission(dt);
    if (state.missionFailed && input.confirm) startMission(state.missionIndex);

    // Cash pickups respawn slowly so the streets never run dry.
    state.cashTimer += dt;
    if (state.cashTimer > 45 && state.pickups.filter((k) => k.kind === 'cash').length < 6) {
      state.cashTimer = 0;
      const pt = randomRoadPoint(random);
      state.pickups.push({ x: pt.x, y: pt.y, kind: 'cash', amount: random.int(50, 150), bob: 0 });
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
        state.player.wantedHeat = n <= 0 ? 0 : HEAT.thresholds[n];
        refreshStars(state);
      },
      startMission(i) { startMission(i); },
      state: () => state,
    };
  }
}
