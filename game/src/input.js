// Keyboard and mouse input, read every frame into one plain object the world steps.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_CONTINUE = 'continue';

export function createInput(canvas, onAction) {
  const keys = new Set();
  const state = {
    up: false, down: false, left: false, right: false,
    run: false, handbrake: false, enter: false, shoot: false,
    aiming: false, aimX: 0, aimY: 0, confirm: false,
  };
  let enterQueued = false;
  let confirmQueued = false;

  function keyCode(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(keyCode(e));
    if (e.code === 'KeyE') enterQueued = true;
    if (e.code === 'Enter') confirmQueued = true;
    if (e.code === 'KeyP') onAction(ACTION_PAUSE);
    if (e.code === 'KeyM') onAction(ACTION_MUTE);
    if (e.code === 'KeyR') onAction(ACTION_RESTART);
    if (e.code === 'KeyC') onAction(ACTION_CONTINUE);
    if (e.code === 'KeyH') onAction('hide-hints');
  });
  window.addEventListener('keyup', (e) => keys.delete(keyCode(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.aimX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    state.aimY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    state.aiming = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) state.shoot = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.shoot = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Convert the raw key set into the world's input shape, in canvas coordinates.
  // `camera` maps screen space to world space for aiming.
  function read(camera) {
    const up = keys.has('KeyW') || keys.has('ArrowUp');
    const down = keys.has('KeyS') || keys.has('ArrowDown');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    state.up = up;
    state.down = down;
    state.left = left;
    state.right = right;
    state.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.handbrake = keys.has('Space');
    state.enter = enterQueued;
    state.confirm = confirmQueued;
    enterQueued = false;
    confirmQueued = false;
    if (camera && state.aiming) {
      const world = camera(state.aimX, state.aimY);
      state.aimX = world.x;
      state.aimY = world.y;
    }
    return state;
  }

  return { read, state };
}
