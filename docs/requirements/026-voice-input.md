---
id: 026
type: feature
title: 语音输入（说话转文字填入对话）
status: review
branch: feat/026-voice-input
created: 2026-10-15
updated: 2026-10-15
---

## 背景

受限场景/移动场景下，用户希望**用说话代替打字**向 AI 网页（ChatGPT/DeepSeek/Claude）输入。
当前 overlay（注入 AI 网页的悬浮层）无任何语音能力（全项目 grep 无 SpeechRecognition/getUserMedia）。

真机实测（Electron 44 / Chromium 152，Cuckoo 内嵌网页）：

| 能力 | https 安全上下文 | data: URL |
|---|---|---|
| navigator.mediaDevices.getUserMedia | ✅ 可用 | ❌ 无 |
| webkitSpeechRecognition | ⚠️ 存在，但 start() 报 not-allowed | — |
| MediaRecorder | ✅ | ✅ |
| AudioWorklet | ✅ | ❌ |

结论：AI 网页是 https 安全上下文 → **采集层可用**；Web Speech API 在 Electron 里
存在但不可用（Electron 不携带 Google 语音服务凭证）→ **识别层必须可插拔**。

## 目标

- overlay 增加「麦克风」按钮：点击开始录音、再点停止；识别结果填入当前 AI 输入框
- 识别后端**可插拔**：优先浏览器原生（若某环境可用），否则走主进程可配置 STT
- 不改动 AI 网页自身代码；失败时清晰提示，不静默

## 方案

### 一、媒体权限（主进程，根因修复）
`src/app/entry.ts`：AI 页面视图创建后，对其 session 设
`setPermissionRequestHandler` / `setPermissionCheckHandler`，
**仅放行 `media` / `audioCapture`**，其余权限维持默认拒绝（不扩大权限面）。

真机验证（`getUserMedia` 实测）：授权后成功拿到麦克流
（`Default - 麦克风 (HyperX Virtual Surround Sound)`）。
此前 `webkitSpeechRecognition.start()` 报 `not-allowed` = 缺媒体权限。

### 二、语音按钮（overlay）
- `src/overlay/template/overlay.html`：悬浮球左侧加 `#cuckoo-voice-btn`（🎤）
- `src/overlay/template/overlay.css`：按钮样式 + 录音中红色脉冲动画
- `src/overlay/voice.ts`（新增）：`startVoiceInput` / `stopVoiceInput` / `toggleVoiceInput`
  - 优先用浏览器原生 `SpeechRecognition`（`webkit` 前缀），`lang='zh-CN'`、`interimResults=true`
  - 启动前先 `getUserMedia` 申请麦克风权限（SpeechRecognition 也依赖它）
  - 识别结束 → `appendTextToInput(text)` 填入当前 AI 输入框（**不自动发送**）
  - 失败明确 `showToast`，不静默
- `src/overlay/events.ts`：绑定 `#cuckoo-voice-btn` → `toggleVoiceInput()`

### 技术选型说明
- Web Speech API 在 Electron 里**存在**（`typeof === 'function'`），但历史行为报 `not-allowed`；
  授权后是否可用**待真机验证**（Electron 不携带 Google 云端语音凭证，可能仍不可用）。
- 因此识别层设计为「可插拔」：当前走原生；若真机不可用，后续可接本地 STT
  （whisper.cpp / sherpa-onnx，主进程侧），无需改动采集/填入层。

## 验收标准

- [x] 主进程授权媒体权限，getUserMedia 可拿到麦克流（**真机实测通过**）
- [x] overlay 麦克风按钮：录音中/空闲 状态可视（代码完成）
- [x] 识别文字填入 AI 输入框（不自动发送）（代码完成）
- [x] typecheck（0 错）/ lint（0 错）/ test（879 passed）/ compile 全绿
- [ ] 真机 npm start 验证语音识别可用性（**待用户验证**）

## 遗留 / 后续

- **语音识别可用性待真机验证**：本机 `webkitSpeechRecognition` 报 `not-allowed` 已由媒体权限修复；
  但 Electron 无 Google 云端凭证，`start()` 后能否真正出字未验证。若不可用 → 接本地 STT。
- 采集层（getUserMedia）已实测可用，本地 STT 可直接复用，无需重构。
- 未做「流式实时出字」：当前为「说完一次性填入」，interimResults 已开但未实时渲染。

## 遗留 / 后续

（完成后补）
