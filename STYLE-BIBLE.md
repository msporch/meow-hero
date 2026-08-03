# Meow Hero — Bíblia de estilo (v2, Game Boy Advance)

Documento de referência para **toda** geração de arte. Copie os parâmetros
daqui **literalmente** em cada chamada — parafrasear o estilo a cada vez é a
principal causa de deriva visual ao longo de muitos personagens.

A v1 (Game Boy DMG, 4 tons de verde) está preservada na branch e na tag
`v1-gameboy`.

---

## Por que a v1 ficou inconsistente

Não foi o estilo, foram os personagens. Na sondagem, o **mesmo prompt** com os
mesmos parâmetros produziu quatro pessoas diferentes: azul-marinho, colete
branco, regata azul, camisa vermelha. Cada `create_character` inventa um
indivíduo novo — vinte gerações independentes nunca iam combinar.

**Regra desta versão:** skins que são "a mesma pessoa com outra roupa" nascem
de `create_character_state` a partir do herói base. Só criaturas de verdade
(bicho, robô, esqueleto) usam `create_character`.

---

## Especificação técnica do jogo

| Item | Valor |
|---|---|
| Resolução virtual | 160 × 144 |
| Escala de exibição | 2× (LCD de ~323px num celular de 375px) |
| Perspectiva | Lateral (side-scroller) |
| Direção usada | Leste (east) — o herói corre para a direita |
| Altura do herói | ~57 px (`size: 48`) |
| Linha do chão | y = 116 |
| Tile do chão | 16 px |
| Animações | `run` (8 frames), `idle` (4 frames) |
| Engine | Canvas 2D próprio, atlas em `assets/atlas.json` |
| Plataforma | Celular, retrato |

**Escala não-inteira é proibida.** 240×160 em retrato daria 1,35×, com pixels
de tamanhos diferentes na mesma tela. Se a resolução mudar para GBA nativo, o
console precisa virar paisagem.

---

## Parâmetros travados — copiar literalmente

Fonte única: `tools/v2/config.mjs`. Nenhum script escreve estes valores à mão.

```js
{
  body_type: 'humanoid',
  mode: 'standard',
  n_directions: 4,
  size: 48,                    // → sprite de ~57px
  view: 'side',
  outline: 'selective outline',
  shading: 'detailed shading',
  detail: 'high detail',
  proportions: '{"type": "preset", "name": "heroic"}',
}
```

Quadrúpedes mudam só o necessário: `body_type: 'quadruped'`, `template`
(`cat` | `dog`), `size: 50`, sem `proportions`. Todo o resto é idêntico.

**Sobre o `size: 48`.** A meta era 36, para um sprite de ~43px. O servidor
recusou oito tentativas seguidas nesse tamanho e aceitou 48 de primeira. Como o
herói base aprovado na sondagem nasceu em 48, o elenco inteiro segue ele — um
elenco coerente em 57px vale mais que um elenco misto no tamanho ideal. O
demake recorta pela caixa real, então o número final varia por skin.

## Animações travadas

| Nome | Template (bípede) | Template (quadrúpede) |
|---|---|---|
| `<skin>_run` | `running-8-frames` | `running-8-frames` |
| `<skin>_idle` | `breathing-idle` | `idle` |

Sempre `directions: ['east']`. Gerar as outras direções é desperdício: o jogo
é um corredor lateral.

---

## Personagem de referência

- **Herói base:** `Meow Hero v2 - Base` — regata azul, shorts pretos, tênis de
  corrida, cabelo escuro curto.
- Sondagem aprovada: variante **C** (contorno seletivo, sombreado detalhado).
- Toda skin de roupa é um `create_character_state` deste personagem.

---

## Regras de cor

A paleta de tela do jogo está em `js/config.js` (`PALETTE` / `COR`). Ela é
indexada: todo desenho passa índice, nunca hex. Foi isso que permitiu trocar os
4 tons de verde da v1 por uma paleta colorida sem reescrever tela por tela.

