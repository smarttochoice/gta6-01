// Save / continue through localStorage: cash, jobs done, position, health, armor.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(world) {
  try {
    const s = world.state;
    const p = s.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash,
      missionIndex: s.missionIndex,
      x: p.x,
      y: p.y,
      health: p.health,
      armor: p.armor,
      earned: s.stats.earned,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage can be off: the game still plays, it just does not save.
  }
}

export function applySave(world, save) {
  const s = world.state;
  const p = s.player;
  p.cash = save.cash ?? 0;
  p.health = save.health ?? 100;
  p.armor = save.armor ?? 50;
  p.x = save.x ?? p.x;
  p.y = save.y ?? p.y;
  s.stats.earned = save.earned ?? 0;
  world.startMission(Math.min(save.missionIndex ?? 0, 4));
}
