// Catálogo declarativo de todos os assets do Meow Hero.
// Tudo é gerado pelo MCP do PixelLab.

// --- Personagens (create_character + animate_character) ---
export const CHARACTERS = {
  hero: {
    create: {
      description: 'young athletic runner boy wearing a green tracksuit, headband and running sneakers, determined face',
      name: 'Meow Hero Runner',
      body_type: 'humanoid',
      mode: 'standard',
      n_directions: 4,
      // 32px mantém o herói em ~1/3 da altura útil da tela (144px), deixando espaço de pulo.
      size: 32,
      view: 'side',
      outline: 'single color black outline',
      shading: 'flat shading',
      detail: 'low detail',
      proportions: '{"type": "preset", "name": "heroic"}',
      text_guidance_scale: 9,
    },
    animations: [
      { key: 'run',  template_animation_id: 'running-8-frames', animation_name: 'hero_run',  directions: ['east'] },
      { key: 'jump', template_animation_id: 'two-footed-jump',  animation_name: 'hero_jump', directions: ['east'] },
      { key: 'idle', template_animation_id: 'breathing-idle',   animation_name: 'hero_idle', directions: ['east'] },
    ],
  },
};

/**
 * Skins do herói. Mesmo tamanho e estilo do personagem padrão, para poderem
 * ser trocadas sem mexer em âncoras nem no posicionamento da cena.
 */
const SKIN_BASE = {
  body_type: 'humanoid',
  mode: 'standard',
  n_directions: 4,
  size: 32,
  view: 'side',
  outline: 'single color black outline',
  shading: 'flat shading',
  detail: 'low detail',
  proportions: '{"type": "preset", "name": "heroic"}',
  text_guidance_scale: 9,
};

const SKIN_ANIMS = [
  { key: 'run',  template_animation_id: 'running-8-frames', directions: ['east'] },
  { key: 'idle', template_animation_id: 'breathing-idle',   directions: ['east'] },
];

/** Monta a entrada de personagem de uma skin bípede. */
function skin(id, description, name) {
  return {
    create: { ...SKIN_BASE, description, name },
    animations: SKIN_ANIMS.map(a => ({ ...a, animation_name: `${id}_${a.key}` })),
  };
}

/**
 * Skin quadrúpede (bicho de quatro patas).
 *
 * Difere do bípede em três pontos: usa um template de esqueleto animal, o
 * repouso chama-se `idle` (não existe `breathing-idle` para quadrúpedes), e o
 * tamanho pedido é maior — um bicho é baixo e comprido, então com o mesmo
 * número do humano ele sairia miúdo demais ao lado do corredor de 42px.
 */
function quadrupede(id, template, description, name) {
  return {
    create: {
      ...SKIN_BASE,
      body_type: 'quadruped',
      template,
      size: 34,
      proportions: undefined,     // ignorado em quadrúpede
      description,
      name,
    },
    animations: [
      { key: 'run',  template_animation_id: 'running-8-frames', directions: ['east'], animation_name: `${id}_run` },
      { key: 'idle', template_animation_id: 'idle',             directions: ['east'], animation_name: `${id}_idle` },
    ],
  };
}

export const SKINS = {
  neon: skin('neon', 'runner in a bright windbreaker with reflective stripes and cap, night jogger', 'Skin Neon'),
  ninja: skin('ninja', 'ninja in dark outfit with face mask and scarf, agile runner', 'Skin Ninja'),
  robo: skin('robo', 'friendly boxy robot with antenna and glowing eye, running', 'Skin Robo'),
  astro: skin('astro', 'astronaut in a white space suit with round helmet, running', 'Skin Astro'),
  // Esqueleto de verdade: ossos à mostra, sem roupa nenhuma.
  esqueleto: skin('esqueleto', 'bare white skeleton with visible ribcage and skull, no clothes, bones only', 'Skin Esqueleto'),

  // Lote 2 — personagens variados, de apelo mais imediato.
  mago:      skin('mago', 'wizard with pointy hat, long beard and star-covered robe', 'Skin Mago'),
  gato:      quadrupede('gato', 'cat', 'orange tabby cat with striped fur and long tail', 'Skin Gato'),
  cachorro:  quadrupede('cachorro', 'dog', 'friendly dog with floppy ears and bushy tail', 'Skin Cachorro'),
  dino:      skin('dino', 'small green tyrannosaurus with tiny arms and big tail, standing on two legs', 'Skin Dino'),
  pirata:    skin('pirata', 'pirate with tricorn hat, eyepatch and long coat', 'Skin Pirata'),
  cavaleiro: skin('cavaleiro', 'knight in full plate armor with plumed helmet', 'Skin Cavaleiro'),
  alien:     skin('alien', 'small green alien with big black eyes and antennae', 'Skin Alien'),
  zumbi:     skin('zumbi', 'cartoon zombie with torn shirt and arms stretched forward', 'Skin Zumbi'),
  vampiro:   skin('vampiro', 'vampire with slicked hair, fangs and high-collared cape', 'Skin Vampiro'),
  bombeiro:  skin('bombeiro', 'firefighter in helmet and reflective turnout coat', 'Skin Bombeiro'),
  chef:      skin('chef', 'chef with tall white hat and apron holding a frying pan', 'Skin Chef'),
  panda:     skin('panda', 'humanoid panda with round black ears and black eye patches, standing on two legs', 'Skin Panda'),
  fantasma:  skin('fantasma', 'cute floating ghost with a white sheet body and round eyes', 'Skin Fantasma'),
  robo_ouro: skin('robo_ouro', 'shiny golden robot with crown and glowing visor', 'Skin Robo de Ouro'),
  banana:    skin('banana', 'person wearing a full banana costume with the peel open at the top', 'Skin Banana'),
};

