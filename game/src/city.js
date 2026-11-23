// Solano Bay: a seeded road grid, blocks of buildings, parks, a beach and the
// ocean along the south edge, plus the landmarks the story uses. One seed
// always builds the same city, so screenshots and saves agree about it.
import { CITY, PALETTE } from './config.js';
import { clamp } from './util.js';

export function roadAt(i) {
  return CITY.firstRoad + i * CITY.pitch;
}

// The point where avenue i meets street j.
export function crossroads(i, j) {
  return { x: roadAt(i), y: roadAt(j) };
}

// Which road index a coordinate is nearest to, clamped to the grid.
export function roadIndex(v) {
  return clamp(Math.round((v - CITY.firstRoad) / CITY.pitch), 0, CITY.grid - 1);
}

// The next road waypoint on a Manhattan route from (fx, fy) to (tx, ty):
// drive along the current street to the target's avenue, then up the avenue.
// Cars, police and the screenshot autopilot all drive roads, never through
// buildings, because they all route through this one function.
export function manhattanWaypoint(fx, fy, tx, ty) {
  const itx = roadIndex(tx);
  const ity = roadIndex(ty);
  const icx = roadIndex(fx);
  const icy = roadIndex(fy);
  if (icx !== itx) return { x: roadAt(itx), y: roadAt(icy) };
  return { x: roadAt(itx), y: roadAt(ity) };
}

export function buildCity(random) {
  const buildings = [];
  const palms = [];
  const parks = [];
  const blocks = [];
  const half = CITY.roadHalf;

  // Blocks sit between neighbouring roads. Each block holds one to four
  // buildings, or becomes a park. The southernmost row is beach, not blocks.
  for (let bx = 0; bx < CITY.grid - 1; bx += 1) {
    for (let by = 0; by < CITY.grid - 1; by += 1) {
      const x0 = roadAt(bx) + half + 14;
      const y0 = roadAt(by) + half + 14;
      const x1 = roadAt(bx + 1) - half - 14;
      const y1 = roadAt(by + 1) - half - 14;
      const block = { x0, y0, x1, y1, bx, by };
      blocks.push(block);
      if (by === CITY.grid - 2) continue; // beach row: sand and palms only
      if (random.next() < 0.16) {
        parks.push(block);
        for (let p = 0; p < 7; p += 1) {
          palms.push({
            x: random.range(x0 + 20, x1 - 20),
            y: random.range(y0 + 20, y1 - 20),
            r: random.range(9, 13),
          });
        }
        continue;
      }
      const cols = random.chance(0.5) ? 1 : 2;
      const rows = random.chance(0.5) ? 1 : 2;
      const cw = (x1 - x0) / cols;
      const ch = (y1 - y0) / rows;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const w = cw * random.range(0.62, 0.82);
          const h = ch * random.range(0.62, 0.82);
          buildings.push({
            x: x0 + cx * cw + (cw - w) / 2,
            y: y0 + cy * ch + (ch - h) / 2,
            w,
            h,
            color: random.pick(PALETTE.roofs),
            // Fake height: taller buildings cast a longer offset shadow.
            height: random.int(1, 4),
            windows: {
              cols: Math.max(2, Math.floor(w / 34)),
              rows: Math.max(2, Math.floor(h / 34)),
            },
          });
        }
      }
    }
  }

  // Palms along the beach and a few on the sidewalks.
  for (let i = 0; i < 26; i += 1) {
    palms.push({
      x: random.range(60, CITY.size - 60),
      y: random.range(roadAt(CITY.grid - 2) + half + 26, CITY.size - 130),
      r: random.range(9, 13),
    });
  }
  for (let i = 0; i < 18; i += 1) {
    const along = random.int(0, 5);
    const across = random.int(0, 6);
    const side = random.chance(0.5) ? -half - 8 : half + 8;
    palms.push({
      x: roadAt(along) + side,
      y: roadAt(across) + random.range(-140, 140),
      r: random.range(8, 12),
    });
  }

  // Landmarks the story and the missions use. All on roads, never inside a
  // building, so every objective is reachable on foot or by car.
  const garage = crossroads(3, 4); // Dante's garage, mid-city
  const docks = { x: roadAt(0) - 40, y: roadAt(1) }; // west edge container yard
  const pier = { x: roadAt(4), y: CITY.size - 190 }; // south beach pier
  const safehouse = crossroads(6, 5);
  const stores = [crossroads(1, 2), crossroads(5, 1), crossroads(2, 5)];
  const sportsCar = { x: roadAt(5) + 30, y: roadAt(2) + 20 };
  const spawn = { x: garage.x, y: garage.y + 90 };

  return {
    buildings,
    palms,
    parks,
    blocks,
    spots: { garage, docks, pier, safehouse, stores, sportsCar, spawn },
    beachY: roadAt(CITY.grid - 2) + half + 10,
    waterY: CITY.size - 110,
  };
}

// True when the point (x, y) is inside any building (bullets use this).
export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

// The building a circle of radius r at (x, y) overlaps, or null.
export function buildingAt(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

// Push a circular body out of every building it overlaps; true when it hit one.
export function pushOutOfBuildings(city, body, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(body.x, b.x, b.x + b.w);
    const cy = clamp(body.y, b.y, b.y + b.h);
    let dx = body.x - cx;
    let dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 === 0) {
      // Centre inside the building: leave along the shallowest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - r;
      else if (m === right) body.x = b.x + b.w + r;
      else if (m === top) body.y = b.y - r;
      else body.y = b.y + b.h + r;
      continue;
    }
    const d = Math.sqrt(d2);
    dx /= d;
    dy /= d;
    body.x = cx + dx * r;
    body.y = cy + dy * r;
  }
  return hit;
}

// Keep a body inside the drivable city. The water is a wall.
export function clampInside(body, r) {
  body.x = clamp(body.x, r, CITY.size - r);
  body.y = clamp(body.y, r, CITY.size - 116 - r);
}
