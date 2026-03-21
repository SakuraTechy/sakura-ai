/**
 * 市场洞察「新建/编辑任务」页布局（大屏双栏）。
 * 修改 leftFr / rightFr 即可调整左右栏宽度比例（按 CSS fr 分配）。
 */
export const MARKET_INSIGHT_TASK_LAYOUT = {
  /** 左侧「任务基础配置」fr */
  leftFr: 1,
  /** 右侧「数据源配置」fr */
  rightFr: 1,
  /**
   * 内容区最大宽度（px）。null 表示不限制，随父级撑满。
   * 若需与旧版一致可设为 1400。
   */
  contentMaxWidthPx: null as number | null,
} as const;
