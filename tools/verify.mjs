// SOLANO HEAT re-author verification: boots the game in headless Chromium,
// plays it for real (walk, drive, shoot, steal, missions, wanted, busted,
// wasted), checks zero page errors, and stages the four screenshots.
// Usage: node tools/verify.mjs [shots|playtest|all]  (run from the entry root)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire('/home/hatch/workspace/makefun/shot-tools/package.json');
const { chromium } = require('playwright');

const ENTRY = '/home/hatch/workspace/makefun/gta6-01-entry';
const PORT = 8901;
const BASE = `http://127.0.0.1:${PORT}`;
const mode = process.argv[2] ?? 'all';

const results = [];
function check(name, pass, evidence) {
  results.push({ name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${evidence}`);
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ENTRY, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const ev = (fn, ...args) => page.evaluate(fn, ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startGame() {
  await page.goto(`${BASE}/index.html?seed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await sleep(300);
  await page.keyboard.press('Enter');
  await sleep(400);
}

try {
  // ---- boot + title ------------------------------------------------------
  await page.goto(`${BASE}/index.html?seed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game, null, { timeout: 10000 });
  const boot = await ev(() => {
    const s = window.__game.state;
    return {
      screen: window.__game.screen,
      cars: s.cars.length,
      traffic: s.cars.filter((c) => c.kind === 'traffic').length,
      parked: s.cars.filter((c) => c.kind === 'parked').length,
      sports: s.cars.filter((c) => c.kind === 'sports').length,
      peds: s.peds.length,
      pickups: s.pickups.length,
      buildings: s.city.buildings.length,
      mission: s.mission?.id,
    };
  });
  check('boot-title', boot.screen === 'title' && boot.cars >= 20 && boot.peds === 26 && boot.pickups === 10,
    `screen=${boot.screen} cars=${boot.cars} (traffic ${boot.traffic}, parked ${boot.parked}, sports ${boot.sports}) peds=${boot.peds} pickups=${boot.pickups} buildings=${boot.buildings} mission=${boot.mission}`);

  if (mode === 'all' || mode === 'playtest') {
    // ---- walk ------------------------------------------------------------
    await startGame();
    const before = await ev(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y, screen: window.__game.screen }));
    await page.keyboard.down('KeyD');
    await sleep(700);
    await page.keyboard.up('KeyD');
    const after = await ev(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
    check('walk', before.screen === 'play' && after.x - before.x > 80,
      `moved ${Math.round(after.x - before.x)}px east in 0.7s`);

    // ---- drive: jack the nearest parked car ------------------------------
    const parked = await ev(() => {
      const s = window.__game.state;
      const p = s.player;
      let best = null; let bd = Infinity;
      for (const c of s.cars) {
        if (c.kind !== 'parked') continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) { bd = d; best = c; }
      }
      return { x: best.x, y: best.y, d: Math.round(bd) };
    });
    await ev((pt) => window.__game.debug.teleport(pt.x + 30, pt.y), parked);
    await sleep(200);
    await page.keyboard.press('KeyE');
    await sleep(300);
    const inCar = await ev(() => ({ onFoot: window.__game.state.player.onFoot, carId: window.__game.state.player.carId }));
    await page.keyboard.down('KeyW');
    await sleep(1200);
    await page.keyboard.up('KeyW');
    const drove = await ev(() => {
      const p = window.__game.state.player;
      const car = window.__game.state.cars.find((c) => c.id === p.carId);
      return { speed: Math.round(Math.abs(car?.speed ?? 0)), x: Math.round(p.x), y: Math.round(p.y) };
    });
    check('drive', inCar.onFoot === false && drove.speed > 100,
      `entered car id=${inCar.carId}, speed after 1.2s W = ${drove.speed}px/s at (${drove.x},${drove.y})`);
    // Leave the car again.
    await page.keyboard.press('KeyE');
    await sleep(300);
    const left = await ev(() => window.__game.state.player.onFoot);
    check('exit-car', left === true, 'pressed E, back on foot');

    // ---- shoot: from an open road, so bullets fly instead of dying on the
    // nearest wall ---------------------------------------------------------
    await ev(() => {
      const s = window.__game.state;
      // Crossroads (3,3): open in all four directions.
      window.__game.debug.teleport(1360, 1360);
    });
    await sleep(300);
    const aim = await ev(() => {
      const p = window.__game.state.player;
      const camX = Math.max(600, Math.min(3200 - 600, p.x));
      const camY = Math.max(320, Math.min(3200 - 320, p.y));
      return { sx: 640 + (p.x + 200 - camX), sy: 360 + (p.y - camY) };
    });
    // Sweep the aim around the player while firing: a fixed aim can point
    // straight into a building and every bullet dies within a step.
    await page.mouse.down();
    let maxBullets = 0;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      await page.mouse.move(aim.sx + Math.cos(a) * 120, aim.sy + Math.sin(a) * 120);
      await sleep(120);
      maxBullets = Math.max(maxBullets, await ev(() => window.__game.state.bullets.length));
    }
    await page.mouse.up();
    check('shoot', maxBullets > 0, `max ${maxBullets} live bullets seen while sweeping aim and holding click`);

    // ---- wanted + police chase -------------------------------------------
    await ev(() => window.__game.debug.setStars(3));
    await sleep(2500);
    const chase = await ev(() => {
      const s = window.__game.state;
      const cops = s.cars.filter((c) => c.kind === 'police');
      const d = cops.length ? Math.min(...cops.map((c) => Math.hypot(c.x - s.player.x, c.y - s.player.y))) : -1;
      return { stars: s.player.stars, cops: cops.length, nearest: Math.round(d) };
    });
    check('wanted-chase', chase.stars === 3 && chase.cops >= 2,
      `stars=${chase.stars}, ${chase.cops} police spawned, nearest ${chase.nearest}px`);

    // ---- mission 1: docks pickup -> garage -------------------------------
    await ev(() => window.__game.debug.startMission(0));
    const docks = await ev(() => window.__game.state.city.spots.docks);
    await ev((pt) => window.__game.debug.teleport(pt.x, pt.y), docks);
    await sleep(600);
    const garage = await ev(() => window.__game.state.city.spots.garage);
    await ev((pt) => window.__game.debug.teleport(pt.x, pt.y), garage);
    await sleep(600);
    const m1 = await ev(() => ({
      idx: window.__game.state.missionIndex, cash: window.__game.state.player.cash,
      mission: window.__game.state.mission?.id,
    }));
    check('mission-1', m1.idx === 1 && m1.cash >= 500, `missionIndex=${m1.idx}, cash=$${m1.cash}, next=${m1.mission}`);

    // ---- mission 2: steal the Comet GT ------------------------------------
    const sc = await ev(() => window.__game.state.city.spots.sportsCar);
    await ev((pt) => window.__game.debug.teleport(pt.x + 30, pt.y), sc);
    await sleep(200);
    await page.keyboard.press('KeyE');
    await sleep(300);
    const stole = await ev(() => {
      const p = window.__game.state.player;
      const car = window.__game.state.cars.find((c) => c.id === p.carId);
      return { kind: car?.kind, onFoot: p.onFoot };
    });
    await ev((pt) => window.__game.debug.teleport(pt.x, pt.y), garage);
    await sleep(600);
    const m2 = await ev(() => ({ idx: window.__game.state.missionIndex, cash: window.__game.state.player.cash }));
    check('mission-2', stole.kind === 'sports' && m2.idx === 2, `stole kind=${stole.kind}, missionIndex=${m2.idx}, cash=$${m2.cash}`);

    // ---- mission 3: evade (clear heat -> advances) ------------------------
    await ev(() => window.__game.debug.startMission(2));
    await sleep(300);
    const m3a = await ev(() => window.__game.state.player.stars);
    await ev(() => window.__game.debug.setStars(0));
    await sleep(800);
    const m3 = await ev(() => window.__game.state.missionIndex);
    check('mission-3', m3a === 3 && m3 === 3, `started at ${m3a} stars, dropped to 0, missionIndex=${m3}`);

    // ---- mission 4: pier shootout (on foot — leave the car first).
    // Mission 3's completion already started job 4, so do NOT start it
    // again or the pier fields two gangs.
    await page.keyboard.press('KeyE');
    await sleep(300);
    const onFoot4 = await ev(() => window.__game.state.player.onFoot);
    const rivals = await ev(() => window.__game.state.peds.filter((x) => x.kind === 'rival').length);
    const pier = await ev(() => window.__game.state.city.spots.pier);
    await ev((pt) => {
      const s = window.__game.state;
      s.player.health = 100; s.player.armor = 50;
      window.__game.debug.teleport(pt.x - 260, pt.y - 60);
    }, pier);
    let kills = 0;
    let peakKills = 0;
    let dead = false;
    // Fight each rival up close: at 60px a bullet's flight is instant, the
    // rival stands its ground to shoot, and tracking aim cannot lag behind.
    for (let target = 0; target < 4 && !dead; target += 1) {
      const spot = await ev(() => {
        const s = window.__game.state;
        let best = null; let bd = Infinity;
        for (const ped of s.peds) {
          if (ped.kind !== 'rival') continue;
          const d = Math.hypot(ped.x - s.player.x, ped.y - s.player.y);
          if (d < bd) { bd = d; best = ped; }
        }
        if (!best) return null;
        return { x: best.x + 60, y: best.y };
      });
      if (!spot) break;
      await ev((pt) => {
        const s = window.__game.state;
        s.player.health = 100; s.player.armor = 50;
        // Firing draws heat (+4 a shot), which would bring a cop ram into
        // the middle of the duel: clear it, this tests the eliminate step.
        window.__game.debug.setStars(0);
        window.__game.debug.teleport(pt.x, pt.y);
      }, spot);
      await sleep(200);
      const before = await ev(() => window.__game.state.missionState.kills ?? 0);
      // Track-aim and fire until this rival drops (up to 4s).
      const started = Date.now();
      await page.mouse.down();
      while (Date.now() - started < 4000) {
        const tgt = await ev(() => {
          const s = window.__game.state;
          if (s.over) return null;
          let best = null; let bd = Infinity;
          for (const ped of s.peds) {
            if (ped.kind !== 'rival') continue;
            const d = Math.hypot(ped.x - s.player.x, ped.y - s.player.y);
            if (d < bd) { bd = d; best = ped; }
          }
          if (!best) return null;
          const p = s.player;
          const camX = Math.max(600, Math.min(3200 - 600, p.x));
          const camY = Math.max(320, Math.min(3200 - 320, p.y));
          return { sx: 640 + (best.x - camX), sy: 360 + (best.y - camY) };
        });
        if (!tgt) break;
        await page.mouse.move(tgt.sx, tgt.sy);
        await sleep(90);
        const now = await ev(() => ({ kills: window.__game.state.missionState.kills ?? 0, idx: window.__game.state.missionIndex, over: window.__game.state.over }));
        if (now.kills > before || now.idx === 4 || now.over) { kills = now.kills; dead = now.over; break; }
      }
      await page.mouse.up();
      const st = await ev(() => ({ kills: window.__game.state.missionState.kills ?? 0, over: window.__game.state.over, idx: window.__game.state.missionIndex }));
      peakKills = Math.max(peakKills, st.kills);
      dead = st.over;
      console.log(`  shootout target ${target}: kills=${st.kills} idx=${st.idx} over=${dead}`);
      if (st.idx === 4) break;
    }
    const m4 = await ev(() => window.__game.state.missionIndex);
    // The kill counter resets the instant the job completes, so the 4th kill
    // is never sampled — the advance to index 4 is itself proof of 4 kills.
    check('mission-4', onFoot4 === true && rivals === 4 && peakKills >= 3 && m4 === 4,
      `onFoot=${onFoot4}, rivals spawned=${rivals}, sampled kills=${peakKills} (4th implied by advance), missionIndex=${m4}, over=${dead}`);

    // ---- mission 5: rob three stores (job 5 auto-started on job 4's end) --
    const m5id = await ev(() => window.__game.state.mission?.id);
    const stores = await ev(() => window.__game.state.city.spots.stores);
    for (const store of stores) {
      await ev((pt) => {
        const s = window.__game.state;
        s.player.health = 100; s.player.armor = 50;
        window.__game.debug.teleport(pt.x, pt.y);
      }, store);
      await sleep(3600);
    }
    const safe = await ev(() => window.__game.state.city.spots.safehouse);
    await ev((pt) => window.__game.debug.teleport(pt.x, pt.y), safe);
    await sleep(800);
    const m5 = await ev(() => ({
      idx: window.__game.state.missionIndex, mission: window.__game.state.mission?.id,
      cash: window.__game.state.player.cash,
    }));
    check('mission-5', m5id === 'big-score' && (m5.mission === 'done' || m5.idx === 5), `started=${m5id}, mission=${m5.mission}, index=${m5.idx}, cash=$${m5.cash}`);

    // ---- save exists --------------------------------------------------------
    const save = await ev(() => window.localStorage.getItem('solano-heat-save-v1'));
    check('save', save !== null && JSON.parse(save).cash >= 500, `localStorage save present, cash=$${save ? JSON.parse(save).cash : '?'}`);

    // ---- pause --------------------------------------------------------------
    await page.keyboard.press('KeyP');
    await sleep(200);
    const paused = await ev(() => window.__game.screen);
    await page.keyboard.press('KeyP');
    await sleep(200);
    check('pause', paused === 'paused', `screen after P = ${paused}`);

    // ---- busted ---------------------------------------------------------------
    await page.goto(`${BASE}/index.html?seed=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game);
    await page.keyboard.press('Enter');
    await sleep(400);
    await ev(() => window.__game.debug.setStars(1));
    await ev(() => window.__game.world.spawnPolice(1));
    await sleep(300);
    // Pin a cop on top of the player: re-snap it every 100 ms so it cannot
    // drive past and the bust timer accumulates.
    for (let i = 0; i < 25; i += 1) {
      await ev(() => {
        const s = window.__game.state;
        const cop = s.cars.find((c) => c.kind === 'police');
        if (cop) { cop.x = s.player.x; cop.y = s.player.y; cop.speed = 0; }
      });
      await sleep(100);
      const done = await ev(() => window.__game.state.over);
      if (done) break;
    }
    const bust = await ev(() => ({ over: window.__game.state.over, kind: window.__game.state.overKind, screen: window.__game.screen }));
    check('busted', bust.over === true && bust.kind === 'busted' && bust.screen === 'over',
      `over=${bust.over} kind=${bust.kind} screen=${bust.screen}`);

    // ---- wasted ---------------------------------------------------------------
    await page.goto(`${BASE}/index.html?seed=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game);
    await page.keyboard.press('Enter');
    await sleep(400);
    await ev(() => {
      const s = window.__game.state;
      s.player.health = 5; s.player.armor = 0;
      window.__game.debug.setStars(1);
      window.__game.world.spawnPolice(1);
    });
    await sleep(300);
    for (let i = 0; i < 40; i += 1) {
      await ev(() => {
        const s = window.__game.state;
        const cop = s.cars.find((c) => c.kind === 'police');
        if (cop) { cop.x = s.player.x; cop.y = s.player.y; cop.speed = 300; }
      });
      await sleep(100);
      const done = await ev(() => window.__game.state.over);
      if (done) break;
    }
    const waste = await ev(() => ({ over: window.__game.state.over, kind: window.__game.state.overKind, screen: window.__game.screen }));
    check('wasted', waste.over === true && waste.kind === 'wasted' && waste.screen === 'over',
      `over=${waste.over} kind=${waste.kind} screen=${waste.screen}`);
  }

  // ---- screenshots ---------------------------------------------------------
  if (mode === 'all' || mode === 'shots') {
    const shots = JSON.parse(readFileSync(join(ENTRY, 'shots.json'), 'utf8'));
    mkdirSync(join(ENTRY, 'screenshots'), { recursive: true });
    for (const shot of shots) {
      await page.goto(`${BASE}/index.html${shot.query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
      await sleep(200);
      const path = join(ENTRY, 'screenshots', shot.name);
      await page.screenshot({ path, type: 'jpeg', quality: 85 });
      const bytes = statSync(path).size;
      const dims = await ev(() => ({ w: window.innerWidth, h: window.innerHeight }));
      check(`shot-${shot.name}`, bytes <= 262144 && bytes > 10000, `${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB), viewport ${dims.w}x${dims.h}`);
    }
  }

  check('zero-page-errors', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : 'no pageerror/console errors across all pages');
} catch (e) {
  console.log('HARNESS ERROR:', e.message);
  results.push({ name: 'harness', pass: false, evidence: e.message });
} finally {
  await browser.close();
  server.kill();
}

const fails = results.filter((r) => !r.pass).length;
console.log(fails === 0 ? `VERIFY: ${results.length}/${results.length} PASS` : `VERIFY: ${results.length - fails}/${results.length} PASS, ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
