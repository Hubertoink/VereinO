import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type ExportStampOptions = {
  includeSeconds?: boolean
  baseDate?: Date
}

export function getExportsDir(): string {
  const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  try {
    fs.mkdirSync(baseDir, { recursive: true })
  } catch {
    // ignore export dir creation errors here; callers will fail on write if needed
  }
  return baseDir
}

export function createExportStamp(options: ExportStampOptions = {}): string {
  const when = options.baseDate ?? new Date()
  const parts = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, '0'),
    String(when.getDate()).padStart(2, '0')
  ]
  const time = [
    String(when.getHours()).padStart(2, '0'),
    String(when.getMinutes()).padStart(2, '0')
  ]
  if (options.includeSeconds) {
    time.push(String(when.getSeconds()).padStart(2, '0'))
  }
  return `${parts.join('-')}_${time.join('')}`
}

export function createExportPath(fileName: string): string {
  return path.join(getExportsDir(), fileName)
}