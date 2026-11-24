export interface WorkEventEffect {
  scoreDelta?: number;
  suspicionDelta?: number;
  timeDelta?: number;
  safeWindowSeconds?: number;
}

export interface WorkEventDefinition {
  id: string;
  title: string;
  copy: string;
  effect: WorkEventEffect;
  weight: number;
}

const EVENT_TIME_EPSILON = 0.000_001;

export const PROGRAMMER_WORK_EVENTS: ReadonlyArray<WorkEventDefinition> = Object.freeze([
  {
    id: 'requirement-change',
    title: '需求变更',
    copy: '产品说只是改一个文案 · 下班 +6 秒',
    effect: { timeDelta: 6 },
    weight: 1,
  },
  {
    id: 'production-alarm',
    title: '线上报警',
    copy: '虽然不是你的模块，但大家都看着你',
    effect: { suspicionDelta: 12, timeDelta: 3 },
    weight: 0.8,
  },
  {
    id: 'review-approved',
    title: 'Code Review 通过',
    copy: '同事只留了一句 LGTM · 摸鱼值 +50',
    effect: { scoreDelta: 50 },
    weight: 1,
  },
  {
    id: 'coffee',
    title: '咖啡续命',
    copy: '精神状态看起来正常多了 · 可疑度 -18',
    effect: { suspicionDelta: -18 },
    weight: 0.9,
  },
  {
    id: 'boss-phone',
    title: '老板接电话',
    copy: '6 秒安全摸鱼窗口，冲！',
    effect: { safeWindowSeconds: 6 },
    weight: 0.7,
  },
  {
    id: 'bug-reopened',
    title: 'Bug 被重新打开',
    copy: '测试说还是能复现 · 摸鱼值 -30',
    effect: { scoreDelta: -30 },
    weight: 0.8,
  },
  {
    id: 'temporary-meeting',
    title: '临时会议',
    copy: '只占用两分钟 · 下班 +8 秒',
    effect: { timeDelta: 8 },
    weight: 0.7,
  },
  {
    id: 'colleague-cover',
    title: '同事打掩护',
    copy: '他说你正在跑测试 · 可疑度 -15',
    effect: { suspicionDelta: -15 },
    weight: 0.7,
  },
  {
    id: 'merge-conflict',
    title: '合并冲突',
    copy: '为什么两个人都改了同一行？· 下班 +4 秒',
    effect: { timeDelta: 4 },
    weight: 0.8,
  },
  {
    id: 'build-passed',
    title: '构建一次通过',
    copy: '今天运气不错 · 摸鱼值 +70',
    effect: { scoreDelta: 70 },
    weight: 0.6,
  },
  {
    id: 'restart-fixed-it',
    title: '重启以后好了',
    copy: '原因不重要，能跑就是胜利 · 摸鱼值 +45',
    effect: { scoreDelta: 45 },
    weight: 0.9,
  },
  {
    id: 'works-on-my-machine',
    title: '在我机器上是好的',
    copy: '测试环境陷入了沉思 · 可疑度 +8',
    effect: { suspicionDelta: 8 },
    weight: 0.8,
  },
  {
    id: 'ancient-comment',
    title: '祖传注释',
    copy: '“千万别删这行”——2017 年某位前辈',
    effect: { safeWindowSeconds: 4 },
    weight: 0.8,
  },
  {
    id: 'stackoverflow-answer',
    title: '挖到远古答案',
    copy: '2013 年的 Stack Overflow 回答再次拯救世界 · 摸鱼值 +60',
    effect: { scoreDelta: 60 },
    weight: 0.7,
  },
  {
    id: 'simple-request',
    title: '这个需求很简单',
    copy: '产品补充：最好今天上线 · 下班 +7 秒',
    effect: { timeDelta: 7 },
    weight: 0.9,
  },
  {
    id: 'heisenbug',
    title: 'Bug 自己好了',
    copy: '只要打开调试器，它就不复现 · 可疑度 -10',
    effect: { suspicionDelta: -10 },
    weight: 0.7,
  },
  {
    id: 'dependency-update',
    title: '依赖建议升级',
    copy: '修复 1 个漏洞，新增 37 个漏洞 · 下班 +5 秒',
    effect: { timeDelta: 5, suspicionDelta: 5 },
    weight: 0.7,
  },
  {
    id: 'cache-problem',
    title: '原来是缓存',
    copy: '清缓存、重登录、假装什么都没发生 · 摸鱼值 +35',
    effect: { scoreDelta: 35 },
    weight: 0.8,
  },
]);

class EventRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1103515245) + 12345) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

export class WorkEventDeck {
  private readonly events: ReadonlyArray<WorkEventDefinition>;
  private readonly random: EventRandom;
  private readonly intervalMin: number;
  private readonly intervalMax: number;
  private remainingSeconds: number;
  private previousId: string | null = null;

  constructor(
    seed = Date.now(),
    events: ReadonlyArray<WorkEventDefinition> = PROGRAMMER_WORK_EVENTS,
    intervalMin = 12,
    intervalMax = 18,
    initialDelay = 10,
  ) {
    if (events.length === 0) throw new Error('WorkEventDeck requires at least one event.');
    if (intervalMin <= 0 || intervalMax < intervalMin || initialDelay < 0) {
      throw new Error('Invalid work event timing.');
    }
    this.events = events;
    this.intervalMin = intervalMin;
    this.intervalMax = intervalMax;
    this.random = new EventRandom(seed);
    this.remainingSeconds = initialDelay;
  }

  update(deltaSeconds: number): WorkEventDefinition | null {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return null;
    this.remainingSeconds -= deltaSeconds;
    if (this.remainingSeconds > EVENT_TIME_EPSILON) return null;

    const event = this.draw();
    this.previousId = event.id;
    this.remainingSeconds = this.intervalMin + (this.intervalMax - this.intervalMin) * this.random.next();
    return event;
  }

  private draw(): WorkEventDefinition {
    const candidates = this.events.length > 1
      ? this.events.filter((event) => event.id !== this.previousId)
      : [...this.events];
    const totalWeight = candidates.reduce((sum, event) => sum + Math.max(0, event.weight), 0);
    if (totalWeight <= 0) return candidates[0];

    let cursor = this.random.next() * totalWeight;
    for (const event of candidates) {
      cursor -= Math.max(0, event.weight);
      if (cursor <= 0) return event;
    }
    return candidates[candidates.length - 1];
  }
}
