import { useState } from 'react'
import { useStudio, type SnapshotMeta } from '../state/store'
import { drawThumbnail } from '../engine/render'
import { restoreGlass } from '../engine/geometry'
import { DEFAULT_INPUT, measure } from '../engine/engine'
import { describeGlass } from '../engine/describe'
import { exportStoryboard, saveStoryboardFile } from '../state/storage'
import {
  moveBoardItem,
  reconcileBoardQueue,
  restoreBoardOrder,
  setBoardAllPicked,
  type BoardPick
} from '../engine/storyboard'

export function StoryboardBar(): JSX.Element {
  const snapshots = useStudio((s) => s.snapshots)
  const busy = useStudio((s) => s.busy)
  const setBusy = useStudio((s) => s.setBusy)
  const showToast = useStudio((s) => s.showToast)
  const [title, setTitle] = useState('我的花瓶')
  // 本次分镜的导出队列（组件本地状态）：只影响本次导出，不写回快照数据或右侧列表
  const [queue, setQueue] = useState<BoardPick[]>([])
  const [seenSnapshots, setSeenSnapshots] = useState(snapshots)

  // 快照列表变化时调和队列：保留手动顺序与勾选，新快照按创建时间追加到队尾
  if (snapshots !== seenSnapshots) {
    setSeenSnapshots(snapshots)
    setQueue(reconcileBoardQueue(queue, snapshots.map((m) => m.record)))
  }

  const byId = new Map(snapshots.map((m) => [m.record.id, m]))
  const picked = queue
    .filter((q) => q.on)
    .map((q) => byId.get(q.id))
    .filter((m): m is SnapshotMeta => m != null)

  // 编号随最终顺序更新：未勾选的节点不占编号
  let seq = 0
  const numbers = new Map<number, number>()
  for (const q of queue) {
    if (q.on) numbers.set(q.id, ++seq)
  }

  const toggle = (id: number): void => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, on: !it.on } : it)))
  }

  const move = (index: number, dir: -1 | 1): void => {
    setQueue((q) => moveBoardItem(q, index, dir))
  }

  // 批量勾选只作用于本次分镜队列，不改写快照数据
  const selectAll = (on: boolean): void => {
    setQueue((q) => setBoardAllPicked(q, on))
  }

  // 恢复按创建时间从早到晚的顺序，各节点当前勾选状态保留
  const restoreOrder = (): void => {
    setQueue((q) => restoreBoardOrder(q, snapshots.map((m) => m.record)))
  }

  const exportBoard = async (): Promise<void> => {
    if (picked.length === 0) {
      showToast(snapshots.length === 0 ? '先拍几张过程快照再导出分镜' : '请至少勾选一个工序节点')
      return
    }
    setBusy(true)
    try {
      const panels = picked.map((meta) => {
        const glass = restoreGlass(meta.snapshot)
        return {
          title: meta.record.title,
          caption: meta.record.note || describeGlass(glass),
          thumb: drawThumbnail(glass, DEFAULT_INPUT, measure(glass))
        }
      })
      const dataUrl = await exportStoryboard(panels, title)
      const name = `${title || 'glass-storyboard'}.png`
      const path = await saveStoryboardFile(dataUrl, name)
      // 用户在保存对话框中取消：静默结束，不当作失败
      if (path) showToast(`分镜已导出：${path}`)
    } catch (err) {
      showToast(`导出失败：${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel storyboard">
      <h3>制作分镜</h3>
      <div className="snap-form">
        <input
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          placeholder="作品名"
          disabled={busy}
        />
        <button className="primary" onClick={exportBoard} disabled={busy || snapshots.length === 0}>
          {busy ? '合成中…' : '导出分镜 PNG'}
        </button>
      </div>
      {queue.length > 0 ? (
        <>
          <div className="board-actions">
            <button onClick={() => selectAll(true)} disabled={busy} title="勾选全部工序节点">
              全选
            </button>
            <button onClick={() => selectAll(false)} disabled={busy} title="取消全部勾选">
              全不选
            </button>
            <button
              onClick={restoreOrder}
              disabled={busy}
              title="按创建时间从早到晚重新排列，保留当前勾选"
            >
              恢复时间顺序
            </button>
          </div>
          <ul className={busy ? 'board-list locked' : 'board-list'}>
            {queue.map((q, i) => {
              const meta = byId.get(q.id)
              if (!meta) return null
              return (
                <li key={q.id} className={q.on ? '' : 'off'}>
                  <input
                    type="checkbox"
                    checked={q.on}
                    onChange={() => toggle(q.id)}
                    disabled={busy}
                    title={q.on ? '取消选中' : '选中'}
                  />
                  <span className="board-seq">{numbers.get(q.id) ?? '–'}</span>
                  <span className="board-title" title={meta.record.title}>
                    {meta.record.title}
                  </span>
                  <span className="board-moves">
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} title="上移">
                      ↑
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={busy || i === queue.length - 1}
                      title="下移"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="muted small">
            已选 {picked.length} / {queue.length} 个工序，默认按创建时间从早到晚排列，可全选、全不选、
            恢复时间顺序，或用 ↑↓ 调整、逐项取消勾选；编号以最终顺序导出，不影响右侧快照列表；
            合成和保存期间预览锁定，导出内容与预览一致。
          </p>
        </>
      ) : (
        <p className="muted small">按快照时间线自动排版成带编号与状态注记的工序分镜。</p>
      )}
    </div>
  )
}
