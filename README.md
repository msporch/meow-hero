# Meow Hero

Endless runner 2D com visual de Game Boy, instalável no celular, em que o
personagem só avança quando **você se move de verdade no mundo real**.

Você escolhe uma meta (por exemplo 6 km), guarda o celular no bolso e corre. O
jogo gera um percurso equivalente a essa distância, o herói avança junto com
você e junta moedas pelo caminho. Não há tempo limite nem derrota: o objetivo
é completar a distância e fazer a maior colheita possível.

Todos os gráficos e animações foram gerados pelo **MCP do PixelLab**.

---

## Como jogar

O menu é dividido em etapas curtas, uma decisão por tela:

1. **START** na tela de título.
2. **MODO DE JOGO** — solo ou multijogador.
3. **ESCOLHA A META** — de 1 a 42,2 km. A coluna da direita é só uma
   estimativa de duração a um trote de 8 min/km.
4. **OUTRAS OPÇÕES** — rastreio e som, ambos com padrão. **START** começa de
   qualquer linha.
5. Guarde o celular no bolso e corra.

**B** volta uma etapa em qualquer tela.

### Modos de rastreio

Quem move o herói é sempre o **acelerômetro**. O GPS só mede.

| Modo | Quando usar | O que faz |
|---|---|---|
| **PASSOS+GPS** | Ao ar livre | Passos movem; GPS afere a distância e calibra a passada |
| **SÓ PASSOS** | Esteira, sem sinal | Passos movem; não liga o GPS |
| **DEMO** | Testar sem correr | Gera passos simulados; **A** dá um empurrão |

### Durante a corrida

Como a tela não é olhada, o retorno é **sonoro e tátil**:

- a cada quilômetro completado: dois bipes agudos + vibração dupla;
- na metade da meta: um trio de bipes;
- ao completar: jingle de chegada.

A tela entra em **modo bolso** (quase apagada, mostrando só distância e tempo
em tom escuro) depois de 20 s sem toque, ou na hora com **SELECT**. Um toque
acorda. **START** pausa.

O botão **B** abre o **diagnóstico do rastreio**: quantos fixes chegaram e
quantos foram descartados (por precisão, jitter ou salto absurdo), a velocidade
da janela contra a de exibição, o estado de movimento, os passos detectados, o
FPS e o quanto o cenário está atrás da distância real. Serve para descobrir o
que está errado quando o problema só aparece correndo de verdade — com ele
aberto a tela não apaga.

---

## Multijogador

Mostra quem está correndo perto de você, como silhuetas na cena — mais perto
ou mais longe conforme a distância real entre vocês.

### Privacidade

O servidor **recebe** coordenadas (precisa, para saber quem está próximo) mas
**nunca as devolve**. Cada jogador só descobre a distância em metros até os
outros e quanto eles estão à frente na corrida. Isso é verificado por teste:
`test-server.mjs` falha se aparecer qualquer coordenada na resposta.

O recurso vem desligado. Ligar passa por uma tela que diz, em palavras claras,
o que é enviado — e o padrão continua sendo não enviar. O identificador é
aleatório, gerado no aparelho, sem ligação com você.

### Rodando o servidor no seu PC

```bash
npm run mp
```

Isso sobe o servidor em `http://localhost:3000`. Para o celular alcançar, ele
precisa estar acessível na internet **por HTTPS** — uma página HTTPS não pode
chamar `http://`, e seu celular na rua não está na sua rede. A forma que
funciona é um túnel, que evita abrir porta no roteador e atravessa CGNAT:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Ele devolve uma URL `https://...trycloudflare.com`. Abra o jogo no celular
passando esse endereço uma vez:

```
https://msporch.github.io/meow-hero/?mp=https://SEU-TUNEL.trycloudflare.com
```

O endereço fica guardado e some da barra. Depois é só ligar **ONLINE** na tela
de preparo.

Limites do PC como servidor: ele precisa estar ligado durante toda a corrida,
e a URL do túnel gratuito muda a cada reinício.

### Migrando para o Cloudflare (sempre no ar)

A lógica está em `server/core.mjs`, sem nada específico de Node. `server/node.mjs`
e `server/worker.mjs` são só invólucros. Para deixar no ar sem depender do PC:

```bash
cd server && npx wrangler deploy
```

A única diferença é onde o estado mora: no Node é memória do processo; no
Workers é um Durable Object, porque requisições não compartilham memória.

## Estrutura

```
index.html              shell do console (LCD + D-pad + A/B/START/SELECT)
manifest.webmanifest    metadados de instalação
sw.js                   service worker (cache offline)
css/style.css           carcaça do console, escala e responsividade
js/
  config.js             constantes (paleta, escala, filtros de GPS)
  gfx.js                canvas 160x144, blit, primitivas na paleta DMG
  font.js               fonte bitmap 5x7 desenhada à mão
  assets.js             carrega atlas.json e desenha sprites/animações
  audio.js              bipes de onda quadrada + vibração
  tracker.js            distância real (GPS / passos / simulador)
  course.js             geração procedural do percurso a partir da meta
  storage.js            moedas, corridas completas e histórico
  multiplayer.js        cliente de presença e posição dos rivais na tela
  game.js               máquina de estados e telas
  main.js               entrada, input, loop, instalação
assets/
  atlas.json            metadados dos sprites (tamanho, âncoras, frames)
  sprites/*.png         arte final, já na paleta de 4 tons
  icons/                ícones do PWA
  _raw/                 saída crua do PixelLab (não versionada)
tools/                  pipeline de geração de assets e testes
```

