import { GameSession } from './generated/GameSession.js';

const elements = {
  timer: document.querySelector('#timer'),
  score: document.querySelector('#score'),
  bossStatus: document.querySelector('#boss-status'),
  boss: document.querySelector('#boss'),
  programmer: document.querySelector('#programmer'),
  monitor: document.querySelector('#monitor'),
  toast: document.querySelector('#event-toast'),
  suspicionCopy: document.querySelector('#suspicion-copy'),
  suspicionFill: document.querySelector('#suspicion-fill'),
  combo: document.querySelector('#combo'),
  playArea: document.querySelector('#play-area'),
  resultPanel: document.querySelector('#result-panel'),
  resultIcon: document.querySelector('#result-icon'),
  resultTitle: document.querySelector('#result-title'),
  resultDetail: document.querySelector('#result-detail'),
  restart: document.querySelector('#restart'),
};

const bossCopy = { safe: '老板背对着你', warning: '⚠ 老板好像要回头！', checking: '老板正在检查！' };
let session;
let lastFrame = performance.now();
let toastTimer;

function flashToast(copy) {
  elements.toast.textContent = copy;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { elements.toast.textContent = ''; }, 1200);
}

function createSession() {
  session = new GameSession({}, Date.now());
  session.subscribe(({ type, snapshot }) => {
    if (type === 'boss-warning') flashToast('椅子响了，快松手！');
    if (type === 'caught') flashToast('被抓包了！可疑度暴涨');
    if (type === 'dodge-success') flashToast(`躲过检查，连击 ${snapshot.combo}`);
    if (type === 'round-finished') showResult(snapshot);
  });
  elements.resultPanel.classList.add('hidden');
  session.start();
}

function render(state) {
  elements.timer.textContent = `${Math.ceil(state.remainingSeconds)} 秒后下班`;
  elements.score.textContent = `摸鱼值 ${Math.floor(state.score)} / 600`;
  elements.bossStatus.textContent = bossCopy[state.bossState];
  elements.boss.className = `boss ${state.bossState}`;
  elements.programmer.classList.toggle('slacking', state.isSlacking);
  elements.monitor.textContent = state.isSlacking ? '摸鱼论坛.exe' : '正在努力写代码';
  elements.suspicionCopy.textContent = `可疑度 ${Math.ceil(state.suspicion)}%`;
  elements.suspicionFill.style.width = `${state.suspicion}%`;
  elements.suspicionFill.style.background = state.suspicion >= 70 ? 'var(--danger)' : state.suspicion >= 40 ? 'var(--accent)' : 'var(--safe)';
  elements.combo.textContent = `连击 ${state.combo} · x${state.multiplier.toFixed(1)}`;
  elements.playArea.textContent = state.isSlacking ? '正在摸鱼…松手工作' : '按住开始摸鱼';
  elements.playArea.classList.toggle('pressed', state.isSlacking);
}

function showResult(state) {
  const view = {
    punctual: ['🎉', '准时下班！', `摸鱼值 ${Math.floor(state.score)}，成功躲过 ${state.successfulDodges} 次检查。`],
    overtime: ['🌙', '被迫加班', `还差 ${Math.max(0, 600 - Math.floor(state.score))} 摸鱼值，下次再贪一点。`],
    fired: ['📦', '惨遭开除', `被抓包 ${state.caughtCount} 次。老板请你收拾纸箱。`],
  }[state.result];
  [elements.resultIcon.textContent, elements.resultTitle.textContent, elements.resultDetail.textContent] = view;
  elements.resultPanel.classList.remove('hidden');
}

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  session.update(delta);
  render(session.getSnapshot());
  requestAnimationFrame(frame);
}

function release(event) {
  event?.preventDefault();
  session.release();
}

elements.playArea.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  elements.playArea.setPointerCapture(event.pointerId);
  session.press();
});
elements.playArea.addEventListener('pointerup', release);
elements.playArea.addEventListener('pointercancel', release);
elements.playArea.addEventListener('lostpointercapture', release);
elements.restart.addEventListener('click', createSession);
document.querySelectorAll('.themes button[data-theme]').forEach((button) => button.addEventListener('click', () => {
  document.body.dataset.theme = button.dataset.theme;
}));
document.addEventListener('visibilitychange', () => document.hidden ? session.pause() : session.resume());

createSession();
requestAnimationFrame(frame);
