/**
 * 语音输入：麦克风采集 + 识别 → 填入对话输入框
 *
 * 真机约束（2026-10-15 实测，Electron 44 / Chromium 152，Cuckoo 内嵌 https 页面）：
 *  - navigator.mediaDevices.getUserMedia 可用（实测已拿到麦克流）
 *  - webkitSpeechRecognition 存在，但 start() 报 not-allowed（缺媒体权限）
 *  - Electron 不携带 Google 云端语音凭证 → 云端识别可能不可用；
 *    现代 Chromium 支持设备端识别（on-device），优先尝试。
 *
 * 策略：优先用浏览器原生 SpeechRecognition（零额外依赖）；启动前先申请麦克风权限。
 * 失败时明确提示，不静默。
 */
import { showToast } from './panel.js';
import { appendTextToInput } from './chat-input.js';

let recognizing = false;
let recognition: any = null;

/** 取浏览器语音识别构造器（Chrome/Electron 为 webkit 前缀） */
function getSpeechRecognitionCtor(): any {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/** 更新麦克风按钮视觉状态 */
function setButtonState(active: boolean): void {
  const btn = document.getElementById('cuckoo-voice-btn');
  if (!btn) return;
  if (active) btn.classList.add('cuckoo-voice-recording');
  else btn.classList.remove('cuckoo-voice-recording');
}

/** 确保拿到麦克风权限（SpeechRecognition 也依赖它） */
async function ensureMicPermission(): Promise<boolean> {
  try {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') return false;
    const stream = await md.getUserMedia({ audio: true });
    // 立刻释放，仅用于触发权限授予
    try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    return true;
  } catch (err: any) {
    console.warn('[Cuckoo Voice] 获取麦克风权限失败:', err && err.message);
    return false;
  }
}

/** 开始语音输入 */
async function startVoiceInput(): Promise<void> {
  if (recognizing) return;
  const SR = getSpeechRecognitionCtor();
  if (!SR) {
    showToast('当前环境不支持语音识别', 3500);
    return;
  }
  const granted = await ensureMicPermission();
  if (!granted) {
    showToast('未获得麦克风权限', 3500);
    return;
  }
  try {
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0] && e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t || '';
      }
    };
    rec.onerror = (e: any) => {
      recognizing = false;
      setButtonState(false);
      const code = e && e.error ? e.error : 'unknown';
      showToast('语音识别失败: ' + code, 3500);
    };
    rec.onend = async () => {
      recognizing = false;
      setButtonState(false);
      const text = finalText.trim();
      if (text) {
        const ok = await appendTextToInput(text);
        if (!ok) showToast('识别成功，但填入输入框失败', 3000);
      }
    };
    recognition = rec;
    recognizing = true;
    setButtonState(true);
    rec.start();
    showToast('正在聆听…再次点击结束', 2500);
  } catch (err: any) {
    recognizing = false;
    setButtonState(false);
    showToast('启动语音识别失败: ' + (err && err.message ? err.message : err), 3500);
  }
}

/** 停止语音输入 */
function stopVoiceInput(): void {
  try { if (recognition) recognition.stop(); } catch (_) {}
  recognizing = false;
  setButtonState(false);
}

/** 切换开始/停止 */
function toggleVoiceInput(): void {
  if (recognizing) stopVoiceInput();
  else void startVoiceInput();
}

/** 当前是否正在识别 */
function isVoiceActive(): boolean {
  return recognizing;
}

export { startVoiceInput, stopVoiceInput, toggleVoiceInput, isVoiceActive };