---

## Rodando

```bash
npm install
```

```bash
npm run serve
```

Abra `http://localhost:8080`. Geolocalização e service worker exigem
**HTTPS ou localhost** — em `file://` nada disso funciona.

Durante o desenvolvimento use `http://localhost:8080/?dev=1`: isso desliga o
service worker e limpa o cache, senão cada recarga serve a versão antiga.

### Testes

```bash
npm test
```

Cobre a lógica que não dá para verificar no navegador sem sair correndo:
contagem de passos e calibração da passada, filtros de GPS (precisão ruim,
jitter parado, salto impossível), determinismo da geração do percurso, a
privacidade do servidor de multijogador, e a entrada e saída de tela dos
rivais.

---

## Instalando no celular

O jogo é um PWA. Para instalar de verdade ele precisa estar num endereço
**HTTPS** — o navegador não oferece instalação (nem GPS) em HTTP comum.

1. Publique a pasta num host estático com HTTPS (GitHub Pages, Netlify,
   Vercel, Cloudflare Pages — qualquer um serve, é tudo arquivo estático).
2. Abra o endereço no celular.
3. **Android/Chrome**: aparece a faixa "Instalar o Meow Hero" ou use
   *Menu → Adicionar à tela inicial*.
   **iOS/Safari**: *Compartilhar → Adicionar à Tela de Início*.

Depois de instalado o jogo abre em tela cheia, sem barra de navegador, e
funciona offline.

### Limite honesto do rastreamento em segundo plano

Um app web **não tem** acesso a rastreamento em segundo plano como um app
nativo. Enquanto a página está visível (mesmo em modo bolso, com a tela preta)
o GPS continua contando normalmente. Se o celular **bloquear a tela** ou o
usuário trocar de app, o navegador suspende o JavaScript e a contagem pausa.

O que foi feito para lidar com isso:

- **Wake Lock**: o jogo pede para a tela não apagar durante a corrida, e
  repede a permissão sempre que a aba volta a ficar visível.
- **Modo bolso**: em vez de apagar a tela, ela fica preta — em telas OLED o
  consumo é próximo de zero e a página continua viva.
- **Coleta tolerante a saltos**: se o app for suspenso e a distância pular de
  uma vez, as moedas do trecho pulado são contabilizadas ao retomar, em vez de
  se perderem.

Para uma corrida longa, deixe o jogo aberto e o celular no bolso com a tela
ligada (o wake lock cuida disso).

---

## Pipeline de assets (MCP do PixelLab)

Toda a arte vem do PixelLab e passa por um "demake" que a converte para as
4 cores do Game Boy original.

```bash
node tools/gen-assets.mjs      # enfileira personagens, sprites, cenários, tileset
node tools/gen-anims.mjs       # enfileira as animações dos personagens
node tools/fetch-assets.mjs    # baixa o que já ficou pronto
node tools/demake.mjs          # quantiza, recorta, empacota, gera atlas.json
node tools/wait-assets.mjs     # espera tudo terminar e já aplica o demake
```

O token fica em `tools/.pixellab-token` (fora do controle de versão) ou na
variável `PIXELLAB_TOKEN`.

### O que o `demake.mjs` faz

O PixelLab entrega pixel art colorida, em canvas grandes. Para virar Game Boy:

1. **Quantização** para os 4 tons da paleta DMG (`#0f380f`, `#306230`,
   `#8bac0f`, `#9bbc0f`), por luminância com esticamento de contraste. Cenários
   levam dither ordenado (Bayer 4×4); sprites não, para não sujar o contorno.
2. **Recorte** pela caixa delimitadora — unida entre todos os frames de uma
   animação, para o movimento não "pular".
3. **Redução** por divisor inteiro, escolhendo a cor dominante de cada bloco
   (empate vai para a cor mais escura, o que preserva os contornos).
4. **Hierarquia tonal**: as camadas de fundo são achatadas num único tom claro
   e a mais distante recebe meio-tom xadrez. Com só 4 cores, é isso que
   garante que o herói (que tem contorno no tom mais escuro) sempre se
   destaque — sem esse passo ele desaparece dentro dos prédios.
5. **Chão**: monta uma faixa de 16×28 combinando o tile de calçada com o de
   asfalto do tileset gerado, detectando sozinho onde a calçada começa.
6. **atlas.json** com tamanhos, número de frames e âncoras (pés / centro).

Ferramentas de inspeção usadas durante o ajuste:

```bash
node tools/zoom.mjs assets/sprites/coin.png /tmp/coin.png 8
```

