import {
  _decorator,
  Color,
  Component,
  Graphics,
  Input,
  Label,
  Node,
  ResolutionPolicy,
  UITransform,
  Vec3,
  input,
  sys,
  view,
} from 'cc';
import {
  GameSession,
  type BossState,
  type GameEvent,
  type GameResult,
  type GameSnapshot,
} from './core/GameSession';
import { WorkEventDeck, type WorkEventDefinition } from './core/WorkEvents';

const { ccclass } = _decorator;
const TUTORIAL_STORAGE_KEY = 'workday-game:tutorial-complete';
const TUTORIAL_STEPS = [
  { title: '第一步：放心摸鱼', copy: '按住下方黄色区域，就会持续获得摸鱼值。' },
  { title: '第二步：观察老板', copy: '看到老板回头预警，立刻松手切回工作。' },
  { title: '第三步：别被开除', copy: '摸鱼会增加可疑度；达到 100%，本日直接结束。' },
] as const;

interface ThemeColors {
  ink: Color;
  paper: Color;
  accent: Color;
  danger: Color;
  safe: Color;
  sky: Color;
  floor: Color;
  desk: Color;
  monitor: Color;
  boss: Color;
  skin: Color;
  white: Color;
}

const BOSS_COPY: Record<BossState, string> = {
  safe: '老板正在看日报',
  warning: '老板突然抬头！',
  checking: '老板正在巡查！',
};