// As skins entram no mesmo pipeline dos personagens.
Object.assign(CHARACTERS, SKINS);

// --- Sprites soltos (create_image_pixflux, fundo transparente, paleta DMG forçada) ---
export const SPRITES = {
  coin:        { description: 'shiny round gold coin with a cat paw print engraved on it, thick black outline', width: 32, height: 32, view: 'side' },
  milk:        { description: 'small milk carton with a cat face printed on it, thick black outline',           width: 32, height: 32, view: 'side' },
  trash_bin:   { description: 'metal street trash bin with lid, thick black outline',                            width: 32, height: 40, view: 'side' },
  cone:        { description: 'traffic cone with reflective stripe, thick black outline',                        width: 32, height: 32, view: 'side' },
  box:         { description: 'stack of cardboard boxes, thick black outline',                                   width: 32, height: 32, view: 'side' },
  puddle:      { description: 'shallow water puddle on asphalt seen from the side, thick black outline',         width: 48, height: 24, view: 'side' },
  hydrant:     { description: 'street fire hydrant, thick black outline',                                        width: 32, height: 40, view: 'side' },
  sign:        { description: 'roadside distance marker signpost with blank square sign on a pole, thick black outline', width: 32, height: 48, view: 'side' },
  streetlight: { description: 'tall city street lamp post with a lamp head, thick black outline',                width: 32, height: 72, view: 'side' },
  bush:        { description: 'small round street bush in a planter, thick black outline',                        width: 32, height: 32, view: 'side' },
  truck:       { description: 'blocky delivery truck seen from the side driving left, thick black outline',      width: 96, height: 56, view: 'side', direction: 'west' },
  heart:       { description: 'pixel heart icon, thick black outline',                                            width: 32, height: 32, view: 'side' },
};

// --- Fundos e telas (opacos, paleta DMG forçada) ---
export const SCENES = {
  bg_sky:   { description: 'distant city skyline silhouette against an empty sky, simple flat retro game background layer', width: 160, height: 72,  no_background: false, detail: 'low detail' },
  bg_city:  { description: 'row of simple city buildings with windows, flat retro game parallax background layer',          width: 160, height: 88,  no_background: false, detail: 'low detail' },
  title_art:{ description: 'a boy running fast down a city street grabbing big gold coins floating in the air, retro game title screen illustration', width: 160, height: 144, no_background: false, detail: 'medium detail' },
};

// --- Tileset do chão (create_sidescroller_tileset) ---
export const TILESETS = {
  road: {
    lower_description: 'dark grey asphalt road with cracks',
    transition_description: 'light concrete sidewalk pavement',
    transition_size: 0.5,
    tile_size: { width: 16, height: 16 },
    outline: 'selective outline',
    shading: 'flat shading',
    detail: 'low detail',
    seed: 7412,
  },
};

// --- Animações de sprites soltos (animate_image, encadeado após o sprite ficar pronto) ---
export const SPRITE_ANIMS = {
  coin_spin:  { from: 'coin',  action: 'coin spinning around its vertical axis', frame_count: 8 },
  milk_bob:   { from: 'milk',  action: 'bobbing gently up and down',             frame_count: 6 },
};
