/* 語音輸入：瀏覽器內建的語音辨識（Chrome / Edge / Safari 走 webkit 前綴）。
   求籤流程裡本來就有這一段，查籤也要能「用說的」，所以抽成共用的 composable。

   一個要先講清楚的限制：多數瀏覽器（尤其 Chrome）的語音辨識是把聲音送到雲端做的，
   沒有網路時會直接以 network 錯誤收場。所以離線時它不會有結果——但也不會擋住流程，
   打字永遠是可用的路，錯誤訊息會明白說是連線問題。 */
import { onBeforeUnmount, ref } from 'vue'

interface SpeechResultAlternative {
  transcript: string
}
interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechResultAlternative
}
interface SpeechResultList {
  readonly length: number
  [index: number]: SpeechResult
}
interface SpeechRecognitionResultEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export interface UseSpeechInputOptions {
  /** 目前的文字內容（辨識結果會接在後面） */
  get(): string
  /** 把辨識到的文字寫回去 */
  set(value: string): void
  /** 上限字數，跟畫面上的 maxlength 一致 */
  maxLength: number
  lang?: string
}

export function useSpeechInput(options: UseSpeechInputOptions) {
  const supported = ref(getRecognitionCtor() !== null)
  const isRecording = ref(false)
  const hint = ref('')

  let recognition: SpeechRecognitionLike | null = null
  let committed = ''

  function start() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      supported.value = false
      hint.value = '這個瀏覽器不支援語音輸入，請直接打字。'
      return
    }
    hint.value = ''
    committed = options.get()

    recognition = new Ctor()
    recognition.lang = options.lang ?? 'zh-TW'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let settled = ''
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) settled += text
        else pending += text
      }
      if (settled) committed = (committed + settled).slice(0, options.maxLength)
      options.set((committed + pending).slice(0, options.maxLength))
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        hint.value = '麥克風權限被拒絕，請在瀏覽器網址列開啟麥克風權限後再試。'
      } else if (event.error === 'no-speech') {
        hint.value = '沒有聽到聲音，請靠近麥克風再說一次。'
      } else if (event.error === 'audio-capture') {
        hint.value = '找不到麥克風，請確認裝置是否接上。'
      } else if (event.error === 'network') {
        // 語音辨識靠雲端，離線時只能請他打字
        hint.value = '目前沒有連線，語音輸入需要網路；可以直接打字，或留白送出。'
      } else if (event.error !== 'aborted') {
        hint.value = '語音辨識中斷了，請再試一次或直接打字。'
      }
    }

    recognition.onend = () => {
      isRecording.value = false
      options.set(committed)
      recognition = null
    }

    try {
      recognition.start()
      isRecording.value = true
      hint.value = '正在聆聽，說完再按一次停止。'
    } catch {
      isRecording.value = false
      hint.value = '無法啟動語音輸入，請直接打字。'
    }
  }

  function stop() {
    recognition?.stop()
    isRecording.value = false
  }

  function toggle() {
    if (isRecording.value) stop()
    else start()
  }

  onBeforeUnmount(() => {
    recognition?.abort()
    recognition = null
  })

  return { supported, isRecording, hint, start, stop, toggle }
}
