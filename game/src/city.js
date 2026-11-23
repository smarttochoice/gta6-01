// The city of Solano Bay: a road grid, blocks of buildings, parks, a beach and the
// ocean along the south edge, plus the landmarks the story uses. Everything is
// generated from one seed, so the same seed always builds the same city.
import { FIRST_ROAD, GRID, PALETTE, PITCH, ROAD_HALF, WORLD } from './config.js';

export function roadCenter(i) {
  return FIRST_ROAD + i * PITCH;
}

// A point on a road centreline (avenue i, street j).
export function intersection(i, j) {
  return { x: roadCenter(i), y: roadCenter(j) };
}

export function createCity(random) {
  const buildings = [];
  const palms = [];
  const parks = [];
  const blocks = [];

  // Blocks sit between neighbouring roads. Each block holds 1-4 buildings, or
  // becomes a park. The southernmost row is beach, not buildings.
  for (let bx = 0; bx < GRID - 1; bx += 1) {
    for (let by = 0; by < GRID - 1; by += 1) {
      const x0 = roadCenter(bx) + ROAD_HALF + 14;
      const y0 = roadCenter(by) + ROAD_HALF + 14;
      const x1 = roadCenter(bx + 1) - ROAD_HALF - 14;
      const y1 = roadCenter(by + 1) - ROAD_HALF - 14;
      const block = { x0, y0, x1, y1, bx, by };
      blocks.push(block);
      if (by === GRID - 2) continue; // beach row: sand and palms, no buildings
      if (random.next() < 0.16) {
        parks.push(block);
        for (let p = 0; p < 7; p += 1) {
          palms.push({ x: random.range(x0 + 20, x1 - 20), y: random.range(y0 + 20, y1 - 20), r: random.range(9, 13) });
        }
        continue;
      }
      const cols = random.next() < 0.5 ? 1 : 2;
      const rows = random.next() < 0.5 ? 1 : 2;
      const cw = (x1 - x0) / cols;
      const ch = (y1 - y0) / rows;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const w = cw * random.range(0.62, 0.82);
          const h = ch * random.range(0.62, 0.82);
          const x = x0 + cx * cw + (cw - w) / 2;
          const y = y0 + cy * ch + (ch - h) / 2;
          buildings.push({
            x, y, w, h,
            color: random.pick(PALETTE.buildingRoofs),
            // Fake height: taller buildings cast a longer offset shadow.
            height: random.int(1, 4),
            windows: { cols: Math.max(2, Math.floor(w / 34)), rows: Math.max(2, Math.floor(h / 34)) },
          });
        }
      }
    }
  }

  // Palms along the beach and a few on sidewalks.
  for (let i = 0; i < 26; i += 1) {
    palms.push({ x: random.range(60, WORLD - 60), y: random.range(roadCenter(GRID - 2) + ROAD_HALF + 26, WORLD - 130), r: random.range(9, 13) });
  }
  for (let i = 0; i < 18; i += 1) {
    const along = random.pick([0, 1, 2, 3, 4, 5]);
    const across = random.pick([0, 1, 2, 3, 4, 5, 6]);
    palms.push({
      x: roadCenter(along) + (random.next() < 0.5 ? -ROAD_HALF - 8 : ROAD_HALF + 8),
      y: roadCenter(across) + random.range(-140, 140),
      r: random.range(8, 12),
    });
  }

  // Landmarks the story and the missions use. All on roads, never inside a building.
  const garage = intersection(3, 4); // Dante's garage, mid-city
  const docks = { x: roadCenter(0) - 40, y: roadCenter(1) }; // west edge container yard
  const pier = { x: roadCenter(4), y: WORLD - 190 }; // south beach pier
  const safehouse = intersection(6, 5);
  const stores = [intersection(1, 2), intersection(5, 1), intersection(2, 5)];
  const sportsCar = { x: roadCenter(5) + 30, y: roadCenter(2) + 20 };
  const spawn = { x: garage.x, y: garage.y + 90 };

  return {
    buildings, palms, parks, blocks,
    landmarks: { garage, docks, pier, safehouse, stores, sportsCar, spawn },
    beachY: roadCenter(GRID - 2) + ROAD_HALF + 10,
    waterY: WORLD - 110,
  };
}

// True when a circle of radius r at (x, y) overlaps any building.
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps; returns true when it hit one.
export function resolveBuildings(city, body, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    let dx = body.x - cx;
    let dy = body.y - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 === 0) {
      // Centre inside the building: push out along the smallest penetration axis.
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

// Keep a point inside the drivable city (the water is a wall).
export function clampToCity(body, r) {
  body.x = Math.max(r, Math.min(WORLD - r, body.x));
  body.y = Math.max(r, Math.min(WORLD - 116 - r, body.y));
}