```bash
node tools/_sheet.mjs
```

---

## Decisões de desenho que valem explicar

**Sem obstáculos, sem pulo.** O celular fica no bolso e a tela não é olhada
durante a corrida. Um jogo que exige reação seria injusto e perigoso. O que
resta é o essencial: você corre, o personagem corre junto, e o desfecho fica
guardado para o final.

**Escala do mundo.** 24 pixels por metro real. A 3 m/s isso dá um scroll
agradável (uma tela a cada ~2,2 s), mas comprime a distância: uma tela mostra
só 6,7 m de mundo. Por isso a zona de chegada tem 12 m e a entrada do gato é
encenada em coordenadas de tela — senão ele só apareceria nos últimos 5 metros.

**Percurso determinístico.** A mesma meta gera sempre o mesmo trajeto (PRNG
semeado pela distância). Repetir uma meta é repetir o mesmo caminho, o que
torna a comparação entre corridas mais justa.

**O estado de movimento não vem de um fix só.** A velocidade saía da comparação
entre dois fixes de GPS consecutivos, e isso quebra na prática. Caminhando a
1,3 m/s com um fix por segundo, cada fix anda ~1,3 m — **abaixo do limiar de
jitter de 1,5 m**, então metade deles é descartada. Somado a um decaimento que
rodava por frame em vez de por segundo (`0.9⁶⁰ ≈ 0,002`), a velocidade zerava em
um segundo e o herói ficava parado enquanto o usuário andava.

Hoje a velocidade vem de uma **janela deslizante de deslocamento** (5 s), e o
estado de movimento tem histerese e duas fontes independentes:

- **liga** assim que o acelerômetro detecta um passo ou a janela acusa
  deslocamento — o acelerômetro responde em menos de um passo, sem esperar
  satélite;
- **desliga** só depois de ~2,5 s com os dois sinais em silêncio, medidos numa
  janela curta (a de 5 s é boa para estimar ritmo, mas lenta para perceber
  parada).

Enquanto o estado for "em movimento", a rolagem nunca zera. É isso que faz o
cenário andar de forma contínua sem depender de o GPS responder.

O acelerômetro roda em **todos** os modos, mas só o modo PASSOS o usa como
fonte de distância. No modo GPS ele é apenas o detector de movimento — a
distância continua vindo do satélite.

**Distância desenhada ≠ distância medida.** O GPS entrega cerca de um fix por
segundo, então a distância real anda aos degraus. Medindo uma corrida a 3 m/s,
o cenário ficava parado em **296 de 300 frames** e então saltava **72 px de uma
vez** — quase meia tela. Isso se percebe como travamento, mas não é: a tela de
corrida custa 0,14 ms por frame.

A correção está em `Game._updateShownDistance`. O mundo é desenhado a partir de
uma distância própria (`shownM`) que avança todo frame na velocidade medida e
absorve o erro contra a distância real com ganho baixo. Pontuação, HUD, barra
de progresso e o disparo do final continuam usando a distância verdadeira — a
suavização é puramente visual. Os ganhos foram calibrados medindo a oscilação
do avanço em vários cenários (corrida, caminhada, GPS ruim, app suspenso):

| | Antes | Depois |
|---|---|---|
| Frames congelados | 296 de 300 | 0 de 180 |
| Maior salto do cenário | 72 px | 1,4 px |
| Oscilação do avanço | teleporte | 1,25× |

Três regimes, porque um ganho só não serve para todos: em cruzeiro a correção é
suave (ritmo constante); acima de 15 m de erro ela sobe, para não arrastar o
atraso pelo resto da corrida; acima de 100 m — app suspenso por minutos no
bolso — o cenário ressincroniza direto, já que ninguém viu aquele trecho e um
sprint de dois minutos seria mais estranho que um corte.

**Dither por padrão, não por pixel.** Desenhar o xadrez de 50% pixel a pixel
custava 11.520 chamadas de `fillRect` na tela de pausa: **7,2 ms por frame**,
43% do orçamento de 60fps num desktop e o suficiente para travar num celular.
Pré-renderizado como padrão de 2×2, virou uma única chamada — 0,20 ms.

**Sem tempo limite nem derrota.** O objetivo é correr a distância e juntar
moedas, então o cronômetro conta para cima e serve de registro. Isso também
tirou a escolha de ritmo e de dificuldade do menu: eram formas de ajustar um
limite que deixou de existir. O gato ficou como mascote — espera na chegada e
comemora junto.

**Rival some andando, não no ar.** A distância física do outro jogador é
mapeada num deslocamento que ULTRAPASSA a borda da tela de propósito: quem se
afasta sai de quadro sozinho, em vez de ficar preso na lateral. Quem some do
servidor recebe um alvo fora da tela e sai correndo. Entre as respostas do
servidor (a cada 4 s) a posição desliza, então ele nunca teleporta.

---

## Licença dos assets

A arte foi gerada pelo PixelLab e está sujeita aos
[termos de serviço](https://pixellab.ai/termsofservice) deles.