| Índice | Nome | Hex | Uso |
|---|---|---|---|
| 0 | `TINTA` | `#12141c` | texto, molduras |
| 1 | `MEIO` | `#3a4a6b` | texto secundário, sombra |
| 2 | `CLARO` | `#8fb4d9` | realce, faixa de seleção |
| 3 | `PAPEL` | `#f2f6fb` | fundo de painel |
| 4 | `MOEDA` | `#f0c04a` | dourado |
| 5 | `ALERTA` | `#d9584a` | vermelho |
| 6 | `OK` | `#5fbf7a` | verde |
| 7 | `PAINEL` | `#1e2436` | fundo escuro de HUD |
| 8 | `CEU` | `#a8c4e0` | céu da corrida |
| 9 | `ASFALTO` | `#6b7c99` | cinza do chão |

Os índices 0–3 mantêm a ordem escuro→claro da v1 de propósito. A carcaça em
`css/style.css` ecoa os mesmos hex.

Regras de arte gerada:

1. **Primeiro plano manda no contraste.** Todo personagem precisa de massa
   escura ou saturada suficiente para se separar do céu (`CEU`). O pipeline
   mede e **avisa**, mas não corrige: escurecer à força estragaria a
   identidade — um astronauta branco tem de ser branco. Quando o aviso dispara,
   quem cede é o cenário.
2. **Sem gradiente e sem anti-aliasing.** Pixel meio-transparente vira halo no
   jogo; o demake corta o alfa em binário.
3. **Paleta enxuta:** até 16 cores por sprite, 24 por camada de cenário, 48 na
   arte de título. Mais que isso é ruído de gerador, não estilo.
4. **Nada de `color_image_url`.** Era o que deixava tudo verde na v1. O gerador
   trabalha em cor livre; a redução acontece depois, no demake.

---

## Cenário

Cidade de dia, céu claro — o elenco foi aprovado em luz de dia, e um cenário
noturno pediria o contraste invertido.

- `bg_sky` e `bg_city` são camadas de parallax. O demake **recorta o céu**
  (preenchimento a partir da borda de cima, por proximidade de cor) para que o
  azul do jogo apareça por trás, e corta a faixa de chão sólida que o gerador
  desenha embaixo.
- `title_art` é ilustração inteira, opaca, 160×144.
- O chão sai de `create_sidescroller_tileset`: o demake compõe uma faixa
  16×28 (calçada em cima, asfalto embaixo) que o jogo só repete na horizontal.

---

## Convenção de nomes

```
assets/sprites/<skin>_run.png     strip horizontal, 8 frames
assets/sprites/<skin>_idle.png    strip horizontal, 4 frames
assets/atlas.json                 fw, fh, frames, anchorX (centro), anchorY (base)
```

Âncora sempre no **centro-base** (pés no chão). Frames de uma animação
compartilham a mesma caixa, senão o personagem treme.

---

## Faça / não faça

**Faça**
- Copiar os parâmetros travados sem reescrever.
- Nascer skin de roupa a partir do herói base.
- Conferir a silhueta e a escala 2× antes de aprovar.
- Gerar em lotes pequenos e revisar entre eles.

**Não faça**
- Não descrever o estilo com outras palavras a cada chamada.
- Não gerar 8 direções — só `east`.
- Não disparar lote grande sem revisar: o servidor falha em carga alta e
  devolve `status: failed` sem avisar (ver `tools/ensure-characters.mjs`).
- Não aceitar sprite claro demais sem checar contra o cenário.
- **Não escrever laço de recriação sem teto de tentativas.** Um laço assim
  queimou ~250 gerações recriando três skins que o servidor recusava. Todo
  script de geração tem `MAX_TENTATIVAS = 3`.

---

## Pipeline

| Etapa | Script | O que faz |
|---|---|---|
| 1 | `tools/v2/produzir.mjs` | roupas (`create_character_state`) → criaturas (`create_character`) → animações |
| 2 | `tools/v2/cenario.mjs` | props, camadas de fundo, arte de título, tileset |
| 3 | `tools/v2/baixar.mjs` | baixa tudo para `assets/_v2raw/` |
| 4 | `tools/v2/qa.mjs` | checagem técnica + folhas de contato para inspeção visual |
| 5 | `tools/v2/demake-gba.mjs` | redução de paleta, recorte, atlas → `assets/_gba/` |

Todos são retomáveis: nada é recriado se já existe e está pronto.
`tools/v2/test-demake.mjs` cobre a etapa 5.

`assets/_v2raw/` tem diretório próprio porque a **primeira** tentativa GBA
(`tools/fetch-gba.mjs`, abandonada) deixou o elenco inconsistente em
`assets/_raw_gba/` com exatamente os mesmos nomes de arquivo.
