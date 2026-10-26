// Textos del juego y nombres localizados. Sin dependencias ni llamadas externas.

const KEY = 'snake.language';
const STRINGS = {
  es: {
    documentTitle: 'Snake — v1.0',
    description: 'Snake v1.0: campaña, modos infinitos y una serpiente cazadora.',
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
    modeClassic: 'clásico',
    modeClassicTag: 'cada fruta acelera · muros al llegar a 30 frutas',
    modeFrenzy: 'frenesí',
    modeFrenzyTag: 'bordes abiertos y la velocidad sube sola',
    modeHunter: 'cazador',
    modeHunterTag: 'una serpiente roja come puntos azules y crece',
    levelNames: {
      LLANO: 'llano', CRUZ: 'cruz', PILARES: 'pilares', ANILLO: 'anillo', ZIGZAG: 'zigzag',
      COLUMNAS: 'columnas', 'DOBLE ANILLO': 'doble anillo', REJILLA: 'rejilla', JAULA: 'jaula',
      ASPAS: 'aspas', 'CUATRO ESQUINAS': 'cuatro esquinas', 'CRUZ HUECA': 'cruz hueca',
      'REJILLA DOBLE': 'rejilla doble', PASILLO: 'pasillo', PUAS: 'púas', ESCALERA: 'escalera',
      DIENTES: 'dientes', LABERINTO: 'laberinto', 'DOS JAULAS': 'dos jaulas', FINAL: 'final',
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
    levelPreviewDataWithRecord: '{goal} {unit} · ritmo {speed} · récord {record}',
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
    ruleChain: 'encadena frutas para subir hasta ×5; los cubos dan premios o poderes.',
    ruleCampaign: 'campaña: supera cada nivel; la fruta final es amarilla.',
    ruleModes: 'frenesí: los bordes dan la vuelta. cazador: come puntos y después te persigue.',
    ruleHunter: 'cazador: su cabeza te mata; su cuerpo y los puntos son seguros.',
    powerBasics: 'fantasma atraviesa obstáculos; lento baja el ritmo; recorte acorta la cola.',
    powerAdvanced: 'los poderes dependen del modo; el escudo salva un choque y doble dura 7 s.',
    gridMode: 'rejilla',
    levelNumberName: 'nivel {number} {name}',
    nextLevelMeta: 'siguiente · {name} · {goal} {unit}',
    levelGoalRecord: 'nivel {goal} {unit} · récord {record}',
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
    hintSwipe: 'desliza para girar',
    hintGame: 'flechas girar · P pausa · R reiniciar · M sonido',
    hintGameTurbo: 'flechas girar · espacio turbo · P pausa · R reiniciar · M sonido',
    best: 'récord {score}',
    fruitScore: '{mode} · {fruits} {unit}',
    levelScore: '{number} {name} · {fruits}/{goal}',
    ghost: 'fantasma',
    slow: 'lento',
    shield: 'escudo',
    double: 'doble',
    turboEffect: 'turbo',
    hunted: 'te caza',
    locked: 'bloqueado',
    routeHome: '',
    routeModes: 'modos',
    routeHelp: 'ayuda',
    routeSettings: 'ajustes',
    routeCampaign: 'campaña',
    routeClassic: 'clásico',
    routeFrenzy: 'frenesí',
    routeHunter: 'cazador',
    routeEndless: 'infinitos',
    previewCampaign: 'vista previa · nivel {number} {name}',
    campaignAt: 'la campaña sigue por aquí · {cleared} de {total} superados',
    nextCampaignLevel: 'así es el siguiente nivel de la campaña',
    previewModeTitle: 'vista previa · {mode}',
    enterForModes: '{tag} · entra para ver los demás',
    footerGroups: 'grupos',
  },
  en: {
    documentTitle: 'Snake — v1.0',
    description: 'Snake v1.0: campaign, endless modes, and a hunter snake.',
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
    modeClassic: 'classic',
    modeClassicTag: 'each fruit speeds you up · walls begin at 30 fruits',
    modeFrenzy: 'frenzy',
    modeFrenzyTag: 'open edges · your speed keeps rising',
    modeHunter: 'hunter',
    modeHunterTag: 'a red snake eats blue pellets and grows',
    levelNames: {
      LLANO: 'open field', CRUZ: 'cross', PILARES: 'pillars', ANILLO: 'ring', ZIGZAG: 'zigzag',
      COLUMNAS: 'columns', 'DOBLE ANILLO': 'double ring', REJILLA: 'grid', JAULA: 'cage',
      ASPAS: 'pinwheels', 'CUATRO ESQUINAS': 'four corners', 'CRUZ HUECA': 'hollow cross',
      'REJILLA DOBLE': 'double grid', PASILLO: 'corridor', PUAS: 'spikes', ESCALERA: 'staircase',
      DIENTES: 'teeth', LABERINTO: 'maze', 'DOS JAULAS': 'twin cages', FINAL: 'finale',
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
    levelPreviewDataWithRecord: '{goal} {unit} · speed {speed} · best {record}',
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
    ruleChain: 'chain fruit to reach ×5; blocks drop bonuses and power-ups.',
    ruleCampaign: 'campaign: clear each level; the final fruit is golden.',
    ruleModes: 'frenzy: wrap around the edges. hunter: eat pellets, then stay ahead.',
    ruleHunter: 'hunter: its head is deadly; its body and pellets are safe.',
    powerBasics: 'ghost passes hazards; slow eases the pace; shrink trims your tail.',
    powerAdvanced: 'available powers depend on the mode; shield saves one crash and double lasts 7 s.',
    gridMode: 'grid',
    levelNumberName: 'level {number} {name}',
    nextLevelMeta: 'next · {name} · {goal} {unit}',
    levelGoalRecord: 'level goal: {goal} {unit} · best {record}',
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
    hintSwipe: 'swipe to turn',
    hintGame: 'arrows turn · P pause · R restart · M sound',
    hintGameTurbo: 'arrows turn · space boost · P pause · R restart · M sound',
    best: 'best {score}',
    fruitScore: '{mode} · {fruits} {unit}',
    levelScore: '{number} {name} · {fruits}/{goal}',
    ghost: 'ghost',
    slow: 'slow',
    shield: 'shield',
    double: 'double points',
    turboEffect: 'boost',
    hunted: 'hunted',
    locked: 'locked',
    routeHome: '',
    routeModes: 'modes',
    routeHelp: 'help',
    routeSettings: 'settings',
    routeCampaign: 'campaign',
    routeClassic: 'classic',
    routeFrenzy: 'frenzy',
    routeHunter: 'hunter',
    routeEndless: 'endless',
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
};
const MODE_TAG_KEYS = {
  classic: 'modeClassicTag',
  frenzy: 'modeFrenzyTag',
  hunter: 'modeHunterTag',
};
const GROUP_KEYS = ['groupCampaign', 'groupEndless'];
const GROUP_TAG_KEYS = ['groupCampaignTag', 'groupEndlessTag'];
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

export function fruitUnit(count) {
  const singular = Number(count) === 1;
  if (language === 'en') return singular ? 'fruit' : 'fruits';
  return singular ? 'fruta' : 'frutas';
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
    endless: [STRINGS.es.routeEndless, STRINGS.en.routeEndless],
  };
}
