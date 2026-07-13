import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { getSetting, setSetting } from './settings'
import { filePayloadToBuffer } from './filePayload'
import type { FileDataPayload } from '../../../shared/filePayload'

const ENABLED_SETTING = 'documents.docling.enabled'
const MAX_INPUT_BYTES = 10 * 1024 * 1024
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024
const DETECT_TIMEOUT_MS = 8_000
const EXTRACT_TIMEOUT_MS = 180_000

type PythonCommand = { command: string; prefix: string[]; label: string }
type DoclingDetection = { installed: boolean; version: string | null; runtime: PythonCommand | null; error?: string }

async function installedWindowsPythonCommands(): Promise<PythonCommand[]> {
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
    path.join(process.env.LOCALAPPDATA || '', 'Python')
  ].filter(Boolean)
  const commands: PythonCommand[] = []
  for (const root of roots) {
    try {
      for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^Python\d+$/i.test(entry.name)) continue
        const executable = path.join(root, entry.name, 'python.exe')
        try {
          await fs.access(executable)
          commands.push({ command: executable, prefix: [], label: entry.name })
        } catch { /* executable not present */ }
      }
    } catch {
      // An absent Python installation root is expected.
    }
  }
  return commands.sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }))
}

async function pythonCandidates(): Promise<PythonCommand[]> {
  return process.platform === 'win32'
    ? [
        ...await installedWindowsPythonCommands(),
        { command: 'py', prefix: ['-3'], label: 'py -3' },
        { command: 'python', prefix: [], label: 'python' }
      ]
    : [
        { command: 'python3', prefix: [], label: 'python3' },
        { command: 'python', prefix: [], label: 'python' }
      ]
}

let detectionCache: { at: number; value: DoclingDetection } | null = null

function runPython(runtime: PythonCommand, code: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(runtime.command, [...runtime.prefix, '-c', code, ...args], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    let settled = false
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error(`Docling-Zeitlimit von ${Math.round(timeoutMs / 1000)} Sekunden überschritten.`))
    }, timeoutMs)
    timer.unref?.()
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(Buffer.concat(stdout).toString('utf8').trim())
    }
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_OUTPUT_BYTES) {
        child.kill()
        finish(new Error('Docling-Ausgabe ist zu groß.'))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code === 0) finish()
      else finish(new Error(Buffer.concat(stderr).toString('utf8').trim() || `Docling wurde mit Code ${code} beendet.`))
    })
  })
}

async function detectDocling(force = false): Promise<DoclingDetection> {
  if (!force && detectionCache && Date.now() - detectionCache.at < 60_000) return detectionCache.value
  let lastError = 'Python 3 oder das Python-Modul „docling“ wurde nicht gefunden.'
  for (const runtime of await pythonCandidates()) {
    try {
      const version = await runPython(
        runtime,
        "import importlib.metadata; print(importlib.metadata.version('docling'))",
        [],
        DETECT_TIMEOUT_MS
      )
      const value = { installed: true, version: version || null, runtime }
      detectionCache = { at: Date.now(), value }
      return value
    } catch (error: any) {
      lastError = error?.message || String(error)
    }
  }
  const value = {
    installed: false,
    version: null,
    runtime: null,
    error: `Docling wurde in keiner verfügbaren Python-3-Installation gefunden.${lastError.includes('ENOENT') ? ' Python 3 wurde ebenfalls nicht erkannt.' : ''}`
  }
  detectionCache = { at: Date.now(), value }
  return value
}

export async function getDoclingStatus(force = false) {
  const detected = await detectDocling(force)
  return {
    installed: detected.installed,
    enabled: Boolean(getSetting<boolean>(ENABLED_SETTING)) && detected.installed,
    configured: Boolean(getSetting<boolean>(ENABLED_SETTING)),
    version: detected.version,
    runtime: detected.runtime?.label || null,
    error: detected.error || null
  }
}

export async function setDoclingEnabled(enabled: boolean) {
  const detected = await detectDocling(true)
  if (enabled && !detected.installed) {
    throw new Error('Docling ist nicht installiert. Bitte zuerst Python 3 und „pip install docling“ ausführen.')
  }
  setSetting(ENABLED_SETTING, enabled)
  return getDoclingStatus()
}

export function cleanDoclingMarkdown(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[ \t]+\|[ \t]+/g, '\t')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractWithDocling(
  input: { fileName: string; mimeType?: string | null } & FileDataPayload
) {
  const status = await getDoclingStatus()
  if (!status.enabled) throw new Error('Die lokale Docling-Verarbeitung ist nicht aktiviert.')
  const detected = await detectDocling()
  if (!detected.runtime) throw new Error('Docling-Laufzeit nicht gefunden.')
  const bytes = filePayloadToBuffer(input)
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new Error('Docling verarbeitet in VereinO Dateien bis 10 MB.')
  const extension = path.extname(input.fileName).toLowerCase()
  if (!['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(extension)) {
    throw new Error('Docling unterstützt hier PDF-, PNG-, JPEG- und TIFF-Dateien.')
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-docling-'))
  const inputPath = path.join(tempDir, `${randomUUID()}${extension}`)
  try {
    await fs.writeFile(inputPath, bytes)
    const output = await runPython(
      detected.runtime,
      [
        'import json, sys',
        'from docling.document_converter import DocumentConverter',
        'doc = DocumentConverter().convert(sys.argv[1]).document',
        "print(json.dumps({'markdown': doc.export_to_markdown(), 'document': doc.export_to_dict()}, ensure_ascii=False))"
      ].join('; '),
      [inputPath],
      EXTRACT_TIMEOUT_MS
    )
    const parsed = JSON.parse(output)
    const markdown = String(parsed?.markdown || '').slice(0, 250_000)
    return {
      ok: true,
      markdown,
      text: cleanDoclingMarkdown(markdown),
      document: parsed?.document || null,
      version: detected.version
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}
