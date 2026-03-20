import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import { MarketInsightService } from './marketInsightService.js';

export class MarketInsightScheduler {
  private static instance: MarketInsightScheduler;
  private jobs = new Map<number, ScheduledTask>();
  private prisma: PrismaClient;
  private service: MarketInsightService;

  private constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
    this.service = new MarketInsightService();
  }

  static getInstance(): MarketInsightScheduler {
    if (!MarketInsightScheduler.instance) {
      MarketInsightScheduler.instance = new MarketInsightScheduler();
    }
    return MarketInsightScheduler.instance;
  }

  async start() {
    console.log('[MarketInsightScheduler] 正在加载定时任务...');
    const tasks = await this.prisma.market_insight_tasks.findMany({
      where: { is_active: true }
    });

    for (const task of tasks) {
      this.scheduleTask(task);
    }

    console.log(`[MarketInsightScheduler] 已加载 ${tasks.length} 个定时任务`);
  }

  stop() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    console.log('[MarketInsightScheduler] 所有定时任务已停止');
  }

  scheduleTask(task: { id: number; trigger_type: string; trigger_time: string; trigger_day: number | null; title: string }) {
    this.unscheduleTask(task.id);

    const cronExpr = this.toCronExpression(task.trigger_type, task.trigger_time, task.trigger_day);
    if (!cronExpr || !cron.validate(cronExpr)) {
      console.warn(`[MarketInsightScheduler] 任务 ${task.id} 的 cron 表达式无效: ${cronExpr}`);
      return;
    }

    const job = cron.schedule(cronExpr, async () => {
      console.log(`[MarketInsightScheduler] 执行定时任务: ${task.id} - ${task.title}`);
      try {
        await this.service.executeTask(task.id);
      } catch (error: any) {
        console.error(`[MarketInsightScheduler] 任务 ${task.id} 执行失败:`, error.message);
      }
    }, { timezone: 'Asia/Shanghai' });

    this.jobs.set(task.id, job);
    console.log(`[MarketInsightScheduler] 已调度任务 ${task.id}: ${cronExpr}`);
  }

  unscheduleTask(taskId: number) {
    const existing = this.jobs.get(taskId);
    if (existing) {
      existing.stop();
      this.jobs.delete(taskId);
    }
  }

  async refreshSchedules() {
    this.stop();
    await this.start();
  }

  private toCronExpression(
    triggerType: string,
    triggerTime: string,
    triggerDay: number | null
  ): string | null {
    const timeParts = triggerTime.split(':');
    const hour = parseInt(timeParts[0] || '0', 10);
    const minute = parseInt(timeParts[1] || '0', 10);

    switch (triggerType) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * ${triggerDay || 1}`;
      case 'monthly':
        return `${minute} ${hour} ${triggerDay || 1} * *`;
      case 'custom':
        return triggerTime;
      default:
        return null;
    }
  }

  getActiveJobCount(): number {
    return this.jobs.size;
  }
}
