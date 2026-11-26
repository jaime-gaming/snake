# Seguridad

## Alcance

`snake` es un juego estático: no hay servidor propio, no hay cuentas, no se recoge ningún dato y **no se hace ni una llamada a la red** al jugar. Todo el progreso (récords, campaña, rango y estadísticas) vive en el `localStorage` del navegador y no sale de ahí.

Por eso, lo que importa aquí es más estrecho de lo normal:

- **La cadena de suministro.** El repositorio no tiene dependencias de ejecución y el sitio publicado sirve ficheros estáticos del propio repo. Node sólo se usa en local y en la CI, con lo que trae la imagen de GitHub Actions. Un `package.json` con dependencias inesperadas, o un paso de CI que descargue y ejecute algo, sería el sitio donde mirar.
- **El despliegue.** `wrangler.toml` publica el repositorio completo como estáticos (`.assetsignore` deja fuera herramientas, documentación y capturas). Un fichero que se colara en la raíz del dominio quedaría publicado; si ves algo que no debería servirse, avisa.
- **La página.** El juego se puede abrir desde `file://` y desde el dominio; no usa `innerHTML` con texto que venga de fuera y no procesa parámetros de la URL más allá de leer `?from=` y `?route=`. Un XSS aquí tendría que venir del propio código, pero se agradece igual el aviso.

## Cómo avisar

No abras un *issue* público para un problema de seguridad. Escríbelo en privado a **jaimegamingpro@gmail.com**, con los pasos para reproducirlo y qué esperabas que pasara.

Si el aviso encaja en el alcance, se responde en unos días, se arregla en una rama privada y, cuando hay despliegue, se cuenta el fallo en el [CHANGELOG](CHANGELOG.md) sin los detalles que permitan aprovecharlo. Si el aviso es sobre el alojamiento (Cloudflare) o sobre el hub `classic.jaime-gaming.com`, dilo también: el juego ya está desplegado allí, pero el problema puede ser de otra pieza.

## Lo que no hace falta avisar

- Que el juego se pueda «hacer trampa» editando `localStorage` o la consola: el progreso es local y de un solo jugador, no hay nada que proteger.
- Que las puntuaciones del competitivo no sean verificables en un servidor: los rivales son bots locales, no hay clasificación global.
- Avisos genéricos de escáneres sin una reproducción concreta.
