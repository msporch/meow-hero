// Constantes globais do Meow Hero.

/** Resolução interna — exatamente a do Game Boy DMG. */
export const W = 160;
export const H = 144;

/** Paleta DMG: 0 = mais escuro, 3 = mais claro. */
export const PALETTE = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
export const DARK = 0, MID = 1, LIGHT = 2, PAPER = 3;

/** Quantos pixels de mundo equivalem a 1 metro real. */
export const PX_PER_M = 24;

/** Linha do chão (topo da calçada) na tela. */
export const GROUND_Y = 116;

/** Altura da faixa de HUD no topo. */
export const HUD_H = 22;

/** Posição X fixa do herói na tela (centro do sprite). */
export const HERO_X = 40;

/** Distâncias-alvo oferecidas na tela de meta (km). */
export const GOALS = [1, 2, 3, 5, 6, 8, 10, 15, 21.1, 42.2];

/** Ritmos oferecidos (min/km) — definem o tempo limite. */
export const PACES = [4, 5, 6, 7, 8, 9, 10, 12, 15];

/** Comprimento de um "chunk" do percurso, em pixels de mundo. */
export const CHUNK_PX = 320;

/**
 * Zona final (cinematográfica) — últimos N metros.
 * A 24 px/m, uma tela de 160px mostra ~6,7 m de mundo: 12 m equivalem a umas
 * duas telas de aproximação, o suficiente para ver o gato e o caminhão chegando.
 */
export const FINALE_M = 12;

/** Bônus de tempo por caixa de leite (segundos). */
export const MILK_SECONDS = 20;

/** Filtros de GPS. */
export const GPS_MAX_ACCURACY = 30;   // m — descarta fixes piores que isso
export const GPS_MIN_DELTA = 1.5;     // m — abaixo disso é jitter
export const GPS_MAX_SPEED = 9;       // m/s — acima disso é fix ruim (~32 km/h)
export const GPS_TIMEOUT_MS = 25000;  // sem fix nesse tempo → avisa

/** Passada padrão quando o usuário não informa a altura (m). */
export const DEFAULT_STRIDE = 0.78;

/**
 * O celular fica no bolso durante a corrida: o retorno é sonoro e tátil.
 * Avisos a cada quilômetro, na metade e quando o tempo aperta.
 */
export const CUE_HALFWAY = true;
export const CUE_LOW_TIME_S = 120;    // avisa quando faltarem 2 min

/** Chave do armazenamento local. */
export const SAVE_KEY = 'meowhero.save.v1';
