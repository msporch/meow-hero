// Meow Hero — máquina de estados e loop principal.
//
// Desenho do jogo: a corrida é PASSIVA. O celular fica no bolso e o herói só
// avança quando o usuário se move de verdade. Não há obstáculos nem toque
// durante a corrida — o retorno vem por som e vibração.
//
// O objetivo é correr a distância escolhida e juntar moedas. Não há tempo
// limite nem derrota: o cronômetro conta para cima e serve de registro.
import {
  W, H, GROUND_Y, HUD_H, HERO_X, PX_PER_M, GOALS,
  CHUNK_PX, MILK_COINS, CUE_HALFWAY,
  SHOWN_GAIN, SHOWN_GAIN_CATCHUP, SHOWN_CATCHUP_M, SHOWN_MAX_SPEED, SHOWN_SNAP_M,
  MP_MAX_ON_SCREEN,
} from './config.js';
import { ctx, clear, rect, rectOutline, panel, dither, progressBar } from './gfx.js';
import { drawText, drawTextShadow, textWidth, wrapText, LINE_H } from './font.js';
import { A, drawSprite, drawAnim, drawGround, spriteSize } from './assets.js';
import { Course } from './course.js';
import { Tracker, MODES, formatTime, formatKmh } from './tracker.js';
import { sfx, resumeAudio, vibrate, setAudioEnabled } from './audio.js';
import * as store from './storage.js';
import { Multiplayer } from './multiplayer.js';

const S = {
  TITLE: 'title', ARM: 'arm', RUN: 'run',
  PAUSE: 'pause', FINALE: 'finale', RESULT: 'result', HISTORY: 'history',
  CONSENT: 'consent',
  // Menu em subseções: modo → meta → opções → correr.
  MODO: 'modo', META: 'meta', OPCOES: 'opcoes',
};

export class Game {
  constructor() {
    this.state = S.TITLE;
    this.t = 0;              // tempo do estado atual, em segundos
    this.frame = 0;

    this.tracker = new Tracker();
    this.course = null;

    const d = store.load();
    this.goalKm = d.lastGoal ?? 5;
    this.mode = MODES.some(m => m.id === d.lastMode) ? d.lastMode : 'steps+gps';
    this.online = false;        // escolhido na primeira subseção do menu
    this.row = 0;               // linha selecionada na subseção atual

    this.coins = 0;
    this.elapsed = 0;

    // Distância usada só para desenhar — ver _updateShownDistance.
    this.shownM = 0;
    this._lastCoinSfx = 0;

    // Multijogador: desligado até haver consentimento explícito.
    this.mp = new Multiplayer();
    this.mpOn = false;
    this.kmCued = 0;
    this.halfCued = false;

    this.chegou = false;
    this.finaleT = 0;
    this.finalePhase = 0;

    // Modo bolso: a tela apaga sozinha para poupar bateria e evitar toque acidental.
    this.pocket = false;
    this.lastTouch = 0;
    this.wakeLock = null;

    this.menuIndex = 0;
    this.toast = null;
    this.toastT = 0;

    // Diagnóstico (botão B durante a corrida). Existe porque os problemas de
    // rastreio só aparecem no aparelho de verdade, em movimento — não dá para
    // reproduzir no desktop.
    this.debug = false;
    this._fps = 60;
  }

  // ---------------- ciclo ----------------

  go(state) {
    this.state = state;
    this.t = 0;
  }

  say(msg, secs = 2) { this.toast = msg; this.toastT = secs; }

  update(dt) {
    this.t += dt;
    this.frame++;
    if (dt > 0) this._fps += (1 / dt - this._fps) * 0.05;
    if (this.toastT > 0) this.toastT -= dt;

    this.tracker.tick(dt);
    this._updateShownDistance(dt);

    switch (this.state) {
      case S.ARM: this._updateArm(dt); break;
      case S.RUN: this._updateRun(dt); break;
      case S.FINALE: this._updateFinale(dt); break;
    }
  }

  /**
   * Distância usada só para DESENHAR o mundo.
   *
   * O GPS entrega cerca de um fix por segundo, então a distância real anda aos
   * degraus: medindo uma corrida a 3 m/s, o cenário ficava parado em 296 de
   * 300 frames e então saltava 72 px de uma vez — quase meia tela. É isso que
   * se percebe como travamento, e não queda de FPS (a tela de corrida custa
   * 0,14 ms por frame).
   *
   * Aqui o mundo anda todo frame na velocidade medida e o erro contra a
   * distância real é absorvido suavemente. Pontuação, HUD, barra de progresso
   * e o disparo do final continuam usando a distância verdadeira: isto é
   * puramente visual.
   */
  _updateShownDistance(dt) {
    const tr = this.tracker;
    const real = tr.distanceM;
    const gap = real - this.shownM;

    // Intervalo enorme (app suspenso por minutos, celular no bolso) não vale
    // animar: ninguém viu aquele trecho, e um sprint de dois minutos seria mais
    // estranho que um corte. Ressincroniza direto.
    if (gap > SHOWN_SNAP_M) { this.shownM = real; return; }

    // Ganho baixo mantém a rolagem em ritmo constante entre dois fixes. Só sobe
    // quando o erro fica grande (app suspenso no bolso, GPS voltando depois de
    // um túnel) — senão o atraso ficaria sendo arrastado pelo resto da corrida.
    const gain = Math.abs(gap) > SHOWN_CATCHUP_M ? SHOWN_GAIN_CATCHUP : SHOWN_GAIN;

    // displaySpeedMs não zera enquanto o estado for "em movimento": é o que
    // mantém o cenário rolando sem depender de o GPS responder.
    const base = tr.displaySpeedMs;

    // Teto de velocidade: mesmo recuperando, o cenário corre em vez de saltar.
    const v = Math.min(Math.max(0, base + gap * gain), SHOWN_MAX_SPEED);

    // Projeta à frente do último fix enquanto anda; parado, o cenário para junto.
    const ceiling = real + (tr.moving ? Math.max(6, base * 3) : 2);
    this.shownM = Math.max(this.shownM, Math.min(this.shownM + v * dt, ceiling));
  }

