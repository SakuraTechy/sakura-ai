import PQueue from 'p-queue';
import { EventEmitter } from 'events';

interface QueueConfig {
  maxConcurrency: number;      // 全局最大并发：6
  perUserLimit: number;        // 每用户并发：2
  taskTimeout: number;         // 任务超时：10分钟
  retryAttempts: number;       // 重试次数：1
}

interface QueueTask {
  id: string;
  userId: string;
  type: 'test' | 'suite';
  priority: 'high' | 'medium' | 'low';
  payload: any;
  createdAt: Date;
  estimatedDuration?: number;
}

export class QueueService extends EventEmitter {
  private globalQueue: PQueue;
  private userQueues: Map<string, PQueue>;
  private planQueues: Map<string, PQueue>; // 🔥 新增：测试计划队列，确保同一计划的用例串行执行
  private activeTasks: Map<string, QueueTask>;
  private waitingTasks: Map<string, QueueTask>;
  private cancelSet: Set<string>;  // 🔥 修正：添加取消标记集合
  private config: QueueConfig;
  
  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.globalQueue = new PQueue({ 
      concurrency: config.maxConcurrency,
      timeout: config.taskTimeout,
      throwOnTimeout: true  // 🔥 修正：启用超时抛出
    });
    this.userQueues = new Map();
    this.planQueues = new Map(); // 🔥 新增：初始化测试计划队列
    this.activeTasks = new Map();
    this.waitingTasks = new Map();
    this.cancelSet = new Set();
  }

  // 🔥 修正：添加执行函数参数，支持重试机制
  async enqueue(task: QueueTask, executor: (task: QueueTask) => Promise<void>): Promise<void> {
    const userQueue = this.getUserQueue(task.userId);
    
    // 🔥 新增：检查是否有 planExecutionId，如果有则使用测试计划队列（串行执行）
    const planExecutionId = task.payload?.options?.planExecutionId;
    const planQueue = planExecutionId ? this.getPlanQueue(planExecutionId) : null;
    
    this.waitingTasks.set(task.id, task);
    this.emit('task_queued', task);
    
    return this.globalQueue.add(async () => {
      // 🔥 如果有测试计划队列，使用测试计划队列（串行执行），否则使用用户队列
      const targetQueue = planQueue || userQueue;
      
      return targetQueue.add(async () => {
        // 检查是否已被取消
        if (this.cancelSet.has(task.id)) {
          throw new Error('Task cancelled');
        }
        
        this.waitingTasks.delete(task.id);
        this.activeTasks.set(task.id, task);
        this.emit('task_started', task);
        
        let attempts = 0;
        while (attempts < this.config.retryAttempts + 1) {
          try {
            await executor(task);
            this.activeTasks.delete(task.id);
            this.cancelSet.delete(task.id);
            this.emit('task_completed', task);
            return;
          } catch (error) {
            attempts++;
            if (attempts > this.config.retryAttempts || error.message === 'Task cancelled') {
              this.activeTasks.delete(task.id);
              this.cancelSet.delete(task.id);
              this.emit('task_failed', task, error);
              throw error;
            }
            console.warn(`任务 ${task.id} 第 ${attempts} 次重试...`);
          }
        }
      });
    }, { priority: this.getPriority(task.priority) });
  }

  // 🔥 修正：实现优先级映射
  private getPriority(priority: 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'high': return 1;
      case 'low': return 10;
      default: return 5;
    }
  }

  // 取消任务
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.waitingTasks.get(taskId) || this.activeTasks.get(taskId);
    if (!task) return false;

    // 标记为取消
    this.cancelSet.add(taskId);
    this.waitingTasks.delete(taskId);
    
    // 通知执行器中断
    this.emit('task_cancelled', task);
    return true;
  }

  // 检查任务是否已被取消
  isCancelled(taskId: string): boolean {
    return this.cancelSet.has(taskId);
  }

  // 获取队列状态
  getQueueStatus() {
    return {
      global: {
        size: this.globalQueue.size,
        pending: this.globalQueue.pending,
        concurrency: this.globalQueue.concurrency
      },
      waiting: Array.from(this.waitingTasks.values()),
      active: Array.from(this.activeTasks.values()),
      estimatedWaitTime: this.calculateEstimatedWaitTime()
    };
  }

  private getUserQueue(userId: string): PQueue {
    if (!this.userQueues.has(userId)) {
      this.userQueues.set(userId, new PQueue({ concurrency: this.config.perUserLimit }));
    }
    return this.userQueues.get(userId)!;
  }

  // 🔥 新增：获取测试计划队列（串行执行，concurrency=1）
  private getPlanQueue(planExecutionId: string): PQueue {
    if (!this.planQueues.has(planExecutionId)) {
      // 🔥 测试计划队列使用串行执行（concurrency=1），确保同一计划的用例不会并发执行
      this.planQueues.set(planExecutionId, new PQueue({ concurrency: 1 }));
      console.log(`📋 [QueueService] 创建测试计划队列: ${planExecutionId.substring(0, 8)}... (串行执行)`);
    }
    return this.planQueues.get(planExecutionId)!;
  }

  // 🔥 修正：使用历史数据计算等待时间
  private calculateEstimatedWaitTime(): number {
    // 简化实现，实际可基于历史运行时间的中位数
    const avgDuration = 120; // 假设平均2分钟
    const position = this.globalQueue.size;
    const concurrency = this.globalQueue.concurrency;
    return Math.ceil(position / concurrency) * avgDuration;
  }
}

export { QueueTask, QueueConfig };