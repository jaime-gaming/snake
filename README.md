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

Mando: d-pad y sticks para girar, A para turbo, start para pausar. En el duelo, el segundo mando controla al rival.

## modos

- **campaña** — 12 niveles con muros dibujados a mano. se desbloquean al superarlos y el récord de cada uno se guarda.
- **clásico** — muros, sin fin. cada fruta acelera.
- **frenesí** — bordes abiertos y aceleración continua.
- **portales** — dos aros que se recolocan cada pocas frutas. entras por uno y sales por el otro.
- **cazador** — una X te persigue por el laberinto y gana terreno. desaparece cada pocas frutas y vuelve a aparecer lejos.
- **duelo** — dos serpientes en el mismo tablero: jugador 1 con flechas, jugador 2 con WASD. el marcador de duelos se guarda.

## piezas

- **cadena** — dos frutas seguidas suben el multiplicador hasta ×5. la barra de abajo es el tiempo que te queda para encadenar.
- **rombo** — aparece cada pocas frutas, caduca y da dos anillos de largo.
- **poderes** — círculo discontinuo: fantasma, atraviesas muros, bordes y cazador durante cinco segundos. dos barras: lento, todo va más despacio. cuadrado: recorte, pierdes anillos y ganas puntos.
- **turbo** — 0,62 del intervalo mientras lo mantengas.

## archivos

```
index.html          marcado, hud y capa de menús
styles.css          todo el estilo
js/engine.js        motor de un jugador: rejilla, colisiones, poderes, dibujo
js/duel.js          motor del duelo a dos
js/grid.js          bfs y utilidades de rejilla (lo usan el cazador y el piloto automático)
js/levels.js        modos y los 12 niveles
js/audio.js         sonido con osciladores, sin ficheros
js/input.js         teclado, gestos y mando
js/main.js          pantallas, progreso y bucle
```

`Game` y `Duel` no tocan el DOM: se pueden instanciar y avanzar desde Node para probar equilibrio o validar niveles. En el navegador, `index.html#debug` deja un `window.__snake` para trastear.

## local

```sh
python3 -m http.server 8000
```

Abre `localhost:8000`. Con doble clic en `index.html` también va en la mayoría de navegadores, pero algunos bloquean los módulos ES desde `file://`.

## publicar

Hay un workflow en `.github/workflows/pages.yml`. En el repositorio: Settings → Pages → Source: GitHub Actions, y luego push a `main`. Queda en `https://<usuario>.github.io/snake/`.
