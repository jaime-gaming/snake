# SNAKE

Snake en blanco y negro, rápido y sin adornos. HTML, CSS y JavaScript sin dependencias ni build: se abre `index.html` y se juega.

## Modos

- **Campaña** — 12 niveles con muros diseñados a mano. Se desbloquean al superarlos; el progreso se guarda.
- **Clásico** — muros que matan, velocidad que sube con cada fruta.
- **Frenesí** — bordes abiertos y aceleración continua: no hay techo.
- **Portales** — dos portales que reubican cada pocas frutas. Los muros siguen matando.

En todos los modos:

- **Cadena** — come frutas seguidas para subir el multiplicador (×2, ×3, ×4, ×5). La barra inferior es el tiempo que te queda para encadenar.
- **Bonus** — un rombo rojo aparece cada pocas frutas, caduca, y da puntuación y crecimiento extra.
- **Turbo** — acelera la serpiente mientras lo mantengas.

## Controles

| Acción | Teclado | Táctil |
| --- | --- | --- |
| Girar | Flechas o WASD | Desliza |
| Turbo | Espacio o Mayús | Toca el tablero |
| Pausa | P o Esc | Botón PAUSA |
| Reiniciar | R | Botón |
| Sonido | M | Botón SONIDO |
| Elegir / confirmar | Flechas + Enter | Toca |

## Local

Cualquier servidor estático sirve:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

También funciona abriendo `index.html` con doble clic: no hay módulos cargados por red ni peticiones `fetch`. Si el navegador bloquea los módulos ES desde `file://`, usa el servidor.

## GitHub Pages

El repositorio incluye `.github/workflows/pages.yml`. Para publicarlo:

1. Settings → Pages → Source: **GitHub Actions**.
2. Push a `main` (o lanza el workflow a mano desde Actions).

El juego queda en `https://<usuario>.github.io/snake/`.

## Estructura

```
index.html        marcado y HUD
styles.css        todo el estilo (blanco y negro, rejilla, monoespaciada)
js/engine.js      motor: rejilla, colisiones, puntuación, dibujo en canvas
js/levels.js      definición de modos y de los 12 niveles de campaña
js/audio.js       sonido sintetizado con WebAudio (sin ficheros)
js/input.js       teclado y gestos
js/main.js        pantallas, menús, progreso en localStorage y bucle
```

El motor es independiente del DOM: `Game` se puede instanciar y avanzar desde Node (útil para probar equilibrio o validar niveles).
