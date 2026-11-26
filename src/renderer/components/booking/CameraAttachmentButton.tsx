import { useEffect, useRef, useState } from 'react'
import { IconCamera } from '@tabler/icons-react'
import './cameraAttachment.css'

type Point = { x: number; y: number }
type Framing = 'portrait' | 'full'
const frameHint = 'Beleg mittig im Rahmen ausrichten.'

function cameraRegion(video: HTMLVideoElement, framing: Framing) {
  const width = framing === 'portrait' ? Math.min(video.videoWidth, Math.round(video.videoHeight * 3 / 4)) : video.videoWidth
  const height = framing === 'portrait' ? Math.min(video.videoHeight, Math.round(video.videoWidth * 4 / 3)) : video.videoHeight
  return { x: (video.videoWidth - width) / 2, y: (video.videoHeight - height) / 2, width, height }
}

function LiveCamera({ onPhoto, mirrored }: { onPhoto: (photo: HTMLCanvasElement) => void; mirrored: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const manualCapture = useRef<() => void>(() => {})
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('Kamera wird geöffnet …')
  const [outline, setOutline] = useState<Point[]>([])
  const [framing, setFraming] = useState<Framing>('portrait')
  const framingRef = useRef<Framing>('portrait')

  useEffect(() => {
    const video = videoRef.current!
    const analysis = document.createElement('canvas')
    const context = analysis.getContext('2d', { willReadFrequently: true })!
    let disposed = false
    let stream: MediaStream | undefined
    let worker: Worker | undefined
    let timer: ReturnType<typeof setTimeout>
    let reference: Point[] | undefined
    let steadySince = 0
    let snapshot: HTMLCanvasElement | undefined
    let capturing = false
    let workerReady = false
    let videoCallback = 0
    let analyzedFraming: Framing = framingRef.current

    const stopScanner = () => {
      clearTimeout(timer)
      video.cancelVideoFrameCallback(videoCallback)
      worker?.terminate()
      worker = undefined
    }
    const finish = (canvas: HTMLCanvasElement) => {
      stopScanner()
      if (!disposed) onPhoto(canvas)
    }
    const capture = (points?: Point[]) => {
      if (disposed || capturing || video.readyState < 2) return
      capturing = true
      setBusy(true)
      clearTimeout(timer)
      snapshot = document.createElement('canvas')
      const region = cameraRegion(video, framingRef.current)
      snapshot.width = region.width
      snapshot.height = region.height
      const ctx = snapshot.getContext('2d')!
      ctx.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
      if (!workerReady || !worker) { finish(snapshot); return }
      setHint('Kurz ruhig halten – Aufnahmeserie läuft …')
      const frames = [ctx.getImageData(0, 0, region.width, region.height)]
      const target = Math.min(5, Math.max(1, Math.floor(12_000_000 / (region.width * region.height))))
      const buffer = document.createElement('canvas')
      buffer.width = region.width
      buffer.height = region.height
      const sample = buffer.getContext('2d', { willReadFrequently: true })!
      let lastTime = performance.now()
      const submit = () => {
        clearTimeout(timer)
        video.cancelVideoFrameCallback(videoCallback)
        if (!worker || disposed) return
        worker.postMessage({ type: 'capture', frames, points }, frames.map(f => f.data.buffer))
        timer = setTimeout(() => { if (snapshot) finish(snapshot) }, 4000)
      }
      const collect: VideoFrameRequestCallback = (now) => {
        if (disposed || !worker) return
        if (now - lastTime >= 115 && video.readyState >= 2) {
          sample.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
          frames.push(sample.getImageData(0, 0, region.width, region.height))
          lastTime = now
        }
        if (frames.length >= target) submit()
        else videoCallback = video.requestVideoFrameCallback(collect)
      }
      if (target === 1) { submit(); return }
      timer = setTimeout(submit, 850)
      videoCallback = video.requestVideoFrameCallback(collect)
    }
    manualCapture.current = () => capture()
    const manualOnly = () => {
      stopScanner()
      if (capturing && snapshot) finish(snapshot)
      else {
        setOutline([])
        setHint('Bitte manuell auslösen. Die automatische Erkennung ist nicht verfügbar.')
      }
    }
    const analyze = () => {
      if (disposed || capturing || !worker) return
      if (video.readyState < 2) { timer = setTimeout(analyze, 160); return }
      analyzedFraming = framingRef.current
      const region = cameraRegion(video, analyzedFraming)
      const scale = Math.min(1, 640 / Math.max(region.width, region.height))
      analysis.width = Math.max(1, Math.round(region.width * scale))
      analysis.height = Math.max(1, Math.round(region.height * scale))
      context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, analysis.width, analysis.height)
      const image = context.getImageData(0, 0, analysis.width, analysis.height)
      worker.postMessage({ type: 'inspect', image }, [image.data.buffer])
    }
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { width: { ideal: 3840 }, height: { ideal: 2160 }, facingMode: { ideal: 'environment' } }
        })
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (disposed || capturing) return
          stopScanner()
          setStarted(false)
          setOutline([])
          setError('Die Kamera wurde getrennt. Öffne sie erneut, sobald sie verfügbar ist.')
        }, { once: true })
        video.srcObject = stream
        await video.play()
        const track = stream.getVideoTracks()[0]
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined
        if (!disposed && capabilities?.focusMode?.includes('continuous')) {
          const focus: MediaTrackConstraintSet & { focusMode: string } = { focusMode: 'continuous' }
          await track.applyConstraints({ advanced: [focus] }).catch(() => undefined)
        }
      } catch (reason) {
        if (disposed) return
        stream?.getTracks().forEach(track => track.stop())
        const name = reason instanceof Error ? reason.name : ''
        setError(name === 'NotAllowedError' ? 'Kamerazugriff verweigert. Gib die Kamera in den Systemeinstellungen frei.'
          : name === 'NotFoundError' ? 'Keine Kamera gefunden. Schließe eine Webcam an und versuche es erneut.'
          : 'Die Kamera konnte nicht geöffnet werden. Prüfe, ob sie verfügbar ist.')
        return
      }
      if (disposed) return
      setStarted(true)
      setHint(frameHint)
      try {
        worker = new Worker(new URL('./scanner/document-worker.js', document.baseURI))
        worker.onerror = manualOnly
        timer = setTimeout(manualOnly, 12000)
        worker.onmessage = ({ data }) => {
          if (disposed) return
          if (data.type === 'ready') { workerReady = true; clearTimeout(timer); analyze(); return }
          if (data.type === 'failed') { manualOnly(); return }
          if (data.type === 'capture' && snapshot) {
            snapshot.width = data.image.width
            snapshot.height = data.image.height
            snapshot.getContext('2d')!.putImageData(data.image, 0, 0)
            finish(snapshot)
            return
          }
          if (capturing) return
          if (analyzedFraming !== framingRef.current) {
            reference = undefined
            analyze()
            return
          }
          const points: Point[] = data.points || []
          setOutline(points)
          if (data.usable) {
            const now = performance.now()
            if (!reference || points.some((p, i) => Math.hypot(p.x - reference![i].x, p.y - reference![i].y) > 0.018)) {
              reference = points
              steadySince = now
            }
            if (now - steadySince >= 850) { capture(points); return }
            setHint('Kurz ruhig halten …')
          } else {
            reference = undefined
            setHint(data.hint || frameHint)
          }
          timer = setTimeout(analyze, 160)
        }
      } catch { manualOnly() }
    }
    void start()
    return () => {
      disposed = true
      stopScanner()
      stream?.getTracks().forEach(track => track.stop())
      video.srcObject = null
    }
  }, [onPhoto])

  return <>
    <label className="camera-framing">Bildausschnitt
      <select className="input" value={framing} disabled={busy} onChange={e => {
        framingRef.current = e.target.value as Framing
        setFraming(framingRef.current)
        setOutline([])
      }}>
        <option value="portrait">Hochformat</option>
        <option value="full">Ganzes Kamerabild</option>
      </select>
    </label>
    <div className="camera-attachment-frame" data-framing={framing} data-mirrored={mirrored}>
      <video ref={videoRef} muted playsInline aria-label="Kameravorschau" />
      {started && !error && outline.length === 0 && <div className="camera-attachment-guide" aria-hidden="true" />}
      {outline.length === 4 && <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={outline.map(p => p.x + ',' + p.y).join(' ')} vectorEffect="non-scaling-stroke" />
      </svg>}
    </div>
    <p role={error ? 'alert' : 'status'}>{error || hint}</p>
    <button type="button" className="btn" disabled={!started || busy} onClick={() => manualCapture.current()}>Foto aufnehmen</button>
  </>
}

