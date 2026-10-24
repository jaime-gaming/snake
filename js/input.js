// Teclado, swipe y botón de turbo. Habla en acciones, no en teclas.

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'turbo',
  ShiftLeft: 'turbo',
  ShiftRight: 'turbo',
  Escape: 'back',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
};

export function attachInput({ stage, actions }) {
  const fire = (action) => actions(action);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    if (action === 'turbo') fire('turboOn');
    else fire(action);
  });

  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code] === 'turbo') fire('turboOff');
  });

  // swipe
  let sx = 0;
  let sy = 0;
  let track = false;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, #overlay')) return;
    track = true;
    sx = e.clientX;
    sy = e.clientY;
  });

  stage.addEventListener('pointerup', (e) => {
    if (!track) return;
    track = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      fire('tap');
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) fire(dx > 0 ? 'right' : 'left');
    else fire(dy > 0 ? 'down' : 'up');
  });

  stage.addEventListener('pointercancel', () => { track = false; });
}
