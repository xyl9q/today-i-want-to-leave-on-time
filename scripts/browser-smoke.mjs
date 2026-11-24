import { writeFile } from 'node:fs/promises';

const port = Number(process.env.WORKDAY_BROWSER_PORT || 9223);
const screenshotPath = process.env.WORKDAY_SCREENSHOT || 'cocos-preview.png';
const targetUrl = process.env.WORKDAY_URL || 'http://127.0.0.1:4174';
const deadline = Date.now() + 15_000;
let pages = [];

while (Date.now() < deadline) {
  try {
    pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
    if (pages.some((page) => page.type === 'page')) break;
  } catch {
    // Browser may still be starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith(targetUrl))
  ?? pages.find((candidate) => candidate.type === 'page');
if (!page) throw new Error(`No debuggable page found on port ${port}.`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const diagnostics = [];
let nextId = 1;

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data.toString());
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    diagnostics.push({ type: 'exception', detail: message.params.exceptionDetails });
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    diagnostics.push({
      type: `console.${message.params.type}`,
      detail: message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    });
  }
  if (message.method === 'Log.entryAdded') {
    diagnostics.push({ type: `log.${message.params.entry.level}`, detail: message.params.entry.text });
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await Promise.all([send('Runtime.enable'), send('Log.enable'), send('Page.enable')]);
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.removeItem('workday-game:tutorial-complete');`,
});
await send('Emulation.setDeviceMetricsOverride', {
  width: 430,
  height: 860,
  deviceScaleFactor: 1,
  mobile: true,
  screenOrientation: { type: 'portraitPrimary', angle: 0 },
});
await send('Page.navigate', { url: targetUrl });
await new Promise((resolve) => setTimeout(resolve, 12_000));

const tutorial = await send('Runtime.evaluate', {
  expression: `(() => {
    const scene = cc.director.getScene();
    const bootstrap = scene.getChildByPath('Canvas').getComponent('GameBootstrap');
    const overlay = scene.getChildByPath('Canvas/TutorialOverlay');
    const title = scene.getChildByPath('Canvas/TutorialOverlay/TutorialCard/TutorialTitle').getComponent(cc.Label).string;
    const pausedAtFirstStep = overlay.active && bootstrap.session.getSnapshot().phase === 'paused';
    const next = scene.getChildByPath('Canvas/TutorialOverlay/TutorialCard/TutorialNext');
    next.emit(cc.Node.EventType.TOUCH_END);
    next.emit(cc.Node.EventType.TOUCH_END);
    next.emit(cc.Node.EventType.TOUCH_END);
    return JSON.stringify({
      title,
      pausedAtFirstStep,
      completed: !overlay.active && bootstrap.session.getSnapshot().phase === 'running',
      stored: localStorage.getItem('workday-game:tutorial-complete'),
    });
  })()`,
  returnByValue: true,
});

const controls = await send('Runtime.evaluate', {
  expression: `(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByPath('Canvas');
    const bootstrap = canvas.getComponent('GameBootstrap');
    canvas.getChildByPath('TaskButton').emit(cc.Node.EventType.TOUCH_END);
    const taskPaused = bootstrap.controlPanel.active && bootstrap.session.getSnapshot().phase === 'paused';
    const taskTitle = canvas.getChildByPath('ControlOverlay/ControlCard/ControlTitle').getComponent(cc.Label).string;
    canvas.getChildByPath('ControlOverlay/ControlCard/ContinueButton').emit(cc.Node.EventType.TOUCH_END);
    canvas.getChildByPath('SettingsButton').emit(cc.Node.EventType.TOUCH_END);
    const settingsTitle = canvas.getChildByPath('ControlOverlay/ControlCard/ControlTitle').getComponent(cc.Label).string;
    const settingsActions = canvas.getChildByPath('ControlOverlay/ControlCard/RestartOption').active
      && canvas.getChildByPath('ControlOverlay/ControlCard/TutorialOption').active;
    canvas.getChildByPath('ControlOverlay/ControlCard/ContinueButton').emit(cc.Node.EventType.TOUCH_END);
    bootstrap.startRound();
    bootstrap.session.update(12);
    const passiveDodges = bootstrap.session.getSnapshot().successfulDodges;
    return JSON.stringify({ taskPaused, taskTitle, settingsTitle, settingsActions, passiveDodges });
  })()`,
  returnByValue: true,
});

await send('Runtime.evaluate', {
  expression: `(() => {
    const scene = cc.director.getScene();
    scene.getChildByPath('Canvas').getComponent('GameBootstrap').startRound();
  })()`,
});
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: 215,
  y: 300,
  button: 'left',
  buttons: 1,
  clickCount: 1,
});
await new Promise((resolve) => setTimeout(resolve, 1_000));
await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: 215,
  y: 300,
  button: 'left',
  buttons: 0,
  clickCount: 1,
});
await new Promise((resolve) => setTimeout(resolve, 100));
const riskBar = await send('Runtime.evaluate', {
  expression: `(() => {
    const scene = cc.director.getScene();
    const fill = scene.getChildByPath('Canvas/SuspicionFill');
    return JSON.stringify({
      label: scene.getChildByPath('Canvas/SuspicionText').getComponent(cc.Label).string,
      scaleX: fill.scale.x,
    });
  })()`,
  returnByValue: true,
});
await send('Runtime.evaluate', {
  expression: `(() => {
    const bootstrap = cc.director.getScene().getChildByPath('Canvas').getComponent('GameBootstrap');
    const event = bootstrap.eventDeck.update(20);
    if (event) bootstrap.applyWorkEvent(event);
  })()`,
});
await new Promise((resolve) => setTimeout(resolve, 100));
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: 215,
  y: 300,
  button: 'left',
  buttons: 1,
  clickCount: 1,
});
await new Promise((resolve) => setTimeout(resolve, 300));
const interaction = await send('Runtime.evaluate', {
  expression: `(() => {
    const scene = cc.director.getScene();
    const label = (path) => scene.getChildByPath(path).getComponent(cc.Label).string;
    return JSON.stringify({
      score: label('Canvas/Score'),
      programmer: scene.getChildByPath('Canvas').getComponent('GameBootstrap').session.getSnapshot().isSlacking,
      action: label('Canvas/PlayArea/ActionLabel'),
      eventTitle: label('Canvas/EventCard/EventTitle'),
      eventVisible: scene.getChildByPath('Canvas/EventCard').active,
      forumVisible: scene.getChildByPath('Canvas/Desk/Monitor/ForumPreview').active,
      bossArt: Boolean(scene.getChildByPath('Canvas/Boss/BossPixelArt')),
      programmerArt: Boolean(scene.getChildByPath('Canvas/Programmer/ProgrammerPixelArt')),
    });
  })()`,
  returnByValue: true,
});

const evaluation = await send('Runtime.evaluate', {
  expression: `(() => {
    const scene = typeof cc !== 'undefined' ? cc.director.getScene() : null;
    const flatten = (node) => [node.name, ...node.children.flatMap(flatten)];
    return JSON.stringify({
      title: document.title,
      readyState: document.readyState,
      bodyText: document.body.innerText,
      canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      })),
      cocos: typeof cc !== 'undefined',
      scene: scene?.name ?? null,
      nodes: scene ? flatten(scene) : [],
      totalFrames: typeof cc !== 'undefined' ? cc.director.getTotalFrames() : 0,
    });
  })()`,
  returnByValue: true,
});

await send('Runtime.evaluate', {
  expression: `(() => {
    const canvas = cc.director.getScene().getChildByPath('Canvas');
    const bootstrap = canvas.getComponent('GameBootstrap');
    bootstrap.session.pause();
    bootstrap.eventCardSeconds = 0;
    canvas.getChildByPath('EventCard').active = false;
  })()`,
});

const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

const report = {
  page: JSON.parse(evaluation.result.value),
  tutorial: JSON.parse(tutorial.result.value),
  controls: JSON.parse(controls.result.value),
  riskBar: JSON.parse(riskBar.result.value),
  interaction: JSON.parse(interaction.result.value),
  diagnostics,
  screenshotPath,
};
console.log(JSON.stringify(report, null, 2));
socket.close();

if (diagnostics.some((entry) => entry.type === 'exception' || entry.type === 'console.error' || entry.type === 'log.error')) {
  process.exitCode = 1;
}
