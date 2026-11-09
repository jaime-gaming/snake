// Comprueba el dominio real después de desplegar. No forma parte de los checks
// de CI: se ejecuta a mano cuando hace falta diagnosticar caché o rutas.
//
//   node tools/verificar-despliegue.mjs
//   node tools/verificar-despliegue.mjs https://snake.jaime-gaming.com

const base = (process.argv[2] || 'https://snake.jaime-gaming.com').replace(/\/+$/, '');
const fallos = [];
const avisos = [];

function nota(ok, texto) {
  process.stdout.write(`${ok ? 'ok ' : 'mal'}  ${texto}\n`);
  if (!ok) fallos.push(texto);
}

async function pedir(ruta, tipo) {
  const respuesta = await fetch(base + ruta, {
    redirect: 'follow',
    cache: 'no-store',
    headers: { Accept: tipo || '*/*' },
  });
  const cuerpo = await respuesta.text();
  const contentType = respuesta.headers.get('content-type') || '';
  const cache = respuesta.headers.get('cache-control') || '(sin cabecera)';
  nota(respuesta.ok, `${ruta} responde ${respuesta.status}`);
  if (tipo) nota(contentType.includes(tipo), `${ruta} tiene content-type ${tipo} (${contentType || 'ninguno'})`);
  return { respuesta, cuerpo, cache };
}

const inicio = await pedir('/', 'text/html');
nota(/<title>Snake<\/title>/i.test(inicio.cuerpo), 'el HTML es el del juego actual');
nota(!/<base[^>]+href=["']\/snake\//i.test(inicio.cuerpo), 'el HTML no usa la base antigua /snake/');
nota(/styles\.css\?v=29/.test(inicio.cuerpo), 'el HTML pide styles.css con el sello actual');
nota(/snake\.js\?v=29/.test(inicio.cuerpo), 'el HTML pide snake.js con el sello actual');
if (!/no-store/i.test(inicio.cache)) avisos.push(`el HTML llega con Cache-Control: ${inicio.cache}`);

const css = await pedir('/styles.css?v=29', 'text/css');
nota(css.cuerpo.includes(':root') && css.cuerpo.includes('--accent'), 'el CSS servido es el del juego');
nota(!/<html/i.test(css.cuerpo), 'el CSS no es en realidad un index.html');

const js = await pedir('/snake.js?v=29', 'javascript');
nota(js.cuerpo.includes('JUGADORES_POR_RANGO'), 'el JS servido es el bundle actual');

const comp = await pedir('/competitivo', 'text/html');
nota(/<title>Snake<\/title>/i.test(comp.cuerpo), 'las rutas profundas vuelven a index.html');

process.stdout.write('\n');
for (const aviso of avisos) process.stdout.write(`aviso: ${aviso}\n`);
if (fallos.length) {
  process.stderr.write(`\n${fallos.length} comprobación(es) fallida(s).\n`);
  process.exit(1);
}
process.stdout.write('despliegue correcto\n');
