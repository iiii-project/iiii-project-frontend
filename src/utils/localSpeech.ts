/* 台語語音輸入：錄音後送到自家後端轉寫，不經任何雲端服務。

   為什麼不用瀏覽器內建的 SpeechRecognition（見 utils/speech.ts）：
   那個只認華語，而且要連外網。台語一定得靠自己的模型。

   為什麼不直接把 MediaRecorder 的 webm/mp4 丟給後端：
   伺服器要解那些容器得裝 ffmpeg，而這台機器上沒有。改成在瀏覽器裡用
   decodeAudioData 解碼、OfflineAudioContext 重新取樣成 16kHz 單聲道，
   送上去就是模型直接吃的 float32——後端零依賴。

   和 useSpeechInput 刻意保持同樣的對外形狀（supported / isRecording / hint /
   toggle / stop），呼叫端只要多接一個 isTranscribing 就能換過來。 */
import { onBeforeUnmount, ref } from 'vue'

const TARGET_SAMPLE_RATE = 16000

export interface UseLocalSpeechOptions {
  /** 目前的文字內容（辨識結果會接在後面） */
  get(): string
  /** 把辨識到的文字寫回去 */
  set(value: string): void
  /** 上限字數，跟畫面上的 maxlength 一致 */
  maxLength: number
  /** 轉寫端點，預設走 vite proxy 到後端 */
  endpoint?: string
}

function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) !==
      'undefined'
  )
}

function getAudioContextCtor(): typeof AudioContext {
  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext
  if (!Ctor) throw new Error('no AudioContext')
  return Ctor
}

/** 把錄到的音檔解碼並重新取樣成 16kHz 單聲道 float32。 */
async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const Ctor = getAudioContextCtor()
  const decodeCtx = new Ctor()
  try {
    const buffer = await decodeCtx.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.ceil((buffer.duration * TARGET_SAMPLE_RATE) || 0)
    if (!frames) return new Float32Array(0)

    /* OfflineAudioContext 幫我們做重新取樣與混音成單聲道。
       自己寫線性內插會有 aliasing，瀏覽器的實作有做低通。 */
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = buffer
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    // 自己配一塊 ArrayBuffer，之後才能安全地當成 BlobPart 送出去
    const pcm = new Float32Array(new ArrayBuffer(rendered.length * 4))
    pcm.set(rendered.getChannelData(0))
    return pcm
  } finally {
    void decodeCtx.close()
  }
}

export function useLocalSpeechInput(options: UseLocalSpeechOptions) {
  const endpoint = options.endpoint ?? '/api/v1/speech/transcribe/'
  const supported = ref(canRecord())
  const isRecording = ref(false)
  const isTranscribing = ref(false)
  const hint = ref('')

  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: Blob[] = []

  function releaseStream() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }

  async function start() {
    if (isRecording.value || isTranscribing.value) return
    if (!canRecord()) {
      supported.value = false
      hint.value = '這個瀏覽器不支援錄音，請直接打字。'
      return
    }
    hint.value = ''
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
    } catch {
      hint.value = '麥克風權限被拒絕，請在瀏覽器開啟麥克風權限後再試。'
      return
    }

    chunks = []
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      releaseStream()
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      chunks = []
      recorder = null
      void transcribe(blob)
    }
    recorder.start()
    isRecording.value = true
    hint.value = '正在錄音，說完再按一次。台語、國語都可以。'
  }

  async function transcribe(blob: Blob) {
    if (!blob.size) {
      hint.value = '沒有錄到聲音，請再試一次或直接打字。'
      return
    }
    isTranscribing.value = true
    hint.value = '正在辨識，稍等一下…'
    try {
      const pcm = await toPcm16k(blob)
      if (pcm.length < TARGET_SAMPLE_RATE * 0.3) {
        hint.value = '太短了，請按住多說一點。'
        return
      }

      const form = new FormData()
      // pcm 是我們自己配置的 ArrayBuffer（見 toPcm16k），不會是 SharedArrayBuffer
      form.append(
        'audio',
        new Blob([pcm.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
        'audio.f32'
      )
      const response = await fetch(endpoint, { method: 'POST', body: form })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        // 後端已經把「請直接打字」寫在訊息裡（模型沒裝好時是 503），直接沿用它的說法
        hint.value = payload?.error?.message ?? '語音辨識失敗了，請再試一次或直接打字。'
        return
      }

      const text: string = payload.data?.text ?? ''
      if (!text) {
        hint.value = '沒有聽出內容，請再說一次或直接打字。'
        return
      }
      options.set((options.get() + text).slice(0, options.maxLength))
      // 辨識率不完美，明確請使用者過目——這比假裝準確好
      hint.value = '辨識完成，請確認文字是否正確，可以直接修改。'
    } catch {
      hint.value = '語音處理失敗了，請再試一次或直接打字。'
    } finally {
      isTranscribing.value = false
    }
  }

  function stop() {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else releaseStream()
    isRecording.value = false
  }

  function toggle() {
    if (isRecording.value) stop()
    else void start()
  }

  onBeforeUnmount(() => {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    releaseStream()
  })

  return { supported, isRecording, isTranscribing, hint, start, stop, toggle }
}
