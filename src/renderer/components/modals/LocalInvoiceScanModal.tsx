import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import TagsEditor from '../TagsEditor'
import PartySelector from '../common/PartySelector'
import { useToast } from '../../context/useToast'
import {
  EMPTY_LOCAL_INVOICE_FIELDS,
  extractLocalInvoiceFields,
  joinPdfTextItems,
  normalizeInvoicePickerValue,
  type LocalInvoiceFields,
  type LocalInvoicePickerField
} from '../../utils/localInvoiceExtraction'
import type { TAiInvoiceExtractionResult } from '../../../../electron/main/ipc/schemas'
import type { QA } from '../../hooks/useQuickAdd'

type AnalysisState = 'idle' | 'analyzing' | 'text-found' | 'ocr-needed' | 'error'
type PreviewKind = 'none' | 'pdf' | 'image'
type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf')
type OptionalSection = 'budgets' | 'earmarks' | 'tags' | 'comment'
type BudgetAssignment = NonNullable<QA['budgets']>[number]
type EarmarkAssignment = NonNullable<QA['earmarksAssigned']>[number]
type InvoiceDuplicate = { voucherId: number; voucherNo: string | null }

function formatAnalysisDuration(milliseconds: number) {
  return milliseconds >= 1_000
    ? `${(milliseconds / 1_000).toFixed(1).replace('.', ',')} s`
    : `${milliseconds} ms`
}

type BudgetOption = {
  id: number
  label: string
  year?: number
  startDate?: string | null
  endDate?: string | null
  enforceTimeRange?: number
  isArchived?: number
  color?: string | null
}

type EarmarkOption = {
  id: number
  code: string
  name: string
  color?: string | null
  startDate?: string | null
  endDate?: string | null
  enforceTimeRange?: number
  isActive?: number
}

type BookingMeta = Pick<QA, 'type' | 'sphere' | 'paymentMethod' | 'paymentAccountId'>

export type LocalInvoiceScanResult = {
  file: File
  fields: LocalInvoiceFields
  partyId: number | null
  budgets: BudgetAssignment[]
  earmarksAssigned: EarmarkAssignment[]
  tags: string[]
  note: string
  bookingMeta: BookingMeta
}

export type LocalInvoiceScanDraftState = {
  fields: LocalInvoiceFields
  partyId: number | null
  budgets: BudgetAssignment[]
  earmarksAssigned: EarmarkAssignment[]
  tags: string[]
  note: string
  bookingMeta: BookingMeta
  visibleSections: OptionalSection[]
}

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_AI_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_PAGES = 20
const PICKER_FIELDS: Array<{ value: LocalInvoicePickerField; label: string }> = [
  { value: 'supplier', label: 'Lieferant' },
  { value: 'invoiceNumber', label: 'Rechnungsnummer' },
  { value: 'invoiceDate', label: 'Rechnungsdatum' },
  { value: 'dueDate', label: 'Fällig am' },
  { value: 'grossAmount', label: 'Brutto' },
  { value: 'netAmount', label: 'Netto' },
  { value: 'taxAmount', label: 'Umsatzsteuer' },
  { value: 'iban', label: 'IBAN' },
  { value: 'description', label: 'Beschreibung' }
]
const SPHERE_OPTIONS: Array<{ value: BookingMeta['sphere']; label: string }> = [
  { value: 'IDEELL', label: 'Ideeller Bereich' },
  { value: 'ZWECK', label: 'Zweckbetrieb' },
  { value: 'VERMOEGEN', label: 'Vermögensverwaltung' },
  { value: 'WGB', label: 'Wirtschaftlicher Geschäftsbetrieb' }
]

function FileTextPlusIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" />
      <path d="M14 2v6h6M8 13h4M8 17h3" />
      <circle cx="18" cy="18" r="4" />
      <path d="M18 16v4M16 18h4" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.2 5.8L5 10l5.8 1.2L12 17l1.2-5.8L19 10l-5.8-1.2L12 3Z" />
      <path d="m19 16-.5 2.5L16 19l2.5.5L19 22l.5-2.5L22 19l-2.5-.5L19 16Z" />
    </svg>
  )
}

function FieldPickerIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 3 15.5 8.2-7.1 2.2-2.2 7.1L4 3Z" />
      <path d="m13 13 5 5" />
    </svg>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'date'
  placeholder?: string
}) {
  return (
    <label className="local-invoice-scan__field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label className="local-invoice-scan__field">
      <span>{label}</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function inferMimeType(file: File) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
    return 'application/pdf' as const
  if (file.type === 'image/png' || /\.png$/i.test(file.name)) return 'image/png' as const
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return 'image/jpeg' as const
  if (file.type === 'image/webp' || /\.webp$/i.test(file.name)) return 'image/webp' as const
  return null
}

function isSupportedFile(file: File) {
  return inferMimeType(file) != null
}

function formatAiAmount(value: number | null) {
  return value == null || !Number.isFinite(value) ? '' : value.toFixed(2)
}

function mergeInvoiceFields(
  current: LocalInvoiceFields,
  result: TAiInvoiceExtractionResult,
  manuallyEdited: Set<LocalInvoicePickerField>
) {
  const aiFields: Partial<LocalInvoiceFields> = {
    supplier: result.supplier || '',
    invoiceNumber: result.invoiceNumber || '',
    invoiceDate: result.invoiceDate || '',
    dueDate: result.dueDate || '',
    grossAmount: formatAiAmount(result.grossAmount),
    netAmount: formatAiAmount(result.netAmount),
    taxAmount: formatAiAmount(result.taxAmount),
    iban: result.iban || '',
    description: result.description || ''
  }
  return (Object.keys(current) as LocalInvoicePickerField[]).reduce<LocalInvoiceFields>(
    (next, key) => {
      if (!manuallyEdited.has(key) && aiFields[key]) next[key] = aiFields[key]!
      return next
    },
    { ...current }
  )
}

export default function LocalInvoiceScanModal({
  onClose,
  onCreateInvoice,
  budgetsForEdit,
  earmarks,
  tagDefs,
  submitLabel = 'Verbindlichkeit anlegen',
  commentAriaLabel = 'Kommentar zur Verbindlichkeit',
  closeOnCreate = true,
  initialFile,
  initialState,
  onDraftChange,
  onFileChange
}: {
  onClose: () => void
  onCreateInvoice: (result: LocalInvoiceScanResult) => Promise<boolean> | boolean
  budgetsForEdit: BudgetOption[]
  earmarks: EarmarkOption[]
  tagDefs: Array<{ id: number; name: string; color?: string | null }>
  submitLabel?: string
  commentAriaLabel?: string
  closeOnCreate?: boolean
  initialFile?: File
  initialState?: LocalInvoiceScanDraftState
  onDraftChange?: (state: LocalInvoiceScanDraftState & { file: File }) => void
  onFileChange?: (file: File | null) => void
}) {
  const { notify } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const pdfJsRef = useRef<PdfJsModule | null>(null)
  const pdfDocumentRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)
  const textLayerTaskRef = useRef<any>(null)
  const imageUrlRef = useRef('')
  const requestRef = useRef(0)
  const manuallyEditedRef = useRef(new Set<LocalInvoicePickerField>())
  const onDraftChangeRef = useRef(onDraftChange)
  const onFileChangeRef = useRef(onFileChange)
  const onCloseRef = useRef(onClose)
  onDraftChangeRef.current = onDraftChange
  onFileChangeRef.current = onFileChange
  onCloseRef.current = onClose
  const [file, setFile] = useState<File | null>(null)
  const [previewKind, setPreviewKind] = useState<PreviewKind>('none')
  const [imageUrl, setImageUrl] = useState('')
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle')
  const [analysisMessage, setAnalysisMessage] = useState('')
  const [duplicate, setDuplicate] = useState<InvoiceDuplicate | null>(null)
  const [duplicateCheckInProgress, setDuplicateCheckInProgress] = useState(false)
  const [rawText, setRawText] = useState('')
  const [fields, setFields] = useState<LocalInvoiceFields>(EMPTY_LOCAL_INVOICE_FIELDS)
  const [partyId, setPartyId] = useState<number | null>(initialState?.partyId ?? null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfPages, setPdfPages] = useState(0)
  const [pdfPageSize, setPdfPageSize] = useState({ width: 595, height: 842 })
  const [dragActive, setDragActive] = useState(false)
  const [pickerEnabled, setPickerEnabled] = useState(false)
  const [pickerText, setPickerText] = useState('')
  const [pickerField, setPickerField] = useState<LocalInvoicePickerField>('supplier')
  const [visibleSections, setVisibleSections] = useState<Set<OptionalSection>>(() => new Set())
  const [budgets, setBudgets] = useState<BudgetAssignment[]>([])
  const [earmarkAssignments, setEarmarkAssignments] = useState<EarmarkAssignment[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [bookingMeta, setBookingMeta] = useState<BookingMeta>({
    type: 'OUT',
    sphere: 'IDEELL',
    paymentMethod: 'BANK',
    paymentAccountId: null
  })
  const [aiAvailable, setAiAvailable] = useState(false)
  const [aiProvider, setAiProvider] = useState('KI')
  const [aiBusy, setAiBusy] = useState(false)
  const [draftReady, setDraftReady] = useState(!initialFile)

  const grossAmount = useMemo(
    () => Number(fields.grossAmount.replace(',', '.')) || 0,
    [fields.grossAmount]
  )
  const activeBudgets = useMemo(
    () => budgetsForEdit.filter((budget) => !budget.isArchived),
    [budgetsForEdit]
  )
  const activeEarmarks = useMemo(
    () => earmarks.filter((earmark) => earmark.isActive !== 0),
    [earmarks]
  )

  useEffect(() => {
    let cancelled = false
    void window.api.ai.settings
      .get()
      .then((settings) => {
        if (cancelled) return
        setAiAvailable(settings.hasApiKey)
        setAiProvider(
          settings.provider === 'openai'
            ? 'OpenAI'
            : settings.provider === 'mittwald'
              ? 'Mittwald AI'
              : 'KI'
        )
      })
      .catch(() => {
        if (!cancelled) setAiAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const bodyOverflow = document.body.style.overflow
    const bodyOverscrollBehavior = document.body.style.overscrollBehavior
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'
    document.documentElement.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = bodyOverflow
      document.body.style.overscrollBehavior = bodyOverscrollBehavior
      document.documentElement.style.overflow = rootOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  useEffect(
    () => () => {
      requestRef.current += 1
      try {
        renderTaskRef.current?.cancel?.()
        textLayerTaskRef.current?.cancel?.()
      } catch {}
      void pdfDocumentRef.current?.destroy?.()
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    },
    []
  )

  useEffect(() => {
    if (previewKind !== 'pdf' || !pdfDocumentRef.current || pdfPages === 0) return
    let cancelled = false

    const renderPage = async () => {
      try {
        try {
          renderTaskRef.current?.cancel?.()
          textLayerTaskRef.current?.cancel?.()
        } catch {}
        const page = await pdfDocumentRef.current.getPage(pdfPage)
        if (cancelled) return
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
        if (cancelled) return
        const canvas = canvasRef.current
        const textLayer = textLayerRef.current
        if (!canvas || !textLayer) return
        const viewport = page.getViewport({ scale: 1 })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        setPdfPageSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
        textLayer.replaceChildren()
        textLayer.style.setProperty('--total-scale-factor', String(viewport.scale))
        const task = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        })
        renderTaskRef.current = task
        const pdfjs = await ensurePdfJs()
        const textContent = await page.getTextContent()
        const layer = new (pdfjs as any).TextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport
        })
        textLayerTaskRef.current = layer
        await Promise.all([task.promise, layer.render()])
      } catch (error: any) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          setAnalysisState('error')
          setAnalysisMessage(`PDF-Vorschau nicht möglich: ${error?.message || String(error)}`)
        }
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      try {
        renderTaskRef.current?.cancel?.()
        textLayerTaskRef.current?.cancel?.()
      } catch {}
    }
  }, [pdfPage, pdfPages, previewKind])

  const updateField = (key: keyof LocalInvoiceFields, value: string) => {
    manuallyEditedRef.current.add(key)
    if (key === 'supplier') setPartyId(null)
    setFields((current) => ({ ...current, [key]: value }))
  }

  const ensurePdfJs = async () => {
    if (pdfJsRef.current) return pdfJsRef.current
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
    ;(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    pdfJsRef.current = pdfjs
    return pdfjs
  }

  const releaseCurrentPreview = () => {
    try {
      renderTaskRef.current?.cancel?.()
      textLayerTaskRef.current?.cancel?.()
    } catch {}
    renderTaskRef.current = null
    textLayerTaskRef.current = null
    void pdfDocumentRef.current?.destroy?.()
    pdfDocumentRef.current = null
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current)
      imageUrlRef.current = ''
    }
    setImageUrl('')
  }

  const resetFile = () => {
    requestRef.current += 1
    releaseCurrentPreview()
    manuallyEditedRef.current.clear()
    setFile(null)
    onFileChangeRef.current?.(null)
    setPreviewKind('none')
    setAnalysisState('idle')
    setAnalysisMessage('')
    setDuplicate(null)
    setDuplicateCheckInProgress(false)
    setRawText('')
    setFields(EMPTY_LOCAL_INVOICE_FIELDS)
    setPartyId(null)
    setPdfPage(1)
    setPdfPages(0)
    setPdfPageSize({ width: 595, height: 842 })
    setPickerText('')
    setPickerEnabled(false)
    setVisibleSections(new Set())
    setBudgets([])
    setEarmarkAssignments([])
    setTags([])
    setNote('')
    setBookingMeta({ type: 'OUT', sphere: 'IDEELL', paymentMethod: 'BANK', paymentAccountId: null })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const analyzeFile = async (nextFile: File, restored?: LocalInvoiceScanDraftState) => {
    const mimeType = inferMimeType(nextFile)
    if (!isSupportedFile(nextFile) || !mimeType) {
      setAnalysisState('error')
      setAnalysisMessage('Bitte eine PDF-, PNG-, JPG- oder WebP-Datei auswählen.')
      return
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setAnalysisState('error')
      setAnalysisMessage('Die Rechnung darf maximal 25 MB groß sein.')
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    releaseCurrentPreview()
    manuallyEditedRef.current.clear()
    setFile(nextFile)
    onFileChangeRef.current?.(nextFile)
    setRawText('')
    setFields(EMPTY_LOCAL_INVOICE_FIELDS)
    setPartyId(null)
    setPdfPage(1)
    setPdfPages(0)
    setPickerText('')
    setAnalysisState('analyzing')
    setAnalysisMessage('Dokument wird gelesen …')
    setDuplicate(null)
    setDuplicateCheckInProgress(true)
    void window.api.ai.invoice.checkDuplicate({
      file: {
        fileName: nextFile.name,
        mimeType,
        dataBytes: new Uint8Array(await nextFile.arrayBuffer())
      }
    }).then((result) => {
      if (requestRef.current !== requestId || !result.isDuplicate || !result.duplicateVoucherId) return
      setDuplicate({ voucherId: result.duplicateVoucherId, voucherNo: result.duplicateVoucherNo })
      notify('warn', `Mögliches Duplikat${result.duplicateVoucherNo ? ` von ${result.duplicateVoucherNo}` : ''} erkannt.`)
    }).catch(() => {
      // Die Rechnungserfassung bleibt verfügbar, falls die optionale Prüfung nicht möglich ist.
    }).finally(() => {
      if (requestRef.current === requestId) setDuplicateCheckInProgress(false)
    })
    if (restored) {
      setFields(restored.fields)
      setPartyId(restored.partyId ?? null)
      setBudgets(restored.budgets)
      setEarmarkAssignments(restored.earmarksAssigned)
      setTags(restored.tags)
      setNote(restored.note)
      setBookingMeta(restored.bookingMeta)
      setVisibleSections(new Set(restored.visibleSections))
    }

    const applyDocling = async (fallbackText = '') => {
      try {
        if (restored) return false
        if (mimeType === 'image/webp') return false
        const status = await window.api.docling.status()
        if (!status.enabled) return false
        setAnalysisState('analyzing')
        setAnalysisMessage('Docling analysiert Text, OCR und Dokumentlayout lokal …')
        const result = await window.api.docling.extract({
          fileName: nextFile.name,
          mimeType,
          dataBytes: new Uint8Array(await nextFile.arrayBuffer())
        })
        if (requestRef.current !== requestId) return true
        const doclingText = result.text.trim()
        const text = doclingText.length >= 20 ? doclingText : fallbackText
        setRawText(text)
        if (!restored && text.length >= 20) setFields(extractLocalInvoiceFields(text))
        setAnalysisState(text.length >= 20 ? 'text-found' : 'ocr-needed')
        setAnalysisMessage(
          text.length >= 20
            ? `Mit Docling ${result.version ? `v${result.version} ` : ''}lokal erkannt und vorbefüllt.`
            : 'Docling konnte keinen ausreichend verwertbaren Text erkennen.'
        )
        return true
      } catch (error: any) {
        if (requestRef.current !== requestId) return true
        if (!fallbackText) {
          setAnalysisState('error')
          setAnalysisMessage(`Docling-Analyse fehlgeschlagen: ${error?.message || String(error)}`)
          return true
        }
        setAnalysisMessage(
          `Textschicht erkannt; Docling konnte nicht ergänzt werden: ${error?.message || String(error)}`
        )
        return false
      }
    }

    if (mimeType !== 'application/pdf') {
      const url = URL.createObjectURL(nextFile)
      imageUrlRef.current = url
      if (requestRef.current !== requestId) {
        URL.revokeObjectURL(url)
        return
      }
      setImageUrl(url)
      setPreviewKind('image')
      if (restored) setFields(restored.fields)
      const handledByDocling = await applyDocling()
      if (!handledByDocling) {
        setAnalysisState('ocr-needed')
        setAnalysisMessage(
          'Bildvorschau bereit. Für lokale Texterkennung kann Docling aktiviert werden.'
        )
      }
      return
    }

    try {
      setPreviewKind('pdf')
      const bytes = new Uint8Array(await nextFile.arrayBuffer())
      const pdfjs = await ensurePdfJs()
      const document = await pdfjs.getDocument({ data: bytes }).promise
      if (requestRef.current !== requestId) {
        await document.destroy()
        return
      }
      pdfDocumentRef.current = document
      setPdfPages(document.numPages || 1)

      const pageTexts: string[] = []
      const pagesToRead = Math.min(document.numPages || 1, MAX_TEXT_PAGES)
      for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        pageTexts.push(joinPdfTextItems(content.items))
      }
      if (requestRef.current !== requestId) return

      const text = pageTexts.join('\n\n').trim()
      setRawText(text)
      if (restored) setFields(restored.fields)
      if (text.length < 20 && (await applyDocling(text))) return
      if (text.length >= 20) {
        if (!restored) setFields(extractLocalInvoiceFields(text))
        setAnalysisState('text-found')
        setAnalysisMessage(
          document.numPages > MAX_TEXT_PAGES
            ? `Text aus den ersten ${MAX_TEXT_PAGES} Seiten erkannt.`
            : 'Text erkannt und Rechnungsfelder vorbefüllt.'
        )
      } else {
        setAnalysisState('ocr-needed')
        setAnalysisMessage(
          'Keine brauchbare Textschicht gefunden. Für diese Rechnung ist OCR nötig.'
        )
      }
    } catch (error: any) {
      if (requestRef.current !== requestId) return
      setPreviewKind('none')
      setAnalysisState('error')
      setAnalysisMessage(`Dokument konnte nicht gelesen werden: ${error?.message || String(error)}`)
    }
  }

  const selectFiles = (files: FileList | null) => {
    const nextFile = files?.[0]
    if (nextFile) void analyzeFile(nextFile)
  }

  useEffect(() => {
    if (!initialFile) return
    let cancelled = false
    void analyzeFile(initialFile, initialState).finally(() => {
      if (!cancelled) setDraftReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [initialFile])

  useEffect(() => {
    if (!file || !draftReady) return
    onDraftChangeRef.current?.({
      file,
      fields,
      partyId,
      budgets,
      earmarksAssigned: earmarkAssignments,
      tags,
      note,
      bookingMeta,
      visibleSections: Array.from(visibleSections)
    })
  }, [
    bookingMeta,
    budgets,
    draftReady,
    earmarkAssignments,
    fields,
    file,
    note,
    partyId,
    tags,
    visibleSections
  ])

  const addOptionalSection = (section: OptionalSection) => {
    setVisibleSections((current) => new Set([...current, section]))
    if (section === 'budgets' && budgets.length === 0) {
      setBudgets([{ budgetId: 0, amount: grossAmount }])
    }
    if (section === 'earmarks' && earmarkAssignments.length === 0) {
      setEarmarkAssignments([{ earmarkId: 0, amount: grossAmount }])
    }
  }

  const removeOptionalSection = (section: OptionalSection) => {
    setVisibleSections((current) => {
      const next = new Set(current)
      next.delete(section)
      return next
    })
    if (section === 'budgets') setBudgets([])
    if (section === 'earmarks') setEarmarkAssignments([])
    if (section === 'tags') setTags([])
    if (section === 'comment') setNote('')
  }

  const capturePdfSelection = () => {
    if (!pickerEnabled || !textLayerRef.current) return
    window.setTimeout(() => {
      const selection = window.getSelection()
      const anchor = selection?.anchorNode
      if (!selection || !anchor || !textLayerRef.current?.contains(anchor)) return
      const selectedText = selection.toString().trim()
      if (selectedText) setPickerText(selectedText)
    }, 0)
  }

  const applyPickerSelection = () => {
    const value = normalizeInvoicePickerValue(pickerField, pickerText)
    if (!value) {
      notify('info', 'Die Auswahl enthält keinen passenden Wert für dieses Feld.')
      return
    }
    updateField(pickerField, value)
    setPickerText('')
    window.getSelection()?.removeAllRanges()
  }

  const analyzeWithAi = async () => {
    if (!file || aiBusy) return
    const mimeType = inferMimeType(file)
    if (!mimeType) return
    if (file.size > MAX_AI_FILE_BYTES) {
      notify('error', 'Die KI-Analyse unterstützt Rechnungen bis 10 MB.')
      return
    }
    setAiBusy(true)
    setAnalysisState('analyzing')
    setAnalysisMessage(`${aiProvider} liest die Rechnung aus …`)
    try {
      const analyzed = await window.api.ai.invoice.extract({
        file: {
          fileName: file.name,
          mimeType,
          dataBytes: new Uint8Array(await file.arrayBuffer())
        }
      })
      const result = analyzed.result
      if (!manuallyEditedRef.current.has('supplier')) setPartyId(result.partyId ?? null)
      setFields((current) => mergeInvoiceFields(current, result, manuallyEditedRef.current))
      setBookingMeta({
        type: result.type,
        sphere: result.sphere,
        paymentMethod:
          result.paymentMethod === 'BAR' || result.paymentMethod === 'BANK'
            ? result.paymentMethod
            : 'BANK',
        paymentAccountId: result.paymentAccountId
      })
      if (result.budgets.length) {
        setBudgets(
          result.budgets.map((assignment) => ({
            budgetId: assignment.id,
            amount: assignment.amount
          }))
        )
        setVisibleSections((current) => new Set([...current, 'budgets']))
      }
      if (result.earmarks.length) {
        setEarmarkAssignments(
          result.earmarks.map((assignment) => ({
            earmarkId: assignment.id,
            amount: assignment.amount
          }))
        )
        setVisibleSections((current) => new Set([...current, 'earmarks']))
      }
      if (result.tags.length) {
        setTags(result.tags)
        setVisibleSections((current) => new Set([...current, 'tags']))
      }
      const warning = result.warnings[0] ? ` ${result.warnings[0]}` : ''
      const timings = analyzed.timings
      const timingDetails = [
        `Gesamt ${formatAnalysisDuration(timings.totalMs)}`,
        timings.doclingMs !== null && `Docling ${formatAnalysisDuration(timings.doclingMs)}`,
        timings.ocrMs !== null && `OCR ${formatAnalysisDuration(timings.ocrMs)}`,
        `KI ${formatAnalysisDuration(timings.analysisMs)}`
      ]
        .filter(Boolean)
        .join(' · ')
      setAnalysisState('text-found')
      setAnalysisMessage(`KI-Auswertung übernommen (${timingDetails}).${warning}`)
    } catch (error: any) {
      setAnalysisState('error')
      setAnalysisMessage(`KI-Auswertung fehlgeschlagen: ${error?.message || String(error)}`)
    } finally {
      setAiBusy(false)
    }
  }

  const createInvoice = async () => {
    if (!file) return
    if (duplicateCheckInProgress) return
    const created = await onCreateInvoice({
      file,
      fields,
      partyId,
      budgets: budgets.filter((assignment) => assignment.budgetId > 0),
      earmarksAssigned: earmarkAssignments.filter((assignment) => assignment.earmarkId > 0),
      tags,
      note,
      bookingMeta
    })
    if (created && closeOnCreate) onClose()
  }

  return createPortal(
    <div className="modal-overlay local-invoice-scan-overlay" role="presentation" onClick={onClose}>
      <section
        className="modal local-invoice-scan"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-invoice-scan-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="local-invoice-scan__header">
          <div className="local-invoice-scan__title-row">
            <span className="local-invoice-scan__title-icon">
              <FileTextPlusIcon size={22} />
            </span>
            <h2 id="local-invoice-scan-title">Rechnung erfassen</h2>
          </div>
          <div className="local-invoice-scan__header-actions">
            {aiAvailable && file && (
              <button
                type="button"
                className="btn local-invoice-scan__ai-button"
                onClick={() => void analyzeWithAi()}
                disabled={aiBusy}
                title={`Sendet nur diese Datei zur Analyse an ${aiProvider}.`}
              >
                <SparkleIcon />
                {aiBusy ? 'KI liest …' : 'Mit KI auslesen'}
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              className="btn ghost local-invoice-scan__close"
              onClick={onClose}
              aria-label="Rechnungserfassung schließen"
            >
              ✕
            </button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
          hidden
          onChange={(event) => selectFiles(event.target.files)}
        />

        {!file ? (
          <button
            type="button"
            className={`local-invoice-scan__dropzone${dragActive ? ' is-dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault()
              if (event.currentTarget === event.target) setDragActive(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              selectFiles(event.dataTransfer.files)
            }}
          >
            <span className="local-invoice-scan__drop-icon">
              <FileTextPlusIcon size={34} />
            </span>
            <strong>Rechnung hier ablegen</strong>
            <span>oder Datei auswählen</span>
            <small>PDF, PNG, JPG oder WebP · maximal 25 MB</small>
            {analysisState === 'error' && (
              <span className="local-invoice-scan__drop-error" role="alert">
                {analysisMessage}
              </span>
            )}
          </button>
        ) : (
          <div className="local-invoice-scan__workspace">
            <section className="local-invoice-scan__preview-panel" aria-label="Dokumentvorschau">
              <div className="local-invoice-scan__panel-heading">
                <div className="local-invoice-scan__file-info">
                  <strong title={file.name}>{file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="local-invoice-scan__preview-actions">
                  {previewKind === 'pdf' && rawText && (
                    <button
                      type="button"
                      className={`btn small local-invoice-scan__picker-toggle${pickerEnabled ? ' is-active' : ''}`}
                      aria-pressed={pickerEnabled}
                      aria-label="Feld-Picker"
                      title="Feld-Picker"
                      onClick={() => {
                        setPickerEnabled((enabled) => !enabled)
                        setPickerText('')
                      }}
                    >
                      <FieldPickerIcon />
                    </button>
                  )}
                  <button type="button" className="btn small" onClick={resetFile}>
                    Wechseln
                  </button>
                </div>
              </div>

              <div className="local-invoice-scan__preview">
                {previewKind === 'pdf' && (
                  <div
                    className="local-invoice-scan__pdf-page"
                    style={
                      {
                        '--pdf-page-width': `${pdfPageSize.width}px`,
                        '--pdf-page-height': `${pdfPageSize.height}px`
                      } as CSSProperties
                    }
                  >
                    <canvas ref={canvasRef} />
                    <div
                      ref={textLayerRef}
                      className={`local-invoice-scan__text-layer${pickerEnabled ? ' is-picker-active' : ''}`}
                      onMouseUp={capturePdfSelection}
                    />
                  </div>
                )}
                {previewKind === 'image' && imageUrl && <img src={imageUrl} alt="Rechnung" />}
                {previewKind === 'none' && analysisState === 'analyzing' && (
                  <div className="local-invoice-scan__loading">Dokument wird vorbereitet …</div>
                )}
              </div>

              {pickerEnabled && (
                <div className="local-invoice-scan__picker" aria-live="polite">
                  <div className="local-invoice-scan__picker-copy">
                    <strong>{pickerText ? 'Text auswählen' : 'Text im Dokument markieren'}</strong>
                    <span>{pickerText || 'Danach bestimmst du das Zielfeld.'}</span>
                  </div>
                  <select
                    value={pickerField}
                    onChange={(event) =>
                      setPickerField(event.target.value as LocalInvoicePickerField)
                    }
                    aria-label="Zielfeld für die Textauswahl"
                  >
                    {PICKER_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!pickerText}
                    onClick={applyPickerSelection}
                  >
                    Zuweisen
                  </button>
                </div>
              )}

              {previewKind === 'pdf' && pdfPages > 1 && (
                <div className="local-invoice-scan__pagination">
                  <button
                    type="button"
                    className="btn small"
                    disabled={pdfPage <= 1}
                    onClick={() => setPdfPage((current) => Math.max(1, current - 1))}
                  >
                    ‹
                  </button>
                  <span>
                    Seite {pdfPage} von {pdfPages}
                  </span>
                  <button
                    type="button"
                    className="btn small"
                    disabled={pdfPage >= pdfPages}
                    onClick={() => setPdfPage((current) => Math.min(pdfPages, current + 1))}
                  >
                    ›
                  </button>
                </div>
              )}
            </section>

            <section
              className="local-invoice-scan__result-panel"
              aria-label="Erkannte Rechnungsdaten"
            >
              <div className="local-invoice-scan__panel-heading local-invoice-scan__result-heading">
                <div>
                  <strong>Erkannte Daten</strong>
                  <div className="helper">Werte können direkt angepasst werden.</div>
                </div>
              </div>

              <div className="local-invoice-scan__result-body">
                <div className={`local-invoice-scan__status is-${analysisState}`} role="status">
                  <span className="local-invoice-scan__status-dot" aria-hidden="true" />
                  <span>{analysisMessage}</span>
                </div>
                {duplicate && (
                  <div className="local-invoice-scan__duplicate-warning" role="alert">
                    <div>
                      <strong>Mögliches Duplikat{duplicate.voucherNo ? ` von ${duplicate.voucherNo}` : ''}</strong>
                      <span>Dieser Beleg ist bereits an einer Buchung gespeichert.</span>
                    </div>
                  </div>
                )}

                <div className="local-invoice-scan__fields">
                  <div className="local-invoice-scan__field">
                    <span>Lieferant / Rechnungsteller</span>
                    <PartySelector
                      valueId={partyId}
                      valueName={fields.supplier}
                      role="SUPPLIER"
                      inputId="local-invoice-party"
                      placeholder="Wählen, eingeben oder neu anlegen"
                      onChange={(selection) => {
                        manuallyEditedRef.current.add('supplier')
                        setPartyId(selection.partyId)
                        setFields((current) => ({ ...current, supplier: selection.name }))
                      }}
                    />
                  </div>
                  <Field
                    label="Rechnungsnummer"
                    value={fields.invoiceNumber}
                    onChange={(value) => updateField('invoiceNumber', value)}
                    placeholder="Noch nicht erkannt"
                  />
                  <Field
                    label="Rechnungsdatum"
                    type="date"
                    value={fields.invoiceDate}
                    onChange={(value) => updateField('invoiceDate', value)}
                  />
                  <Field
                    label="Fällig am"
                    type="date"
                    value={fields.dueDate}
                    onChange={(value) => updateField('dueDate', value)}
                  />
                  <Field
                    label="Brutto (€)"
                    value={fields.grossAmount}
                    onChange={(value) => updateField('grossAmount', value)}
                    placeholder="0,00"
                  />
                  <Field
                    label="Netto (€)"
                    value={fields.netAmount}
                    onChange={(value) => updateField('netAmount', value)}
                    placeholder="0,00"
                  />
                  <Field
                    label="Umsatzsteuer (€)"
                    value={fields.taxAmount}
                    onChange={(value) => updateField('taxAmount', value)}
                    placeholder="0,00"
                  />
                  <Field
                    label="IBAN"
                    value={fields.iban}
                    onChange={(value) => updateField('iban', value)}
                    placeholder="Noch nicht erkannt"
                  />
                  <SelectField
                    label="Sphäre"
                    value={bookingMeta.sphere}
                    options={SPHERE_OPTIONS}
                    onChange={(value) =>
                      setBookingMeta((current) => ({ ...current, sphere: value }))
                    }
                  />
                  <div className="local-invoice-scan__field-span">
                    <Field
                      label="Beschreibung"
                      value={fields.description}
                      onChange={(value) => updateField('description', value)}
                      placeholder="Buchungstext"
                    />
                  </div>
                </div>

                <section
                  className="local-invoice-scan__optional"
                  aria-label="Optionale Buchungsangaben"
                >
                  <div className="local-invoice-scan__optional-heading">
                    <strong>Zuordnungen & Hinweise</strong>
                    <span>Optional</span>
                  </div>
                  <div className="local-invoice-scan__optional-actions">
                    {!visibleSections.has('budgets') && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => addOptionalSection('budgets')}
                      >
                        + Budget
                      </button>
                    )}
                    {!visibleSections.has('earmarks') && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => addOptionalSection('earmarks')}
                      >
                        + Zweckbindung
                      </button>
                    )}
                    {!visibleSections.has('tags') && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => addOptionalSection('tags')}
                      >
                        + Tags
                      </button>
                    )}
                    {!visibleSections.has('comment') && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => addOptionalSection('comment')}
                      >
                        + Kommentar
                      </button>
                    )}
                  </div>

                  {visibleSections.has('budgets') && (
                    <div className="local-invoice-scan__optional-card">
                      <div className="local-invoice-scan__optional-card-header">
                        <strong>Budget</strong>
                        <div>
                          <button
                            type="button"
                            className="btn ghost local-invoice-scan__icon-button"
                            onClick={() =>
                              setBudgets((current) => [...current, { budgetId: 0, amount: 0 }])
                            }
                            aria-label="Weiteres Budget hinzufügen"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="btn ghost local-invoice-scan__icon-button"
                            onClick={() => removeOptionalSection('budgets')}
                            aria-label="Budget entfernen"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {activeBudgets.length === 0 ? (
                        <span className="helper">Keine aktiven Budgets vorhanden.</span>
                      ) : (
                        budgets.map((assignment, index) => (
                          <div
                            className="local-invoice-scan__assignment-row"
                            key={`budget-${index}`}
                          >
                            <select
                              value={assignment.budgetId || ''}
                              onChange={(event) =>
                                setBudgets((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, budgetId: Number(event.target.value) || 0 }
                                      : item
                                  )
                                )
                              }
                              aria-label="Budget wählen"
                            >
                              <option value="">Budget wählen</option>
                              {activeBudgets.map((budget) => (
                                <option key={budget.id} value={budget.id}>
                                  {budget.label}
                                </option>
                              ))}
                            </select>
                            <label>
                              <span className="sr-only">Budgetbetrag</span>
                              <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={assignment.amount || ''}
                                onChange={(event) =>
                                  setBudgets((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, amount: Number(event.target.value) || 0 }
                                        : item
                                    )
                                  )
                                }
                              />
                              <span>€</span>
                            </label>
                            <button
                              type="button"
                              className="btn ghost local-invoice-scan__icon-button"
                              onClick={() =>
                                setBudgets((current) =>
                                  current.filter((_, itemIndex) => itemIndex !== index)
                                )
                              }
                              aria-label="Budgetzeile entfernen"
                            >
                              ×
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {visibleSections.has('earmarks') && (
                    <div className="local-invoice-scan__optional-card">
                      <div className="local-invoice-scan__optional-card-header">
                        <strong>Zweckbindung</strong>
                        <div>
                          <button
                            type="button"
                            className="btn ghost local-invoice-scan__icon-button"
                            onClick={() =>
                              setEarmarkAssignments((current) => [
                                ...current,
                                { earmarkId: 0, amount: 0 }
                              ])
                            }
                            aria-label="Weitere Zweckbindung hinzufügen"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="btn ghost local-invoice-scan__icon-button"
                            onClick={() => removeOptionalSection('earmarks')}
                            aria-label="Zweckbindung entfernen"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {activeEarmarks.length === 0 ? (
                        <span className="helper">Keine aktive Zweckbindung vorhanden.</span>
                      ) : (
                        earmarkAssignments.map((assignment, index) => (
                          <div
                            className="local-invoice-scan__assignment-row"
                            key={`earmark-${index}`}
                          >
                            <select
                              value={assignment.earmarkId || ''}
                              onChange={(event) =>
                                setEarmarkAssignments((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, earmarkId: Number(event.target.value) || 0 }
                                      : item
                                  )
                                )
                              }
                              aria-label="Zweckbindung wählen"
                            >
                              <option value="">Zweckbindung wählen</option>
                              {activeEarmarks.map((earmark) => (
                                <option key={earmark.id} value={earmark.id}>
                                  {earmark.code} – {earmark.name}
                                </option>
                              ))}
                            </select>
                            <label>
                              <span className="sr-only">Zweckbindungsbetrag</span>
                              <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={assignment.amount || ''}
                                onChange={(event) =>
                                  setEarmarkAssignments((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, amount: Number(event.target.value) || 0 }
                                        : item
                                    )
                                  )
                                }
                              />
                              <span>€</span>
                            </label>
                            <button
                              type="button"
                              className="btn ghost local-invoice-scan__icon-button"
                              onClick={() =>
                                setEarmarkAssignments((current) =>
                                  current.filter((_, itemIndex) => itemIndex !== index)
                                )
                              }
                              aria-label="Zweckbindungszeile entfernen"
                            >
                              ×
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {visibleSections.has('tags') && (
                    <div className="local-invoice-scan__optional-card">
                      <div className="local-invoice-scan__optional-card-header">
                        <strong>Tags</strong>
                        <button
                          type="button"
                          className="btn ghost local-invoice-scan__icon-button"
                          onClick={() => removeOptionalSection('tags')}
                          aria-label="Tags entfernen"
                        >
                          ×
                        </button>
                      </div>
                      <TagsEditor
                        value={tags}
                        onChange={setTags}
                        tagDefs={tagDefs}
                        className="local-invoice-scan__tags"
                      />
                    </div>
                  )}

                  {visibleSections.has('comment') && (
                    <div className="local-invoice-scan__optional-card">
                      <div className="local-invoice-scan__optional-card-header">
                        <strong>Kommentar</strong>
                        <button
                          type="button"
                          className="btn ghost local-invoice-scan__icon-button"
                          onClick={() => removeOptionalSection('comment')}
                          aria-label="Kommentar entfernen"
                        >
                          ×
                        </button>
                      </div>
                      <textarea
                        className="input local-invoice-scan__comment"
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Interne Notiz oder Ablagehinweis …"
                        aria-label={commentAriaLabel}
                      />
                    </div>
                  )}
                </section>

                {rawText && (
                  <details className="local-invoice-scan__raw-text">
                    <summary>Erkannten PDF-Text anzeigen</summary>
                    <pre>{rawText.slice(0, 12_000)}</pre>
                  </details>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="local-invoice-scan__footer">
          <div className="local-invoice-scan__footer-actions">
            {file && (
              <button type="button" className="btn primary" onClick={() => void createInvoice()} disabled={duplicateCheckInProgress}>
                {submitLabel}
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              Schließen
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  )
}