const RESULT_COPY: Record<GameResult, { icon: string; title: string }> = {
  punctual: { icon: '✓', title: '准时下班！' },
  overtime: { icon: '…', title: '被迫加班' },
  fired: { icon: '!', title: '惨遭开除' },
};

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private readonly colors: ThemeColors = {
    ink: new Color('#182238'),
    paper: new Color('#EEF1FF'),
    accent: new Color('#FFD166'),
    danger: new Color('#EF476F'),
    safe: new Color('#06D6A0'),
    sky: new Color('#CDE8F6'),
    floor: new Color('#8A78A8'),
    desk: new Color('#C17C52'),
    monitor: new Color('#101827'),
    boss: new Color('#324A6D'),
    skin: new Color('#F4BE91'),
    white: new Color('#FFFFFF'),
  };

  private session: GameSession | null = null;
  private eventDeck: WorkEventDeck | null = null;
  private unsubscribe: (() => void) | null = null;
  private timerLabel: Label | null = null;
  private scoreLabel: Label | null = null;
  private bossStatusLabel: Label | null = null;
  private bossNode: Node | null = null;
  private bossBodyGraphics: Graphics | null = null;
  private bossPixelGraphics: Graphics | null = null;
  private monitorLabel: Label | null = null;
  private forumPreview: Node | null = null;
  private programmerLabel: Label | null = null;
  private programmerPixelGraphics: Graphics | null = null;
  private suspicionLabel: Label | null = null;
  private suspicionFill: Graphics | null = null;
  private comboLabel: Label | null = null;
  private actionLabel: Label | null = null;
  private playArea: Node | null = null;
  private toastLabel: Label | null = null;
  private eventCard: Node | null = null;
  private eventTitleLabel: Label | null = null;
  private eventCopyLabel: Label | null = null;
  private resultPanel: Node | null = null;
  private resultIconLabel: Label | null = null;
  private resultTitleLabel: Label | null = null;
  private resultDetailLabel: Label | null = null;
  private tutorialPanel: Node | null = null;
  private tutorialTitleLabel: Label | null = null;
  private tutorialCopyLabel: Label | null = null;
  private tutorialButtonLabel: Label | null = null;
  private controlPanel: Node | null = null;
  private controlTitleLabel: Label | null = null;
  private controlBodyLabel: Label | null = null;
  private controlContinueLabel: Label | null = null;
  private controlRestartOption: Node | null = null;
  private controlTutorialOption: Node | null = null;
  private controlWasRunning = false;
  private toastSeconds = 0;
  private eventCardSeconds = 0;
  private warningPulseSeconds = 0;
  private tutorialStep = 0;
  private tutorialRequired = false;

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(750, 1334);
    this.node.setPosition(375, 667, 0);
    this.buildInterface();
    this.bindInput();
    this.tutorialRequired = sys.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== '1';
    this.startRound();
  }

  protected update(deltaTime: number): void {
    const step = Math.min(deltaTime, 0.1);
    this.session?.update(step);
    if (this.session?.getSnapshot().phase === 'running') {
      const event = this.eventDeck?.update(step);
      if (event) this.applyWorkEvent(event);
    }
    if (this.session) this.render(this.session.getSnapshot());

    this.toastSeconds = Math.max(0, this.toastSeconds - deltaTime);
    if (this.toastLabel) this.toastLabel.node.active = this.toastSeconds > 0;
    this.eventCardSeconds = Math.max(0, this.eventCardSeconds - deltaTime);
    if (this.eventCard) this.eventCard.active = this.eventCardSeconds > 0;

    this.warningPulseSeconds += deltaTime;
    if (this.bossNode && this.session?.getSnapshot().bossState === 'warning') {
      const pulse = 1 + Math.sin(this.warningPulseSeconds * 22) * 0.045;
      this.bossNode.setScale(pulse, pulse, 1);
    }
  }

  protected onDestroy(): void {
    this.unbindInput();
    this.unsubscribe?.();
  }

  public startRound(): void {
    this.unsubscribe?.();
    const seed = Date.now();
    this.session = new GameSession({}, seed);
    this.eventDeck = new WorkEventDeck(seed ^ 0x51f15e);
    this.unsubscribe = this.session.subscribe((event) => this.onGameEvent(event));
    if (this.resultPanel) this.resultPanel.active = false;
    if (this.eventCard) this.eventCard.active = false;
    this.eventCardSeconds = 0;
    this.session.start();
    if (this.tutorialRequired) this.showTutorial();
    this.render(this.session.getSnapshot());
  }

  private buildInterface(): void {
    for (const child of [...this.node.children]) {
      if (child.name !== 'Camera') child.destroy();
    }

    this.addPanel(this.node, 'Background', 750, 1334, 0, 0, this.colors.paper);
    this.addPanel(this.node, 'Topbar', 750, 112, 0, 611, this.colors.ink);
    this.timerLabel = this.addLabel(this.node, 'Timer', '90 秒后下班', 31, this.colors.white, -185, 611, 330, 60, Label.HorizontalAlign.LEFT);
    this.scoreLabel = this.addLabel(this.node, 'Score', '摸鱼值 0 / 600', 27, this.colors.white, 190, 611, 320, 60, Label.HorizontalAlign.RIGHT);

    this.addPanel(this.node, 'Sky', 750, 660, 0, 225, this.colors.sky);
    this.createMangaBackdrop();
    this.addPanel(this.node, 'Floor', 750, 250, 0, -230, this.colors.floor);
    this.createTopControls();
    this.bossStatusLabel = this.addPill(this.node, 'BossStatus', BOSS_COPY.safe, 286, 66, 0, 472, this.colors.white, this.colors.ink, 25);
    this.createBoss();
    this.createDeskAndProgrammer();
    this.toastLabel = this.addLabel(this.node, 'Toast', '', 27, this.colors.danger, 0, 65, 620, 54);
    this.toastLabel.node.active = false;
    this.createEventCard();

    this.addPanel(this.node, 'Hud', 750, 390, 0, -472, this.colors.white, 0, this.colors.ink, 6);
    this.suspicionLabel = this.addLabel(this.node, 'SuspicionText', '可疑度 0%', 24, this.colors.ink, -215, -342, 270, 45, Label.HorizontalAlign.LEFT);
    this.comboLabel = this.addLabel(this.node, 'ComboText', '连击 0 · x1.0', 22, this.colors.ink, 220, -342, 270, 45, Label.HorizontalAlign.RIGHT);
    this.addPanel(this.node, 'SuspicionTrack', 660, 28, 0, -389, this.colors.white, 14, this.colors.ink, 4);
    const fillNode = this.createNode('SuspicionFill', this.node, -322, -389, 644, 16);
    fillNode.getComponent(UITransform)?.setAnchorPoint(0, 0.5);
    this.suspicionFill = fillNode.addComponent(Graphics);
    this.drawSuspicionFill(this.colors.safe);
    fillNode.setScale(0, 1, 1);

    this.playArea = this.addPanel(this.node, 'PlayArea', 660, 126, 0, -500, this.colors.accent, 24, this.colors.ink, 5);
    this.actionLabel = this.addLabel(this.playArea, 'ActionLabel', '按住屏幕开始摸鱼', 34, this.colors.ink, 0, 0, 610, 80);
    this.addLabel(this.node, 'Hint', '看到预警立即松手 · 单手即可游玩', 20, new Color('#626574'), 0, -600, 650, 40);
    this.addLabel(this.node, 'BuildVersion', 'M1.9 · 正向工位', 15, new Color('#6B6680'), 270, -640, 190, 28);

    this.createResultPanel();
    this.createTutorialPanel();
    this.createControlPanel();
  }

  private createMangaBackdrop(): void {
    const office = this.createNode('OfficeBackdrop', this.node, 0, 225, 750, 660);

    this.addPanel(office, 'CeilingLightLeft', 210, 18, -205, 302, this.colors.white, 8, new Color('#C9C5BB'), 3);
    this.addPanel(office, 'CeilingLightRight', 210, 18, 205, 302, this.colors.white, 8, new Color('#C9C5BB'), 3);

    const window = this.addPanel(office, 'OfficeWindow', 286, 230, -205, 112, new Color('#D9EFF6'), 3, this.colors.ink, 6);
    this.addPanel(window, 'WindowSky', 266, 210, 0, 0, new Color('#D9EFF6'));
    const buildingHeights = [68, 102, 82, 126, 92, 116];
    buildingHeights.forEach((height, index) => {
      const x = -112 + index * 45;
      this.addPanel(window, `Building${index}`, 38, height, x, -105 + height / 2, new Color(index % 2 ? '#AEBCC3' : '#C3CDD1'));
    });
    this.addPanel(window, 'WindowMullionV', 7, 218, 0, 0, this.colors.white);
    this.addPanel(window, 'WindowMullionH', 274, 7, 0, 0, this.colors.white);

    const board = this.addPanel(office, 'Whiteboard', 270, 184, 175, 118, this.colors.white, 5, this.colors.ink, 5);
    this.addLabel(board, 'WhiteboardTitle', 'SPRINT TODO', 20, this.colors.ink, -58, 66, 130, 30, Label.HorizontalAlign.LEFT);
    this.addLabel(board, 'WhiteboardCopy', '□ 修 Bug\n□ 写单测\n☑ 先重启试试', 17, new Color('#454545'), -42, -10, 190, 108, Label.HorizontalAlign.LEFT);
    this.addLabel(board, 'WhiteboardNote', '周五禁止上线', 16, this.colors.danger, 72, -68, 115, 28);

    const rack = this.addPanel(office, 'ServerRack', 88, 220, 318, -105, new Color('#2A2D32'), 5, this.colors.ink, 5);
    this.addLabel(rack, 'ServerLabel', 'PROD\n不要动', 15, this.colors.white, 0, 66, 72, 58);
    for (let index = 0; index < 4; index += 1) {
      this.addPanel(rack, `ServerSlot${index}`, 64, 24, 0, 18 - index * 34, new Color('#454A52'), 3);
      this.addPanel(rack, `ServerLight${index}`, 8, 8, 24, 18 - index * 34, index === 2 ? this.colors.danger : this.colors.safe, 4);
    }

    const poster = this.addPanel(office, 'OfficePoster', 116, 90, -312, -118, new Color('#FFF1A8'), 3, this.colors.ink, 4);
    this.addLabel(poster, 'PosterCopy', 'It works\non my machine', 15, this.colors.ink, 0, 0, 100, 68);

    const clock = this.addPanel(office, 'OfficeClock', 112, 52, 0, 270, this.colors.ink, 8);
    this.addLabel(clock, 'ClockCopy', '17:58', 24, this.colors.accent, 0, 0, 96, 40);
  }

  private createTopControls(): void {
    const task = this.addPanel(this.node, 'TaskButton', 118, 56, -298, 515, this.colors.white, 8, this.colors.ink, 5);
    this.addLabel(task, 'TaskButtonText', '任务', 24, this.colors.ink, 0, 0, 90, 42);
    task.on(Node.EventType.TOUCH_END, this.openTaskPanel, this);

    const settings = this.addPanel(this.node, 'SettingsButton', 118, 56, 298, 515, this.colors.white, 8, this.colors.ink, 5);
    this.addLabel(settings, 'SettingsButtonText', '设置', 24, this.colors.ink, 0, 0, 90, 42);
    settings.on(Node.EventType.TOUCH_END, this.openSettingsPanel, this);
  }

  private createEventCard(): void {
    this.eventCard = this.addPanel(this.node, 'EventCard', 650, 126, 0, 62, this.colors.white, 18, this.colors.ink, 5);
    this.eventTitleLabel = this.addLabel(this.eventCard, 'EventTitle', '随机事件', 27, this.colors.danger, 0, 28, 580, 42);
    this.eventCopyLabel = this.addLabel(this.eventCard, 'EventCopy', '', 22, this.colors.ink, 0, -25, 580, 54);
    this.eventCard.active = false;
  }

  private createBoss(): void {
    this.bossNode = this.createNode('Boss', this.node, 0, 255, 170, 250);
    const artNode = this.createNode('BossPixelArt', this.bossNode, 0, 0, 170, 250);
    this.bossPixelGraphics = artNode.addComponent(Graphics);
    this.drawPixelBoss('safe');
  }

  private createDeskAndProgrammer(): void {
    const desk = this.addPanel(this.node, 'Desk', 610, 132, 0, -142, this.colors.desk, 4, this.colors.ink, 6);
    const monitor = this.addPanel(desk, 'Monitor', 316, 168, 64, 96, this.colors.monitor, 4, this.colors.ink, 6);
    this.monitorLabel = this.addLabel(monitor, 'MonitorText', '// TODO: 下次一定优化\nif (works) dont_touch();', 18, new Color('#8EE6AC'), 0, 0, 276, 110, Label.HorizontalAlign.LEFT);
    this.createForumPreview(monitor);
    this.addPanel(desk, 'Keyboard', 240, 34, 64, -24, new Color('#DADCE3'), 8, this.colors.ink, 4);
    this.addPanel(desk, 'CoffeeCup', 32, 38, 252, -8, new Color('#F3F6FF'), 2, this.colors.ink, 3);

    // Near side of the desk: the player sees the employee's back while the
    // employee faces upward toward both the monitor and the boss.
    const programmer = this.createNode('Programmer', this.node, -70, -222, 220, 220);
    const artNode = this.createNode('ProgrammerPixelArt', programmer, 0, 0, 220, 220);
    this.programmerPixelGraphics = artNode.addComponent(Graphics);
    this.drawPixelProgrammer(false);
  }

  private createForumPreview(monitor: Node): void {
    this.forumPreview = this.addPanel(monitor, 'ForumPreview', 292, 144, 0, 0, new Color('#F4F6F8'), 2);
    this.addPanel(this.forumPreview, 'ForumHeader', 292, 32, 0, 56, new Color('#1F78D1'));
    this.addLabel(this.forumPreview, 'ForumLogo', 'LINUX DO', 16, this.colors.white, -92, 56, 92, 26, Label.HorizontalAlign.LEFT);
    this.addLabel(this.forumPreview, 'ForumStatus', '摸鱼专区  ·  3 条新帖', 11, new Color('#DCEBFA'), 58, 56, 165, 24, Label.HorizontalAlign.RIGHT);

    const topics = [
      ['删掉这行代码，项目就能跑了', '开发调优'],
      ['在我机器上明明是好的', '搞七捻三'],
      ['如何优雅地解释技术债', '茶馆'],
    ] as const;
    topics.forEach(([title, tag], index) => {
      const y = 25 - index * 36;
      this.addPanel(this.forumPreview!, `TopicDivider${index}`, 270, 2, 0, y - 18, new Color('#DDE2E7'));
      this.addLabel(this.forumPreview!, `Topic${index}`, title, 12, new Color('#26323D'), -18, y, 220, 28, Label.HorizontalAlign.LEFT);
      this.addLabel(this.forumPreview!, `Tag${index}`, tag, 9, new Color('#73808C'), 112, y, 48, 24, Label.HorizontalAlign.RIGHT);
    });
    this.addLabel(this.forumPreview, 'ForumDisclaimer', '原型化界面 · 非真实帖子', 8, new Color('#929BA4'), 70, -62, 140, 16, Label.HorizontalAlign.RIGHT);
    this.forumPreview.active = false;
  }

  private drawPixelBoss(state: BossState): void {
    const graphics = this.bossPixelGraphics;
    if (!graphics) return;
    graphics.clear();
    const skin = state === 'checking' ? new Color('#F29C8F') : this.colors.skin;
    const suit = state === 'checking' ? this.colors.danger : this.colors.boss;

    this.pixelRect(graphics, -48, -105, 38, 34, new Color('#24334D'));
    this.pixelRect(graphics, 10, -105, 38, 34, new Color('#24334D'));
    this.pixelRect(graphics, -62, -76, 124, 94, suit);
    this.pixelRect(graphics, -72, -60, 20, 64, suit);
    this.pixelRect(graphics, 52, -60, 20, 64, suit);
    this.pixelRect(graphics, -14, -76, 28, 54, new Color('#F4F4EE'));
    this.pixelRect(graphics, -5, -72, 10, 42, this.colors.danger);
    this.pixelRect(graphics, -46, 10, 92, 78, skin);
    this.pixelRect(graphics, -54, 28, 12, 30, skin);
    this.pixelRect(graphics, 42, 28, 12, 30, skin);
    this.pixelRect(graphics, -48, 70, 96, 24, new Color('#26334B'));
    this.pixelRect(graphics, -36, 86, 72, 12, new Color('#26334B'));

    const eyeY = state === 'safe' ? 48 : 43;
    const eyeShift = state === 'safe' ? 7 : 0;
    this.pixelRect(graphics, -27 + eyeShift, eyeY, 10, 10, this.colors.ink);
    this.pixelRect(graphics, 17 + eyeShift, eyeY, 10, 10, this.colors.ink);
    this.pixelRect(graphics, -20, 22, 40, 8, state === 'checking' ? this.colors.ink : new Color('#8C4E3A'));
    if (state === 'warning') {
      this.pixelRect(graphics, 64, 72, 12, 34, this.colors.accent);
      this.pixelRect(graphics, 64, 58, 12, 10, this.colors.accent);
    }
  }

  private drawPixelProgrammer(isSlacking: boolean): void {
    const graphics = this.programmerPixelGraphics;
    if (!graphics) return;
    graphics.clear();
    const hoodie = isSlacking ? new Color('#8B5CF6') : new Color('#4776E6');

    // Chair and wheels, viewed from behind.
    this.pixelRect(graphics, -58, -98, 116, 118, new Color('#39445D'));
    this.pixelRect(graphics, -48, -88, 96, 100, new Color('#4A5670'));
    this.pixelRect(graphics, -6, -122, 12, 28, new Color('#283247'));
    this.pixelRect(graphics, -52, -132, 104, 10, new Color('#283247'));
    this.pixelRect(graphics, -62, -140, 22, 18, new Color('#283247'));
    this.pixelRect(graphics, 40, -140, 22, 18, new Color('#283247'));

    // Hoodie back and shoulders.
    this.pixelRect(graphics, -55, -60, 110, 88, hoodie);
    this.pixelRect(graphics, -70, -45, 20, 62, hoodie);
    this.pixelRect(graphics, 50, -45, 20, 62, hoodie);
    this.pixelRect(graphics, -18, -58, 36, 10, new Color('#3159B5'));
    this.pixelRect(graphics, -5, -48, 10, 36, new Color('#3159B5'));

    // Back of the head, hair and headphones—no facial features visible.
    this.pixelRect(graphics, -42, 18, 84, 68, this.colors.skin);
    this.pixelRect(graphics, -48, 38, 12, 30, this.colors.skin);
    this.pixelRect(graphics, 36, 38, 12, 30, this.colors.skin);
    this.pixelRect(graphics, -44, 68, 88, 24, new Color('#2E3047'));
    this.pixelRect(graphics, -36, 84, 72, 12, new Color('#2E3047'));
    this.pixelRect(graphics, -52, 42, 12, 34, new Color('#111827'));
    this.pixelRect(graphics, 40, 42, 12, 34, new Color('#111827'));
    this.pixelRect(graphics, -48, 82, 96, 8, new Color('#111827'));

    // Forearms disappear toward the keyboard in front of the monitor.
    this.pixelRect(graphics, -68, -42, 44, 20, hoodie);
    this.pixelRect(graphics, 24, -42, 44, 20, hoodie);
    this.pixelRect(graphics, -76, -42, 24, 18, this.colors.skin);
    if (isSlacking) {
      // Only the phone peeks out beside the monitor.
      this.pixelRect(graphics, 64, -8, 26, 46, new Color('#111827'));
      this.pixelRect(graphics, 69, -1, 16, 28, new Color('#60A5FA'));
      this.pixelRect(graphics, 52, -30, 28, 18, this.colors.skin);
    } else {
      this.pixelRect(graphics, 52, -42, 24, 18, this.colors.skin);
    }
  }

  private pixelRect(graphics: Graphics, x: number, y: number, width: number, height: number, color: Color): void {
    graphics.fillColor = color;
    graphics.rect(x, y, width, height);
    graphics.fill();
  }

  private createResultPanel(): void {
    this.resultPanel = this.addPanel(this.node, 'ResultOverlay', 750, 1334, 0, 0, new Color(20, 22, 30, 215));
    const card = this.addPanel(this.resultPanel, 'ResultCard', 630, 560, 0, 0, this.colors.paper, 32, this.colors.ink, 6);
    this.resultIconLabel = this.addLabel(card, 'ResultIcon', '✓', 88, this.colors.safe, 0, 150, 160, 120);
    this.resultTitleLabel = this.addLabel(card, 'ResultTitle', '准时下班！', 44, this.colors.ink, 0, 55, 520, 80);
    this.resultDetailLabel = this.addLabel(card, 'ResultDetail', '', 25, new Color('#515461'), 0, -40, 520, 100);
    const restart = this.addPanel(card, 'RestartButton', 360, 92, 0, -172, this.colors.accent, 18, this.colors.ink, 5);
    this.addLabel(restart, 'RestartText', '再来一天', 31, this.colors.ink, 0, 0, 320, 60);
    restart.on(Node.EventType.TOUCH_END, this.startRound, this);
    this.resultPanel.active = false;
  }

  private createTutorialPanel(): void {
    this.tutorialPanel = this.addPanel(this.node, 'TutorialOverlay', 750, 1334, 0, 0, new Color(20, 22, 30, 220));
    const card = this.addPanel(this.tutorialPanel, 'TutorialCard', 630, 520, 0, 0, this.colors.paper, 32, this.colors.ink, 6);
    this.addLabel(card, 'TutorialEyebrow', '程序员生存手册', 23, this.colors.danger, 0, 166, 500, 46);
    this.tutorialTitleLabel = this.addLabel(card, 'TutorialTitle', '', 38, this.colors.ink, 0, 92, 530, 70);
    this.tutorialCopyLabel = this.addLabel(card, 'TutorialCopy', '', 26, new Color('#515461'), 0, -2, 520, 112);
    const next = this.addPanel(card, 'TutorialNext', 360, 92, 0, -160, this.colors.accent, 18, this.colors.ink, 5);
    this.tutorialButtonLabel = this.addLabel(next, 'TutorialNextText', '下一步', 30, this.colors.ink, 0, 0, 320, 60);
    next.on(Node.EventType.TOUCH_END, this.advanceTutorial, this);
    this.tutorialPanel.active = false;
  }

  private createControlPanel(): void {
    this.controlPanel = this.addPanel(this.node, 'ControlOverlay', 750, 1334, 0, 0, new Color(15, 15, 15, 225));
    const card = this.addPanel(this.controlPanel, 'ControlCard', 630, 760, 0, 0, this.colors.paper, 8, this.colors.ink, 7);
    this.addLabel(card, 'ControlEyebrow', 'TODAY // 01', 20, this.colors.danger, 0, 298, 500, 40);
    this.controlTitleLabel = this.addLabel(card, 'ControlTitle', '今日任务', 43, this.colors.ink, 0, 232, 520, 70);
    this.controlBodyLabel = this.addLabel(card, 'ControlBody', '', 25, new Color('#454545'), 0, 78, 520, 210);

    this.controlRestartOption = this.addPanel(card, 'RestartOption', 470, 82, 0, -78, this.colors.white, 6, this.colors.ink, 5);
    this.addLabel(this.controlRestartOption, 'RestartOptionText', '重新开始今天', 27, this.colors.ink, 0, 0, 420, 54);
    this.controlRestartOption.on(Node.EventType.TOUCH_END, this.restartFromControlPanel, this);

    this.controlTutorialOption = this.addPanel(card, 'TutorialOption', 470, 82, 0, -178, this.colors.white, 6, this.colors.ink, 5);
    this.addLabel(this.controlTutorialOption, 'TutorialOptionText', '重看操作教学', 27, this.colors.ink, 0, 0, 420, 54);
    this.controlTutorialOption.on(Node.EventType.TOUCH_END, this.replayTutorial, this);

    const continueButton = this.addPanel(card, 'ContinueButton', 470, 86, 0, -286, this.colors.accent, 6, this.colors.ink, 5);
    this.controlContinueLabel = this.addLabel(continueButton, 'ContinueButtonText', '继续游戏', 29, this.colors.ink, 0, 0, 420, 56);
    continueButton.on(Node.EventType.TOUCH_END, this.closeControlPanel, this);
    this.controlPanel.active = false;
  }

  private readonly openTaskPanel = (): void => {
    const state = this.session?.getSnapshot();
    if (!state || !this.controlPanel) return;
    this.pauseForControlPanel();
    if (this.controlTitleLabel) this.controlTitleLabel.string = '今日任务';
    if (this.controlBodyLabel) {
      this.controlBodyLabel.string = [
        `摸鱼值：${Math.floor(state.score)} / 600`,
        `剩余时间：${Math.ceil(state.remainingSeconds)} 秒`,
        `可疑度：${Math.ceil(state.suspicion)} / 100`,
        '',
        '先摸鱼，再于检查前松手，才算有效躲避。',
      ].join('\n');
    }
    if (this.controlContinueLabel) this.controlContinueLabel.string = '返回工位';
    if (this.controlRestartOption) this.controlRestartOption.active = false;
    if (this.controlTutorialOption) this.controlTutorialOption.active = false;
    this.controlPanel.active = true;
  };

  private readonly openSettingsPanel = (): void => {
    if (!this.session || !this.controlPanel) return;
    this.pauseForControlPanel();
    if (this.controlTitleLabel) this.controlTitleLabel.string = '游戏设置';
    if (this.controlBodyLabel) {
      this.controlBodyLabel.string = '游戏已暂停。\n可以重新开始当前工作日，或重新查看操作教学。';
    }
    if (this.controlContinueLabel) this.controlContinueLabel.string = '继续游戏';
    if (this.controlRestartOption) this.controlRestartOption.active = true;
    if (this.controlTutorialOption) this.controlTutorialOption.active = true;
    this.controlPanel.active = true;
  };

  private pauseForControlPanel(): void {
    this.session?.release();
    this.playArea?.setScale(Vec3.ONE);
    this.controlWasRunning = this.session?.getSnapshot().phase === 'running';
    if (this.controlWasRunning) this.session?.pause();
  }

  private readonly closeControlPanel = (): void => {
    if (this.controlPanel) this.controlPanel.active = false;
    if (this.controlWasRunning) this.session?.resume();
    this.controlWasRunning = false;
  };

  private readonly restartFromControlPanel = (): void => {
    if (this.controlPanel) this.controlPanel.active = false;
    this.controlWasRunning = false;
    this.startRound();
  };

  private readonly replayTutorial = (): void => {
    if (this.controlPanel) this.controlPanel.active = false;
    this.controlWasRunning = false;
    this.tutorialRequired = true;
    sys.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
    this.showTutorial();
  };

  private bindInput(): void {
    this.playArea?.on(Node.EventType.TOUCH_START, this.onPress, this);
    this.playArea?.on(Node.EventType.TOUCH_END, this.onRelease, this);
    this.playArea?.on(Node.EventType.TOUCH_CANCEL, this.onRelease, this);
    this.playArea?.on(Node.EventType.MOUSE_DOWN, this.onPress, this);
    this.playArea?.on(Node.EventType.MOUSE_UP, this.onRelease, this);
    this.playArea?.on(Node.EventType.MOUSE_LEAVE, this.onRelease, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onPress, this);
    input.on(Input.EventType.MOUSE_UP, this.onRelease, this);
    input.on(Input.EventType.TOUCH_START, this.onPress, this);
    input.on(Input.EventType.TOUCH_END, this.onRelease, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onRelease, this);
  }

  private unbindInput(): void {
    this.playArea?.off(Node.EventType.TOUCH_START, this.onPress, this);
    this.playArea?.off(Node.EventType.TOUCH_END, this.onRelease, this);
    this.playArea?.off(Node.EventType.TOUCH_CANCEL, this.onRelease, this);
    this.playArea?.off(Node.EventType.MOUSE_DOWN, this.onPress, this);
    this.playArea?.off(Node.EventType.MOUSE_UP, this.onRelease, this);
    this.playArea?.off(Node.EventType.MOUSE_LEAVE, this.onRelease, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onPress, this);
    input.off(Input.EventType.MOUSE_UP, this.onRelease, this);
    input.off(Input.EventType.TOUCH_START, this.onPress, this);
    input.off(Input.EventType.TOUCH_END, this.onRelease, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onRelease, this);
  }

  private readonly onPress = (): void => {
    this.session?.press();
    this.playArea?.setScale(0.98, 0.98, 1);
  };

  private readonly onRelease = (): void => {
    this.session?.release();
    this.playArea?.setScale(Vec3.ONE);
  };

  private onGameEvent(event: GameEvent): void {
    switch (event.type) {
      case 'boss-warning':
        this.showToast('老板进程切到前台了，快松手！');
        break;
      case 'caught':
        this.showToast('摸鱼进程未响应，被老板强制结束！');
        break;
      case 'dodge-success':
        this.showToast(`躲过检查，连击 ${event.snapshot.combo}`);
        break;
      case 'round-finished':
        this.showResult(event.snapshot);
        break;
      default:
        break;
    }
  }

  private applyWorkEvent(event: WorkEventDefinition): void {
    this.session?.applyAdjustment(event.effect);
    if (this.eventTitleLabel) this.eventTitleLabel.string = event.title;
    if (this.eventCopyLabel) this.eventCopyLabel.string = event.copy;
    if (this.eventCard) this.eventCard.active = true;
    this.eventCardSeconds = 2.4;
  }

  private showTutorial(): void {
    this.tutorialStep = 0;
    this.session?.pause();
    if (this.tutorialPanel) this.tutorialPanel.active = true;
    this.renderTutorialStep();
  }

  private readonly advanceTutorial = (): void => {
    if (this.tutorialStep < TUTORIAL_STEPS.length - 1) {
      this.tutorialStep += 1;
      this.renderTutorialStep();
      return;
    }

    this.tutorialRequired = false;
    sys.localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    if (this.tutorialPanel) this.tutorialPanel.active = false;
    this.session?.resume();
  };

  private renderTutorialStep(): void {
    const step = TUTORIAL_STEPS[this.tutorialStep];
    if (this.tutorialTitleLabel) this.tutorialTitleLabel.string = step.title;
    if (this.tutorialCopyLabel) this.tutorialCopyLabel.string = step.copy;
    if (this.tutorialButtonLabel) {
      this.tutorialButtonLabel.string = this.tutorialStep === TUTORIAL_STEPS.length - 1 ? '开始今天' : '下一步';
    }
  }

  private render(state: GameSnapshot): void {
    if (this.timerLabel) this.timerLabel.string = `${Math.ceil(state.remainingSeconds)} 秒后下班`;
    if (this.scoreLabel) this.scoreLabel.string = `摸鱼值 ${Math.floor(state.score)} / 600`;
    if (this.bossStatusLabel) this.bossStatusLabel.string = BOSS_COPY[state.bossState];
    if (this.suspicionLabel) this.suspicionLabel.string = `可疑度 ${Math.ceil(state.suspicion)}%`;
    if (this.comboLabel) this.comboLabel.string = `连击 ${state.combo} · x${state.multiplier.toFixed(1)}`;
    if (this.actionLabel) this.actionLabel.string = state.isSlacking ? '正在摸鱼…松手工作' : '按住屏幕开始摸鱼';
    if (this.monitorLabel) this.monitorLabel.node.active = !state.isSlacking;
    if (this.forumPreview) this.forumPreview.active = state.isSlacking;
    if (this.programmerLabel) this.programmerLabel.string = state.isSlacking ? '^_^' : '•_•';
    this.drawPixelBoss(state.bossState);
    this.drawPixelProgrammer(state.isSlacking);

    if (this.bossNode) {
      this.bossNode.setPosition(state.bossState === 'checking' ? 34 : 0, state.bossState === 'checking' ? 242 : 255, 0);
      if (state.bossState === 'checking') this.bossNode.setScale(1.1, 1.1, 1);
      else if (state.bossState !== 'warning') this.bossNode.setScale(Vec3.ONE);
    }
    if (this.bossBodyGraphics) {
      const color = state.bossState === 'checking' ? this.colors.danger : this.colors.boss;
      this.drawRect(this.bossBodyGraphics, 170, 142, color, 28, this.colors.ink, 5);
    }

    if (this.suspicionFill) {
      const progress = Math.min(1, Math.max(0, state.suspicion / 100));
      const color = state.suspicion >= 70 ? this.colors.danger : state.suspicion >= 40 ? this.colors.accent : this.colors.safe;
      this.drawSuspicionFill(color);
      this.suspicionFill.node.setScale(progress, 1, 1);
    }
  }

  private drawSuspicionFill(color: Color): void {
    if (!this.suspicionFill) return;
    this.suspicionFill.clear();
    this.suspicionFill.fillColor = color;
    this.suspicionFill.roundRect(0, -8, 644, 16, 8);
    this.suspicionFill.fill();
  }

  private showToast(copy: string): void {
    if (this.toastLabel) this.toastLabel.string = copy;
    this.toastSeconds = 1.2;
  }

  private showResult(state: GameSnapshot): void {
    if (!state.result || !this.resultPanel) return;
    const result = RESULT_COPY[state.result];
    if (this.resultIconLabel) {
      this.resultIconLabel.string = result.icon;
      this.resultIconLabel.color = state.result === 'punctual' ? this.colors.safe : this.colors.danger;
    }
    if (this.resultTitleLabel) this.resultTitleLabel.string = result.title;
    if (this.resultDetailLabel) {
      if (state.result === 'punctual') {
        this.resultDetailLabel.string = `feat: 准时下班。摸鱼值 ${Math.floor(state.score)}，躲过 ${state.successfulDodges} 次巡查。`;
      } else if (state.result === 'overtime') {
        this.resultDetailLabel.string = `需求没有延期，只是你延期下班。还差 ${Math.max(0, 600 - Math.floor(state.score))} 摸鱼值。`;
      } else {
        this.resultDetailLabel.string = `老板发现你把摸鱼写进了 OKR。共被抓包 ${state.caughtCount} 次。`;
      }
    }
    this.resultPanel.active = true;
  }

  private addPill(
    parent: Node,
    name: string,
    copy: string,
    width: number,
    height: number,
    x: number,
    y: number,
    background: Color,
    foreground: Color,
    fontSize: number,
  ): Label {
    const panel = this.addPanel(parent, `${name}Panel`, width, height, x, y, background, height / 2, foreground, 4);
    return this.addLabel(panel, name, copy, fontSize, foreground, 0, 0, width - 30, height - 10);
  }

  private addPanel(
    parent: Node,
    name: string,
    width: number,
    height: number,
    x: number,
    y: number,
    fill: Color,
    radius = 0,
    stroke?: Color,
    lineWidth = 0,
  ): Node {
    const node = this.createNode(name, parent, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    this.drawRect(graphics, width, height, fill, radius, stroke, lineWidth);
    return node;
  }

  private addLabel(
    parent: Node,
    name: string,
    copy: string,
    fontSize: number,
    color: Color,
    x: number,
    y: number,
    width: number,
    height: number,
    horizontalAlign: Label.HorizontalAlign = Label.HorizontalAlign.CENTER,
  ): Label {
    const node = this.createNode(name, parent, x, y, width, height);
    const label = node.addComponent(Label);
    label.string = copy;
    label.fontSize = fontSize;
    label.lineHeight = Math.ceil(fontSize * 1.3);
    label.color = color;
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  private createNode(name: string, parent: Node, x: number, y: number, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    node.parent = parent;
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return node;
  }

  private drawRect(
    graphics: Graphics,
    width: number,
    height: number,
    fill: Color,
    radius = 0,
    stroke?: Color,
    lineWidth = 0,
  ): void {
    graphics.clear();
    graphics.fillColor = fill;
    const left = -width / 2;
    const bottom = -height / 2;
    if (radius > 0) graphics.roundRect(left, bottom, width, height, radius);
    else graphics.rect(left, bottom, width, height);
    graphics.fill();

    if (stroke && lineWidth > 0) {
      graphics.strokeColor = stroke;
      graphics.lineWidth = lineWidth;
      if (radius > 0) graphics.roundRect(left, bottom, width, height, radius);
      else graphics.rect(left, bottom, width, height);
      graphics.stroke();
    }
  }
}
