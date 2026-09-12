# 琉璃工房 · Glass Forge

面向玻璃艺术家的桌面虚拟吹制工具：从一团熔融玻璃球出发，用 **火焰 / 吹管 / 拉制 / 炭铲 / 风冷** 五个工具头，
配合火焰温度、旋转速度、拉伸力度、吹气压力四个旋钮，吹旋冷却出一只虚拟花瓶。

- **离线优先**：Electron 桌面应用，过程快照存入本地 SQLite（`better-sqlite3`），无需网络。
- **确定性仿真**：玻璃抽象为一条旋转剖面母线（25 个站点），1/30s 固定步长推进；
  温度、壁厚、气泡、应力、裂纹全部沿母线演化，轨迹逐帧录制、可逐帧复现回放。
- **过程快照**：任意工序节点拍快照（状态 + 缩略图 + 工序备注），随时读取回到该节点；
  列表展示成型状态、温度与警示注记，删除需二次确认（5 秒内可取消），防止误删。
- **轨迹导出 / 导入**：成形轨迹可保存为 JSON 文件；导入后自动从料泡逐帧回放，
  结果与原轨迹一致，文件损坏时给出明确提示。
- **制作分镜**：快照自动排版合成带编号与状态注记的分镜板，一键导出 PNG。

## 技术栈

Electron + electron-vite + TypeScript + React + Canvas 2D + Zustand + better-sqlite3 + Vitest

## 开发

```bash
npm install
# better-sqlite3 是原生模块，首次安装后按 Electron ABI 重编译
npm run rebuild
npm run dev
```

> 在纯浏览器中也能跑（`vite` 开发时），存储会自动降级到 localStorage、分镜改为浏览器下载。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发环境 |
| `npm test` | 运行 Vitest（物理行为 / 回放确定性 / 快照往返 / 轨迹文件 / 分镜布局） |
| `npm run typecheck` | TypeScript 全量检查 |
| `npm run build` | 构建主 / preload / 渲染进程到 `out/` |
| `npm run dist` | 打包桌面安装包 |

## 操作

1. 选择工具头，在器身上**按住拖动**（鼠标或触控）施加作用，松开即停止。
2. 推荐工序：火焰整体保温 → 吹管鼓出瓶腹 → 肩部加热后拉制收颈 → 口沿补热吹开 → 缓慢冷却。
3. 警告：对冷玻璃硬拉会锁住应力；把炽热玻璃用强风冷直接吹过 ~380℃ 脆裂温区会产生裂纹，
   裂纹贯穿即报废。高于 520℃ 退火温度时应力会自然松弛。
4. 在关键节点拍快照（可附一句工序备注）；删除快照需再点一次「确认删除」（5 秒内可取消）。
   完成后点「回放轨迹」从料泡逐帧复现，或「导出分镜 PNG」。
5. 「导出轨迹」把成形轨迹保存为 JSON 文件；「导入轨迹」选择该文件后自动从料泡开始回放，
   复现结果与原轨迹一致。文件损坏、版本过新或不是轨迹文件时会弹出具体原因。

## 代码结构

```
src/
  shared/          主进程 / 渲染进程共享类型
  main/            Electron 主进程：窗口、IPC、SQLite、分镜导出
  preload/         contextBridge 安全桥（window.forge）
  renderer/
    engine/        纯 TS 仿真内核（无 DOM 依赖，可直接单测）
      geometry.ts  剖面站点、温度可塑性、扩散/平滑
      tools.ts     五个工具头 + 环境步（导热、对流、淬火、退火、裂纹、气泡）
      engine.ts    固定步长引擎、轨迹录制 / 回放、成型度量
      trajectory.ts 轨迹 JSON 导出 / 导入（逐帧校验类型与取值范围，损坏时给出中文提示）
      render.ts    Canvas 2D 回转体渲染
      storyboard.ts 分镜纯布局 + 合成
    state/         Zustand store、存储适配（SQLite / localStorage 降级）
    components/    React UI（Stage / Toolbar / Controls / Metrics / Snapshots …）
```

## 仿真模型要点

- 站点状态：`r`（半径）、`thickness`（壁厚）、`temp`（℃）、`stress`、`bubbles`、`cracks`。
- 工具作用 = 沿母线的高斯权重 × 温度可塑性（620℃ 以下基本不可塑，980℃ 以上接近自由流动）。
- 旋转速度同时影响：加热/膨胀均匀度、高温气泡逸出、离心微鼓。
- 成型判定：口沿外翻、瓶腹明显大于口径、伸长 > 1.12× 且无贯穿裂纹。
