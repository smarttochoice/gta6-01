// Combat and pickups: bullets, muzzle sparks and crash debris, hurting the
// player through armor first, and the cash, health and repair pickups on the
// street. The world calls these; the renderer only reads the results.
import { FOOT, VEHICLE } from './config.js';
import { pointInBuilding } from './city.js';
import { dist } from './util.js';

export function burst(state, x, y, n, color, speed) {
  const { random } = state;
  for (let i = 0; i < n; i += 1) {
    const a = random.range(0, Math.PI * 2);
    const s = random.range(speed * 0.3, speed);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: random.range(0.25, 0.6), maxLife: 0.6,
      color, size: random.range(2, 5),
    });
  }
}

// Fire one bullet. A player's shot is a crime, so it adds a little heat.
export function fireShot(state, from, x, y, angle, api) {
  state.bullets.push({ x, y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900, life: 0.6, from });
  state.events.push('shot');
  if (from === 'player' && api) api.heat(4);
  burst(state, x, y, 3, '#ffd76a', 90);
}

// Damage the player: armor absorbs first, then health. At zero health the run
// is over — WASTED.
export function hurtPlayer(state, amount) {
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

export function updateBullets(state, dt, api) {
  const p = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(state.city, b.x, b.y)) {
      burst(state, b.x, b.y, 4, '#ffd76a', 120);
      dead = true;
    }
    if (!dead) {
      if (b.from === 'player') {
        for (const ped of [...state.peds]) {
          if (dist(b.x, b.y, ped.x, ped.y) < 16) {
            ped.health -= FOOT.shotDamage;
            burst(state, b.x, b.y, 6, '#d94f3d', 130);
            dead = true;
            if (ped.health <= 0) {
              state.stats.kills += 1;
              if (ped.kind === 'rival') {
                api.rivalDown();
                api.heat(10);
              } else {
                api.heat(40);
              }
              api.removePed(ped);
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
              car.health -= FOOT.shotDamage;
              burst(state, b.x, b.y, 5, '#ffd76a', 130);
              dead = true;
              if (car.kind === 'police') api.heat(12);
              if (car.health <= 0 && car.kind === 'police') {
                burst(state, car.x, car.y, 20, '#ff7a3d', 220);
                car.kind = 'wreck';
                car.speed = 0;
                api.heat(60);
              }
              break;
            }
          }
        }
      } else {
        // A rival's bullet can only hurt the player, on foot or in the car.
        const car = api.playerCar();
        const tx = car ? car.x : p.x;
        const ty = car ? car.y : p.y;
        if (dist(b.x, b.y, tx, ty) < (car ? 30 : 15)) {
          if (car) car.health -= 6;
          else hurtPlayer(state, 8);
          burst(state, b.x, b.y, 4, '#d94f3d', 110);
          dead = true;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

export function updatePickups(state, dt, api) {
  const p = state.player;
  const car = api.playerCar();
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
        p.health = Math.min(FOOT.health, p.health + k.amount);
      } else if (k.kind === 'repair' && car) {
        car.health = Math.min(VEHICLE.health, car.health + 50);
      }
      state.events.push('pickup');
      state.pickups.splice(i, 1);
    }
  }
}
