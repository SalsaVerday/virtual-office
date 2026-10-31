const STORAGE_KEY = 'vo.devices'

export type DeviceChoice = {
  micId: string
  speakerId: string
}

export function readDevices(): DeviceChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { micId: '', speakerId: '' }
    const parsed = JSON.parse(raw) as Partial<DeviceChoice>
    return {
      micId: typeof parsed.micId === 'string' ? parsed.micId : '',
      speakerId: typeof parsed.speakerId === 'string' ? parsed.speakerId : '',
    }
  } catch {
    return { micId: '', speakerId: '' }
  }
}

export function writeDevices(choice: DeviceChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: choice.micId, speakerId: choice.speakerId }))
  } catch {
    // Private mode can block storage. The in-memory room still switches for this page.
  }
}
