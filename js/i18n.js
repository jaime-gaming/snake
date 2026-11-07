// Textos del juego y nombres localizados. Sin dependencias ni llamadas externas.

const KEY = 'snake.language';
const STRINGS = {
  es: {
    documentTitle: 'Snake — v2.1',
    description: 'Snake v2.1: campaña de 30 niveles con modificadores, competitivo con arena al azar y copas, contrarreloj con reloj grande y perfil.',
    language: 'Idioma',
    sound: 'sonido',
    soundTitleOn: 'sonido activo (M)',
    soundTitleOff: 'sonido apagado (M)',
    pause: 'pausa',
    pauseTitle: 'pausa (P)',
    resume: 'seguir',
    resumeTitle: 'seguir (P)',
    board: 'tablero',
    startPrompt: 'pulsa una dirección',
    focusHint: 'haz clic en el tablero para que responda el teclado',
    fatalTitle: 'el juego no ha arrancado',
    fatalReload: 'recargar limpio',
    noScript: 'este juego necesita javascript activado.',
    loading: 'cargando…',
    missingPieces: 'faltan piezas ({pieces}). casi seguro hay ficheros viejos en caché: pulsa recargar limpio.',
    campaign: 'campaña',
    groupCampaign: 'progreso',
    groupCampaignTag: 'rutas con obstáculos',
    groupEndless: 'infinitos',
    groupEndlessTag: 'puntuación sin final',
    groupCompetitive: 'competitivo',
    groupCompetitiveTag: 'arena y modificador al azar · copas y rangos',
    modeClassic: 'clásico',
    modeClassicTag: 'cada fruta acelera · muros al llegar a 30 frutas',
    modeFrenzy: 'frenesí',
    modeFrenzyTag: 'bordes abiertos · olas de fruta y picos de velocidad',
    modeHunter: 'cazador',
    modeHunterTag: 'una serpiente roja come puntos azules y crece',
    modeTimed: 'contrarreloj',
    modeTimedTag: '30 segundos · cada fruta suma 3',
    modeCompetitive: 'competitivo',
    modeCompetitiveTag: 'mapa y modificador al azar · tres bots · copas en juego',
    levelNames: {
      LLANO: 'llano', CRUZ: 'cruz', PILARES: 'pilares', ANILLO: 'anillo', ZIGZAG: 'zigzag',
      COLUMNAS: 'columnas', 'DOBLE ANILLO': 'doble anillo', REJILLA: 'rejilla', JAULA: 'jaula',
      ASPAS: 'aspas', 'CUATRO ESQUINAS': 'cuatro esquinas', 'CRUZ HUECA': 'cruz hueca',
      'REJILLA DOBLE': 'rejilla doble', PASILLO: 'pasillo', PUAS: 'púas', ESCALERA: 'escalera',
      DIENTES: 'dientes', LABERINTO: 'laberinto', 'DOS JAULAS': 'dos jaulas', FINAL: 'final',
      'TÚNEL': 'túnel', ESQUINAS: 'esquinas', 'TRES ANILLOS': 'tres anillos',
      'CUATRO CAJAS': 'cuatro cajas', 'DIENTES DOBLES': 'dientes dobles',
      'ZIGZAG TRIPLE': 'zigzag triple', 'ANILLO CUADRADO': 'anillo cuadrado',
      'OCHO PILARES': 'ocho pilares', 'LABERINTO II': 'laberinto ii', 'GRAN FINAL': 'gran final',
    },
    controls: 'controles',
    hideGrid: 'quitar trama',
    showGrid: 'poner trama',
    clearRecords: 'borrar récords',
    chooseGroup: 'elige un grupo',
    menuSubtitle: 'elige una partida',
    settings: 'configuración',
    settingsHint: 'ajusta la experiencia de juego',
    soundSettingHint: 'efectos sonoros del juego',
    scanlines: 'trama de fósforo',
    scanlinesHint: 'líneas de pantalla para dar textura',
    clearRecordsHint: 'borra récords y progreso guardados',
    enabled: 'activado',
    disabled: 'desactivado',
    preview: 'vista previa',
    previewMode: 'vista previa del modo',
    previewGroupHint: 'elige un grupo para ver sus modos',
    groupAria: 'grupos',
    menuNumber: 'menú · {number}',
    groups: 'grupos',
    switchGroup: 'cambiar de grupo',
    modes: 'modos',
    chooseMode: '↑↓ elegir · ←→ cambiar de grupo · enter jugar',
    campaignProgress: '{cleared}/{total} superados',
    campaignDescription: 'recorrido con muros · {cleared} superados',
    chooseLevel: 'elige nivel',
    blocked: 'bloqueado',
    fruits: '{count} {unit}',
    levelPreviewData: '{goal} {unit} · ritmo {speed}',
    applesRemaining: '{count} {unit} por recoger',
    campaignLevel: 'nivel {number} · {name}',
    campaignRunSummary: 'manzanas recogidas: {collected} · manzanas restantes: {remaining}',
    levelControls: 'flechas para moverte · enter para jugar',
    helpTitle: 'cómo se juega',
    helpHeading: 'controles',
    back: 'volver',
    turn: 'girar',
    turnKeys: 'flechas o WASD · desliza',
    turbo: 'turbo',
    turboKeys: 'espacio / mayús / A · salvo cazador',
    pauseHelp: 'pausa',
    pauseKeys: 'P o esc · mando: start',
    restart: 'reiniciar',
    restartKeys: 'R · sonido M',
    menus: 'menús',
    menuKeys: 'flechas + enter · ←→ cambia de grupo',
    gameRules: 'reglas de juego',
    ruleChain: 'sólo en modos infinitos: cadena hasta ×5; cubos dan premios o poderes.',
    ruleCampaign: 'campaña: manzanas, no puntos; la última fruta es dorada.',
    ruleModes: 'frenesí: bordes abiertos, olas de fruta y picos de velocidad.',
    ruleHunter: 'cazador: su cabeza te mata; su cuerpo y los puntos son seguros.',
    ruleTimed: 'contrarreloj: 30 s y cada fruta suma 3 s; el tiempo no perdona.',
    ruleCompetitive: 'competitivo: arena y modificador al azar; ganas copas; último en pie.',
    ruleMods: 'algunos niveles llevan modificador: muros, reloj, cazador o sin turbo.',
    powerBasics: 'fantasma atraviesa obstáculos; lento baja el ritmo; recorte acorta la cola.',
    powerAdvanced: 'los poderes dependen del modo; el escudo salva un choque y doble dura 7 s.',
    gridMode: 'rejilla',
    levelNumberName: 'nivel {number} {name}',
    recordFruitMeta: 'récord {record} · {fruits} {unit}',
    recordNew: 'récord nuevo',
    end: 'fin',
    retry: 'reintentar',
    menu: 'menú',
    levelCleared: 'nivel {number} superado',
    campaignComplete: 'campaña completa · ya no hay margen',
    next: 'siguiente',
    repeat: 'repetir',
    fruitsRecord: '{fruits} {unit} · récord {record}',
    paused: 'en pausa',
    eraseConfirm: '¿borrar récords y progreso?',
    gamepadConnected: 'mando conectado',
    activeEffects: 'efectos activos',
    hintHome: '↑↓ grupo · enter abrir',
    hintModes: '↑↓ modo · ←→ grupo · enter jugar · esc volver',
    hintLevels: 'flechas nav · enter jugar · esc grupos',
    hintHelp: 'esc volver',
    hintSettings: '↑↓ elegir · enter cambiar · esc volver',
    hintPaused: 'P seguir · R reiniciar · esc menú',
    hintDead: 'R reintentar · esc menú',
    hintCleared: 'enter siguiente · esc menú',
    hintWon: 'R reintentar · esc menú',
    hintProfile: 'esc volver',
    hintSwipe: 'desliza para girar',
    hintGame: 'flechas girar · P pausa · R reiniciar · M sonido',
    hintGameTurbo: 'flechas girar · espacio turbo · P pausa · R reiniciar · M sonido',
    best: 'récord {score}',
    fruitScore: '{mode} · {fruits} {unit}',
    ghost: 'fantasma',
    slow: 'lento',
    shield: 'escudo',
    double: 'doble',
    turboEffect: 'turbo',
    hunted: 'te caza',
    locked: 'bloqueado',
    timeLeft: '{s} s',
    timeUp: 'se acabó el tiempo',
    competitiveAlive: '{alive} vivos de {total}',
    competitiveRank: 'quedaste {rank}º de {total}',
    competitiveWin: '¡victoria! · último en pie',
    competitiveDown: '{count} rivales caídos',
    mod_muros: 'muros que salen',
    mod_reloj: 'reloj',
    mod_cazador: 'cazador',
    mod_turbo: 'sin turbo',
    mod_ninguno: 'sin modificador',
    cups: '{count} copas',
    cupsWon: '+{count} copas',
    newRank: '¡nuevo rango: {name}!',
    rankBronze: 'bronce', rankSilver: 'plata', rankGold: 'oro',
    rankPlatinum: 'platino', rankDiamond: 'diamante', rankMaster: 'maestro',
    statsCups: 'copas',
    statsRank: 'rango',
    win: '¡has ganado!',
    profile: 'perfil',
    profileTitle: 'tu perfil',
    profileHint: 'todo lo acumulado en este navegador',
    statsGames: 'partidas jugadas',
    statsWins: 'victorias en competitivo',
    statsFruits: 'frutas recogidas',
    statsTime: 'tiempo jugado',
    statsChain: 'mejor cadena',
    statsBest: 'mejor puntuación',
    routeHome: '',
    routeModes: 'modos',
    routeHelp: 'ayuda',
    routeSettings: 'ajustes',
    routeCampaign: 'campaña',
    routeClassic: 'clásico',
    routeFrenzy: 'frenesí',
    routeHunter: 'cazador',
    routeTimed: 'contrarreloj',
    routeCompetitive: 'competitivo',
    routeEndless: 'infinitos',
    routeProfile: 'perfil',
    previewCampaign: 'vista previa · nivel {number} {name}',
    campaignAt: 'la campaña sigue por aquí · {cleared} de {total} superados',
    nextCampaignLevel: 'así es el siguiente nivel de la campaña',
    previewModeTitle: 'vista previa · {mode}',
    enterForModes: '{tag} · entra para ver los demás',
    footerGroups: 'grupos',
  },
  en: {
    documentTitle: 'Snake — v2.0',
    description: 'Snake v2.1: 30-level campaign with modifiers, competitive with random arenas and cups, time attack with a big clock, and a profile.',
    language: 'Language',
    sound: 'sound',
    soundTitleOn: 'sound on (M)',
    soundTitleOff: 'sound off (M)',
    pause: 'pause',
    pauseTitle: 'pause (P)',
    resume: 'resume',
    resumeTitle: 'resume (P)',
    board: 'game board',
    startPrompt: 'press a direction',
    focusHint: 'click the board to enable keyboard controls',
    fatalTitle: 'the game did not start',
    fatalReload: 'reload cleanly',
    noScript: 'this game needs javascript enabled.',
    loading: 'loading…',
    missingPieces: 'missing pieces ({pieces}). The browser may have cached old files; try a clean reload.',
    campaign: 'campaign',
    groupCampaign: 'campaign',
    groupCampaignTag: 'obstacle routes',
    groupEndless: 'endless',
    groupEndlessTag: 'chase a high score',
    groupCompetitive: 'competitive',
    groupCompetitiveTag: 'random arena and modifier · cups and ranks',
    modeClassic: 'classic',
    modeClassicTag: 'each fruit speeds you up · walls begin at 30 fruits',
    modeFrenzy: 'frenzy',
    modeFrenzyTag: 'open edges · fruit waves and speed pulses',
    modeHunter: 'hunter',
    modeHunterTag: 'a red snake eats blue pellets and grows',
    modeTimed: 'time attack',
    modeTimedTag: '30 seconds · each fruit adds 3',
    modeCompetitive: 'competitive',
    modeCompetitiveTag: 'random map and modifier · three bots · cups at stake',
    levelNames: {
      LLANO: 'open field', CRUZ: 'cross', PILARES: 'pillars', ANILLO: 'ring', ZIGZAG: 'zigzag',
      COLUMNAS: 'columns', 'DOBLE ANILLO': 'double ring', REJILLA: 'grid', JAULA: 'cage',
      ASPAS: 'pinwheels', 'CUATRO ESQUINAS': 'four corners', 'CRUZ HUECA': 'hollow cross',
      'REJILLA DOBLE': 'double grid', PASILLO: 'corridor', PUAS: 'spikes', ESCALERA: 'staircase',
      DIENTES: 'teeth', LABERINTO: 'maze', 'DOS JAULAS': 'twin cages', FINAL: 'finale',
      'TÚNEL': 'tunnel', ESQUINAS: 'corners', 'TRES ANILLOS': 'three rings',
      'CUATRO CAJAS': 'four boxes', 'DIENTES DOBLES': 'twin teeth',
      'ZIGZAG TRIPLE': 'triple zigzag', 'ANILLO CUADRADO': 'square ring',
      'OCHO PILARES': 'eight pillars', 'LABERINTO II': 'maze ii', 'GRAN FINAL': 'grand finale',
    },
    controls: 'controls',
    hideGrid: 'hide scanlines',
    showGrid: 'show scanlines',
    clearRecords: 'clear records',
    chooseGroup: 'choose a group',
    menuSubtitle: 'choose a run',
    settings: 'settings',
    settingsHint: 'adjust your game experience',
    soundSettingHint: 'game sound effects',
    scanlines: 'scanlines',
    scanlinesHint: 'screen lines for a little texture',
    clearRecordsHint: 'erase saved records and progress',
    enabled: 'on',
    disabled: 'off',
    preview: 'preview',
    previewMode: 'mode preview',
    previewGroupHint: 'choose a group to see its modes',
    groupAria: 'groups',
    menuNumber: 'menu · {number}',
    groups: 'groups',
    switchGroup: 'switch group',
    modes: 'modes',
    chooseMode: '↑↓ choose · ←→ switch group · enter play',
    campaignProgress: '{cleared}/{total} cleared',
    campaignDescription: 'obstacle course · {cleared} cleared',
    chooseLevel: 'choose a level',
    blocked: 'locked',
    fruits: '{count} {unit}',
    levelPreviewData: '{goal} {unit} · speed {speed}',
    applesRemaining: '{count} {unit} left',
    campaignLevel: 'level {number} · {name}',
    campaignRunSummary: 'apples collected: {collected} · apples remaining: {remaining}',
    levelControls: 'arrow keys to move · enter to play',
    helpTitle: 'how to play',
    helpHeading: 'controls',
    back: 'back',
    turn: 'turn',
    turnKeys: 'arrows or WASD · swipe',
    turbo: 'boost',
    turboKeys: 'space / shift / A · except in hunter',
    pauseHelp: 'pause',
    pauseKeys: 'P or esc · controller: start',
    restart: 'restart',
    restartKeys: 'R · sound M',
    menus: 'menus',
    menuKeys: 'arrows + enter · ←→ switches groups',
    gameRules: 'game rules',
    ruleChain: 'endless modes only: chain up to ×5; blocks drop bonuses or power-ups.',
    ruleCampaign: 'campaign: apples, not points; the final fruit is golden.',
    ruleModes: 'frenzy: open edges, fruit waves, and speed pulses.',
    ruleHunter: 'hunter: its head is deadly; its body and pellets are safe.',
    ruleTimed: 'time attack: 30 s and each fruit adds 3 s; time shows no mercy.',
    ruleCompetitive: 'competitive: random arena and modifier, cups by placing; last one standing.',
    ruleMods: 'some levels add a modifier: walls, clock, hunter, or no boost.',
    powerBasics: 'ghost passes hazards; slow eases the pace; shrink trims your tail.',
    powerAdvanced: 'available powers depend on the mode; shield saves one crash and double lasts 7 s.',
    gridMode: 'grid',
    levelNumberName: 'level {number} {name}',
    recordFruitMeta: 'best {record} · {fruits} {unit}',
    recordNew: 'new record',
    end: 'game over',
    retry: 'retry',
    menu: 'menu',
    levelCleared: 'level {number} cleared',
    campaignComplete: 'campaign complete · no more levels',
    next: 'next',
    repeat: 'play again',
    fruitsRecord: '{fruits} {unit} · best {record}',
    paused: 'paused',
    eraseConfirm: 'Clear records and progress?',
    gamepadConnected: 'controller connected',
    activeEffects: 'active effects',
    hintHome: '↑↓ group · enter open',
    hintModes: '↑↓ mode · ←→ group · enter play · esc back',
    hintLevels: 'arrows move · enter play · esc groups',
    hintHelp: 'esc back',
    hintSettings: '↑↓ choose · enter toggle · esc back',
    hintPaused: 'P resume · R restart · esc menu',
    hintDead: 'R retry · esc menu',
    hintCleared: 'enter next · esc menu',
    hintWon: 'R retry · esc menu',
    hintProfile: 'esc back',
    hintSwipe: 'swipe to turn',
    hintGame: 'arrows turn · P pause · R restart · M sound',
    hintGameTurbo: 'arrows turn · space boost · P pause · R restart · M sound',
    best: 'best {score}',
    fruitScore: '{mode} · {fruits} {unit}',
    ghost: 'ghost',
    slow: 'slow',
    shield: 'shield',
    double: 'double points',
    turboEffect: 'boost',
    hunted: 'hunted',
    locked: 'locked',
    timeLeft: '{s} s',
    timeUp: 'time up',
    competitiveAlive: '{alive} alive of {total}',
    competitiveRank: 'you placed {rank} of {total}',
    competitiveWin: 'victory! · last one standing',
    competitiveDown: '{count} rivals down',
    mod_muros: 'walls appear',
    mod_reloj: 'clock',
    mod_cazador: 'hunter',
    mod_turbo: 'no boost',
    mod_ninguno: 'no modifier',
    cups: '{count} cups',
    cupsWon: '+{count} cups',
    newRank: 'new rank: {name}!',
    rankBronze: 'bronze', rankSilver: 'silver', rankGold: 'gold',
    rankPlatinum: 'platinum', rankDiamond: 'diamond', rankMaster: 'master',
    statsCups: 'cups',
    statsRank: 'rank',
    win: 'you won!',
    profile: 'profile',
    profileTitle: 'your profile',
    profileHint: 'everything earned in this browser',
    statsGames: 'games played',
    statsWins: 'competitive wins',
    statsFruits: 'fruits collected',
    statsTime: 'time played',
    statsChain: 'best chain',
    statsBest: 'best score',
    routeHome: '',
    routeModes: 'modes',
    routeHelp: 'help',
    routeSettings: 'settings',
    routeCampaign: 'campaign',
    routeClassic: 'classic',
    routeFrenzy: 'frenzy',
    routeHunter: 'hunter',
    routeTimed: 'timed',
    routeCompetitive: 'competitive',
    routeEndless: 'endless',
    routeProfile: 'profile',
    previewCampaign: 'preview · level {number} {name}',
    campaignAt: 'campaign continues here · {cleared} of {total} cleared',
    nextCampaignLevel: 'preview of the next campaign level',
    previewModeTitle: 'preview · {mode}',
    enterForModes: '{tag} · enter to see the rest',
    footerGroups: 'groups',
  },
};