  draw() {
    // Modo bolso: tela praticamente apagada. Economiza bateria em OLED e
    // evita que o bolso dispare toques.
    if (this.pocket && (this.state === S.RUN || this.state === S.ARM)) {
      clear(0);
      // Números em tom escuro: dá pra conferir de relance sem acordar a tela,
      // e continua economizando bateria em telas OLED.
      drawText(ctx, `${(this.tracker.distanceM / 1000).toFixed(2)} KM`, W / 2, 56, 1, 'center');
      drawText(ctx, formatTime(this.elapsed), W / 2, 70, 1, 'center');
      drawText(ctx, 'TOQUE PARA VER', W / 2, 92, 1, 'center');
      return;
    }

    switch (this.state) {
      case S.TITLE: this._drawTitle(); break;
      case S.MODO: this._drawModo(); break;
      case S.META: this._drawMeta(); break;
      case S.OPCOES: this._drawOpcoes(); break;
      case S.CONSENT: this._drawConsent(); break;
      case S.ARM: this._drawArm(); break;
      case S.RUN: this._drawRun(); break;
      case S.PAUSE: this._drawRun(); this._drawPause(); break;
      case S.FINALE: this._drawFinale(); break;
      case S.RESULT: this._drawResult(); break;
      case S.HISTORY: this._drawHistory(); break;
    }
    this._drawToast();
  }

  // ---------------- entrada ----------------

  input(key) {
    resumeAudio();
    this.lastTouch = performance.now();

    // Qualquer toque acorda a tela.
    if (this.pocket) {
      this.pocket = false;
      if (key === 'tap') return;
    }

    switch (this.state) {
      case S.TITLE: return this._inputTitle(key);
      case S.MODO: return this._inputModo(key);
      case S.META: return this._inputMeta(key);
      case S.OPCOES: return this._inputOpcoes(key);
      case S.CONSENT: return this._inputConsent(key);
      case S.ARM: return this._inputArm(key);
      case S.RUN: return this._inputRun(key);
      case S.PAUSE: return this._inputPause(key);
      case S.RESULT: return this._inputResult(key);
      case S.HISTORY: if (key === 'b' || key === 'a' || key === 'start') { sfx.back(); this.go(S.TITLE); } return;
      case S.FINALE: return;
    }
  }

  // ---------------- TÍTULO ----------------

  _inputTitle(key) {
    if (key === 'start' || key === 'a' || key === 'tap') { sfx.confirm(); this.row = 0; this.go(S.MODO); }
    else if (key === 'select') { sfx.select(); this.menuIndex = 0; this.go(S.HISTORY); }
  }

