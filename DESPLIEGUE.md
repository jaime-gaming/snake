# Despliegue

El juego se sirve en la **raíz** de `snake.jaime-gaming.com`. La base del HTML
es `/` y los assets son `styles.css` y `snake.js`; no hay ninguna ruta de assets
bajo `/snake/`. Las URLs antiguas `/snake/...` se redirigen a su equivalente en
la raíz antes de cargar el CSS.

## Worker (recomendado)

```sh
npx wrangler deploy
```

`wrangler.toml` publica el repositorio como estáticos en la raíz y usa
`single-page-application` para que `/competitivo`, `/perfil` o
`/campaña/nivel-30` devuelvan `index.html`.

## Si el dominio enseña una versión antigua

Ese síntoma no es del CSS: el HTML que llega al navegador es el shell viejo
(`<base href="/snake/">`), así que los assets se piden bajo `/snake/` y el
fallback SPA puede devolver `index.html` con tipo CSS. Hay que dejar **un solo**
origen para el dominio:

1. En Cloudflare, abre **Workers & Pages** y comprueba que
   `snake.jaime-gaming.com` está asociado al Worker `snake` (o a su
   `workers.dev` si aún no tiene dominio).
2. Si hay un proyecto de Pages antiguo con el mismo dominio, quita el dominio
   personalizado de Pages; no pueden servirlo los dos a la vez.
3. Despliega de nuevo con `npx wrangler deploy`.
4. Purga la caché: **Caching → Configuration → Purge Everything** (o purge por
   URL de `/`, `/index.html`, `/styles.css` y `/snake.js`).
5. Verifica:

```sh
node tools/verificar-despliegue.mjs
```

El script comprueba que `/` sirve el HTML actual, que la base no es `/snake/`,
que el CSS responde `text/css` con contenido real y que el JS del juego carga.
Si el HTML sigue siendo el viejo después de purgar, el dominio aún no apunta al
Worker nuevo: revisa el punto 1.

## Caché

`_headers` (Pages) marca el HTML como `no-store`. En Workers, el HTML se sirve
sin caché por defecto; si tienes una regla de caché para todo el sitio,
excluye `/`, `/index.html` y las rutas del juego, o purga tras cada despliegue.
Los assets llevan sello `?v=29` para que un cambio de CSS/JS no reutilice la
copia anterior.
