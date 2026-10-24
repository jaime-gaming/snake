// teclado, gestos y mando. habla en acciones, no en teclas

const TECLAS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up2',
  KeyS: 'down2',
  KeyA: 'left2',
  KeyD: 'right2',
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

  // mando: dos mandos, el segundo juega como WASD
  const previo = [{}, {}];
  let conectados = 0;

  function leerMando() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const lista = [pads && pads[0], pads && pads[1]];
    let cuantos = 0;

    lista.forEach((pad, indice) => {
      const sufijo = indice === 1 ? '2' : '';
      const actual = {};
      if (!pad) {
        if (previo[indice].turbo) fire('turboOff');
        previo[indice] = actual;
        return;
      }
      cuantos++;
      const UMBRAL = 0.55;
      const ejeX = pad.axes[0] || 0;
      const ejeY = pad.axes[1] || 0;
      if (ejeX < -UMBRAL) actual.left = true;
      if (ejeX > UMBRAL) actual.right = true;
      if (ejeY < -UMBRAL) actual.up = true;
      if (ejeY > UMBRAL) actual.down = true;

      for (const [indiceBoton, nombre] of Object.entries(BOTONES)) {
        const boton = pad.buttons[indiceBoton];
        if (boton && (boton.pressed || boton.value > 0.5)) actual[nombre] = true;
      }
      [0, 1].forEach((n) => {
        const boton = pad.buttons[n];
        if (boton && (boton.pressed || boton.value > 0.5)) actual.turbo = true;
      });
      for (const nombre of ['up', 'down', 'left', 'right']) {
        if (actual[nombre] && !previo[indice][nombre]) fire(nombre + sufijo);
      }
      if (indice === 0) {
        if (actual.turbo && !previo[0].turbo) fire('turboOn');
        if (!actual.turbo && previo[0].turbo) fire('turboOff');
      }

      previo[indice] = actual;
    });

    if (cuantos && !conectados) fire('padConectado');
    if (!cuantos && conectados) conectados = 0;
    if (cuantos) conectados = cuantos;

    requestAnimationFrame(leerMando);
  }

  if (navigator.getGamepads) requestAnimationFrame(leerMando);
}
