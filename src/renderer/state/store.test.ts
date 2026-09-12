import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudio } from './store'

/** storage.ts 的浏览器降级依赖 localStorage，node 环境下用内存 stub */
const lsData = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsData.get(k) ?? null,
  setItem: (k: string, v: string) => {
    lsData.set(k, String(v))
  },
  removeItem: (k: string) => {
    lsData.delete(k)
  },
  clear: () => lsData.clear()
})

function storedCount(): number {
  return (JSON.parse(lsData.get('glass-forge:snapshots') ?? '[]') as unknown[]).length
}

describe('快照删除', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    lsData.clear()
    await useStudio.getState().refreshSnapshots()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('删除立即生效：列表与存储同时移除', async () => {
    const ok = await useStudio.getState().addSnapshot('节点A', '备注', 'thumb')
    expect(ok).toBe(true)
    expect(useStudio.getState().snapshots).toHaveLength(1)
    const id = useStudio.getState().snapshots[0].record.id!

    await useStudio.getState().removeSnapshot(id)

    expect(useStudio.getState().snapshots).toHaveLength(0)
    expect(storedCount()).toBe(0)
    expect(useStudio.getState().toast).toBe('已删除快照「节点A」')
  })

  it('删除失败时保留快照并给出一致提示', async () => {
    await useStudio.getState().addSnapshot('节点A', '', 'thumb')
    const id = useStudio.getState().snapshots[0].record.id!

    // 让底层存储写入失败
    const ls = localStorage as unknown as { setItem: (k: string, v: string) => void }
    const original = ls.setItem
    ls.setItem = () => {
      throw new Error('磁盘写入失败')
    }
    try {
      await useStudio.getState().removeSnapshot(id)
    } finally {
      ls.setItem = original
    }

    expect(useStudio.getState().toast).toBe('删除快照失败：磁盘写入失败')
    expect(useStudio.getState().snapshots).toHaveLength(1)
  })
})