const MODE_KEYS = {
  campaign: 'campaign',
  classic: 'modeClassic',
  frenzy: 'modeFrenzy',
  hunter: 'modeHunter',
  timed: 'modeTimed',
  competitive: 'modeCompetitive',
};
const MODE_TAG_KEYS = {
  classic: 'modeClassicTag',
  frenzy: 'modeFrenzyTag',
  hunter: 'modeHunterTag',
  timed: 'modeTimedTag',
  competitive: 'modeCompetitiveTag',
};
const GROUP_KEYS = ['groupCampaign', 'groupEndless', 'groupCompetitive'];
const GROUP_TAG_KEYS = ['groupCampaignTag', 'groupEndlessTag', 'groupCompetitiveTag'];
let language = 'es';

try {
  const stored = localStorage.getItem(KEY);
  if (stored === 'es' || stored === 'en') language = stored;
} catch (error) {
  // El idioma también funciona sin almacenamiento local.
}

export function getLanguage() {
  return language;
}

export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'es';
  try {
    localStorage.setItem(KEY, language);
  } catch (error) {
    // El idioma se mantiene en memoria durante esta sesión.
  }
  return language;
}

export function t(key, values = {}) {
  let text = STRINGS[language][key] ?? STRINGS.es[key] ?? key;
  if (typeof text !== 'string') return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function modeName(mode) {
  return t(MODE_KEYS[mode] || 'campaign');
}

export function modeTag(mode) {
  return t(MODE_TAG_KEYS[mode] || 'campaign');
}

export function groupName(index) {
  return t(GROUP_KEYS[index] || GROUP_KEYS[0]);
}

export function groupTag(index) {
  return t(GROUP_TAG_KEYS[index] || GROUP_TAG_KEYS[0]);
}

export function levelName(name) {
  const names = STRINGS[language].levelNames || STRINGS.es.levelNames;
  return names[name] || String(name).toLowerCase();
}

const UMBRALES_RANGO = [1000, 750, 500, 250, 100, 0];
const CLAVES_RANGO = ['rankMaster', 'rankDiamond', 'rankPlatinum', 'rankGold', 'rankSilver', 'rankBronze'];

export function rankName(cups) {
  const n = Math.max(0, Number(cups) || 0);
  for (let i = 0; i < UMBRALES_RANGO.length; i++) {
    if (n >= UMBRALES_RANGO[i]) return t(CLAVES_RANGO[i]);
  }
  return t('rankBronze');
}

export function fruitUnit(count) {
  const singular = Number(count) === 1;
  if (language === 'en') return singular ? 'fruit' : 'fruits';
  return singular ? 'fruta' : 'frutas';
}

export function appleUnit(count) {
  const singular = Number(count) === 1;
  if (language === 'en') return singular ? 'apple' : 'apples';
  return singular ? 'manzana' : 'manzanas';
}

export function routeSlug(name) {
  const key = `route${name[0].toUpperCase()}${name.slice(1)}`;
  return t(key);
}

export function routeWords() {
  return {
    home: '',
    modes: [STRINGS.es.routeModes, STRINGS.en.routeModes],
    help: [STRINGS.es.routeHelp, STRINGS.en.routeHelp],
    settings: [STRINGS.es.routeSettings, STRINGS.en.routeSettings],
    campaign: [STRINGS.es.routeCampaign, STRINGS.en.routeCampaign],
    classic: [STRINGS.es.routeClassic, 'clasico', STRINGS.en.routeClassic],
    frenzy: [STRINGS.es.routeFrenzy, 'frenesi', STRINGS.en.routeFrenzy],
    hunter: [STRINGS.es.routeHunter, STRINGS.en.routeHunter],
    timed: [STRINGS.es.routeTimed, 'contrarreloj', STRINGS.en.routeTimed],
    competitive: [STRINGS.es.routeCompetitive, 'competitivo', STRINGS.en.routeCompetitive],
    endless: [STRINGS.es.routeEndless, STRINGS.en.routeEndless],
    profile: [STRINGS.es.routeProfile, STRINGS.en.routeProfile],
  };
}
