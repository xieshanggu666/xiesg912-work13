import type { ForgeBridge, SnapshotRecord, StoryboardPanel } from '@shared/types'

/**
 * 存储适配：Electron 下走 SQLite（window.forge），
 * 浏览器 / 单测环境降级到 localStorage，保证离线可用。
 */

const LS_KEY = 'glass-forge:snapshots'

function bridge(): ForgeBridge | undefined {
  return typeof window !== 'undefined' ? window.forge : undefined
}

function readLocal(): SnapshotRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as SnapshotRecord[]
  } catch {
    return []
  }
}

function writeLocal(records: SnapshotRecord[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(records))
}

export async function listSnapshots(): Promise<SnapshotRecord[]> {
  const b = bridge()
  if (b) return b.listSnapshots()
  return readLocal().sort((a, b2) => b2.created_at - a.created_at)
}

export async function saveSnapshot(
  record: Omit<SnapshotRecord, 'id' | 'created_at'>
): Promise<SnapshotRecord> {
  const b = bridge()
  if (b) return b.saveSnapshot(record)
  const all = readLocal()
  const full: SnapshotRecord = {
    ...record,
    id: all.reduce((m, r) => Math.max(m, r.id ?? 0), 0) + 1,
    created_at: Date.now()
  }
  all.push(full)
  writeLocal(all)
  return full
}

export async function deleteSnapshot(id: number): Promise<void> {
  const b = bridge()
  if (b) {
    await b.deleteSnapshot(id)
    return
  }
  writeLocal(readLocal().filter((r) => r.id !== id))
}

export async function exportStoryboard(panels: StoryboardPanel[], title: string): Promise<string> {
  // 动态引入，避免纯逻辑测试加载 DOM 依赖
  const { renderStoryboard } = await import('../engine/storyboard')
  return renderStoryboard(panels, title)
}

/** 保存分镜 PNG；返回保存路径，用户在系统对话框中取消时返回 null */
export async function saveStoryboardFile(dataUrl: string, name: string): Promise<string | null> {
  const b = bridge()
  if (b) {
    const res = await b.exportStoryboard(dataUrl, name)
    if (res.canceled) return null
    if (!res.ok) throw new Error(res.error ?? '导出失败')
    return res.path ?? ''
  }
  // 浏览器降级：直接触发下载
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
  return name
}

/** 导出轨迹 JSON；返回保存路径，用户取消时返回 null */
export async function saveTrajectoryFile(json: string, name: string): Promise<string | null> {
  const b = bridge()
  if (b) {
    const res = await b.exportTrajectory(json, name)
    if (res.canceled) return null
    if (!res.ok) throw new Error(res.error ?? '导出失败')
    return res.path ?? ''
  }
  // 浏览器降级：Blob 下载
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}

/** 弹出文件选择并读取轨迹 JSON 文本；用户取消时返回 null */
export async function openTrajectoryFile(): Promise<{ name: string; text: string } | null> {
  const b = bridge()
  if (b) {
    const res = await b.importTrajectory()
    if (res.canceled) return null
    if (!res.ok) throw new Error(res.error ?? '读取文件失败')
    return { name: res.name ?? '轨迹文件', text: res.text ?? '' }
  }
  // 浏览器降级：<input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') })
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
