// Keyboard and mouse, read once a frame into one plain object the world
// steps. Keys are held in a set; edge actions (enter a car, confirm) queue
// once per press so a fixed-step loop never fires them twice.
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_CONTINUE = 'continue';
export const ACTION_HIDE_HINTS = 'hide-hints';

const HELD_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

export function createInput(canvas, onAction) {
  const held = new Set();
  const state = {
    up: false, down: false, left: false, right: false,
    run: false, handbrake: false, enter: false, shoot: false,
    aiming: false, aimX: 0, aimY: 0, confirm: false,
  };
  // The mouse position in screen pixels, kept apart from the world-space aim
  // below: converting the same pair twice would send the aim drifting across
  // the map whenever the mouse holds still.
  let aimSX = 0;
  let aimSY = 0;
  let enterQueued = false;
  let confirmQueued = false;

  window.addEventListener('keydown', (e) => {
    if (HELD_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    switch (e.code) {
      case 'KeyE': enterQueued = true; break;
      case 'Enter': confirmQueued = true; break;
      case 'KeyP': onAction(ACTION_PAUSE); break;
      case 'KeyM': onAction(ACTION_MUTE); break;
      case 'KeyR': onAction(ACTION_RESTART); break;
      case 'KeyC': onAction(ACTION_CONTINUE); break;
      case 'KeyH': onAction(ACTION_HIDE_HINTS); break;
      default: break;
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    aimSX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    aimSY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    state.aiming = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) state.shoot = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.shoot = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Fold the raw key set into the world's input shape. `toWorld` maps screen
  // pixels to world coordinates so the mouse aims where it points.
  function read(toWorld) {
    state.up = held.has('KeyW') || held.has('ArrowUp');
    state.down = held.has('KeyS') || held.has('ArrowDown');
    state.left = held.has('KeyA') || held.has('ArrowLeft');
    state.right = held.has('KeyD') || held.has('ArrowRight');
    state.run = held.has('ShiftLeft') || held.has('ShiftRight');
    state.handbrake = held.has('Space');
    state.enter = enterQueued;
    state.confirm = confirmQueued;
    enterQueued = false;
    confirmQueued = false;
    if (toWorld && state.aiming) {
      // World aim is recomputed from the stored screen position every frame,
      // never from the previous frame's world aim.
      const world = toWorld(aimSX, aimSY);
      state.aimX = world.x;
      state.aimY = world.y;
    }
    return state;
  }

  return { read, state };
}
