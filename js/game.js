// Meow Hero — máquina de estados e loop principal.
//
// Desenho do jogo: a corrida é PASSIVA. O celular fica no bolso e o herói só
// avança quando o usuário se move de verdade. Não há obstáculos nem toque
// durante a corrida — o retorno vem por som e vibração, e o desfecho fica
// guardado para o final.
import {
  W, H, GROUND_Y, HUD_H, HERO_X, PX_PER_M, GOALS, PACES,
  CHUNK_PX, MILK_SECONDS, CUE_HALFWAY, CUE_LOW_TIME_S,
} from './config.js';
import { ctx, clear, rect, rectOutline, panel, dither, progressBar } from './gfx.js';
import { drawText, drawTextShadow, textWidth, wrapText, LINE_H } from './font.js';
import { A, drawSprite, drawAnim, drawGround, spriteSize } from './assets.js';
import { Course } from './course.js';
import { Tracker, formatPace, formatTime } from './tracker.js';
import { sfx, resumeAudio, vibrate } from './audio.js';
import * as store from './storage.js';

const S = {
  TITLE: 'title', SETUP: 'setup', ARM: 'arm', RUN: 'run',
  PAUSE: 'pause', FINALE: 'finale', RESULT: 'result', HISTORY: 'history',
};

const MODES = [
  { id: 'gps',   label: 'GPS',      hint: 'Ao ar livre. Usa o sinal de GPS.' },
  { id: 'steps', label: 'PASSOS',   hint: 'Esteira ou indoor. Conta passos.' },
  { id: 'demo',  label: 'DEMO',     hint: 'Simulador, para testar sem correr.' },
];

export class Game {
  constructor() {
    this.state = S.TITLE;
    this.t = 0;              // tempo do estado atual, em segundos
    this.frame = 0;

    this.tracker = new Tracker();
    this.course = null;

    const d = store.load();
    this.goalKm = d.lastGoal ?? 5;
    this.paceMinKm = d.lastPace ?? 8;
    this.mode = d.lastMode ?? 'gps';
    this.setupRow = 0;

    this.coins = 0;
    this.timeLeft = 0;
    this.elapsed = 0;
    this.kmCued = 0;
    this.halfCued = false;
    this.lowTimeCued = false;

    this.saved = false;
    this.finaleT = 0;
    this.finalePhase = 0;

    // Modo bolso: a tela apaga sozinha para poupar bateria e evitar toque acidental.
    this.pocket = false;
    this.lastTouch = 0;
    this.wakeLock = null;

    this.menuIndex = 0;
    this.toast = null;
    this.toastT = 0;
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
    if (this.toastT > 0) this.toastT -= dt;

    this.tracker.tick(dt);

    switch (this.state) {
      case S.ARM: this._updateArm(dt); break;
      case S.RUN: this._updateRun(dt); break;
      case S.FINALE: this._updateFinale(dt); break;
    }
  }

  draw() {
    // Modo bolso: tela praticamente apagada. Economiza bateria em OLED e
    // evita que o bolso dispare toques.
    if (this.pocket && (this.state === S.RUN || this.state === S.ARM)) {
      clear(0);
      // Números em tom escuro: dá pra conferir de relance sem acordar a tela,
      // e continua economizando bateria em telas OLED.
      drawText(ctx, `${(this.tracker.distanceM / 1000).toFixed(2)} KM`, W / 2, 56, 1, 'center');
      drawText(ctx, formatTime(this.timeLeft), W / 2, 70, 1, 'center');
      drawText(ctx, 'TOQUE PARA VER', W / 2, 92, 1, 'center');
      return;
    }

    switch (this.state) {
      case S.TITLE: this._drawTitle(); break;
      case S.SETUP: this._drawSetup(); break;
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
      case S.SETUP: return this._inputSetup(key);
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
    if (key === 'start' || key === 'a' || key === 'tap') { sfx.confirm(); this.go(S.SETUP); }
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
    drawText(ctx, 'CORRA. SALVE O GATO.', W / 2, 27, 2, 'center');

    const d = store.load();
    rect(0, H - 26, W, 26, 0);
    if (Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, 'START PARA COMECAR', W / 2, H - 22, 3, 'center');
    }
    drawText(ctx, `\x05${d.coins}  \x04${d.catsSaved}  ${d.totalKm.toFixed(1)}KM`, W / 2, H - 11, 2, 'center');
  }

