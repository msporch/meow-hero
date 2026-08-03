// Catálogo da v2 (Game Boy Advance). Ver STYLE-BIBLE.md.
//
// A diferença central em relação à v1 não é o estilo, é COMO as skins nascem.
// Na v1 cada skin era um `create_character` independente, e o mesmo prompt
// devolvia pessoas diferentes — foi isso que deixou o elenco inconsistente.
// Aqui, skin que é "a mesma pessoa com outra roupa" nasce de
// `create_character_state` a partir do herói base, que preserva corpo,
// proporções e rosto. Só criaturas de verdade usam `create_character`.

/** Parâmetros travados. Copiados literalmente da bíblia de estilo. */
export const ESTILO = {
  body_type: 'humanoid',
  mode: 'standard',
  n_directions: 4,
  size: 48,     // sprite de ~57px; foi o tamanho que o servidor aceitou
  view: 'side',
  outline: 'selective outline',
  shading: 'detailed shading',
  detail: 'high detail',
  proportions: '{"type": "preset", "name": "heroic"}',
};

/**
 * Herói base = a variante C aprovada na sondagem.
 *
 * Não é regerado: é exatamente o sprite que foi escolhido olhando. Regerar
 * traria um corredor parecido, mas não O corredor aprovado — e o servidor
 * recusou oito tentativas seguidas em size 36 enquanto este, em size 48,
 * saiu de primeira.
 */
export const BASE_ID = '678f8015-f1af-4be3-b23e-c13dec135706';

export const BASE = {
  id: 'base',
  create: {
    ...ESTILO,
    size: 48,
    description: 'young athletic runner in a blue tank top, black shorts and running shoes, short dark hair, determined expression',
    name: 'Meow Hero v2 - Base',
  },
};

/**
 * Skins de roupa: variantes do MESMO corredor.
 * `edit_description` descreve só o que muda — o corpo vem do base.
 */
export const VESTES = {
  neon:      'wearing a bright neon windbreaker with reflective stripes and a cap',
  ninja:     'wearing a black ninja outfit with face mask and scarf',
  pirata:    'wearing a pirate tricorn hat, eyepatch and long coat',
  cavaleiro: 'wearing full steel plate armor with a plumed helmet',
  bombeiro:  'wearing a firefighter helmet and reflective turnout coat',
  chef:      'wearing a tall white chef hat and apron',
  mago:      'wearing a pointy wizard hat and a star-covered robe, long beard',
  vampiro:   'wearing a high-collared vampire cape, pale skin and fangs',
  astro:     'wearing a white astronaut space suit with a round glass helmet',
  banana:    'wearing a full banana costume with the peel open at the top',
  zumbi:     'as a zombie with torn clothes, greenish skin and vacant eyes',
};

/**
 * Criaturas: seres diferentes, não variantes.
 * Usam `create_character` com os MESMOS parâmetros de estilo, que é o que dá
 * coerência visual sem forçar a mesma anatomia.
 */
export const CRIATURAS = {
  gato:      { quad: 'cat', description: 'orange tabby cat with striped fur and long tail' },
  cachorro:  { quad: 'dog', description: 'friendly dog with floppy ears and bushy tail' },
  dino:      { description: 'small green tyrannosaurus with tiny arms and a big tail' },
  alien:     { description: 'small green alien with big black eyes and antennae' },
  robo:      { description: 'boxy retro robot with an antenna and a glowing visor' },
  robo_ouro: { description: 'shiny golden robot with a crown and a glowing visor' },
  esqueleto: { description: 'bare white skeleton with visible ribcage and skull, no clothes' },
  fantasma:  { description: 'floating ghost with a flowing white sheet body and round dark eyes' },
  panda:     { description: 'humanoid panda with round black ears and black eye patches' },
};

/** Animações travadas. Só a direção leste: o jogo é um corredor lateral. */
export const ANIMS = {
  bipede:     [{ key: 'run', tpl: 'running-8-frames' }, { key: 'idle', tpl: 'breathing-idle' }],
  quadrupede: [{ key: 'run', tpl: 'running-8-frames' }, { key: 'idle', tpl: 'idle' }],
};

/** Parâmetros de quadrúpede: só o necessário muda. */
export function estiloQuadrupede(template) {
  const { proportions, ...resto } = ESTILO;
  // Proporcional ao humano (48): bicho baixo e comprido precisa de mais
  // numero para ter presenca parecida ao lado do corredor.
  return { ...resto, body_type: 'quadruped', template, size: 50 };
}