  _drawTitle() {
    clear(3);
    // title_art é ancorado em (0,0), então cobre a tela inteira.
    if (!drawSprite('title_art', 0, 0)) rect(0, 0, W, H, 2);

    // Faixa escura atrás do logotipo para o texto respirar.
    dither(0, 8, W, 34, 0, 0);
    rect(0, 14, W, 22, 0);
    drawText(ctx, 'MEOW HERO', W / 2, 18, 3, 'center');
    drawText(ctx, 'CORRA. PEGUE AS MOEDAS.', W / 2, 27, 2, 'center');

    const d = store.load();
    rect(0, H - 26, W, 26, 0);
    if (Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, 'START PARA COMECAR', W / 2, H - 22, 3, 'center');
    }
    drawText(ctx, `\x05${d.coins}   ${d.totalKm.toFixed(1)}KM   \x04${d.completadas}`, W / 2, H - 11, 2, 'center');
  }

  // ---------------- CONFIGURAÇÃO ----------------

  // ---------------- MENU: navegação comum ----------------

  /**
   * Uma subseção do menu é só uma lista de itens. Cada item tem um rótulo,
   * um valor opcional (para linhas que alternam com ← →) e uma dica.
   * Centralizar aqui evita repetir seleção, desenho e navegação em cada tela.
   */
  _menuNav(itens, key, { onEscolher, onVoltar, onAlternar }) {
    const n = itens.length;
    if (key === 'up') { this.row = (this.row + n - 1) % n; sfx.select(); }
    else if (key === 'down') { this.row = (this.row + 1) % n; sfx.select(); }
    else if (key === 'left' || key === 'right') {
      if (onAlternar) { onAlternar(itens[this.row], key === 'right' ? 1 : -1); sfx.select(); }
    }
    else if (key === 'b') { sfx.back(); onVoltar?.(); }
    else if (key === 'a' || key === 'start' || key === 'tap') {
      sfx.confirm(); onEscolher?.(itens[this.row], key);
    }
  }

  _drawMenu(titulo, itens, { dica, rodape } = {}) {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, titulo, W / 2, 4, 3, 'center');

    const alto = itens.length <= 3 ? 20 : 14;
    const topo = itens.length <= 3 ? 30 : 20;

    itens.forEach((it, i) => {
      const y = topo + i * alto;
      const on = i === this.row;
      if (on) { rect(4, y - 3, W - 8, alto - 3, 2); rectOutline(4, y - 3, W - 8, alto - 3, 0); }
      drawText(ctx, it.label, 14, y, 0);
      if (it.value != null) drawText(ctx, it.value, W - 15, y, 0, 'right');
      if (on && Math.floor(this.t * 3) % 2 === 0 && it.value != null) {
        drawText(ctx, '\x08', 7, y, 0);
        drawText(ctx, '\x03', W - 12, y, 0);
      } else if (on && it.value == null) {
        drawText(ctx, '\x03', 7, y, 0);
      }
    });

    rect(0, 96, W, 30, 0);
    wrapText(dica || '', W - 12).slice(0, 3).forEach((l, i) =>
      drawText(ctx, l, W / 2, 99 + i * LINE_H, 2, 'center'));

    drawText(ctx, rodape || 'A ESCOLHE   B VOLTA', W / 2, 132, 0, 'center');
  }

  // ---------------- MENU 1: modo de jogo ----------------

  _itensModo() {
    return [
      { id: 'solo', label: 'SOLO' },
      { id: 'online', label: 'MULTIJOGADOR' },
    ];
  }

  _inputModo(key) {
    this._menuNav(this._itensModo(), key, {
      onVoltar: () => this.go(S.TITLE),
      onEscolher: it => {
        if (it.id === 'online') {
          if (!this.mp.configured) { this.say('SEM SERVIDOR', 2.5); return; }
          this.online = true;
          // Envia a sua posição: precisa de consentimento antes.
          if (store.get('mpConsent') !== true) { this.row = 0; this.go(S.CONSENT); return; }
        } else {
          this.online = false;
        }
        this.row = Math.max(0, GOALS.indexOf(this.goalKm));
        this.go(S.META);
      },
    });
  }

  _drawModo() {
    const itens = this._itensModo();
    const dica = this.row === 0
      ? 'Voce contra o relogio.'
      : (this.mp.configured
        ? 'Mostra quem esta correndo perto de voce.'
        : 'Sem servidor. Abra o link com ?mp=endereco.');
    this._drawMenu('MODO DE JOGO', itens, { dica });
  }

  // ---------------- MENU 2: meta ----------------

  _inputMeta(key) {
    const itens = GOALS.map(km => ({ km, label: `${km.toFixed(km % 1 ? 1 : 0)} KM` }));
    // A lista é longa: rola em vez de mostrar tudo.
    const n = itens.length;
    if (key === 'up') { this.row = (this.row + n - 1) % n; sfx.select(); }
    else if (key === 'down') { this.row = (this.row + 1) % n; sfx.select(); }
    else if (key === 'b') { this.row = this.online ? 1 : 0; sfx.back(); this.go(S.MODO); }
    else if (key === 'a' || key === 'start' || key === 'tap') {
      this.goalKm = itens[this.row].km;
      store.set('lastGoal', this.goalKm);
      sfx.confirm();
      this.row = 0;
      this.go(S.OPCOES);
    }
  }

  _drawMeta() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, 'ESCOLHA A META', W / 2, 4, 3, 'center');

    // Janela de 6 itens centrada na seleção.
    const VIS = 6;
    const n = GOALS.length;
    let ini = Math.min(Math.max(0, this.row - 2), Math.max(0, n - VIS));

    for (let i = 0; i < Math.min(VIS, n); i++) {
      const idx = ini + i;
      const km = GOALS[idx];
      const y = 20 + i * 13;
      const on = idx === this.row;
      if (on) { rect(4, y - 3, W - 8, 13, 2); rectOutline(4, y - 3, W - 8, 13, 0); }
      drawText(ctx, `${km.toFixed(km % 1 ? 1 : 0)} KM`, 16, y, 0);
      // Estimativa a um trote de 8 min/km, só para dar noção de duração.
      // Sem "~": a fonte 5x7 não tem esse caractere e ele sairia como "?".
      drawText(ctx, formatTime(km * 8 * 60), W - 14, y, 1, 'right');
      if (on) drawText(ctx, '\x03', 8, y, 0);
    }

    // Marcadores de rolagem na borda direita, fora da coluna de texto.
    if (ini > 0) drawText(ctx, '\x02', W - 7, 20, 1);
    if (ini + VIS < n) drawText(ctx, '\x02', W - 7, 20 + (Math.min(VIS, n) - 1) * 13, 1);

    rect(0, 104, W, 22, 0);
    drawText(ctx, 'A DIREITA E UMA ESTIMATIVA', W / 2, 107, 2, 'center');
    drawText(ctx, 'DE DURACAO. NAO HA LIMITE.', W / 2, 116, 2, 'center');
    drawText(ctx, 'A ESCOLHE   B VOLTA', W / 2, 132, 0, 'center');
  }

  // ---------------- MENU 3: outras opções ----------------

  _itensOpcoes() {
    const mode = MODES.find(m => m.id === this.mode) ?? MODES[0];
    return [
      { id: 'rastreio', label: 'RASTREIO', value: mode.label, hint: mode.hint },
      { id: 'som', label: 'SOM', value: store.get('audio') === false ? 'DESLIGADO' : 'LIGADO',
        hint: 'Avisos por bipe a cada quilometro.' },
      { id: 'comecar', label: 'COMECAR', hint: 'Bora correr.' },
    ];
  }

  _inputOpcoes(key) {
    const itens = this._itensOpcoes();
    this._menuNav(itens, key, {
      onVoltar: () => { this.row = Math.max(0, GOALS.indexOf(this.goalKm)); this.go(S.META); },
      onAlternar: (it, dir) => {
        if (it.id === 'rastreio') {
          const i = MODES.findIndex(m => m.id === this.mode);
          this.mode = MODES[(i + dir + MODES.length) % MODES.length].id;
          store.set('lastMode', this.mode);
        } else if (it.id === 'som') {
          const novo = store.get('audio') === false;
          store.set('audio', novo);
          setAudioEnabled(novo);
        }
      },
      // START começa de qualquer linha; A só começa em cima de COMECAR.
      onEscolher: (it, k) => { if (it.id === 'comecar' || k === 'start') this._arm(); },
    });
  }

  _drawOpcoes() {
    const itens = this._itensOpcoes();
    this._drawMenu('OUTRAS OPCOES', itens, {
      dica: itens[this.row]?.hint,
      rodape: 'START COMECA   B VOLTA',
    });
  }

  // ---------------- CONSENTIMENTO DO MULTIJOGADOR ----------------

  _inputConsent(key) {
    if (key === 'a' || key === 'start') {
      store.set('mpConsent', true);
      this.online = true;
      sfx.confirm();
      this.row = Math.max(0, GOALS.indexOf(this.goalKm));
      this.go(S.META);
    } else if (key === 'b' || key === 'select') {
      // Recusar volta ao modo, com SOLO selecionado.
      this.online = false;
      sfx.back();
      this.row = 0;
      this.go(S.MODO);
    }
  }

  /**
   * Ligar o online envia a sua localização a um servidor. Isso é dito em
   * palavras claras antes de qualquer envio, e o padrão é não enviar.
   */
  _drawConsent() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, 'JOGAR ONLINE', W / 2, 4, 3, 'center');

    // wrapText garante que caiba: linhas fixas estouravam os 160px de largura.
    const texto = [
      ...wrapText('Para achar quem corre perto, seu celular envia a sua localizacao ao servidor.', W - 10),
      '',
      ...wrapText('Os outros NAO veem onde voce esta: so a que distancia, em metros.', W - 10),
    ];
    texto.forEach((l, i) => drawText(ctx, l, W / 2, 20 + i * LINE_H, 0, 'center'));

    const srv = this.mp.server.replace(/^https?:\/\//, '');
    drawText(ctx, 'SERVIDOR', W / 2, 92, 1, 'center');
    drawText(ctx, srv.slice(0, 26), W / 2, 101, 0, 'center');

    rect(0, H - 24, W, 24, 0);
    drawText(ctx, 'A  ACEITO', W / 2, H - 20, 3, 'center');
    drawText(ctx, 'B  NAO, OBRIGADO', W / 2, H - 10, 2, 'center');
  }

  // ---------------- ARMAR (permissões / sinal) ----------------

  async _arm() {
    store.set('lastGoal', this.goalKm);
    store.set('lastMode', this.mode);

    this.course = new Course(this.goalKm, Math.round(this.goalKm * 977) % 100000);
    this.coins = 0;
    this.elapsed = 0;
    this.kmCued = 0;
    this.halfCued = false;
    this.chegou = false;
    this._collectedTo = 0;
    this.shownM = 0;
    this._lastCoinSfx = 0;
    this.tracker.reset();
    this.tracker.stride = store.get('stride') || 0.78;

    // O online só faz sentido com GPS: é a posição que localiza os vizinhos.
    this.mpOn = this.online && this.mp.configured
      && store.get('mpConsent') === true && this.mode === 'steps+gps';
    if (this.mpOn) this.mp.start(); else this.mp.stop();

    this.go(S.ARM);
    await this.tracker.start(this.mode);
    await this._requestWakeLock();
  }

  async _requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => { this.wakeLock = null; });
      }
    } catch { /* sem suporte ou negado */ }
  }

  async reacquireWakeLock() {
    if (!this.wakeLock && (this.state === S.RUN || this.state === S.ARM)) {
      await this._requestWakeLock();
    }
  }

  _releaseWakeLock() {
    try { this.wakeLock?.release(); } catch { /* ok */ }
    this.wakeLock = null;
  }

  _updateArm() {
    // Em DEMO começa direto; nos outros modos espera o rastreio ficar pronto.
    if (this.mode === 'demo' || this.tracker.status === 'ok') {
      if (this.t > 0.8) this._begin();
    }
  }

  _inputArm(key) {
    if (key === 'b') { sfx.back(); this.tracker.stop(); this._releaseWakeLock(); this.go(S.OPCOES); }
    // Deixa forçar o início mesmo sem sinal ideal.
    else if (key === 'start' && this.t > 1.5) this._begin();
  }

  _begin() {
    sfx.start();
    this.tracker.distanceM = 0;
    this.go(S.RUN);
    this.lastTouch = performance.now();
  }

  _drawArm() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, 'PREPARANDO', W / 2, 4, 3, 'center');

    const st = this.tracker.status;
    const lines = {
      idle: 'Iniciando...',
      waiting: 'Ligando o sensor',
      ok: 'Pronto!',
      denied: 'Permissao negada',
      error: this.tracker.message || 'Sensor indisponivel',
      stale: 'Sinal fraco',
    };

    drawText(ctx, lines[st] || '...', W / 2, 42, 0, 'center');

    if (this.tracker.accuracy != null) {
      drawText(ctx, `PRECISAO ${Math.round(this.tracker.accuracy)}M`, W / 2, 54, 1, 'center');
    }

    // Animação de espera: o herói correndo no lugar.
    const f = Math.floor(this.t * 10);
    drawAnim('hero_run', f, W / 2, 104);

    const dots = '.'.repeat(1 + (Math.floor(this.t * 2) % 3));
    if (st === 'denied' || st === 'error') {
      // Sem acelerômetro o herói não anda — é ele que move o jogo agora.
      const msg = 'Autorize o sensor de movimento, ou volte e escolha DEMO.';
      wrapText(msg, W - 16).forEach((l, i) => drawText(ctx, l, W / 2, 112 + i * LINE_H, 0, 'center'));
      drawText(ctx, 'B VOLTA', W / 2, H - 10, 0, 'center');
    } else {
      drawText(ctx, dots, W / 2, 114, 1, 'center');
      if (this.t > 1.5) drawText(ctx, 'START IGNORA A ESPERA', W / 2, H - 10, 0, 'center');
    }
  }

  // ---------------- CORRIDA ----------------

  _updateRun(dt) {
    const tr = this.tracker;
    this.elapsed += dt;

    // Entra em modo bolso após um tempo sem toque — é o uso previsto.
    // Com o diagnóstico aberto não apaga: a tela existe para ser observada.
    if (!this.pocket && !this.debug && performance.now() - this.lastTouch > 20000) {
      this.pocket = true;
    }

    const dist = tr.distanceM;

    // Avisos sonoros/táteis: a única forma de retorno com o celular no bolso.
    const kmNow = Math.floor(dist / 1000);
    if (kmNow > this.kmCued) { this.kmCued = kmNow; sfx.km(kmNow); }

    if (CUE_HALFWAY && !this.halfCued && dist >= this.course.goalM / 2) {
      this.halfCued = true;
      sfx.halfway();
    }
    // Coleta pela posição desenhada, para a moeda sumir quando o herói passa
    // por ela na tela. O que ficar para trás é recolhido ao fim da corrida.
    // Multijogador: envia posição e recolhe quem está perto.
    this.mp.tick(performance.now(), dt, {
      position: tr.position, runM: dist, goalKm: this.goalKm,
    });

    const got = this._collectUpTo(this.shownM);

    if (got.coins > 0 && !this.pocket) {
      // Um salto do GPS pode entregar dezenas de moedas no mesmo frame; sem
      // limite isso dispararia dezenas de osciladores de uma vez.
      const now = performance.now();
      if (now - this._lastCoinSfx > 55) { sfx.coin(); this._lastCoinSfx = now; }
    }
    if (got.milk > 0) {
      if (!this.pocket) sfx.milk();
      this.say(`+${MILK_COINS * got.milk} `, 1.6);
    }

    // Chegou na meta. Não existe o caminho contrário: sem tempo limite, a
    // corrida só termina quando você completa ou desiste.
    if (dist >= this.course.goalM) {
      this.chegou = true;
      this._enterFinale();
    }
  }

  /** Vizinhos dentro da tela, os mais próximos primeiro. */
  get mpVisiveis() {
    return this.mp.rivals.visible(MP_MAX_ON_SCREEN);
  }

  _enterFinale() {
    // Recolhe o que sobrou entre a posição desenhada e a distância real.
    this._collectUpTo(this.tracker.distanceM);
    this.pocket = false;
    this.finaleT = 0;
    this.finalePhase = 0;
    this.go(S.FINALE);
  }

  /**
   * Recolhe moedas e leite até `uptoM` metros, retomando de onde parou.
   *
   * A varredura parte do último ponto coletado, e não do que está na tela: com
   * o app suspenso no bolso a distância pode dar um salto grande entre dois
   * frames, e o trecho pulado seria perdido. O teto de chunks por frame evita
   * um pico de trabalho depois de uma suspensão longa — 8 chunks equivalem a
   * 106 m por frame, ou 6 km por segundo de recuperação.
   */
  _collectUpTo(uptoM) {
    const worldX = uptoM * PX_PER_M;
    const MAX_CHUNKS = 8;
    const from = Math.max(0, this._collectedTo ?? 0);
    const to = Math.min(worldX, from + MAX_CHUNKS * CHUNK_PX);
    let coins = 0, milk = 0;

    for (const c of this.course.visibleChunks(from, to + W)) {
      for (const it of c.items) {
        if (it.x > worldX || this.course.isTaken(it.id)) continue;
        this.course.take(it.id);
        if (it.type === 'coin') { this.coins++; coins++; }
        else if (it.type === 'milk') { this.coins += MILK_COINS; milk++; }
      }
    }
    this._collectedTo = to;
    return { coins, milk };
  }

  _inputRun(key) {
    if (key === 'start') { sfx.pause(); this.go(S.PAUSE); }
    else if (key === 'select') { this.pocket = true; vibrate(30); }
    else if (key === 'b') { this.debug = !this.debug; sfx.select(); }
    else if (key === 'a' && this.mode === 'demo') this.tracker.demoNudge(120);
  }

  _inputPause(key) {
    if (key === 'start' || key === 'b') { sfx.confirm(); this.go(S.RUN); this.lastTouch = performance.now(); }
    else if (key === 'select') { this._abandon(); }
  }

  _abandon() {
    sfx.back();
    this.tracker.stop();
    this.mp.stop();
    this._releaseWakeLock();
    this.chegou = false;
    store.recordRun({
      goalKm: this.goalKm, distanceM: this.tracker.distanceM,
      seconds: this.elapsed, coins: this.coins, completou: false, mode: this.mode,
    });
    this.go(S.RESULT);
  }

  // ---------------- desenho da corrida ----------------

  /**
   * Fração já percorrida da reta final (0 → 1). Serve para encenar a chegada:
   * a 24 px/m o gato ficaria fora de quadro até os últimos metros, então a
   * aproximação dele é roteirizada em coordenadas de tela.
   */
  _finaleT(worldX) {
    const span = this.course.lengthPx - this.course.finaleStartPx;
    if (span <= 0) return 1;
    return Math.max(0, Math.min(1, (worldX - this.course.finaleStartPx) / span));
  }

  /** X de tela do gato durante a aproximação: entra pela direita e para à frente do herói. */
  _catScreenX(worldX) {
    const t = this._finaleT(worldX);
    const from = W + 24, to = HERO_X + 52;
    return from + (to - from) * t;
  }

  _drawWorld(worldX, { heroAnim = 'hero_run', heroFrame = 0, heroY = GROUND_Y, catX = null } = {}) {
    clear(3);

    // Céu
    rect(0, HUD_H, W, GROUND_Y - HUD_H, 3);

    // Parallax em duas camadas. A distante fica bem mais alta para a silhueta
    // aparecer ACIMA da próxima — se as duas ficam na mesma faixa, viram
    // uma mancha só, já que ambas usam o mesmo tom.
    const sky = A.sprites.bg_sky;
    if (sky) this._tile(sky.img, -worldX * 0.10, GROUND_Y - 42 - sky.h);
    const city = A.sprites.bg_city;
    if (city) this._tile(city.img, -worldX * 0.35, GROUND_Y - city.h);

    // Cenário e itens do percurso
    for (const c of this.course.visibleChunks(worldX - 80, worldX + W + 80)) {
      for (const d of c.decos) {
        drawSprite(d.type, d.x - worldX + HERO_X, GROUND_Y + 2);
      }
      for (const s of c.signs) {
        const sx = s.x - worldX + HERO_X;
        if (drawSprite('sign', sx, GROUND_Y)) {
          const { h } = spriteSize('sign');
          drawText(ctx, String(s.km), sx, GROUND_Y - h + 3, 0, 'center');
        }
      }
      for (const it of c.items) {
        if (this.course.isTaken(it.id)) continue;
        const ix = it.x - worldX + HERO_X;
        if (ix < -20 || ix > W + 20) continue;
        if (it.type === 'coin') {
          // Giro clássico: a moeda "afina" no meio do ciclo.
          const ph = (this.frame * 0.12 + it.x * 0.05) % (Math.PI * 2);
          const sq = Math.abs(Math.cos(ph));
          const s = A.sprites.coin;
          if (s) {
            const w2 = Math.max(1, Math.round(s.w * sq));
            ctx.drawImage(s.img, 0, 0, s.w, s.h, Math.round(ix - w2 / 2), Math.round(it.y - s.h), w2, s.h);
          }
        } else {
          drawSprite(it.type, ix, it.y);
        }
      }
    }

    // Gato esperando na chegada.
    if (catX != null) drawAnim('cat_sit', Math.floor(this.frame / 8), catX, GROUND_Y);

    // Outros jogadores correndo por perto. A posição de cada um é mantida pelo
    // RivalSet, que desliza suavemente entre as respostas do servidor (que vêm
    // a cada 4 s) e leva para fora de quadro quem se afasta ou some.
    // Os rótulos sobem em degraus para não colidirem entre si.
    this.mpVisiveis.forEach((r, i) => {
      drawAnim('rival_run', heroFrame + (r.id.charCodeAt(0) % 8), r.x, GROUND_Y);
      drawTextShadow(ctx, `${r.distM}M`, r.x, GROUND_Y - 52 - i * 9, 0, 3, 'center');
    });

    // Herói
    drawAnim(heroAnim, heroFrame, HERO_X, heroY);

    // Chão
    drawGround(worldX, GROUND_Y, W);
  }

  _tile(img, offset, dy) {
    const tw = img.width;
    let x = -(((-offset % tw) + tw) % tw);
    while (x < W) { ctx.drawImage(img, Math.round(x), Math.round(dy)); x += tw; }
  }

  _drawRun() {
    const tr = this.tracker;
    // Posição suavizada: o mundo rola continuamente mesmo com fixes a cada 1 s.
    const worldX = this.shownM * PX_PER_M;

    // O herói corre enquanto o estado for "em movimento" — que liga no primeiro
    // passo detectado e só desliga após alguns segundos parado de verdade.
    const moving = tr.moving;
    const cadence = Math.min(18, 5 + tr.displaySpeedMs * 3.2);
    const anim = moving ? 'hero_run' : 'hero_idle';
    const frame = moving ? Math.floor(this.elapsed * cadence) : Math.floor(this.elapsed * 3);

    // Na reta final o gato aparece esperando na chegada — mascote, não resgate.
    const inFinaleZone = worldX >= this.course.finaleStartPx;
    const catX = inFinaleZone ? this._catScreenX(worldX) : null;

    this._drawWorld(worldX, { heroAnim: anim, heroFrame: frame, catX });
    this._drawHud();
    if (this.debug) this._drawDebug();
  }

  _drawHud() {
    const tr = this.tracker;
    rect(0, 0, W, HUD_H, 0);

    const km = (tr.distanceM / 1000);
    drawText(ctx, `${km.toFixed(2)}KM`, 3, 2, 3);
    drawText(ctx, formatTime(this.elapsed), W - 3, 2, 3, 'right');

    // Barra de progresso com marcas de quilômetro.
    const t = Math.min(1, tr.distanceM / this.course.goalM);
    progressBar(3, 12, W - 6, 8, t, 3, 0);
    const kmCount = Math.floor(this.goalKm);
    for (let k = 1; k <= kmCount; k++) {
      const x = 5 + ((W - 10) * (k / this.goalKm));
      if (x < W - 5) rect(x, 13, 1, 6, tr.distanceM / 1000 >= k ? 0 : 2);
    }

    // Moedas e passos, na faixa de céu (fora do HUD escuro).
    //
    // Não há mais ritmo instantâneo aqui: a leitura minuto/km oscilava demais
    // para ser confiável a cada segundo. A média da corrida fica no relatório
    // final, onde o intervalo é longo o bastante para o número significar algo.
    drawTextShadow(ctx, `\x05${String(this.coins).padStart(4, '0')}`, 3, HUD_H + 3, 0, 3);
    drawTextShadow(ctx, `${tr.steps} PASSOS`, W - 3, HUD_H + 3, 0, 3, 'right');
  }

  /**
   * Painel de diagnóstico do rastreio (botão B durante a corrida).
   *
   * Mostra de onde vem cada número: quantos fixes chegaram e quantos foram
   * descartados por precisão, jitter ou salto absurdo; a velocidade da janela
   * contra a de exibição; e o quanto o cenário está atrás da distância real.
   */
  _drawDebug() {
    const tr = this.tracker;
    rect(0, 0, W, H, 0);

    const L = (y, txt, cor = 3) => drawText(ctx, txt, 3, y, cor);
    let y = 2;
    drawText(ctx, 'DIAGNOSTICO', W / 2, y, 2, 'center'); y += 10;

    L(y, 'MOVIMENTO (PASSOS)', 2); y += 9;
    L(y, ` SENSOR ${tr.motionOk ? 'SIM' : 'NAO'}  ${tr.moving ? 'ANDANDO' : 'PARADO'}`); y += 9;
    L(y, ` PASSOS ${tr.steps}  ${tr.cadenceSpm}/MIN`); y += 9;
    L(y, ` VEL ${tr.displaySpeedMs.toFixed(2)}M/S  FPS ${Math.round(this._fps)}`); y += 10;

    L(y, 'PASSADA', 2); y += 9;
    L(y, ` ${tr.stride.toFixed(3)}M  ${tr.strideCalibrated ? 'AFERIDA' : 'PADRAO'} x${tr.calibracoes}`); y += 10;

    L(y, 'GPS (SO MEDE)', 2); y += 9;
    L(y, ` ${tr.status.toUpperCase()}  PREC ${tr.accuracy == null ? '--' : Math.round(tr.accuracy) + 'M'}`); y += 9;
    L(y, ` FIX ${tr.fixesRecebidos} USA ${tr.fixesAceitos} JIT ${tr.fixesJitter}`); y += 9;
    L(y, ` IMPREC ${tr.fixesImprecisos}  ABSURDO ${tr.fixesAbsurdos}`); y += 10;

    L(y, `JOGO ${(tr.distanceM / 1000).toFixed(2)}KM  GPS ${(tr.gpsDistanceM / 1000).toFixed(2)}KM`); y += 9;
    L(y, `TELA ${this.shownM.toFixed(1)}M DIF ${(tr.distanceM - this.shownM).toFixed(1)}`);

    drawText(ctx, 'B FECHA', W / 2, H - 9, 1, 'center');
  }

  _drawPause() {
    dither(0, 0, W, H, 0, 0);
    panel(16, 40, W - 32, 62);
    drawText(ctx, 'PAUSA', W / 2, 47, 0, 'center');
    drawText(ctx, `${(this.tracker.distanceM / 1000).toFixed(2)} / ${this.goalKm} KM`, W / 2, 60, 0, 'center');
    drawText(ctx, `\x05 ${this.coins}`, W / 2, 70, 0, 'center');
    drawText(ctx, 'START CONTINUA', W / 2, 82, 0, 'center');
    drawText(ctx, 'SELECT ENCERRA', W / 2, 91, 1, 'center');
  }

  // ---------------- FINAL ----------------

  _updateFinale(dt) {
    this.finaleT += dt;
    // 0: chegando · 1: comemoração com o gato · 2: faixa de chegada
    if (this.finaleT > 0.9 && this.finalePhase === 0) { this.finalePhase = 1; sfx.win(); }
    if (this.finaleT > 2.2 && this.finalePhase === 1) { this.finalePhase = 2; }
    if (this.finaleT > 5.0) this._finish();
  }

  _finish() {
    this.tracker.stop();
    this.mp.stop();
    this._releaseWakeLock();
    store.recordRun({
      goalKm: this.goalKm, distanceM: this.tracker.distanceM,
      seconds: this.elapsed, coins: this.coins, completou: this.chegou, mode: this.mode,
    });
    this.go(S.RESULT);
  }

  /**
   * Chegada. Sem resgate e sem derrota: o herói completa a distância, o gato
   * comemora junto e o total de moedas aparece.
   */
  _drawFinale() {
    const worldX = Math.min(this.shownM, this.course.goalM) * PX_PER_M;
    const p = this.finalePhase;

    const chegando = p === 0;
    this._drawWorld(worldX, {
      heroAnim: chegando ? 'hero_run' : 'hero_idle',
      heroFrame: Math.floor(this.finaleT * (chegando ? 12 : 4)),
      catX: chegando ? HERO_X + 52 : null,
    });

    if (p >= 1) drawAnim('cat_happy', Math.floor(this.finaleT * 8), HERO_X + 24, GROUND_Y);

    if (p >= 2) {
      rect(0, 40, W, 34, 0);
      drawText(ctx, 'META CUMPRIDA!', W / 2, 45, 3, 'center');
      drawText(ctx, ` ${this.coins} MOEDAS`, W / 2, 58, 2, 'center');
    }
  }

  // ---------------- RESULTADO ----------------

  _inputResult(key) {
    if (key === 'start' || key === 'a') { sfx.confirm(); this.row = 0; this.go(S.MODO); }
    else if (key === 'b') { sfx.back(); this.go(S.TITLE); }
    else if (key === 'select') { this.menuIndex = 0; this.go(S.HISTORY); }
  }

  _drawResult() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, this.chegou ? 'META CUMPRIDA!' : 'CORRIDA ENCERRADA', W / 2, 4, 3, 'center');

    const tr = this.tracker;
    // A distância do relatório é a do GPS quando houver: ela é aferida, e a do
    // jogo vem de passos × passada estimada.
    const km = tr.reportedDistanceM / 1000;

    const rows = [
      ['DISTANCIA', `${km.toFixed(2)} KM`],
      ['META', `${this.goalKm} KM`],
      ['TEMPO', formatTime(this.elapsed)],
      ['MEDIA', `${formatKmh(tr.avgSpeedKmh(this.elapsed))} KM/H`],
      ['PASSOS', String(tr.steps)],
      ['MOEDAS', `\x05 ${this.coins}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 17 + i * 9;
      drawText(ctx, k, 6, y, 1);
      drawText(ctx, v, W - 6, y, 0, 'right');
    });

    // O gato fica na faixa livre entre os números e a barra, sem cobrir texto.
    drawAnim(this.chegou ? 'cat_happy' : 'cat_sit',
      Math.floor(this.t * (this.chegou ? 8 : 4)), W / 2, 94);

    const pct = Math.min(100, Math.round((tr.distanceM / this.course.goalM) * 100));
    progressBar(6, 96, W - 12, 9, pct / 100, 0, 3);
    drawText(ctx, `${pct}%`, W / 2, 107, 0, 'center');

    const d = store.load();
    rect(0, 116, W, H - 116, 0);
    drawText(ctx, `TOTAL \x05${d.coins}   ${d.totalKm.toFixed(1)}KM`, W / 2, 118, 2, 'center');
    if (Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, 'START CORRE DE NOVO', W / 2, 127, 3, 'center');
    }
    drawText(ctx, 'B MENU  SELECT HISTORICO', W / 2, 136, 1, 'center');
  }

  // ---------------- HISTÓRICO ----------------

  _drawHistory() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, 'HISTORICO', W / 2, 4, 3, 'center');

    const runs = store.load().runs;
    if (!runs.length) {
      drawText(ctx, 'NENHUMA CORRIDA', W / 2, 60, 1, 'center');
      drawText(ctx, 'AINDA.', W / 2, 70, 1, 'center');
    } else {
      runs.slice(0, 9).forEach((r, i) => {
        const y = 20 + i * 12;
        const dt = new Date(r.at);
        const day = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
        drawText(ctx, day, 4, y, 1);
        drawText(ctx, `${(r.distanceM / 1000).toFixed(1)}KM`, 40, y, 0);
        drawText(ctx, formatTime(r.seconds), 82, y, 0);
        // Carinha de gato = salvou; traço = não deu tempo.
        drawText(ctx, r.completou ? '\x04' : '-', W - 8, y, r.completou ? 0 : 1, 'right');
      });
    }
    drawText(ctx, 'B VOLTA', W / 2, H - 9, 0, 'center');
  }

  // ---------------- toast ----------------

  _drawToast() {
    if (this.toastT <= 0 || !this.toast) return;
    const w = textWidth(this.toast) + 10;
    const x = (W - w) / 2;
    rect(x, 60, w, 13, 0);
    drawText(ctx, this.toast, W / 2, 63, 3, 'center');
  }
}