function CameraDialog({ onFiles, onClose, confirmLabel }: { onFiles: (files: FileList) => void; onClose: () => void; confirmLabel: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null)
  const [mirrored, setMirrored] = useState(() => localStorage.getItem('camera.mirrorReceipt') !== 'false')
  const [preview, setPreview] = useState<{ url: string; blob: Blob; mirrored: boolean } | null>(null)
  const [encodingError, setEncodingError] = useState(false)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  useEffect(() => {
    if (!photo) return
    let active = true
    let url: string | undefined
    let output = photo
    if (mirrored) {
      output = document.createElement('canvas')
      output.width = photo.width
      output.height = photo.height
      const context = output.getContext('2d')!
      context.setTransform(-1, 0, 0, 1, photo.width, 0)
      context.drawImage(photo, 0, 0)
    }
    setEncodingError(false)
    output.toBlob(blob => {
      if (!active) return
      if (!blob) { setEncodingError(true); return }
      url = URL.createObjectURL(blob)
      setPreview({ url, blob, mirrored })
    }, 'image/jpeg', 0.96)
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [photo, mirrored])
  function attach() {
    if (!preview || preview.mirrored !== mirrored) return
    const files = new DataTransfer()
    files.items.add(new File([preview.blob], 'Beleg-' + new Date().toISOString().replace(/[:.]/g, '-') + '.jpg', { type: 'image/jpeg' }))
    onFiles(files.files)
    onClose()
  }
  return <dialog ref={dialog} className="camera-attachment-dialog" aria-label="Beleg fotografieren"
    onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => e.stopPropagation()}>
    <header><h2>Beleg fotografieren</h2><button type="button" className="btn" onClick={onClose} aria-label="Kamera schließen">×</button></header>
    <label className="camera-mirror"><input type="checkbox" checked={mirrored} onChange={event => {
      const checked = event.target.checked
      setMirrored(checked)
      localStorage.setItem('camera.mirrorReceipt', String(checked))
    }} />Horizontal spiegeln</label>
    {photo ? <>
      {preview && <img src={preview.url} alt="Aufgenommener Beleg zur Prüfung" />}
      {encodingError && <p role="alert">Das Foto konnte nicht gespeichert werden. Bitte erneut aufnehmen.</p>}
      <footer><button type="button" className="btn" onClick={() => { setPreview(null); setPhoto(null) }}>Erneut aufnehmen</button>
        <button type="button" className="btn primary" disabled={!preview || preview.mirrored !== mirrored || encodingError} onClick={attach}>{confirmLabel}</button></footer>
    </> : <LiveCamera onPhoto={setPhoto} mirrored={mirrored} />}
  </dialog>
}

export function CameraAttachmentButton({ onFiles, iconOnly = false, confirmLabel = 'Als Anhang übernehmen' }: { onFiles: (files: FileList) => void; iconOnly?: boolean; confirmLabel?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className={iconOnly ? 'attachment-icon-btn' : 'btn camera-attachment-button'} title="Beleg fotografieren" aria-label="Kamera öffnen"
      onClick={e => { e.stopPropagation(); setOpen(true) }}><IconCamera size={17} aria-hidden="true" />{!iconOnly && 'Kamera'}</button>
    {open && <CameraDialog onFiles={onFiles} onClose={() => setOpen(false)} confirmLabel={confirmLabel} />}
  </>
}