  // ---------------- CONFIGURAÇÃO ----------------

  _inputSetup(key) {
    const rows = 3;
    if (key === 'up') { this.setupRow = (this.setupRow + rows - 1) % rows; sfx.select(); }
    else if (key === 'down') { this.setupRow = (this.setupRow + 1) % rows; sfx.select(); }
    else if (key === 'left' || key === 'right') {
      const dir = key === 'right' ? 1 : -1;
      if (this.setupRow === 0) {
        const i = GOALS.indexOf(this.goalKm);
        this.goalKm = GOALS[(i + dir + GOALS.length) % GOALS.length];
      } else if (this.setupRow === 1) {
        const i = PACES.indexOf(this.paceMinKm);
        this.paceMinKm = PACES[(i + dir + PACES.length) % PACES.length];
      } else {
        const i = MODES.findIndex(m => m.id === this.mode);
        this.mode = MODES[(i + dir + MODES.length) % MODES.length].id;
      }
      sfx.select();
    }
    else if (key === 'b') { sfx.back(); this.go(S.TITLE); }
    else if (key === 'start' || key === 'a') { sfx.confirm(); this._arm(); }
  }

  get limitSeconds() { return this.goalKm * this.paceMinKm * 60; }

  _drawSetup() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, 'PREPARAR CORRIDA', W / 2, 4, 3, 'center');

    const mode = MODES.find(m => m.id === this.mode);
    const rows = [
      ['META', `${this.goalKm.toFixed(this.goalKm % 1 ? 1 : 0)} KM`],
      ['RITMO', `${this.paceMinKm}:00 /KM`],
      ['MODO', mode.label],
    ];

    rows.forEach(([label, value], i) => {
      const y = 24 + i * 20;
      const on = i === this.setupRow;
      if (on) { rect(4, y - 3, W - 8, 17, 2); rectOutline(4, y - 3, W - 8, 17, 0); }
      // Texto recuado para as setas piscantes não encostarem nele.
      drawText(ctx, label, 14, y + 2, 0);
      drawText(ctx, value, W - 15, y + 2, 0, 'right');
      if (on && Math.floor(this.t * 3) % 2 === 0) {
        drawText(ctx, '\x08', 7, y + 2, 0);
        drawText(ctx, '\x03', W - 12, y + 2, 0);
      }
    });

    // Resumo
    rect(0, 88, W, 32, 0);
    drawText(ctx, `TEMPO LIMITE ${formatTime(this.limitSeconds)}`, W / 2, 91, 3, 'center');
    wrapText(mode.hint, W - 12).slice(0, 2).forEach((l, i) =>
      drawText(ctx, l, W / 2, 102 + i * LINE_H, 2, 'center'));

    drawText(ctx, 'START COMECA   B VOLTA', W / 2, 128, 0, 'center');
  }

  // ---------------- ARMAR (permissões / sinal) ----------------

  async _arm() {
    store.set('lastGoal', this.goalKm);
    store.set('lastPace', this.paceMinKm);
    store.set('lastMode', this.mode);

    this.course = new Course(this.goalKm, Math.round(this.goalKm * 977) % 100000);
    this.coins = 0;
    this.elapsed = 0;
    this.timeLeft = this.limitSeconds;
    this.kmCued = 0;
    this.halfCued = false;
    this.lowTimeCued = false;
    this.saved = false;
    this._collectedTo = 0;
    this.tracker.reset();
    this.tracker.stride = store.get('stride') || 0.78;

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
    if (key === 'b') { sfx.back(); this.tracker.stop(); this._releaseWakeLock(); this.go(S.SETUP); }
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
      waiting: this.mode === 'gps' ? 'Procurando satelites' : 'Aguardando sensor',
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
      const msg = this.mode === 'gps'
        ? 'Autorize a localizacao ou volte e escolha PASSOS.'
        : 'Autorize o sensor de movimento ou use DEMO.';
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
    this.timeLeft -= dt;

    // Entra em modo bolso após um tempo sem toque — é o uso previsto.
    if (!this.pocket && performance.now() - this.lastTouch > 20000) this.pocket = true;

    const dist = tr.distanceM;

    // Avisos sonoros/táteis: a única forma de retorno com o celular no bolso.
    const kmNow = Math.floor(dist / 1000);
    if (kmNow > this.kmCued) { this.kmCued = kmNow; sfx.km(kmNow); }

    if (CUE_HALFWAY && !this.halfCued && dist >= this.course.goalM / 2) {
      this.halfCued = true;
      sfx.halfway();
    }
    if (!this.lowTimeCued && this.timeLeft <= CUE_LOW_TIME_S && this.timeLeft > 0) {
      this.lowTimeCued = true;
      sfx.lowTime();
    }

    // Coleta automática: tudo que o herói ultrapassa entra no total.
    //
    // A varredura vai do último ponto coletado até a posição atual, não só do
    // que está na tela: com o app suspenso no bolso, a distância pode dar um
    // salto grande entre dois frames e as moedas do trecho pulado seriam
    // perdidas. O limite de chunks por frame evita travar depois de uma pausa
    // longa — o resto é coletado nos frames seguintes.
    const worldX = dist * PX_PER_M;
    const MAX_CHUNKS = 40;
    const from = Math.max(0, this._collectedTo ?? (worldX - CHUNK_PX));
    const to = Math.min(worldX, from + MAX_CHUNKS * CHUNK_PX);

    for (const c of this.course.visibleChunks(from, to + W)) {
      for (const it of c.items) {
        if (it.x <= worldX && !this.course.isTaken(it.id)) {
          this.course.take(it.id);
          if (it.type === 'coin') { this.coins++; if (!this.pocket) sfx.coin(); }
          else if (it.type === 'milk') {
            this.timeLeft += MILK_SECONDS;
            if (!this.pocket) sfx.milk();
            this.say(`+${MILK_SECONDS}s`, 1.6);
          }
        }
      }
    }
    this._collectedTo = to;

    // Chegou na meta.
    if (dist >= this.course.goalM) {
      this.saved = this.timeLeft > 0;
      this.pocket = false;
      this.finaleT = 0;
      this.finalePhase = 0;
      this.go(S.FINALE);
      return;
    }

    // Tempo esgotado.
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.saved = false;
      this.pocket = false;
      this.finaleT = 0;
      this.finalePhase = 0;
      this.go(S.FINALE);
    }
  }

  _inputRun(key) {
    if (key === 'start') { sfx.pause(); this.go(S.PAUSE); }
    else if (key === 'select') { this.pocket = true; vibrate(30); }
    else if (key === 'a' && this.mode === 'demo') this.tracker.demoNudge(120);
  }

  _inputPause(key) {
    if (key === 'start' || key === 'b') { sfx.confirm(); this.go(S.RUN); this.lastTouch = performance.now(); }
    else if (key === 'select') { this._abandon(); }
  }

  _abandon() {
    sfx.back();
    this.tracker.stop();
    this._releaseWakeLock();
    this.saved = false;
    store.recordRun({
      goalKm: this.goalKm, distanceM: this.tracker.distanceM,
      seconds: this.elapsed, coins: this.coins, saved: false, mode: this.mode,
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

  _drawWorld(worldX, { heroAnim = 'hero_run', heroFrame = 0, heroY = GROUND_Y, catX = null, truckX = null } = {}) {
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

    // Gato e caminhão (reta final)
    if (catX != null) {
      drawAnim('cat_sit', Math.floor(this.frame / 8), catX, GROUND_Y);
    }
    if (truckX != null) {
      drawSprite('truck', truckX, GROUND_Y - 1, { flip: true });
    }

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
    const worldX = tr.distanceM * PX_PER_M;

    // O herói só corre quando o usuário se move de verdade.
    const moving = tr.isMoving;
    const cadence = Math.min(18, 5 + tr.speedMs * 3.2);
    const anim = moving ? 'hero_run' : 'hero_idle';
    const frame = moving ? Math.floor(this.elapsed * cadence) : Math.floor(this.elapsed * 3);

    const inFinaleZone = worldX >= this.course.finaleStartPx;
    const catX = inFinaleZone ? this._catScreenX(worldX) : null;

    let truckX = null;
    if (inFinaleZone) {
      // O caminhão se aproxima conforme o tempo aperta: com folga ele fica fora
      // de quadro; faltando pouco, vem em cima do gato. Mas para antes de
      // cobri-lo — o gato precisa continuar visível, é ele que está em risco.
      const remainRatio = Math.max(0, Math.min(1, this.timeLeft / 45));
      const wanted = W + 50 - (1 - remainRatio) * 120;
      const halfTruck = spriteSize('truck').w / 2;
      truckX = Math.max(catX + halfTruck + 14, wanted);
    }

    this._drawWorld(worldX, { heroAnim: anim, heroFrame: frame, catX, truckX });
    this._drawHud();
  }

  _drawHud() {
    const tr = this.tracker;
    rect(0, 0, W, HUD_H, 0);

    const km = (tr.distanceM / 1000);
    drawText(ctx, `${km.toFixed(2)}KM`, 3, 2, 3);
    drawText(ctx, formatTime(this.timeLeft), W - 3, 2, this.timeLeft < 60 ? 2 : 3, 'right');

    // Barra de progresso com marcas de quilômetro.
    const t = Math.min(1, tr.distanceM / this.course.goalM);
    progressBar(3, 12, W - 6, 8, t, 3, 0);
    const kmCount = Math.floor(this.goalKm);
    for (let k = 1; k <= kmCount; k++) {
      const x = 5 + ((W - 10) * (k / this.goalKm));
      if (x < W - 5) rect(x, 13, 1, 6, tr.distanceM / 1000 >= k ? 0 : 2);
    }

    // Moedas e ritmo, na faixa de céu (fora do HUD escuro).
    drawTextShadow(ctx, `\x05${String(this.coins).padStart(4, '0')}`, 3, HUD_H + 3, 0, 3);
    const pace = tr.isMoving ? formatPace(tr.paceMinKm) : '--:--';
    drawTextShadow(ctx, `${pace}/KM`, W - 3, HUD_H + 3, 0, 3, 'right');

    if (tr.status === 'stale') {
      drawTextShadow(ctx, 'SINAL FRACO', W / 2, HUD_H + 14, 0, 3, 'center');
    }
  }

  _drawPause() {
    dither(0, 0, W, H, 0, 0);
    panel(16, 40, W - 32, 62);
    drawText(ctx, 'PAUSA', W / 2, 47, 0, 'center');
    drawText(ctx, `${(this.tracker.distanceM / 1000).toFixed(2)} / ${this.goalKm} KM`, W / 2, 60, 0, 'center');
    drawText(ctx, `\x05 ${this.coins}`, W / 2, 70, 0, 'center');
    drawText(ctx, 'START CONTINUA', W / 2, 82, 0, 'center');
    drawText(ctx, 'SELECT DESISTE', W / 2, 91, 1, 'center');
  }

  // ---------------- FINAL ----------------

  _updateFinale(dt) {
    this.finaleT += dt;

    if (this.saved) {
      // 0: corre até o gato · 1: salto · 2: resgate · 3: comemoração
      if (this.finaleT > 1.1 && this.finalePhase === 0) { this.finalePhase = 1; }
      if (this.finaleT > 2.0 && this.finalePhase === 1) { this.finalePhase = 2; sfx.win(); }
      if (this.finaleT > 3.4 && this.finalePhase === 2) { this.finalePhase = 3; }
      if (this.finaleT > 6.0) this._finish();
    } else {
      if (this.finaleT > 1.4 && this.finalePhase === 0) { this.finalePhase = 1; sfx.lose(); }
      if (this.finaleT > 4.5) this._finish();
    }
  }

  _finish() {
    this.tracker.stop();
    this._releaseWakeLock();
    store.recordRun({
      goalKm: this.goalKm, distanceM: this.tracker.distanceM,
      seconds: this.elapsed, coins: this.coins, saved: this.saved, mode: this.mode,
    });
    this.go(S.RESULT);
  }

  _drawFinale() {
    const worldX = Math.min(this.tracker.distanceM, this.course.goalM) * PX_PER_M;
    const p = this.finalePhase;

    if (this.saved) {
      let heroAnim = 'hero_run', heroFrame = Math.floor(this.finaleT * 12), heroY = GROUND_Y;

      if (p >= 1) {
        // Salto em direção ao gato.
        const jt = Math.min(1, (this.finaleT - 1.1) / 0.9);
        heroAnim = 'hero_jump';
        heroFrame = Math.floor(jt * (A.anims.hero_jump?.frames ?? 7));
        heroY = GROUND_Y - Math.sin(jt * Math.PI) * 26;
      }
      if (p >= 2) { heroAnim = 'hero_idle'; heroFrame = Math.floor(this.finaleT * 4); heroY = GROUND_Y; }

      this._drawWorld(worldX, {
        heroAnim, heroFrame, heroY,
        catX: p < 2 ? HERO_X + 52 : null,
        truckX: p >= 1 && p < 3 ? W + 40 - (this.finaleT - 1.1) * 260 : null,
      });

      // Depois do resgate, o gato aparece feliz ao lado do herói.
      if (p >= 2) drawAnim('cat_happy', Math.floor(this.finaleT * 8), HERO_X + 22, GROUND_Y);

      if (p >= 3) {
        rect(0, 44, W, 30, 0);
        drawText(ctx, 'GATO SALVO!', W / 2, 50, 3, 'center');
        drawText(ctx, `\x04 MEOW! \x04`, W / 2, 62, 2, 'center');
      }
    } else {
      // Sem drama explícito: buzina, corte para o escuro e a constatação.
      this._drawWorld(worldX, {
        heroAnim: 'hero_idle', heroFrame: Math.floor(this.finaleT * 3),
        catX: p < 1 ? HERO_X + 52 : null,
        truckX: p < 1 ? W + 20 - this.finaleT * 120 : null,
      });

      if (p >= 1) {
        const k = Math.min(1, (this.finaleT - 1.4) / 0.8);
        if (k < 0.35) rect(0, 0, W, H, 3);
        else { clear(0); }
        if (k > 0.5) {
          drawText(ctx, 'O TEMPO ACABOU', W / 2, 60, 3, 'center');
          drawText(ctx, 'NAO DEU PRA CHEGAR', W / 2, 74, 2, 'center');
        }
      }
    }
  }

  // ---------------- RESULTADO ----------------

  _inputResult(key) {
    if (key === 'start' || key === 'a') { sfx.confirm(); this.go(S.SETUP); }
    else if (key === 'b') { sfx.back(); this.go(S.TITLE); }
    else if (key === 'select') { this.menuIndex = 0; this.go(S.HISTORY); }
  }

  _drawResult() {
    clear(3);
    rect(0, 0, W, 14, 0);
    drawText(ctx, this.saved ? 'GATO SALVO!' : 'FIM DA CORRIDA', W / 2, 4, 3, 'center');

    const tr = this.tracker;
    const km = tr.distanceM / 1000;
    const pace = tr.paceAvg(this.elapsed);

    const rows = [
      ['DISTANCIA', `${km.toFixed(2)} KM`],
      ['META', `${this.goalKm} KM`],
      ['TEMPO', formatTime(this.elapsed)],
      ['RITMO', `${formatPace(pace)} /KM`],
      ['MOEDAS', `\x05 ${this.coins}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 18 + i * 10;
      drawText(ctx, k, 6, y, 1);
      drawText(ctx, v, W - 6, y, 0, 'right');
    });

    // O gato fica na faixa livre entre os números e a barra, sem cobrir texto.
    const catAnim = this.saved ? 'cat_happy' : 'cat_sit';
    drawAnim(catAnim, Math.floor(this.t * (this.saved ? 8 : 4)), W / 2, 92);

    const pct = Math.min(100, Math.round((tr.distanceM / this.course.goalM) * 100));
    progressBar(6, 94, W - 12, 9, pct / 100, 0, 3);
    drawText(ctx, `${pct}%`, W / 2, 105, 0, 'center');

    const d = store.load();
    rect(0, 114, W, H - 114, 0);
    drawText(ctx, `TOTAL \x05${d.coins}  \x04${d.catsSaved}`, W / 2, 116, 2, 'center');
    if (Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, 'START CORRE DE NOVO', W / 2, 125, 3, 'center');
    }
    drawText(ctx, 'B MENU  SELECT HISTORICO', W / 2, 134, 1, 'center');
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
        drawText(ctx, r.saved ? '\x04' : '-', W - 8, y, r.saved ? 0 : 1, 'right');
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
