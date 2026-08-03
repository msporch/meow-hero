// Constantes globais do Meow Hero.

/** Resolução interna — exatamente a do Game Boy DMG. */
export const W = 160;
export const H = 144;

/**
 * Paleta da v2 (Game Boy Advance).
 *
 * Os índices 0..3 mantêm a ordem escuro→claro da v1 de propósito: todas as
 * chamadas de desenho que já existiam continuam produzindo algo coerente sem
 * precisar ser reescritas uma a uma. Os índices seguintes são acentos que a
 * paleta de 4 tons não permitia — dourado para moeda, vermelho para alerta,
 * azul de céu separado do branco de painel.
 *
 * A v1 (4 tons de verde) está em `git checkout v1-gameboy`.
 */
export const PALETTE = [
  '#12141c',  // 0 TINTA   — texto escuro, molduras
  '#3a4a6b',  // 1 MEIO    — texto secundário, sombra
  '#8fb4d9',  // 2 CLARO   — prédios distantes, realce
  '#f2f6fb',  // 3 PAPEL   — fundo de painel
  '#f0c04a',  // 4 MOEDA   — dourado
  '#d9584a',  // 5 ALERTA  — vermelho
  '#5fbf7a',  // 6 OK      — verde
  '#1e2436',  // 7 PAINEL  — fundo escuro de HUD
  '#a8c4e0',  // 8 CEU     — azul de céu
  '#6b7c99',  // 9 ASFALTO — cinza do chão
];

/** Nomes dos índices. Usar estes em código novo. */
export const COR = {
  TINTA: 0, MEIO: 1, CLARO: 2, PAPEL: 3,
  MOEDA: 4, ALERTA: 5, OK: 6, PAINEL: 7, CEU: 8, ASFALTO: 9,
};

// Mantidos por compatibilidade com o código existente.
export const DARK = 0, MID = 1, LIGHT = 2, PAPER = 3;

/** Quantos pixels de mundo equivalem a 1 metro real. */
export const PX_PER_M = 24;

/** Linha do chão (topo da calçada) na tela. */
export const GROUND_Y = 116;

/** Altura da faixa de HUD no topo. */
export const HUD_H = 22;

/** Posição X fixa do herói na tela (centro do sprite). */
export const HERO_X = 40;

/**
 * Meta de distância: faixa contínua, ajustada por um slider.
 *
 * Era uma lista fixa de distâncias. Vira faixa porque quem corre tem alvo
 * próprio — e o passo cresce junto com o número, para não exigir oitenta
 * toques até chegar na maratona.
 */
export const GOAL_MIN = 1;
export const GOAL_MAX = 42;

/** Passo do slider na posição atual: fino no começo, largo no fim. */
export function goalStep(km) {
  if (km < 10) return 0.5;
  if (km < 20) return 1;
  return 2;
}

/** Move a meta um passo, mantendo-a alinhada e dentro da faixa. */
export function stepGoal(km, dir) {
  const passo = goalStep(dir > 0 ? km : km - 0.01);
  const bruto = km + dir * passo;
  const arredondado = Math.round(bruto / passo) * passo;
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, Number(arredondado.toFixed(1))));
}

/**
 * Não há tempo limite nem condição de derrota: o objetivo é correr a distância
 * e juntar moedas. O cronômetro conta para cima, como registro da corrida.
 *
 * Por isso também não há escolha de ritmo nem de dificuldade — eram só formas
 * de ajustar um limite que deixou de existir.
 */

/** Moedas ganhas por caixa de leite. */
export const MILK_COINS = 25;

/** Comprimento de um "chunk" do percurso, em pixels de mundo. */
export const CHUNK_PX = 320;

/**
 * Zona de chegada — últimos N metros.
 * A 24 px/m, uma tela de 160px mostra ~6,7 m de mundo: 12 m dão umas duas
 * telas de aproximação até a linha de chegada.
 */
export const FINALE_M = 12;

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

/** Faixa da passada ajustável no perfil. */
export const STRIDE_STEP = 0.02;

/** Tempo sem toque até a tela apagar durante a corrida. */
export const POCKET_DELAYS = [
  { id: 10, label: '10 S' },
  { id: 20, label: '20 S' },
  { id: 60, label: '60 S' },
  { id: 0,  label: 'NUNCA' },
];

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
 * Avisos a cada quilômetro e na metade do percurso.
 */
export const CUE_HALFWAY = true;

/** Chave do armazenamento local. */
export const SAVE_KEY = 'meowhero.save.v1';

/**
 * Multijogador.
 *
 * Só a distância relativa circula: o servidor recebe coordenadas para saber
 * quem está perto, mas devolve apenas metros até o outro e a diferença de
 * progresso. Nenhuma coordenada chega a outro jogador.
 */
export const MP_INTERVAL_MS = 4000;    // frequência de envio da posição
export const MP_TIMEOUT_MS = 6000;     // desiste da requisição depois disso
export const MP_STALE_MS = 20000;      // sem resposta por tanto tempo, limpa a cena
export const MP_MAX_ON_SCREEN = 3;     // vizinhos desenhados ao mesmo tempo

/**
 * Posição do rival na tela.
 *
 * A distância física é mapeada num deslocamento que ULTRAPASSA a borda: assim
 * quem se afasta sai de quadro sozinho, em vez de ficar preso na lateral. O
 * mesmo caminho serve para quem some do servidor — o alvo vai para fora e ele
 * sai correndo.
 */
export const MP_VISIBLE_M = 300;       // acima disso o rival já saiu de quadro
export const MP_MIN_OFFSET = 24;       // px — nunca encosta no herói
export const MP_SPAN_PX = 130;         // px — alcance do mapeamento de distância
export const MP_GLIDE = 3.2;           // suavização do deslize (1/s)
export const MP_EXIT_PX = 120;         // alvo extra para quem saiu do servidor
