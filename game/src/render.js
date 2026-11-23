// SOLANO HEAT — the renderer: a top-down golden-hour city on canvas, the HUD
// with its minimap and wanted stars, and the title / pause / game-over
// screens. It only reads the world state; it never changes it.
import { CITY, PALETTE, VEHICLE } from './config.js';
import { roadAt } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const VIEW_W = 1280;
const VIEW_H = 720;
const MAP_SIZE = 200;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let mapCache = null;
  let mapSeed = -1;
  let shake = 0;

  // The minimap is a small static picture of the city, drawn once per seed.
  function buildMinimap(state) {
    const map = document.createElement('canvas');
    map.width = MAP_SIZE;
    map.height = MAP_SIZE;
    const m = map.getContext('2d');
    const s = MAP_SIZE / CITY.size;
    m.fillStyle = PALETTE.grass;
    m.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    m.fillStyle = PALETTE.sand;
    m.fillRect(0, state.city.beachY * s, MAP_SIZE, (state.city.waterY - state.city.beachY) * s);
    m.fillStyle = PALETTE.water;
    m.fillRect(0, state.city.waterY * s, MAP_SIZE, MAP_SIZE - state.city.waterY * s);
    m.fillStyle = '#6a6a72';
    for (let i = 0; i < CITY.grid; i += 1) {
      m.fillRect(roadAt(i) * s - 3, 0, 6, MAP_SIZE);
      m.fillRect(0, roadAt(i) * s - 3, MAP_SIZE, 6);
    }
    m.fillStyle = '#8a8474';
    for (const b of state.city.buildings) {
      m.fillRect(b.x * s, b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    }
    mapCache = map;
    mapSeed = state.seed;
  }

  function draw(state, view) {
    const p = state.player;
    ctx.save();
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    // The camera follows the player; the title screen drifts over the city.
    let cx = p.x;
    let cy = p.y;
    if (view.screen === SCREEN_TITLE) {
      cx = CITY.size / 2 + Math.sin(state.time * 0.05) * 500;
      cy = CITY.size / 2 + Math.cos(state.time * 0.04) * 400;
    }
    if (state.events.includes('crash')) shake = 7;
    shake *= 0.88;
    const shx = (Math.random() - 0.5) * shake;
    const shy = (Math.random() - 0.5) * shake;
    const camX = Math.max(VIEW_W / 2 - 40, Math.min(CITY.size - VIEW_W / 2 + 40, cx)) + shx;
    const camY = Math.max(VIEW_H / 2 - 40, Math.min(CITY.size - VIEW_H / 2 + 40, cy)) + shy;
    const ox = VIEW_W / 2 - camX;
    const oy = VIEW_H / 2 - camY;

    paintGround(state, ox, oy);
    paintBuildings(state, ox, oy);
    paintMarker(state, ox, oy, view);
    paintPickups(state, ox, oy);
    paintPeds(state, ox, oy);
    paintCars(state, ox, oy);
    paintBullets(state, ox, oy);
    paintParticles(state, ox, oy);
    paintPlayer(state, ox, oy);
    ctx.restore();

    if (view.screen === SCREEN_PLAY) {
      paintHud(state, view);
      paintMinimap(state);
      paintObjective(state, view);
    }
    if (view.screen === SCREEN_TITLE) paintTitle(state, view);
    if (view.screen === SCREEN_PAUSED) paintPaused();
    if (view.screen === SCREEN_OVER) paintOver(state, view);
    if (view.flash && view.flashUntil > state.time) paintFlash(view.flash);
  }

  function paintGround(state, ox, oy) {
    const half = CITY.roadHalf;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Beach and ocean along the south edge, with a slow wave shimmer.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(ox, state.city.beachY + oy, CITY.size, state.city.waterY - state.city.beachY);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(ox, state.city.waterY + oy, CITY.size, CITY.size - state.city.waterY);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let i = 0; i < 8; i += 1) {
      const wy = state.city.waterY + 18 + i * 14 + Math.sin(state.time * 1.2 + i) * 3;
      ctx.fillRect(ox, wy + oy, CITY.size, 2);
    }
    // Sidewalks, then roads, then the road edges.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let i = 0; i < CITY.grid; i += 1) {
      const c = roadAt(i);
      ctx.fillRect(c - half - 14 + ox, oy - 60, (half + 14) * 2, CITY.size + 120);
      ctx.fillRect(ox - 60, c - half - 14 + oy, CITY.size + 120, (half + 14) * 2);
    }
    ctx.fillStyle = PALETTE.road;
    for (let i = 0; i < CITY.grid; i += 1) {
      const c = roadAt(i);
      ctx.fillRect(c - half + ox, oy - 60, half * 2, CITY.size + 120);
      ctx.fillRect(ox - 60, c - half + oy, CITY.size + 120, half * 2);
    }
    ctx.fillStyle = PALETTE.roadEdge;
    for (let i = 0; i < CITY.grid; i += 1) {
      const c = roadAt(i);
      ctx.fillRect(c - half + ox, oy - 60, 3, CITY.size + 120);
      ctx.fillRect(c + half - 3 + ox, oy - 60, 3, CITY.size + 120);
      ctx.fillRect(ox - 60, c - half + oy, CITY.size + 120, 3);
      ctx.fillRect(ox - 60, c + half - 3 + oy, CITY.size + 120, 3);
    }
    // Parks read as darker green blocks.
    for (const park of state.city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x0 + ox, park.y0 + oy, park.x1 - park.x0, park.y1 - park.y0);
    }
    // Lane dashes down every road.
    ctx.fillStyle = PALETTE.lane;
    for (let i = 0; i < CITY.grid; i += 1) {
      const c = roadAt(i);
      for (let d = 0; d < CITY.size; d += 64) {
        ctx.fillRect(c - 2 + ox, d + oy, 4, 30);
        ctx.fillRect(d + ox, c - 2 + oy, 30, 4);
      }
    }
    // Palms: a trunk line and five fronds.
    for (const palm of state.city.palms) {
      ctx.strokeStyle = PALETTE.trunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x + ox, palm.y + oy);
      ctx.lineTo(palm.x + 4 + ox, palm.y - 12 + oy);
      ctx.stroke();
      ctx.fillStyle = PALETTE.palm;
      for (let f = 0; f < 5; f += 1) {
        const a = (f / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(palm.x + 4 + Math.cos(a) * 9 + ox, palm.y - 12 + Math.sin(a) * 9 + oy, 11, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function paintBuildings(state, ox, oy) {
    for (const b of state.city.buildings) {
      // An offset shadow sells the height.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.height * 5 + ox, b.y + b.height * 5 + oy, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.h);
      // Lit windows, a few dark.
      ctx.fillStyle = 'rgba(255,244,200,0.85)';
      const gw = b.w / b.windows.cols;
      const gh = b.h / b.windows.rows;
      for (let wx = 0; wx < b.windows.cols; wx += 1) {
        for (let wy = 0; wy < b.windows.rows; wy += 1) {
          if ((wx * 7 + wy * 13 + b.height) % 5 === 0) continue;
          ctx.fillRect(b.x + wx * gw + gw * 0.25 + ox, b.y + wy * gh + gh * 0.25 + oy, gw * 0.5, gh * 0.5);
        }
      }
      // A dark roof plant.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w * 0.15 + ox, b.y + b.h * 0.15 + oy, b.w * 0.2, b.h * 0.2);
    }
  }

  // Where the current mission step wants the player, if anywhere.
  function missionTarget(state) {
    const m = state.mission;
    if (!m || !m.steps || m.steps.length === 0 || state.missionFailed) return null;
    const step = m.steps[state.missionStep];
    if (!step) return null;
    if (step.kind === 'goto' || step.kind === 'steal' || step.kind === 'eliminate') {
      return state.city.spots[step.at];
    }
    if (step.kind === 'rob') {
      const robbed = state.missionState.robbed ?? [false, false, false];
      for (let i = 0; i < 3; i += 1) if (!robbed[i]) return state.city.spots.stores[i];
      return state.city.spots.safehouse;
    }
    return null;
  }

  function paintMarker(state, ox, oy, view) {
    if (view.screen !== SCREEN_PLAY) return;
    const t = missionTarget(state);
    if (!t) return;
    const pulse = 1 + Math.sin(state.time * 5) * 0.15;
    ctx.save();
    ctx.translate(t.x + ox, t.y + oy);
    ctx.fillStyle = 'rgba(255,210,31,0.18)';
    ctx.fillRect(-34 * pulse, -120, 68 * pulse, 120);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd21f';
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 3;
    const s = 16 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    // Off-screen: an arrow at the screen edge points the way.
    const sx = t.x + ox;
    const sy = t.y + oy;
    if (sx < 40 || sx > VIEW_W - 40 || sy < 40 || sy > VIEW_H - 40) {
      const cx = Math.max(50, Math.min(VIEW_W - 50, sx));
      const cy = Math.max(50, Math.min(VIEW_H - 50, sy));
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function paintPickups(state, ox, oy) {
    for (const k of state.pickups) {
      const bob = Math.sin(k.bob * 2) * 3;
      ctx.save();
      ctx.translate(k.x + ox, k.y + bob + oy);
      if (k.kind === 'cash') {
        ctx.fillStyle = '#2fae5f';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d7ffd7';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#eaffea';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
      } else if (k.kind === 'health') {
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(-11, -11, 22, 22);
        ctx.fillStyle = '#d93a3a';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      } else {
        ctx.fillStyle = '#c9a227';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff3c4';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('R', 0, 1);
      }
      ctx.restore();
    }
  }

  function paintPeds(state, ox, oy) {
    for (const ped of state.peds) {
      ctx.save();
      ctx.translate(ped.x + ox, ped.y + oy);
      if (ped.state === 'down') {
        ctx.rotate(ped.angle);
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8b98a';
        ctx.beginPath();
        ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
        ctx.fill();
        if (ped.kind === 'rival') {
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ped.angle) * 8, Math.sin(ped.angle) * 8);
          ctx.lineTo(Math.cos(ped.angle) * 20, Math.sin(ped.angle) * 20);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function paintCarShape(state, car, ox, oy, highlight) {
    ctx.save();
    ctx.translate(car.x + ox, car.y + oy);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 30, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = car.kind === 'wreck' ? '#3a3a3a' : car.color;
    ctx.beginPath();
    ctx.roundRect(-27, -14, 54, 28, 7);
    ctx.fill();
    ctx.strokeStyle = highlight ? '#ffffff' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = highlight ? 3 : 2;
    ctx.stroke();
    if (car.kind !== 'wreck') {
      ctx.fillStyle = '#1c2733';
      ctx.beginPath();
      ctx.roundRect(-8, -11, 16, 22, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-6, -11, 12, 3);
      ctx.fillStyle = '#fff8c4';
      ctx.fillRect(24, -10, 3, 5);
      ctx.fillRect(24, 5, 3, 5);
      ctx.fillStyle = '#d93a3a';
      ctx.fillRect(-27, -10, 3, 5);
      ctx.fillRect(-27, 5, 3, 5);
    }
    if (car.kind === 'police') {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-6, -14, 12, 28);
      const flash = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
      ctx.beginPath();
      ctx.arc(-2, -8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
      ctx.beginPath();
      ctx.arc(-2, 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.kind === 'sports') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-27, -2, 54, 4);
    }
    ctx.restore();
  }

  function paintCars(state, ox, oy) {
    const playerCarId = state.player.carId;
    for (const car of state.cars) {
      paintCarShape(state, car, ox, oy, car.id === playerCarId);
      if (car.health < 45 && car.kind !== 'wreck') {
        ctx.fillStyle = 'rgba(60,60,60,0.5)';
        ctx.beginPath();
        ctx.arc(car.x + ox + (Math.random() - 0.5) * 8, car.y + oy - 12, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function paintBullets(state, ox, oy) {
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02 + ox, b.y - b.vy * 0.02 + oy);
      ctx.lineTo(b.x + ox, b.y + oy);
      ctx.stroke();
    }
  }

  function paintParticles(state, ox, oy) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x + ox, pt.y + oy, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function paintPlayer(state, ox, oy) {
    const p = state.player;
    if (!p.onFoot) return;
    ctx.save();
    ctx.translate(p.x + ox, p.y + oy);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b6e63';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3, 6, 0, Math.PI * 2);
    ctx.fill();
    // Gun barrel when aiming.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.angle) * 10, Math.sin(p.angle) * 10);
    ctx.lineTo(Math.cos(p.angle) * 24, Math.sin(p.angle) * 24);
    ctx.stroke();
    ctx.restore();
  }

  // ---- HUD --------------------------------------------------------------------
  function meter(x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, frac))), h);
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 5, y + h / 2 + 0.5);
    }
  }

  function paintHud(state, view) {
    const p = state.player;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left: health, armor, cash.
    ctx.fillStyle = 'rgba(16,16,20,0.55)';
    ctx.beginPath();
    ctx.roundRect(14, 12, 250, 84, 10);
    ctx.fill();
    meter(24, 24, 200, 14, p.health / 100, '#39d353', 'HP');
    meter(24, 44, 200, 14, p.armor / 50, '#4aa8ff', 'ARMOR');
    ctx.fillStyle = '#7CFC66';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 24, 88);
    // Top-right: wanted stars.
    ctx.fillStyle = 'rgba(16,16,20,0.55)';
    ctx.beginPath();
    ctx.roundRect(VIEW_W - 214, 12, 200, 56, 10);
    ctx.fill();
    ctx.font = '28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < p.stars ? '#ffd21f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', VIEW_W - 184 + i * 34, 48);
    }
    if (p.stars > 0 && state.bustTimer > 0) {
      meter(VIEW_W - 204, 58, 180, 6, state.bustTimer / 1.4, '#ff5d5d');
    }
    // Bottom-left: controls.
    if (!view.hintsHidden) {
      ctx.fillStyle = 'rgba(16,16,20,0.55)';
      ctx.beginPath();
      ctx.roundRect(14, VIEW_H - 64, 430, 50, 10);
      ctx.fill();
      ctx.fillStyle = '#e8e8e8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(p.onFoot ? 'WASD move · SHIFT run · MOUSE aim · CLICK shoot · E enter car' : 'WASD drive · SPACE handbrake · E leave car', 24, VIEW_H - 44);
      ctx.fillText('P pause · M mute · H hide HUD hints · ENTER start mission', 24, VIEW_H - 26);
    }
    // Speed, bottom-centre: number plus the car's health.
    if (!p.onFoot) {
      const car = state.cars.find((c) => c.id === p.carId);
      const mph = Math.round(Math.abs(car ? car.speed : 0) * 0.12);
      ctx.fillStyle = 'rgba(16,16,20,0.55)';
      ctx.beginPath();
      ctx.roundRect(VIEW_W / 2 - 113, VIEW_H - 64, 226, 50, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${mph} mph`, VIEW_W / 2 + 99, VIEW_H - 30);
      if (car) meter(VIEW_W / 2 - 103, VIEW_H - 56, 120, 8, car.health / VEHICLE.health, '#ff8c42');
    }
  }

  function paintMinimap(state) {
    if (mapCache === null || mapSeed !== state.seed) buildMinimap(state);
    const x = VIEW_W - MAP_SIZE - 14;
    const y = VIEW_H - MAP_SIZE - 14;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, MAP_SIZE + 6, MAP_SIZE + 6, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x, y, MAP_SIZE, MAP_SIZE);
    ctx.clip();
    ctx.drawImage(mapCache, x, y);
    const s = MAP_SIZE / CITY.size;
    const dot = (wx, wy, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + wx * s, y + wy * s, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of state.cars) {
      if (car.kind === 'police') dot(car.x, car.y, '#2d6bff', 4);
      else if (car.kind === 'traffic') dot(car.x, car.y, 'rgba(255,255,255,0.55)', 2.5);
    }
    const t = missionTarget(state);
    if (t) {
      ctx.fillStyle = '#ffd21f';
      ctx.save();
      ctx.translate(x + t.x * s, y + t.y * s);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    for (const ped of state.peds) {
      if (ped.kind === 'rival') dot(ped.x, ped.y, '#ff2d2d', 3);
    }
    // Player: a white triangle pointing where they face.
    const p = state.player;
    ctx.save();
    ctx.translate(x + p.x * s, y + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function paintObjective(state, view) {
    const m = state.mission;
    if (!m || !m.steps) return;
    if (state.missionFailed) {
      ctx.fillStyle = 'rgba(120,0,0,0.8)';
      ctx.beginPath();
      ctx.roundRect((VIEW_W - 420) / 2, VIEW_H / 2 - 60, 420, 80, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MISSION FAILED', VIEW_W / 2, VIEW_H / 2 - 28);
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText('Press ENTER to try the job again', VIEW_W / 2, VIEW_H / 2 + 2);
      ctx.textAlign = 'left';
      return;
    }
    if (m.steps.length === 0) return;
    const step = m.steps[state.missionStep];
    if (!step) return;
    let text = step.text;
    if (step.kind === 'eliminate') {
      const kills = state.missionState.kills ?? 0;
      text = `Clear the Vipers off the south pier (${kills}/${step.count})`;
    } else if (step.kind === 'rob') {
      const robbed = (state.missionState.robbed ?? [false, false, false]).filter(Boolean).length;
      text = `Rob the three marked stores (${robbed}/3)`;
    } else if (step.kind === 'steal') {
      const left = Math.ceil(state.missionState.timeLeft ?? step.timeLimit);
      text = `${step.text} — ${left}s left`;
    }
    ctx.fillStyle = 'rgba(16,16,20,0.7)';
    ctx.font = 'bold 17px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 36;
    ctx.beginPath();
    ctx.roundRect((VIEW_W - w) / 2, 14, w, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#ffd21f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, VIEW_W / 2, 33);
    ctx.textBaseline = 'alphabetic';
    if (view.briefing && view.briefingUntil > state.time) {
      ctx.fillStyle = 'rgba(16,16,20,0.82)';
      const lines = view.briefing;
      const bw = 620;
      const bh = 30 + lines.length * 24;
      ctx.beginPath();
      ctx.roundRect((VIEW_W - bw) / 2, 64, bw, bh, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.title, VIEW_W / 2, 88);
      ctx.font = '15px system-ui, sans-serif';
      lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 112 + i * 24));
      ctx.textAlign = 'left';
    }
  }

  function paintFlash(text) {
    ctx.fillStyle = 'rgba(16,16,20,0.75)';
    ctx.font = 'bold 34px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 60;
    ctx.beginPath();
    ctx.roundRect((VIEW_W - w) / 2, VIEW_H / 2 - 110, w, 64, 12);
    ctx.fill();
    ctx.fillStyle = '#ffd21f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, VIEW_W / 2, VIEW_H / 2 - 77);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  function paintTitle(state, view) {
    ctx.fillStyle = 'rgba(10,10,24,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillText('SOLANO HEAT', VIEW_W / 2, 210);
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('An open-world crime story in Solano Bay', VIEW_W / 2, 258);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#ffd9a8';
    ctx.fillText('Five jobs. One wheelman. The whole bay watching.', VIEW_W / 2, 292);
    ctx.fillStyle = 'rgba(16,16,20,0.7)';
    ctx.beginPath();
    ctx.roundRect(VIEW_W / 2 - 300, 330, 600, 150, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('ENTER — New game', VIEW_W / 2, 372);
    if (view.hasSave) {
      ctx.fillText('C — Continue saved game', VIEW_W / 2, 408);
    }
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#cfcfcf';
    ctx.fillText('WASD move / drive · E enter & steal cars · MOUSE aim, CLICK shoot', VIEW_W / 2, 444);
    ctx.fillText('Missions, wanted stars, police chases — P pause · M mute', VIEW_W / 2, 468);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#9a9a9a';
    ctx.fillText('An original game. No Rockstar Games content. Plays offline, no network.', VIEW_W / 2, 640);
    ctx.textAlign = 'left';
  }

  function paintPaused() {
    ctx.fillStyle = 'rgba(10,10,24,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 330);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('P — resume · M — mute · R — restart from the title screen', VIEW_W / 2, 380);
    ctx.textAlign = 'left';
  }

  function paintOver(state) {
    ctx.fillStyle = state.overKind === 'busted' ? 'rgba(10,20,60,0.65)' : 'rgba(60,0,0,0.65)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.overKind === 'busted' ? '#7db4ff' : '#ff5d5d';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.fillText(state.overKind === 'busted' ? 'BUSTED' : 'WASTED', VIEW_W / 2, 320);
    ctx.fillStyle = '#fff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(state.overKind === 'busted'
      ? 'The Solano Bay PD caught up with Mara.'
      : 'Mara went down in the streets of Solano Bay.', VIEW_W / 2, 370);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(`Cash kept: $${state.player.cash.toLocaleString('en-US')} · Jobs done: ${state.missionIndex} of 5`, VIEW_W / 2, 410);
    ctx.fillText('ENTER — try again', VIEW_W / 2, 460);
    ctx.textAlign = 'left';
  }

  return { draw, viewSize: { w: VIEW_W, h: VIEW_H } };
}
