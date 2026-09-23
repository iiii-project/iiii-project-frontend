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
  let baseText = ''
  // SpeechRecognition 可能重送同一個 resultIndex 的 final 結果。
  // 用 index 記錄並覆寫，而不是每次事件都 append，避免「你好」變成「你好你好」。
  let finalSegments = new Map<number, string>()
  let sessionId = 0

  function finalText(): string {
    let previous = ''
    return [...finalSegments.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, text]) => {
        // 少數瀏覽器會把同一段 final transcript 放進相鄰的兩個結果索引；
        // 同句完全重複時只保留一次，但不影響真正不同的連續句子。
        if (text === previous) return ''
        previous = text
        return text
      })
      .join('')
  }

  function start() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      supported.value = false
      hint.value = '這個瀏覽器不支援語音輸入，請直接打字。'
      return
    }
    hint.value = ''
    if (recognition) return
    const currentSession = ++sessionId
    baseText = options.get()
    finalSegments = new Map()

    const currentRecognition = new Ctor()
    recognition = currentRecognition
    currentRecognition.lang = options.lang ?? 'zh-TW'
    currentRecognition.continuous = true
    currentRecognition.interimResults = true

    currentRecognition.onresult = (event) => {
      if (currentSession !== sessionId) return
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finalSegments.set(i, text)
        else pending += text
      }
      options.set((baseText + finalText() + pending).slice(0, options.maxLength))
    }

    currentRecognition.onerror = (event) => {
      if (currentSession !== sessionId) return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        hint.value = '麥克風權限被拒絕，請在瀏覽器網址列開啟麥克風權限後再試。'
      } else if (event.error === 'no-speech') {
        hint.value = '沒有聽到聲音，請靠近麥克風再說一次。'
      } else if (event.error === 'audio-capture') {
        hint.value = '找不到麥克風，請確認裝置是否接上。'
      } else if (event.error === 'network') {
        // 語音辨識靠雲端，離線時只能請他打字
        hint.value = '語音輸入需要網路，請直接打字。'
      } else if (event.error !== 'aborted') {
        hint.value = '語音辨識中斷了，請再試一次或直接打字。'
      }
    }

    currentRecognition.onend = () => {
      if (currentSession !== sessionId) return
      isRecording.value = false
      options.set((baseText + finalText()).slice(0, options.maxLength))
      recognition = null
    }

    try {
      currentRecognition.start()
      isRecording.value = true
      hint.value = '正在聆聽，說完再按一次停止。'
    } catch {
      isRecording.value = false
      recognition = null
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
    sessionId += 1
    recognition?.abort()
    recognition = null
  })

  return { supported, isRecording, hint, start, stop, toggle }
}
