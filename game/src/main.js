// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between four
// screens: title, play, paused and game over.
//
// ?seed=N fixes the city. ?shot=start|chase|mission|wanted (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { applySave, readSave, writeSave } from './save.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const WORLD = 3200;
const VIEW_W = 1280;
const VIEW_H = 720;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const savedGame = readSave();

const view = {
  screen: SCREEN_TITLE,
  hasSave: Boolean(savedGame),
  briefing: null,
  briefingUntil: 0,
  flash: null,
  flashUntil: 0,
};

// The playtest harness and the shot stager read the live game through this.
window.__game = {
  world,
  state: world.state,
  view,
  debug: world.debug(),
  get screen() {
    return view.screen;
  },
};

function cameraToWorld(sx, sy) {
  const p = world.state.player;
  const camX = Math.max(VIEW_W / 2 - 40, Math.min(WORLD - VIEW_W / 2 + 40, p.x));
  const camY = Math.max(VIEW_H / 2 - 40, Math.min(WORLD - VIEW_H / 2 + 40, p.y));
  return { x: sx + camX - VIEW_W / 2, y: sy + camY - VIEW_H / 2 };
}

function announce(message) {
  status.textContent = message;
}

function startNewGame() {
  world.reset();
  view.screen = SCREEN_PLAY;
  view.briefing = world.state.mission ? world.state.mission.briefing : null;
  view.briefingUntil = world.state.time + 7;
  audio.unlock();
  announce('Playing Solano Heat. First job: pick up the package at the west docks.');
}

function continueGame() {
  if (!savedGame) return;
  world.reset();
  applySave(world, savedGame);
  view.screen = SCREEN_PLAY;
  view.briefing = world.state.mission ? world.state.mission.briefing : null;
  view.briefingUntil = world.state.time + 7;
  audio.unlock();
  announce('Continuing your saved game.');
}

function runShot(name) {
  const scene = stageShot(name, world);
  view.screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (action) => {
    if (action === 'pause' && (view.screen === SCREEN_PLAY || view.screen === SCREEN_PAUSED)) {
      view.screen = view.screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(view.screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
    }
    if (action === 'mute') {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (action === 'restart' && view.screen !== SCREEN_TITLE) {
      world.reset();
      view.screen = SCREEN_TITLE;
      view.hasSave = Boolean(readSave());
      announce('Back at the title screen.');
    }
    if (action === 'continue' && view.screen === SCREEN_TITLE && savedGame) continueGame();
  });
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const keys = input.read(cameraToWorld);
    if (view.screen === SCREEN_TITLE) {
      if (keys.confirm) startNewGame();
      world.step(dt, { up: false, down: false, left: false, right: false });
    } else if (view.screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, keys);
        accumulator -= STEP;
        // Edge-triggered actions fire once, not once per substep.
        keys.enter = false;
        keys.confirm = false;
      }
      drainEvents();
      audio.update(world.state);
      saveTimer += dt;
      if (saveTimer > 10) {
        saveTimer = 0;
        writeSave(world);
      }
      if (world.state.over) {
        view.screen = SCREEN_OVER;
        writeSave(world);
        announce(world.state.overKind === 'busted' ? 'Busted. The police caught Mara.' : 'Wasted. Mara went down.');
      }
    } else if (view.screen === SCREEN_OVER) {
      if (keys.confirm) startNewGame();
    }
    renderer.draw(world.state, view);
  }

  function drainEvents() {
    const events = world.state.events;
    if (events.length === 0) return;
    for (const event of events) {
      audio.play(event);
      if (event === 'mission') {
        const m = world.state.mission;
        if (m && m.briefing) {
          view.briefing = m.briefing;
          view.briefingUntil = world.state.time + 7;
        }
      }
      if (event === 'mission-complete') {
        view.flash = 'JOB COMPLETE';
        view.flashUntil = world.state.time + 3;
        writeSave(world);
      }
      if (event === 'mission-failed') {
        view.flash = null;
      }
    }
    events.length = 0;
  }

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
