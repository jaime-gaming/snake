// teclado, gestos y mando. habla en acciones, no en teclas

const TECLAS = {
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

const BOTONES = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export function attachInput({ stage, actions }) {
  const fire = (accion) => actions(accion);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const accion = TECLAS[e.code];
    if (!accion) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    fire(accion === 'turbo' ? 'turboOn' : accion);
  });

  window.addEventListener('keyup', (e) => {
    if (TECLAS[e.code] === 'turbo') fire('turboOff');
  });

  // gestos sobre el tablero
  let x0 = 0;
  let y0 = 0;
  let activo = false;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, #overlay')) return;
    // al tocar el tablero, el foco vuelve a la página: las teclas llegan siempre
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (typeof window.focus === 'function') window.focus();
    activo = true;
    x0 = e.clientX;
    y0 = e.clientY;
  });

  stage.addEventListener('pointerup', (e) => {
    if (!activo) return;
    activo = false;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      fire('tap');
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) fire(dx > 0 ? 'right' : 'left');
    else fire(dy > 0 ? 'down' : 'up');
  });

  stage.addEventListener('pointercancel', () => {
    activo = false;
  });

  // mando: estado por frame, sin eventos
  let previo = {};
  let conectado = false;

  function leerMando() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    const actual = {};

    if (pad) {
      if (!conectado) {
        conectado = true;
        fire('padConectado');
      }
      const UMBRAL = 0.55;
      const ejeX = pad.axes[0] || 0;
      const ejeY = pad.axes[1] || 0;
      if (ejeX < -UMBRAL) actual.left = true;
      if (ejeX > UMBRAL) actual.right = true;
      if (ejeY < -UMBRAL) actual.up = true;
      if (ejeY > UMBRAL) actual.down = true;
      for (const [indice, nombre] of Object.entries(BOTONES)) {
        const boton = pad.buttons[indice];
        if (boton && (boton.pressed || boton.value > 0.5)) actual[nombre] = true;
      }
      [0, 1].forEach((n) => {
        const boton = pad.buttons[n];
        if (boton && (boton.pressed || boton.value > 0.5)) actual.turbo = true;
      });
      [3, 9].forEach((n) => {
        const boton = pad.buttons[n];
        if (boton && (boton.pressed || boton.value > 0.5)) actual.aux = true;
      });
    } else if (conectado) {
      conectado = false;
    }

    for (const nombre of ['up', 'down', 'left', 'right']) {
      if (actual[nombre] && !previo[nombre]) fire(nombre);
    }
    if (actual.turbo && !previo.turbo) fire('turboOn');
    if (!actual.turbo && previo.turbo) fire('turboOff');
    if (actual.aux && !previo.aux) fire('pause');

    previo = actual;
    requestAnimationFrame(leerMando);
  }

  if (navigator.getGamepads) requestAnimationFrame(leerMando);
}
