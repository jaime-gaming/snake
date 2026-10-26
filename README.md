# snake — v1.0

Snake de rejilla, en blanco y negro y sin dependencias ni peticiones de red. Se puede jugar en español o en inglés; el idioma elegido se guarda en el navegador. Compatible con GitHub Pages, teclado, controles táctiles y mando.

## Cómo se juega

| Acción | Teclado | Táctil / mando |
| --- | --- | --- |
| Girar | Flechas o WASD | Desliza / cruceta o stick |
| Turbo | Espacio o mayús | Toca el tablero / botón A; no disponible en cazador |
| Pausa | P o Esc | Botón de pausa / Start |
| Reiniciar | R | Botón |
| Sonido | M | Botón de sonido |
| Menús | Flechas y Enter | Toca una opción |

La navegación de grupos, modos, niveles, ayuda y ajustes funciona con teclado y mantiene un foco visible. En la rejilla de niveles, `↑↓` se mueve por las filas. El botón compacto de configuración está bajo la lista de modos; desde ahí se cambian el sonido y la trama de pantalla, o se borran los récords.

## Modos

La portada tiene dos grupos: **progreso** e **infinitos**. Dentro de la pantalla de modos se puede cambiar de grupo con `←→`.

- **Campaña** — 20 niveles con muros diseñados a mano. Se desbloquean al superarlos y cada nivel guarda su mejor puntuación.
- **Clásico** — partida sin fin. Cada fruta acelera la serpiente y, al llegar a 30 frutas, empiezan a aparecer muros.
- **Frenesí** — los bordes conectan entre sí y la velocidad aumenta gradualmente con el tiempo.
- **Cazador** — una serpiente roja come puntos azules y después te persigue. Su cabeza es peligrosa; su cuerpo y los puntos son seguros. Si choca contra tu cuerpo, desaparece y vuelve más pequeña. Los puntos azules también los puedes comer tú.

Los poderes dependen del modo:

- **Campaña:** fantasma, lento y recorte.
- **Clásico:** fantasma, lento, recorte y doble puntuación.
- **Frenesí:** lento, escudo y doble puntuación.
- **Cazador:** fantasma, recorte y escudo.

Fantasma atraviesa obstáculos; lento reduce el ritmo; recorte acorta la cola; escudo salva un choque y doble multiplica la puntuación.

El modo competitivo se retiró para preparar la versión 1.0: no aparece en el menú, no puede iniciarse y ya no conserva salas, bots, clasificación, reloj, reapariciones ni audio propio.

### `BORRAR-COMPETITIVO` · rastro de retirada

Se mantienen comentarios inocuos con la marca `BORRAR-COMPETITIVO` para identificar el trabajo retirado; no representan código jugable. Se pueden localizar con:

```sh
grep -rn BORRAR-COMPETITIVO .
```

## Portada

El título `snake.` se dibuja como cinco serpientes independientes, una por letra. Solo la `e` va tras la manzana: avanza muy lentamente, con movimiento continuo, hasta alcanzarla. El diseño conserva los bloques nítidos y la paleta de alto contraste.

## Idioma y rutas

El selector **ES / EN** cambia los textos y las rutas, y recuerda la preferencia en el navegador. El sitio usa rutas bajo el directorio del proyecto de GitHub Pages, sin dominios especiales; por ejemplo:

- `https://<usuario>.github.io/snake/`
- `https://<usuario>.github.io/snake/campaña`
- `https://<usuario>.github.io/snake/clásico`
- En inglés: `/snake/campaign`, `/snake/classic`

Las rutas admiten acceso directo y recarga. `serve.mjs` hace fallback a `index.html` en local; `404.html` reconstruye las rutas profundas en GitHub Pages.

## Archivos

```text
index.html          documento y elementos accesibles de la interfaz
404.html            recuperación de subrutas en GitHub Pages
styles.css          diseño de bloques, responsive y accesible
snake.js            bundle clásico generado que carga la página
js/
  engine.js         motor de juego, colisiones, poderes y dibujo
  grid.js           BFS y utilidades de rejilla
  levels.js         grupos, tres modos y 20 niveles
  audio.js          sonido sintetizado, sin archivos de audio
  input.js          teclado, gestos y mando
  i18n.js           cadenas ES/EN y nombres localizados
  main.js           pantallas, rutas, progreso, título y bucle
serve.mjs           servidor local sin caché y fallback de rutas
tools/build.mjs     empaqueta js/ en snake.js, sin dependencias
tools/check.mjs     pruebas de niveles, motor, idioma y publicación
```

La página carga `snake.js` como script clásico, no como módulo: así también puede abrirse con doble clic en `index.html` (`file://`). Para editar, modifica `js/` y regenera el bundle:

```sh
node tools/build.mjs          # regenera snake.js
node tools/check.mjs          # comprueba niveles, motor, idioma y rutas
node tools/build.mjs --check  # comprueba que snake.js está actualizado
```

## Ejecutar en local

```sh
node serve.mjs 8123
```

Abre `http://localhost:8123/snake/`. También se sirven `http://localhost:8123/` y las rutas profundas, por ejemplo `http://localhost:8123/snake/campaña`. El servidor no usa dependencias ni caché.

## Publicar

El workflow `.github/workflows/pages.yml` comprueba el bundle, ejecuta las pruebas y publica `index.html`, `404.html`, `styles.css` y `snake.js`. Activa **Settings → Pages → Source: GitHub Actions** para alojar el juego en `https://<usuario>.github.io/snake/`.
