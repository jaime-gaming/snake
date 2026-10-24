# snake

Snake de rejilla, en blanco y negro y sin adornos. HTML, CSS y JavaScript a pelo: no hay dependencias, ni build, ni peticiones de red.

## cómo se juega

| | teclado | táctil |
| --- | --- | --- |
| girar | flechas o WASD | desliza |
| turbo | espacio o mayús | toca el tablero |
| pausa | P o esc | botón pausa |
| reiniciar | R | botón |
| sonido | M | botón sonido |

Mando: d-pad y sticks para girar, A para turbo, start para pausar.

## modos

- **campaña** — 12 niveles con muros dibujados a mano. se desbloquean al superarlos y el récord de cada uno se guarda.
- **clásico** — muros, sin fin. cada fruta acelera.
- **frenesí** — bordes abiertos y aceleración continua.
- **portales** — dos aros que se recolocan cada pocas frutas. entras por uno y sales por el otro.
- **cazador** — una serpiente roja te persigue por el laberinto. come puntos azules y se hace más larga: cada anillo que gana es una casilla más que te puede tapar. vuelve a nacer lejos cada vez que coges un rombo.

## piezas

- **cadena** — dos frutas seguidas suben el multiplicador hasta ×5. la barra de abajo es el tiempo que te queda para encadenar.
- **rombo** — aparece cada pocas frutas, caduca y da dos anillos de largo.
- **poderes** — círculo discontinuo: fantasma, atraviesas muros, bordes y cazador durante cinco segundos. dos barras: lento, todo va más despacio. cuadrado: recorte, pierdes anillos y ganas puntos.
- **turbo** — 0,62 del intervalo mientras lo mantengas.
- **arranque** — al empezar cada partida, la cabeza va encendiendo el tablero: una onda de luz revela casillas hasta dejar el mapa entero a la vista.

## archivos

```
index.html          marcado, hud, capa de menús y aviso de fallo de carga
styles.css          todo el estilo
snake.js            TODO el juego en un fichero (generado, es lo que carga la página)
js/                 fuentes por módulos, más cómodas de editar
  engine.js         motor: rejilla, colisiones, poderes, cazador, dibujo
  grid.js           bfs y utilidades de rejilla (cazador y piloto automático)
  levels.js         modos y los 12 niveles
  audio.js          sonido con osciladores, sin ficheros
  input.js          teclado, gestos y mando
  main.js           pantallas, progreso y bucle
tools/build.mjs     junta js/ en snake.js (sin dependencias)
tools/check.mjs     pruebas del motor y de los niveles, sin navegador
serve.mjs           servidor local sin caché
```

La página carga `snake.js` como script clásico, no como módulo. Así funciona también con doble clic en `index.html` (protocolo `file://`), donde los módulos ES están bloqueados en varios navegadores.

## editar

Se toca `js/`, nunca `snake.js`, y después:

```sh
node tools/build.mjs          # regenera snake.js
node tools/check.mjs          # valida niveles, motor y reglas
```

`node tools/build.mjs --check` comprueba que `snake.js` está al día; el workflow lo hace antes de publicar, así que si te olvidas no se despliega una versión vieja.

## local

```sh
node serve.mjs 8123           # http://localhost:8123, sin caché
```

`python3 -m http.server 8123` también sirve, pero manda cabeceras que el navegador puede cachear y te deja con la versión anterior. Si algo no cuadra tras un cambio, prueba `Ctrl+F5` o añade `?v=loquesea` a la dirección.

## si algo no arranca

La página avisa en pantalla en lugar de quedarse en negro: error de javascript con fichero y línea, fichero que no carga, o "no ha arrancado en 4 s" (casi siempre caché). El botón **recargar limpio** añade un parámetro nuevo a la dirección para saltarse la caché. La versión aparece junto al logo.

## publicar

`.github/workflows/pages.yml` comprueba el bundle, pasa los tests y publica `index.html`, `styles.css` y `snake.js`. En el repositorio: Settings → Pages → Source: GitHub Actions, y push a `main`. Queda en `https://<usuario>.github.io/snake/`.
