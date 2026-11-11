export type BackupProgress = {
  active: boolean
  stage: 'database' | 'attachments' | 'transfer' | 'verify' | 'rotation' | 'done' | 'error'
  message: string
  completedBytes?: number
  totalBytes?: number
  localFilePath?: string
  logFilePath?: string
}

export type BackupResult = {
  filePath: string
  warning?: string
  logFilePath?: string
}
