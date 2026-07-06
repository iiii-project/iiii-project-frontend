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
