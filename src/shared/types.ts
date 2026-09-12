/**
 * 主进程 / preload / 渲染进程共享的类型定义。
 * 所有跨 IPC 传输的数据都必须是可 JSON 结构化克隆的普通对象。
 */

export type ToolId = 'flame' | 'blow' | 'pull' | 'marver' | 'cool'

/** 工坊旋钮参数（由 UI 滑块控制） */
export interface SimParams {
  /** 火焰目标温度 ℃（400 ~ 1200） */
  temperature: number
  /** 旋转速度 rpm（0 ~ 120） */
  spin: number
  /** 拉伸力度（0 ~ 1） */
  pullForce: number
  /** 吹气压力（0 ~ 1） */
  blowPressure: number
}

/** 一帧内指针 + 旋钮的全部输入（轨迹录制 / 回放单元） */
export interface FrameInput {
  tool: ToolId
  /** 指针在玻璃高度方向的归一化位置 0(底)~1(顶) */
  y: number
  /** 指针水平位置 -1(左)~1(右)，仅用于工具头渲染 */
  x: number
  /** 按压强度 0..1（松开/按下/触控压感的折中值） */
  pressure: number
  params: SimParams
}

/** 轨迹中的一个固定步长采样 */
export interface TrajFrame {
  dt: number
  input: FrameInput
}

/** SQLite 中保存的一条过程快照 */
export interface SnapshotRecord {
  id: number | null
  title: string
  note: string
  created_at: number
  /** GlassSnapshot 的 JSON 字符串 */
  glass_json: string
  /** dataURL 缩略图 */
  thumb: string
}

/** 分镜板上的一格（纯数据，布局计算在 renderer 内完成） */
export interface StoryboardPanel {
  title: string
  caption: string
  thumb: string
}

export interface ExportResult {
  ok: boolean
  path?: string
  error?: string
  /** 用户在系统对话框中取消 */
  canceled?: boolean
}

/** 导入文件（打开对话框 + 读取文本）的结果 */
export interface ImportFileResult {
  ok: boolean
  canceled?: boolean
  /** 文件名（不含目录） */
  name?: string
  /** 文件文本内容 */
  text?: string
  error?: string
}

/** preload 暴露在 window.forge 上的接口 */
export interface ForgeBridge {
  listSnapshots(): Promise<SnapshotRecord[]>
  saveSnapshot(record: Omit<SnapshotRecord, 'id' | 'created_at'>): Promise<SnapshotRecord>
  deleteSnapshot(id: number): Promise<void>
  exportStoryboard(dataUrl: string, defaultName: string): Promise<ExportResult>
  exportTrajectory(json: string, defaultName: string): Promise<ExportResult>
  importTrajectory(): Promise<ImportFileResult>
}
