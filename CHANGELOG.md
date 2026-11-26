# Changelog

Todos los cambios notables de snake se anotan en este fichero. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y la versión se lee
en el sello `?v=` de `index.html`: es el número que sube el bundle.

## [Sin publicar]

### Añadido

- `LICENSE` (MIT), `CONTRIBUTING` dentro del README, `SECURITY.md`, este
  `CHANGELOG.md` y un `.assetsignore` para no publicar herramientas,
  documentación ni capturas en el dominio.
- Capturas del juego en `media/`, con sus pies, y una tabla que las coloca en el
  README.
- Instrucciones de instalación y ejecución en el README: abrir `index.html`,
  `node serve.mjs`, servidores estáticos alternativos y las comprobaciones.

### Corregido

- `tools/verificar-despliegue.mjs` buscaba el sello `?v=29` cuando la página ya
  pide `?v=30`, así que el diagnóstico del dominio daba fallo aunque el
  despliegue estuviera bien. Ahora el sello se lee de `index.html` antes de
  comparar.

## [0.3.0] — 2026-11-26 · sello `?v=30`

### Añadido

- **Integración con el hub**: quien llega con `?from=hub` ve un botón «← volver
  al hub» que sobrevive a la recarga mediante `sessionStorage`.
- **Perfil** con partidas, victorias, frutas, tiempo jugado, mejor cadena, mejor
  puntuación, puntos de rango y el borrado completo del progreso.
- **Ajustes** con sonido, trama y borrado, y **ayuda** con las reglas en diez
  líneas.

### Cambiado

- El **competitivo** pasa a tableros separados: seis serpientes, tres actos de
  veinte segundos (×1, ×1.5, ×2), gracia al revivir y una escalera de seis
  rangos que abre mapas y modificadores.
- **Contrarreloj** con el reloj grande sobre el tablero, aceleración hasta el
  doble, turbo apagado y manzana envenenada que cuesta cinco segundos.
- La **campaña** queda en treinta niveles con manzanas contadas en vez de
  puntuación.

## [0.2.0]

### Añadido

- Modos infinitos: **Frenesí** con olas de fruta y pulsos de velocidad, y
  **Cazador** con la serpiente roja y sus puntos azules.
- Potenciadores por modo (fantasma, lento, encoger, escudo y doble) y manzana
  envenenada en los modos que la admiten.
- Idioma **EN / ES** en toda la interfaz, con la elección recordada.

## [0.1.0]

- Primera versión: **Clásico** y **Campaña**, teclado, gestos y mando, sonido
  sintetizado y una única hoja de estilos sin dependencias.
