import { defineStore } from 'pinia'
import type { ActionEvent } from '@/types/divination'

export type PermissionStatus = 'idle' | 'granted' | 'denied'
export type DetectionStatus = 'idle' | 'starting' | 'ready' | 'detecting' | 'detected' | 'failed'

export const useCameraStore = defineStore('camera', {
  state: () => ({
    permissionStatus: 'idle' as PermissionStatus,
    isActive: false,
    detectionStatus: 'idle' as DetectionStatus,
    lastDetectedAction: null as ActionEvent | null,
    errorMessage: ''
  })
})
