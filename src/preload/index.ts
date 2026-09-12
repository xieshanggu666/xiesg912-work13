import { contextBridge, ipcRenderer } from 'electron'
import type { ForgeBridge, SnapshotRecord } from '../shared/types'

const bridge: ForgeBridge = {
  listSnapshots: () => ipcRenderer.invoke('pn:snapshots:list'),
  saveSnapshot: (record: Omit<SnapshotRecord, 'id' | 'created_at'>) =>
    ipcRenderer.invoke('pn:snapshots:save', record),
  deleteSnapshot: (id: number) => ipcRenderer.invoke('pn:snapshots:delete', id),
  exportStoryboard: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('pn:storyboard:export', dataUrl, defaultName),
  exportTrajectory: (json: string, defaultName: string) =>
    ipcRenderer.invoke('pn:trajectory:export', json, defaultName),
  importTrajectory: () => ipcRenderer.invoke('pn:trajectory:import')
}

contextBridge.exposeInMainWorld('forge', bridge)
