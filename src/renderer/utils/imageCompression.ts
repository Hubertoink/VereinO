export type CompressImageOptions = {
  readonly maxDimension: number
  readonly targetBytes: number
}

export type CompressedImageResult = {
  readonly dataUrl: string
  readonly bytes: number
}

export function approxBytesFromDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
    img.src = src
  })
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  // Use JPEG to keep size low; browser will clamp quality to [0..1]
  return canvas.toDataURL('image/jpeg', quality)
}

export async function compressImageFileToDataUrl(file: File, opts: CompressImageOptions): Promise<CompressedImageResult> {
  const sourceDataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(sourceDataUrl)

  const maxDim = Math.max(1, Math.floor(opts.maxDimension))
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))

  const targetW = Math.max(1, Math.floor((img.width || 1) * scale))
  const targetH = Math.max(1, Math.floor((img.height || 1) * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar')

  ctx.drawImage(img, 0, 0, targetW, targetH)

  // Iteratively reduce quality until under targetBytes (or we hit a floor)
  let quality = 0.9
  let dataUrl = canvasToDataUrl(canvas, quality)
  let bytes = approxBytesFromDataUrl(dataUrl)

  while (bytes > opts.targetBytes && quality > 0.35) {
    quality = Math.max(0.35, quality - 0.08)
    dataUrl = canvasToDataUrl(canvas, quality)
    bytes = approxBytesFromDataUrl(dataUrl)
  }

  return { dataUrl, bytes }
}
