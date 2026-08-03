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

/**
 * Movimento.
 *
 * Quem move o herói é o ACELERÔMETRO, não o GPS. O passo é detectado em
 * milissegundos, funciona sem sinal e não depende de o satélite responder —
 * era a dependência do GPS que fazia o cenário travar. O GPS entra só para
 * medir a distância real, calcular a média no fim e localizar outros jogadores.
 */
export const STEP_RECENT_MS = 1200;    // passo mais recente que isso = andando
export const STOP_CONFIRM_MS = 2000;   // sem passos por tanto tempo → herói para
export const CADENCE_SAMPLES = 6;      // passos considerados na média de cadência
export const MOVE_MIN_SPEED = 0.6;     // m/s — piso da rolagem enquanto anda
export const MOVE_MAX_SPEED = 6.5;     // m/s — teto de sanidade da cadência

/** Detector de passos (aceleração dinâmica, em m/s²). */
export const STEP_PEAK = 1.35;         // limiar de pico
export const STEP_VALLEY = -0.6;       // limiar de vale
export const STEP_MIN_GAP_MS = 250;    // período refratário (240 passos/min)
export const STEP_MAX_GAP_MS = 2000;   // acima disso a cadência é descartada

/**
 * Calibração da passada.
 *
 * A distância do jogo é passos × passada. Uma passada errada em 10% vira 600 m
 * de erro numa meta de 6 km, então o GPS recalibra o valor: a cada trecho com
 * deslocamento confiável, divide os metros medidos pelos passos dados.
 */
export const CALIB_MIN_M = 30;         // metros de GPS mínimos por ajuste
export const CALIB_MIN_STEPS = 25;     // passos mínimos por ajuste
export const CALIB_GAIN = 0.3;         // suavização do ajuste
export const STRIDE_MIN = 0.35;        // limites de sanidade para passada humana
export const STRIDE_MAX = 1.6;
/**
 * Ajustar a passada só corrige os passos SEGUINTES — os que já foram dados
 * entraram com o valor errado e esse erro não sai sozinho. A cada calibração o
 * total também é puxado na direção do que o GPS mediu.
 */
export const DIST_CORRECT_GAIN = 0.4;

/** Janela para a velocidade média do GPS no relatório final. */
export const SPEED_SAMPLE_MS = 250;

/** Passada padrão quando o usuário não informa a altura (m). */
export const DEFAULT_STRIDE = 0.78;

/**
 * Suavização da posição desenhada (ver Game._updateShownDistance).
 * O GPS entrega ~1 fix por segundo, então a distância real anda aos degraus;
 * estes valores fazem o cenário rolar em ritmo constante mesmo assim.
 */
export const SHOWN_GAIN = 0.2;         // correção suave em cruzeiro
export const SHOWN_GAIN_CATCHUP = 1.5; // correção forte após um salto grande
export const SHOWN_CATCHUP_M = 15;     // erro acima disso entra em recuperação
export const SHOWN_MAX_SPEED = 12;     // m/s — recupera correndo, não teleporta
export const SHOWN_SNAP_M = 100;       // acima disso ressincroniza direto

/**
 * O celular fica no bolso durante a corrida: o retorno é sonoro e tátil.
 * Avisos a cada quilômetro, na metade e quando o tempo aperta.
 */
export const CUE_HALFWAY = true;
export const CUE_LOW_TIME_S = 120;    // avisa quando faltarem 2 min

/** Chave do armazenamento local. */
export const SAVE_KEY = 'meowhero.save.v1';
