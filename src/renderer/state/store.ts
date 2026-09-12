import { create } from 'zustand'
import type { SimParams, SnapshotRecord, ToolId, TrajFrame } from '@shared/types'
import {
  DEFAULT_INPUT,
  Engine,
  measure,
  type GlassMetrics
} from '../engine/engine'
import { restoreGlass, type GlassSnapshot } from '../engine/geometry'
import { summarizeMetrics, type GlassStatusSummary } from '../engine/describe'
import { parseTrajectory, serializeTrajectory } from '../engine/trajectory'
import {
  deleteSnapshot,
  listSnapshots,
  openTrajectoryFile,
  saveSnapshot,
  saveTrajectoryFile
} from './storage'

export interface SnapshotMeta {
  record: SnapshotRecord
  snapshot: GlassSnapshot
  /** 由快照玻璃状态算出的状态概述（列表 / 分镜展示用） */
  summary: GlassStatusSummary
}

interface StudioState {
  engine: Engine
  tool: ToolId
  params: SimParams
  /** 每次 tick 自增，用于驱动 React 刷新读数（不存整块玻璃） */
  frameTick: number
  metrics: GlassMetrics
  pointerActive: boolean
  replaying: boolean
  replayProgress: number
  snapshots: SnapshotMeta[]
  toast: string | null
  busy: boolean

  bump: () => void
  setTool: (t: ToolId) => void
  setParam: <K extends keyof SimParams>(k: K, v: SimParams[K]) => void
  setPointerActive: (v: boolean) => void

  refreshSnapshots: () => Promise<void>
  addSnapshot: (title: string, note: string, thumb: string) => Promise<boolean>
  removeSnapshot: (id: number) => Promise<void>
  loadSnapshot: (meta: SnapshotMeta) => void

  playReplay: () => void
  stopReplay: () => void
  setReplayProgress: (p: number) => void
  exportTrajectory: () => Promise<void>
  importTrajectory: () => Promise<void>

  resetGlass: () => void
  showToast: (msg: string) => void
  setBusy: (v: boolean) => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useStudio = create<StudioState>((set, get) => {
  const engine = new Engine()

  return {
    engine,
    tool: engine.input.tool,
    params: { ...engine.input.params },
    frameTick: 0,
    metrics: engine.metrics(),
    pointerActive: false,
    replaying: false,
    replayProgress: 0,
    snapshots: [],
    toast: null,
    busy: false,

    bump: () => {
      const { engine: e } = get()
      set({ frameTick: get().frameTick + 1, metrics: e.metrics() })
    },

    setTool: (t) => {
      get().engine.setTool(t)
      set({ tool: t })
    },

    setParam: (k, v) => {
      const p = { ...get().params, [k]: v }
      get().engine.setParams({ [k]: v })
      set({ params: p })
    },

    setPointerActive: (v) => set({ pointerActive: v }),

    refreshSnapshots: async () => {
      try {
        const records = await listSnapshots()
        const metas: SnapshotMeta[] = []
        let corrupt = 0
        for (const record of records) {
          try {
            const snapshot = JSON.parse(record.glass_json) as GlassSnapshot
            metas.push({
              record,
              snapshot,
              summary: summarizeMetrics(measure(restoreGlass(snapshot)))
            })
          } catch {
            corrupt++
          }
        }
        set({ snapshots: metas })
        if (corrupt > 0) {
          get().showToast(`读取快照列表失败：${corrupt} 条记录数据损坏已跳过`)
        }
      } catch (err) {
        get().showToast(`读取快照列表失败：${(err as Error).message}`)
      }
    },

    addSnapshot: async (title, note, thumb) => {
      const { engine: e, showToast, refreshSnapshots } = get()
      try {
        const record = await saveSnapshot({
          title,
          note,
          glass_json: JSON.stringify(e.snapshot()),
          thumb
        })
        await refreshSnapshots()
        showToast(`已保存快照「${record.title}」`)
        return true
      } catch (err) {
        showToast(`保存快照失败：${(err as Error).message}`)
        return false
      }
    },

    removeSnapshot: async (id) => {
      const title = get().snapshots.find((m) => m.record.id === id)?.record.title
      try {
        await deleteSnapshot(id)
        await get().refreshSnapshots()
        get().showToast(title ? `已删除快照「${title}」` : '已删除快照')
      } catch (err) {
        get().showToast(`删除快照失败：${(err as Error).message}`)
      }
    },

    loadSnapshot: (meta) => {
      const { engine: e, stopReplay } = get()
      try {
        stopReplay()
        e.restore(meta.snapshot)
        e.clearTraj()
        set({ metrics: e.metrics() })
        get().bump()
        get().showToast(`已读取快照「${meta.record.title}」`)
      } catch (err) {
        get().showToast(`读取快照失败：${(err as Error).message}`)
      }
    },

    playReplay: () => {
      const { engine: e } = get()
      if (e.traj.length < 2) {
        get().showToast('还没有可回放的成形轨迹')
        return
      }
      // reset 会清空轨迹，先留存帧序列
      const frames = e.traj.slice()
      e.reset()
      e.startReplay(frames)
      set({
        replaying: true,
        replayProgress: 0,
        tool: 'flame',
        params: { ...DEFAULT_INPUT.params }
      })
    },

    stopReplay: () => {
      const { engine: e } = get()
      e.cancelReplay()
      set({ replaying: false, replayProgress: 0 })
    },

    setReplayProgress: (p) => set({ replayProgress: p }),

    exportTrajectory: async () => {
      const { engine: e, showToast } = get()
      if (e.traj.length < 2) {
        showToast('还没有可导出的成形轨迹')
        return
      }
      try {
        const json = serializeTrajectory(e.traj)
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        const path = await saveTrajectoryFile(json, `玻璃轨迹-${stamp}.json`)
        if (path) showToast(`轨迹已导出：${path}`)
      } catch (err) {
        showToast(`导出失败：${(err as Error).message}`)
      }
    },

    importTrajectory: async () => {
      const { engine: e, showToast, stopReplay } = get()
      let file: { name: string; text: string } | null
      try {
        file = await openTrajectoryFile()
      } catch (err) {
        showToast(`导入失败：${(err as Error).message}`)
        return
      }
      if (!file) return
      let frames: TrajFrame[]
      try {
        frames = parseTrajectory(file.text)
      } catch (err) {
        showToast(`导入失败：${(err as Error).message}`)
        return
      }
      stopReplay()
      e.loadTrajectory(frames)
      set({
        replaying: true,
        replayProgress: 0,
        tool: 'flame',
        params: { ...DEFAULT_INPUT.params }
      })
      showToast(`已导入「${file.name}」（${frames.length} 帧），从料泡开始回放`)
    },

    resetGlass: () => {
      get().engine.reset()
      set({
        tool: 'flame',
        params: { ...DEFAULT_INPUT.params },
        metrics: get().engine.metrics(),
        replaying: false,
        replayProgress: 0
      })
      get().bump()
    },

    showToast: (msg) => {
      set({ toast: msg })
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => set({ toast: null }), 2600)
    },

    setBusy: (v) => set({ busy: v })
  }
})
