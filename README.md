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
| menús | flechas + enter | toca |

Todo lo que sale en pantalla (grupos, modos, niveles, pausa, fin, ayuda) se maneja con las **flechas** y **enter**: el botón enfocado lleva un marco de 2 px. En la rejilla de niveles `↑↓` saltan de fila.

Mando: d-pad y sticks para girar, A para turbo, start para pausar.

## modos

El menú son tres grupos y cada uno abre su propia subpágina con sus modos: `↑↓` para elegir y `←→` para cambiar de grupo.

**progreso**

- **campaña** — 20 niveles con muros dibujados a mano. se desbloquean al superarlos y el récord de cada uno se guarda.

**infinitos**

- **clásico** — sin fin. cada fruta acelera y, pasadas 30, empiezan a salir muros sueltos.
- **frenesí** — los bordes dan la vuelta y la velocidad sube sola con el reloj.
- **cazador** — la serpiente roja empieza comiendo puntos azules y **no te toca**: se mueve despacio y tu cabeza tampoco es casilla para ella. cuando llega a dos tercios de su tope (12 anillos) se pone a cazar: marco blanco en la cabeza, aviso y ritmo doble. su cuerpo no te mata; si le muerdes un anillo se lo recortas. te come sólo si su cabeza cae sobre la tuya, y antes marca con un cubo rojo fino por dónde va a cortar. **si se estrella contra tu cuerpo revienta**: estalla, está un segundo fuera y vuelve a nacer lejos por la mitad de largo, así que tu cuerpo es también un arma. se mueve interpolado entre casillas, sin saltos. los puntos azules también son para ti: si te los comes, no crece. cada cubo hueco te da una vida nueva: vuelve a nacer lejos.

**especiales**

- **ciego** — sólo ves un cuadrado de luz a tu alrededor, y se abre poco a poco según comes.

los modos que sobraban (portales, reloj y muro) se han ido: sus reglas no aportaban nada que la campaña y el clásico no dieran ya, y cada uno era una forma más de romper el juego.

## piezas

- **cadena** — dos frutas seguidas suben el multiplicador hasta ×5. la barra de abajo es el tiempo que te queda para encadenar, y comer con la barra por encima del 62% paga un extra de 5 × multiplicador. cada subida de multiplicador da un destello y marca el marcador.
- **premio** — un cubo rojo hueco aparece cada pocas frutas, caduca y da dos anillos de largo.
- **poderes** — todo son cubos: contorno discontinuo, fantasma (atraviesas muros, bordes y cazador durante cinco segundos); raya en medio, lento; cuadro relleno, recorte (pierdes anillos y ganas puntos). el fantasma no se corta de golpe: en el último segundo y medio se apaga en cuatro escalones y los cubos se van rellenando hasta volver a ser sólidos.
- **turbo** — 0,68 del intervalo mientras lo mantengas.
- **choque** — al morir la casilla del golpe queda marcada y tres marcos cuadrados se abren desde ella mientras la serpiente se deshace de la cabeza a la cola. la cifra final sube de 0 al total en medio segundo.
- **borde** — si chocar con él te mata, el borde se ve **siempre**: es una pared, no un adorno. donde hay muro va más marcado. con el fantasma puesto (o en frenesí, donde los bordes dan la vuelta y no matan) se apaga y sólo se marca al acercarte. el bloque por el que vas a salir se enciende en blanco.
- **última fruta** — en la campaña, la fruta que cierra el nivel sale amarilla con el centro negro: es el último punto de la barra de progreso.
- **arranque** — al empezar cada partida, la luz enciende el tablero por bloques, un escalón por casilla, hasta dejar el mapa entero a la vista. el borde se enciende con él, porque se dibuja dentro del tablero.
- **velocidad** — la campaña va de 155 a 106 ms por casilla y los infinitos arrancan entre 124 y 146, con suelo de 42 a 86 ms. cuesta más acelerar que antes, así que las partidas duran más.

## archivos

```
index.html          marcado, hud, capa de menús y aviso de fallo de carga
styles.css          todo el estilo
snake.js            TODO el juego en un fichero (generado, es lo que carga la página)
js/                 fuentes por módulos, más cómodas de editar
  engine.js         motor: rejilla, colisiones, poderes, cazador, dibujo
  grid.js           bfs y utilidades de rejilla (cazador y piloto automático)
  levels.js         grupos, 4 modos y los 20 niveles
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

La página avisa en pantalla en lugar de quedarse en negro: error de javascript con fichero y línea, fichero que no carga, o "no ha arrancado en 4 s" (casi siempre caché). El botón **recargar limpio** añade un parámetro nuevo a la dirección para saltarse la caché.

## publicar

`.github/workflows/pages.yml` comprueba el bundle, pasa los tests y publica `index.html`, `styles.css` y `snake.js`. En el repositorio: Settings → Pages → Source: GitHub Actions, y push a `main`. Queda en `https://<usuario>.github.io/snake/`.
