import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import type { SnapshotRecord } from '../shared/types'

let db: Database.Database | null = null

export function openDatabase(): Database.Database {
  if (db) return db
  const file = app.isPackaged
    ? join(app.getPath('userData'), 'glass-forge.db')
    : join(app.getPath('userData'), 'glass-forge-dev.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      glass_json TEXT NOT NULL,
      thumb TEXT NOT NULL
    )
  `)
  return db
}

interface SnapshotRow {
  id: number
  title: string
  note: string
  created_at: number
  glass_json: string
  thumb: string
}

export function listSnapshots(): SnapshotRecord[] {
  const rows = openDatabase()
    .prepare('SELECT * FROM snapshots ORDER BY created_at DESC')
    .all() as SnapshotRow[]
  return rows
}

export function insertSnapshot(
  record: Omit<SnapshotRecord, 'id' | 'created_at'>
): SnapshotRecord {
  const created_at = Date.now()
  const info = openDatabase()
    .prepare(
      'INSERT INTO snapshots (title, note, created_at, glass_json, thumb) VALUES (?, ?, ?, ?, ?)'
    )
    .run(record.title, record.note, created_at, record.glass_json, record.thumb)
  return { ...record, id: Number(info.lastInsertRowid), created_at }
}

export function deleteSnapshot(id: number): void {
  openDatabase().prepare('DELETE FROM snapshots WHERE id = ?').run(id)
}
