/// <reference types="vite/client" />

declare module '@mediapipe/camera_utils' {
  export class Camera {
    constructor(video: HTMLVideoElement, options: { width: number; height: number; onFrame: () => Promise<void> })
    start(): Promise<void>
    stop(): void
  }
}

declare module '@mediapipe/hands' {
  export class Hands {
    constructor(options: { locateFile: (file: string) => string })
    setOptions(options: Record<string, boolean | number>): void
    onResults(callback: (results: { multiHandLandmarks?: Array<Array<{ x: number; y: number; z?: number }>> }) => void): void
    send(input: { image: HTMLVideoElement }): Promise<void>
    close(): void
  }
}

declare module '@mediapipe/pose' {
  export class Pose {
    constructor(options: { locateFile: (file: string) => string })
    setOptions(options: Record<string, boolean | number>): void
    onResults(callback: (results: { poseLandmarks?: Array<{ x: number; y: number; z?: number }> }) => void): void
    send(input: { image: HTMLVideoElement }): Promise<void>
    close(): void
  }
}

/* AR 引擎那份離線籤詩表是純 JS（原樣搬自舊版單頁），
   查籤的離線備援會 import 它，這裡補上型別宣告。 */
declare module '@/ar/temple-ar-oracle/engine/offline-fortunes.js' {
  export const OFFLINE_FORTUNES: Array<{
    no: number
    ganzhi: string
    grade: string
    poem: string
    explain: string
    modern: string
  }>
}
