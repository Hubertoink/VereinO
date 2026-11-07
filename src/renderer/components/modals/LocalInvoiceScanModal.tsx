import ModalHeader, { ModalCloseButton } from '../ModalHeader'
import type { PartyCreationSource } from '../../utils/partyCreationSource'
import { locateInvoiceSource, type InvoiceSource, type SourcePage } from '../../utils/invoiceSources'
import InvoiceFileName from './InvoiceFileName'
import InvoiceAnalysisInfo from './InvoiceAnalysisInfo'
import BookingKindSwitch from '../booking/BookingKindSwitch'
import { invoiceAmountMismatch } from '../../../../shared/invoiceAmounts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronLeft, IconChevronRight, IconFilePlus, IconPlus, IconSparkles, IconTargetArrow, IconX } from '@tabler/icons-react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import TagsEditor from '../TagsEditor'
import PartySelector from '../common/PartySelector'
import AppIcon from '../common/AppIcon'
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
import type { InvoiceAiGuidance } from '../../types/invoiceAiGuidance'

type AnalysisState = 'idle' | 'analyzing' | 'text-found' | 'ocr-needed' | 'error'
type PreviewKind = 'none' | 'pdf' | 'image'
type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf')
type OptionalSection = 'budgets' | 'earmarks' | 'tags' | 'comment'
type BudgetAssignment = NonNullable<QA['budgets']>[number]
type EarmarkAssignment = NonNullable<QA['earmarksAssigned']>[number]
type InvoiceDuplicate = { voucherId: number; voucherNo: string | null }
type OcrWord = { text: string; x: number; y: number; width: number; height: number }

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

type BookingMeta = Pick<QA, 'type' | 'sphere' | 'primaryClassificationValueId' | 'paymentMethod' | 'paymentAccountId'>
type PrimaryClassification = { id: number; name: string; color?: string | null; icon?: string | null }

function bookingMetaFromGuidance(guidance?: InvoiceAiGuidance): BookingMeta {
  const defaults = guidance?.defaults
  return {
    type: defaults?.type || 'OUT',
    sphere: defaults?.sphere || 'IDEELL',
    primaryClassificationValueId: defaults?.primaryClassificationValueId ?? null,
    paymentMethod: defaults?.paymentMethod,
    paymentAccountId: defaults?.paymentAccountId ?? null
  }
}

export type LocalInvoiceScanResult = {
  file: File
  fields: LocalInvoiceFields
  partyId: number | null
  partyCreationSource?: PartyCreationSource
  budgets: BudgetAssignment[]
  earmarksAssigned: EarmarkAssignment[]
  tags: string[]
  note: string
  bookingMeta: BookingMeta
}

export type LocalInvoiceScanDraftState = {
  fieldSources?: InvoiceSource[]
  sourcePages?: Record<number, SourcePage>
  fields: LocalInvoiceFields
  partyId: number | null
  partyCreationSource?: PartyCreationSource
  budgets: BudgetAssignment[]
  earmarksAssigned: EarmarkAssignment[]
  tags: string[]
  note: string
  bookingMeta: BookingMeta
  visibleSections: OptionalSection[]
  analysisDetails?: { summary: string; timings: string; warnings: string[] }
}

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_AI_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_PAGES = 20
const MAX_LOCAL_OCR_PAGES = 3
const MIN_PDF_ZOOM = 0.6
const MAX_PDF_ZOOM = 2.6
const PDF_ZOOM_STEP = 0.15
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

function FileTextPlusIcon({ size = 18 }: { size?: number }) {
  return <IconFilePlus aria-hidden="true" size={size} stroke={1.8} />
}

function SparkleIcon() {
  return <AppIcon icon={IconSparkles} size="control" />
}

function FieldPickerIcon() {
  return <AppIcon icon={IconTargetArrow} size="control" />
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  sourceField,
  onSourceFocus
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'date'
  placeholder?: string
  error?: string
  sourceField?: LocalInvoicePickerField
  onSourceFocus?: (field: LocalInvoicePickerField) => void
}) {
  return (
    <label className="local-invoice-scan__field" data-source-field={sourceField} onFocus={() => sourceField && onSourceFocus?.(sourceField)}>
      <span>{label}</span>
      <input
        className={`input${error ? ' local-invoice-scan__input-error' : ''}`}
        aria-invalid={Boolean(error)}
        title={error}
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
  aiGuidance,
  onDraftChange,
  onFileChange,
  anchorRect,
  intakeHeader
}: {
  onClose: () => void
  intakeHeader?: import('react').ReactNode
  onCreateInvoice: (result: LocalInvoiceScanResult) => Promise<boolean> | boolean
  budgetsForEdit: BudgetOption[]
  earmarks: EarmarkOption[]
  tagDefs: Array<{ id: number; name: string; color?: string | null }>
  submitLabel?: string
  commentAriaLabel?: string
  closeOnCreate?: boolean
  initialFile?: File
  initialState?: LocalInvoiceScanDraftState
  aiGuidance?: InvoiceAiGuidance
  onDraftChange?: (state: LocalInvoiceScanDraftState & { file: File }) => void
  onFileChange?: (file: File | null) => void
  anchorRect?: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'> | null
}) {
  const { notify } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const ocrTextLayerRef = useRef<HTMLDivElement | null>(null)
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
  const [analysisDetails, setAnalysisDetails] = useState<LocalInvoiceScanDraftState['analysisDetails']>()
  const [hasAnalysisWarnings, setHasAnalysisWarnings] = useState(false)
  const manualTypeRef = useRef(false)
  const manualAccountRef = useRef(false)
  const [paymentAccounts, setPaymentAccounts] = useState<Array<{ id: number; name: string; kind: string }>>([])
  const [accountsReady, setAccountsReady] = useState(false)
  const [accountError, setAccountError] = useState('')
  useEffect(() => {
    let active = true
    void window.api.paymentAccounts.list({ activeOnly: true }).then((result) => {
      if (!active) return
      setPaymentAccounts(result.rows.filter((account) => account.isActive !== 0))
      setAccountsReady(true)
    }).catch(() => { if (active) setAccountError('Zahlungskonten konnten nicht geladen werden. Bitte den Dialog erneut öffnen.') })
    return () => { active = false }
  }, [])
  const [duplicate, setDuplicate] = useState<InvoiceDuplicate | null>(null)
  const [duplicateCheckInProgress, setDuplicateCheckInProgress] = useState(false)
  const [rawText, setRawText] = useState('')
  const [fields, setFields] = useState<LocalInvoiceFields>(EMPTY_LOCAL_INVOICE_FIELDS)
  const [partyCreationSource, setPartyCreationSource] = useState<PartyCreationSource>()
  const [partyId, setPartyId] = useState<number | null>(initialState?.partyId ?? null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfPages, setPdfPages] = useState(0)
  const [pdfZoom, setPdfZoom] = useState(1)
  const [pdfPageSize, setPdfPageSize] = useState({ width: 595, height: 842 })
  const [fieldSources, setFieldSources] = useState<InvoiceSource[]>([])
  const [sourcePages, setSourcePages] = useState<Record<number, SourcePage>>({})
  const [activeSource, setActiveSource] = useState<LocalInvoicePickerField | null>(null)
  const [showSources, setShowSources] = useState(true)
  const [ocrWordsByPage, setOcrWordsByPage] = useState<Record<number, OcrWord[]>>({})
  const [dragActive, setDragActive] = useState(false)
  const [pickerEnabled, setPickerEnabled] = useState(false)
  const [pickerText, setPickerText] = useState('')
  const [pickerField, setPickerField] = useState<LocalInvoicePickerField>('supplier')
  const [visibleSections, setVisibleSections] = useState<Set<OptionalSection>>(() => new Set())
  const [budgets, setBudgets] = useState<BudgetAssignment[]>([])
  const [earmarkAssignments, setEarmarkAssignments] = useState<EarmarkAssignment[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [bookingMeta, setBookingMeta] = useState<BookingMeta>(() => bookingMetaFromGuidance(aiGuidance))
  const [isGeneralProfile, setIsGeneralProfile] = useState(false)
  const [categories, setCategories] = useState<PrimaryClassification[]>([])
  const [aiAvailable, setAiAvailable] = useState(false)
  const [aiProvider, setAiProvider] = useState('KI')
  const [aiInstructions, setAiInstructions] = useState(aiGuidance?.instructions || '')
  const [aiBusy, setAiBusy] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [draftReady, setDraftReady] = useState(!initialFile)
  const [flyoutStyle, setFlyoutStyle] = useState<CSSProperties | undefined>()

  useLayoutEffect(() => {
    if (!anchorRect || file) {
      setFlyoutStyle(undefined)
      return
    }
    const gap = 8
    const width = Math.min(460, window.innerWidth - 32)
    const left = Math.max(12, Math.min(anchorRect.right - width, window.innerWidth - width - 12))
    const spaceBelow = window.innerHeight - anchorRect.bottom - gap - 12
    const spaceAbove = anchorRect.top - gap - 12
    const opensDown = spaceBelow >= spaceAbove
    const maxHeight = Math.max(240, Math.min(520, opensDown ? spaceBelow : spaceAbove))
    setFlyoutStyle(opensDown
      ? { position: 'fixed', left, top: Math.max(12, anchorRect.bottom + gap), maxHeight, margin: 0 }
      : { position: 'fixed', left, bottom: Math.max(12, window.innerHeight - anchorRect.top + gap), maxHeight, margin: 0 })
  }, [anchorRect, file])

  useEffect(() => {
    let active = true
    void window.api.classifications.primary.list().then((result) => {
      if (!active) return
      setIsGeneralProfile(result.profile === 'GENERAL')
      setCategories(result.values.filter((value) => value.isActive !== false))
    }).catch(() => { if (active) setIsGeneralProfile(false) })
    return () => { active = false }
  }, [])

  const clampPdfZoom = (value: number) => Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, value))

  const amountValue = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null
  const amountMismatch = invoiceAmountMismatch(amountValue(fields.grossAmount), amountValue(fields.netAmount), amountValue(fields.taxAmount))
  const amountError = amountMismatch ? 'Netto + Umsatzsteuer stimmen nicht mit Brutto überein. Bitte die drei Beträge am Original prüfen.' : undefined

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
  const aiGuidanceLabel = useMemo(() => {
    const defaults = aiGuidance?.defaults
    const values = [
      defaults?.type === 'OUT' ? 'Ausgabe' : defaults?.type === 'IN' ? 'Einnahme' : '',
      isGeneralProfile ? categories.find((category) => category.id === defaults?.primaryClassificationValueId)?.name || '' : defaults?.sphere === 'IDEELL' ? 'Ideeller Bereich' : defaults?.sphere === 'ZWECK' ? 'Zweckbetrieb' : defaults?.sphere === 'VERMOEGEN' ? 'Vermögensverwaltung' : defaults?.sphere === 'WGB' ? 'Wirtschaftlicher Geschäftsbetrieb' : '',
      defaults?.paymentMethod === 'BANK' ? 'Bank' : defaults?.paymentMethod === 'BAR' ? 'Kasse' : ''
    ].filter(Boolean)
    return values.join(' · ') || (aiGuidance?.instructions?.trim() ? 'Hinweis für die KI' : '')
  }, [aiGuidance, isGeneralProfile, categories])
  const activeAiGuidance = useMemo<InvoiceAiGuidance | undefined>(() => {
    if (!aiAvailable) return undefined
    const instructions = aiInstructions.trim()
    const defaults = aiGuidance?.defaults
    return instructions || defaults ? { instructions: instructions || undefined, defaults } : undefined
  }, [aiAvailable, aiGuidance?.defaults, aiInstructions])

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
        const viewport = page.getViewport({ scale: pdfZoom })
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
        if (cancelled) return
        // Browser ranges use the actual PDF font metrics, including rotation and zoom.
        const bounds = textLayer.getBoundingClientRect()
        const words: OcrWord[] = []
        for (const span of textLayer.querySelectorAll('span')) {
          const node = span.firstChild
          if (!node || node.nodeType !== Node.TEXT_NODE) continue
          for (const match of (node.textContent || '').matchAll(/\S+/g)) {
            const range = document.createRange()
            range.setStart(node, match.index!)
            range.setEnd(node, match.index! + match[0].length)
            const rect = range.getBoundingClientRect()
            words.push({ text: match[0], x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height })
          }
        }
        if (words.length) setSourcePages((current) => ({ ...current, [pdfPage]: { width: bounds.width, height: bounds.height, words } }))
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
  }, [pdfPage, pdfPages, pdfZoom, previewKind])

  const updateField = (key: keyof LocalInvoiceFields, value: string) => {
    manuallyEditedRef.current.add(key)
    if (key === 'supplier') setPartyId(null)
    setFields((current) => ({ ...current, [key]: value }))
    setFieldSources((current) => current.filter((source) => source.field !== key))
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
    setHasAnalysisWarnings(false)
    setAnalysisDetails(undefined)
    manualTypeRef.current = false
    manualAccountRef.current = false
    setAccountError('')
    setPartyId(null)
    setPartyCreationSource(undefined)
    setPdfPage(1)
    setPdfPages(0)
    setPdfPageSize({ width: 595, height: 842 })
    setOcrWordsByPage({})
    setFieldSources([])
    setSourcePages({})
    setActiveSource(null)
    setPickerText('')
    setPickerEnabled(false)
    setVisibleSections(new Set())
    setBudgets([])
    setEarmarkAssignments([])
    setTags([])
    setNote('')
    setBookingMeta(bookingMetaFromGuidance(aiGuidance))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePdfWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (previewKind !== 'pdf' || (!event.ctrlKey && !event.metaKey)) return
    event.preventDefault()
    event.stopPropagation()
    const delta = -Math.sign(event.deltaY || event.deltaX || 1) * PDF_ZOOM_STEP
    setPdfZoom((current) => clampPdfZoom(current + delta))
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
    setHasAnalysisWarnings(false)
    setAnalysisDetails(undefined)
    manualTypeRef.current = false
    manualAccountRef.current = false
    setAccountError('')
    setPartyId(null)
    setPartyCreationSource(undefined)
    setBookingMeta(bookingMetaFromGuidance(aiGuidance))
    setPdfZoom(1)
    setPdfPage(1)
    setPdfPages(0)
    setOcrWordsByPage({})
    setFieldSources([])
    setSourcePages({})
    setActiveSource(null)
    setPickerText('')
    setAnalysisDetails(undefined)
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
      setFieldSources(restored.fieldSources || [])
      setSourcePages(restored.sourcePages || {})
      setHasAnalysisWarnings(Boolean(restored.analysisDetails?.warnings.length || restored.note))
      setAnalysisDetails(restored.analysisDetails || (restored.note ? { summary: 'Gespeicherte Auswertung', timings: '', warnings: restored.note.split('\n').filter(Boolean) } : undefined))
      setPartyId(restored.partyId ?? null)
      setPartyCreationSource(restored.partyCreationSource)
      setBudgets(restored.budgets)
      setEarmarkAssignments(restored.earmarksAssigned)
      setTags(restored.tags)
      setNote(restored.note)
      setBookingMeta(restored.bookingMeta)
      setVisibleSections(new Set(restored.visibleSections))
    }

    // Konkrete OCR-Fehler für die manuelle Prüfung erhalten.
    let localOcrFailure = ''
    const ocrFailureHint = () => localOcrFailure ? ` Lokale OCR-Fehler: ${localOcrFailure}` : ''

    const applyLocalOcr = async (pdfDocument?: any) => {
      try {
        if (restored) return null
        setAnalysisDetails(undefined)
        setAnalysisState('analyzing')
        setAnalysisMessage('Lokale OCR liest den Scan …')
        const images: Array<{ dataBytes: Uint8Array }> = []
        const sizes: Array<{ width: number; height: number }> = []

        if (pdfDocument) {
          const pagesToRead = Math.min(pdfDocument.numPages || 1, MAX_LOCAL_OCR_PAGES)
          for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
            const page = await pdfDocument.getPage(pageNumber)
            const viewport = page.getViewport({ scale: 2.5 })
            const canvas = document.createElement('canvas')
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            sizes.push({ width: canvas.width, height: canvas.height })
            const context = canvas.getContext('2d')
            if (!context) throw new Error('OCR-Seite konnte nicht gerendert werden.')
            await page.render({ canvasContext: context, viewport }).promise
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (value) => value ? resolve(value) : reject(new Error('OCR-Seite konnte nicht erzeugt werden.')),
                'image/jpeg',
                0.92
              )
            })
            images.push({ dataBytes: new Uint8Array(await blob.arrayBuffer()) })
          }
        } else {
          images.push({ dataBytes: new Uint8Array(await nextFile.arrayBuffer()) })
        }

        const result = await window.api.ocr.extract({ images })
        if (requestRef.current !== requestId) return null
        setSourcePages((current) => ({ ...current, ...Object.fromEntries(result.pages.map((page, index) => [index + 1, {
          width: sizes[index]?.width || current[index + 1]?.width || 0,
          height: sizes[index]?.height || current[index + 1]?.height || 0,
          words: page.words
        }])) }))
        if (pdfDocument) {
          setOcrWordsByPage(
            Object.fromEntries(
              result.pages.map((page, index) => [
                index + 1,
                page.words.map((word) => ({
                  ...word,
                  x: word.x / 2.5,
                  y: word.y / 2.5,
                  width: word.width / 2.5,
                  height: word.height / 2.5
                }))
              ])
            )
          )
        }
        return result
      } catch (error: any) {
        if (requestRef.current === requestId) {
          localOcrFailure = error?.message || String(error)
          setAnalysisState('ocr-needed')
          setAnalysisMessage(`Lokale OCR konnte den Scan nicht lesen: ${localOcrFailure}`)
        }
        return null
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
      const ocr = await applyLocalOcr()
      if (ocr?.text.length && ocr.text.length >= 20) {
        setRawText(ocr.text)
        setFields(extractLocalInvoiceFields(ocr.text))

        setAnalysisState('text-found')
        setAnalysisMessage(`Lokal per OCR erkannt und vorbefüllt · ${ocr.confidence}% Zuversicht.`)
        return
      }
      setAnalysisState('ocr-needed')
      setAnalysisMessage(
        `Bildvorschau bereit. Die lokale OCR konnte keinen ausreichend verwertbaren Text erkennen.${ocrFailureHint()}`
      )
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
      const locatedPages: Record<number, SourcePage> = {}
      const pagesToRead = Math.min(document.numPages || 1, MAX_TEXT_PAGES)
      for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        pageTexts.push(joinPdfTextItems(content.items))
        const viewport = page.getViewport({ scale: 1 })
        locatedPages[pageNumber] = {
          width: viewport.width, height: viewport.height,
          words: content.items.filter((item: any) => typeof item.str === 'string' && item.str.trim()).map((item: any) => {
            const transform = pdfjs.Util.transform(viewport.transform, item.transform)
            const height = Math.hypot(transform[2], transform[3])
            const style = content.styles[item.fontName]
            const ascent = style?.ascent ?? (style?.descent != null ? 1 + style.descent : 0.8)
            const angle = Math.atan2(transform[1], transform[0])
            const width = item.width
            const corners = [[0, -height * ascent], [width, -height * ascent], [0, height * (1 - ascent)], [width, height * (1 - ascent)]].map(([x, y]) => [transform[4] + x * Math.cos(angle) - y * Math.sin(angle), transform[5] + x * Math.sin(angle) + y * Math.cos(angle)])
            const xs = corners.map(([x]) => x), ys = corners.map(([, y]) => y)
            return { text: item.str, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
          })
        }
      }
      if (requestRef.current !== requestId) return

      setSourcePages((current) => ({ ...current, ...Object.fromEntries(Object.entries(locatedPages).filter(([, page]) => page.words.length)) }))
      const text = pageTexts.join('\n\n').trim()
      setRawText(text)
      if (restored) setFields(restored.fields)
      if (text.length < 20) {
        const ocr = await applyLocalOcr(document)
        if (ocr?.text.length && ocr.text.length >= 20) {
          setRawText(ocr.text)
          setFields(extractLocalInvoiceFields(ocr.text))

          setAnalysisState('text-found')
          setAnalysisMessage(
            `Lokal per OCR aus ${ocr.pages.length} ${ocr.pages.length === 1 ? 'Seite' : 'Seiten'} erkannt und vorbefüllt · ${ocr.confidence}% Zuversicht.`
          )
          return
        }

      }
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
          `Keine brauchbare Textschicht gefunden. Die lokale OCR konnte keinen ausreichend verwertbaren Text erkennen.${ocrFailureHint()}`
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
      partyCreationSource,
      budgets,
      earmarksAssigned: earmarkAssignments,
      tags,
      note,
      bookingMeta,
      analysisDetails,
      fieldSources,
      sourcePages,
      visibleSections: Array.from(visibleSections)
    })
  }, [
    fieldSources,
    sourcePages,
    analysisDetails,
    bookingMeta,
    budgets,
    draftReady,
    earmarkAssignments,
    fields,
    file,
    note,
    partyId,
    partyCreationSource,
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
    if (!pickerEnabled || (!textLayerRef.current && !ocrTextLayerRef.current)) return
    window.setTimeout(() => {
      const selection = window.getSelection()
      const anchor = selection?.anchorNode
      if (!selection || !anchor) return
      const isDocumentText = !!textLayerRef.current?.contains(anchor)
      const isOcrText = !!ocrTextLayerRef.current?.contains(anchor)
      if (!isDocumentText && !isOcrText) return
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

  const focusSource = (field: LocalInvoicePickerField) => {
    setActiveSource(field)
    const source = fieldSources.find((item) => item.field === field && locateInvoiceSource(item, sourcePages[item.page]).length)
    if (source) {
      setShowSources(true)
      if (previewKind === 'pdf') setPdfPage(source.page)
    }
  }

  useEffect(() => {
    if (activeSource && showSources) {
      document.querySelector('.local-invoice-scan__source-box.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [activeSource, showSources, pdfPage, sourcePages])

  const renderSources = (page: number) => showSources && !pickerEnabled && (
    <div className="local-invoice-scan__sources" aria-label="KI-Fundstellen">
      {fieldSources.filter((source) => source.page === page).flatMap((source, index) => {
        const label = PICKER_FIELDS.find((field) => field.value === source.field)?.label || source.field
        return locateInvoiceSource(source, sourcePages[page]).map((box, boxIndex) => (
          <button key={`${index}-${boxIndex}`} type="button"
            className={`local-invoice-scan__source-box${activeSource === source.field ? ' is-active' : ''}`}
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
            title={`${label}: ${source.text}`} aria-label={`${label}: ${source.text}`}
            onClick={() => {
              focusSource(source.field)
              const input = source.field === 'supplier' ? document.getElementById('local-invoice-party') : document.querySelector<HTMLInputElement>(`[data-source-field="${source.field}"] input`)
              input?.focus()
            }}
          ><span>{label}</span></button>
        ))
      })}
    </div>
  )

  const analyzeWithAi = async () => {
    if (!file || aiBusy) return
    const mimeType = inferMimeType(file)
    if (!mimeType) return
    if (file.size > MAX_AI_FILE_BYTES) {
      notify('error', 'Die KI-Analyse unterstützt Rechnungen bis 10 MB.')
      return
    }
    const aiRequestId = requestRef.current
    setAiBusy(true)
    setAnalysisDetails(undefined)
    setAnalysisState('analyzing')
    setAnalysisMessage(`${aiProvider} liest die Rechnung aus …`)
    try {
      const analyzed = await window.api.ai.invoice.extract({
        file: {
          fileName: file.name,
          mimeType,
          dataBytes: new Uint8Array(await file.arrayBuffer())
        },
        localDocumentText: rawText.slice(0, 250_000),
        guidance: activeAiGuidance
      })
      if (requestRef.current !== aiRequestId) return
      const result = analyzed.result
      setPartyCreationSource({ name: result.supplier || '', iban: result.counterpartyIban })
      setFieldSources((result.fieldSources || []).filter((source) => !manuallyEditedRef.current.has(source.field)))
      if (!manuallyEditedRef.current.has('supplier')) setPartyId(result.partyId ?? null)
      setFields((current) => mergeInvoiceFields(current, result, manuallyEditedRef.current))
      setHasAnalysisWarnings(result.warnings.length > 0)
      setBookingMeta((current) => ({
        type: manualTypeRef.current ? current.type : result.type,
        sphere: isGeneralProfile ? 'IDEELL' : result.sphere,
        primaryClassificationValueId: result.primaryClassificationValueId,
        paymentMethod: manualAccountRef.current ? current.paymentMethod : result.paymentMethod || undefined,
        paymentAccountId: manualAccountRef.current ? current.paymentAccountId : result.paymentAccountId
      }))
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
      setAnalysisDetails({ summary: 'KI-Auswertung übernommen', timings: timingDetails, warnings: result.warnings })
      setAnalysisMessage('KI-Auswertung übernommen')
    } catch (error: any) {
      setAnalysisState('error')
      setAnalysisMessage(`KI-Auswertung fehlgeschlagen: ${error?.message || String(error)}`)
    } finally {
      setAiBusy(false)
    }
  }

  const createInvoice = async () => {
    if (!file || duplicateCheckInProgress || isTransferring) return
    const account = paymentAccounts.find((item) => item.id === bookingMeta.paymentAccountId)
    if (!accountsReady || !account) {
      setAccountError('Bitte ein aktives Zahlungskonto auswählen. Ohne Konto kann der Beleg nicht übernommen werden.')
      document.getElementById('invoice-payment-account')?.focus()
      return
    }
    setIsTransferring(true)
    document.documentElement.dataset.bookingHandoff = 'true'
    try {
      // The short outgoing motion makes the hand-off tangible before this
      // review is replaced by the prefilled booking form.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 180))
      const created = await onCreateInvoice({
        file,
        fields,
        partyId,
        partyCreationSource,
        budgets: budgets.filter((assignment) => assignment.budgetId > 0),
        earmarksAssigned: earmarkAssignments.filter((assignment) => assignment.earmarkId > 0),
        tags,
        note,
        bookingMeta: { ...bookingMeta, paymentAccountId: account.id, paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK' }
      })
      if (!created) {
        delete document.documentElement.dataset.bookingHandoff
        return
      }
      window.setTimeout(() => delete document.documentElement.dataset.bookingHandoff, 900)
      if (closeOnCreate) onClose()
    } catch (error) {
      delete document.documentElement.dataset.bookingHandoff
      notify('error', error instanceof Error ? error.message : 'Beleg konnte nicht gespeichert werden.')
    } finally {
      setIsTransferring(false)
    }
  }

  const aiGuidancePanel = aiAvailable ? (
    <details className="local-invoice-scan__ai-guidance">
      <summary>
        <span><SparkleIcon /> KI-Vorgaben</span>
        <small>Optional</small>
      </summary>
      <div>
        <label htmlFor="local-invoice-ai-instructions">Instruktionen für {aiProvider}</label>
        <textarea id="local-invoice-ai-instructions" className="input" rows={2} value={aiInstructions} onChange={(event) => setAiInstructions(event.target.value)} placeholder="z. B. als Projektkosten einordnen" />
        <small>{aiGuidanceLabel ? `Voreinstellung: ${aiGuidanceLabel}` : 'Gilt nur für diese Rechnung.'}</small>
      </div>
    </details>
  ) : null

  return createPortal(
    <div className="modal-overlay local-invoice-scan-overlay" role="presentation" onClick={onClose}>
      <section
        className={`modal local-invoice-scan${!file && anchorRect ? ' local-invoice-scan--flyout' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-invoice-scan-title"
        onClick={(event) => event.stopPropagation()}
        style={flyoutStyle}
      >
        <ModalHeader className="local-invoice-scan__header">
          <div className="local-invoice-scan__title-row">
            <span className="local-invoice-scan__title-icon">
              <FileTextPlusIcon />
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
            <ModalCloseButton ref={closeButtonRef} type="button" onClick={onClose} aria-label="Rechnungserfassung schließen" />
          </div>
        </ModalHeader>

        {intakeHeader}
        {!file && aiGuidancePanel}

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
            <div className="local-invoice-scan__document-column">
            {aiGuidancePanel}
            <section className="local-invoice-scan__preview-panel" aria-label="Dokumentvorschau">
              <div className="local-invoice-scan__panel-heading">
                <div className="local-invoice-scan__file-info">
                  <InvoiceFileName file={file} onRename={setFile} disabled={isTransferring} />
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="local-invoice-scan__preview-actions">
                  {fieldSources.length > 0 && <button type="button" className="btn btn-sm" aria-pressed={showSources} onClick={() => setShowSources((value) => !value)}>Fundstellen {showSources ? 'ausblenden' : 'anzeigen'}</button>}
                  {previewKind === 'pdf' && (
                    <>
                      <button
                        type="button"
                        className="btn small"
                        aria-label="PDF verkleinern"
                        title="PDF verkleinern"
                        disabled={pdfZoom <= MIN_PDF_ZOOM}
                        onClick={() => setPdfZoom((current) => clampPdfZoom(current - PDF_ZOOM_STEP))}
                      >
                        −
                      </button>
                      <span className="local-invoice-scan__zoom-label">{Math.round(pdfZoom * 100)}%</span>
                      <button
                        type="button"
                        className="btn small"
                        aria-label="PDF vergrößern"
                        title="PDF vergrößern"
                        disabled={pdfZoom >= MAX_PDF_ZOOM}
                        onClick={() => setPdfZoom((current) => clampPdfZoom(current + PDF_ZOOM_STEP))}
                      >
                        +
                      </button>
                    </>
                  )}
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

              <div className="local-invoice-scan__preview" onWheel={handlePdfWheel}>
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
                    {renderSources(pdfPage)}
                    <div
                      ref={textLayerRef}
                      className={`local-invoice-scan__text-layer${pickerEnabled ? ' is-picker-active' : ''}`}
                      onMouseUp={capturePdfSelection}
                    />
                    <div
                      ref={ocrTextLayerRef}
                      className={`local-invoice-scan__ocr-text-layer${pickerEnabled && ocrWordsByPage[pdfPage]?.length ? ' is-picker-active' : ''}`}
                      onMouseUp={capturePdfSelection}
                    >
                      {(ocrWordsByPage[pdfPage] || []).map((word, index) => (
                        <span
                          key={`${index}-${word.x}-${word.y}`}
                          style={{ left: word.x, top: word.y, width: word.width, height: word.height, fontSize: Math.max(1, word.height) }}
                          onClick={() => setPickerText(word.text)}
                        >
                          {word.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {previewKind === 'image' && imageUrl && <div className="local-invoice-scan__source-image" style={{ '--source-ratio': (sourcePages[1]?.width || 1) / (sourcePages[1]?.height || 1) } as CSSProperties}>
                  <img src={imageUrl} alt="Rechnung" onLoad={(event) => {
                    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
                    setSourcePages((current) => ({ ...current, 1: { width, height, words: current[1]?.words || [] } }))
                  }} />
                  {renderSources(1)}
                </div>}
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
                    <AppIcon icon={IconChevronLeft} size="control" />
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
                    <AppIcon icon={IconChevronRight} size="control" />
                  </button>
                </div>
              )}
            </section>

            </div>
            <section
              className="local-invoice-scan__result-panel"
              aria-label="Erkannte Rechnungsdaten"
            >
              <div className="local-invoice-scan__panel-heading local-invoice-scan__result-heading">
                <div>
                  <strong>Erkannte Daten</strong>
                  <div className="helper">Werte können direkt angepasst werden.</div>
                </div>
                {analysisMessage && analysisState !== 'analyzing' && analysisState !== 'idle' && (
                  <InvoiceAnalysisInfo message={analysisDetails?.summary || analysisMessage} timings={analysisDetails?.timings} warnings={analysisDetails?.warnings} warning={hasAnalysisWarnings || amountMismatch || analysisState === 'error' || analysisState === 'ocr-needed'} />
                )}
              </div>

              <div className="local-invoice-scan__result-body">
                <BookingKindSwitch
                  ariaLabel="Buchungsart wählen"
                  value={bookingMeta.type === 'IN' ? 'IN' : 'OUT'}
                  options={[{ value: 'IN', label: 'Einnahme' }, { value: 'OUT', label: 'Ausgabe' }]}
                  onChange={(value) => { manualTypeRef.current = true; setBookingMeta((current) => ({ ...current, type: value === 'IN' ? 'IN' : 'OUT' })) }}
                />
                <label className="local-invoice-scan__field local-invoice-scan__payment-account">
                  <span>Zahlungskonto *</span>
                  <select id="invoice-payment-account" className={`input${accountError ? ' local-invoice-scan__input-error' : ''}`}
                    value={paymentAccounts.some((account) => account.id === bookingMeta.paymentAccountId) ? String(bookingMeta.paymentAccountId) : ''}
                    aria-invalid={Boolean(accountError)} aria-describedby="invoice-payment-account-hint" disabled={!accountsReady}
                    onChange={(event) => {
                      const account = paymentAccounts.find((item) => item.id === Number(event.target.value))
                      manualAccountRef.current = true
                      setAccountError('')
                      setBookingMeta((current) => ({ ...current, paymentAccountId: account?.id ?? null, paymentMethod: account ? account.kind === 'CASH' ? 'BAR' : 'BANK' : undefined }))
                    }}>
                    <option value="">{accountsReady ? 'Bitte Zahlungskonto auswählen' : 'Zahlungskonten werden geladen …'}</option>
                    {paymentAccounts.map((account) => <option key={account.id} value={String(account.id)}>{account.name}</option>)}
                  </select>
                  <small id="invoice-payment-account-hint">{accountError || (accountsReady && !paymentAccounts.length ? 'Noch keine aktiven Zahlungskonten vorhanden. Bitte in den Einstellungen ein Konto anlegen.' : 'Eigenes Konto der Organisation, über das die Zahlung erfolgt.')}</small>
                </label>
                {(analysisState === 'analyzing' || analysisState === 'error') && <div className={`local-invoice-scan__status is-${analysisState}`} role="status">
                  <span className="local-invoice-scan__status-dot" aria-hidden="true" />
                  <span>{analysisMessage}</span>
                </div>}
                {duplicate && (
                  <div className="local-invoice-scan__duplicate-warning" role="alert">
                    <div>
                      <strong>Mögliches Duplikat{duplicate.voucherNo ? ` von ${duplicate.voucherNo}` : ''}</strong>
                      <span>Dieser Beleg ist bereits an einer Buchung gespeichert.</span>
                    </div>
                  </div>
                )}

                {amountError && <div className="local-invoice-scan__amount-warning" role="alert">{amountError}</div>}
                <div className="local-invoice-scan__fields">
                  <div className="local-invoice-scan__field">
                    <span>{bookingMeta.type === 'IN' ? 'Geschäftspartner / Kunde' : 'Lieferant / Rechnungssteller'}</span>
                    <PartySelector
                      valueId={partyId}
                      valueName={fields.supplier}
                      creationSource={partyCreationSource}
                      role={bookingMeta.type === 'IN' ? 'CUSTOMER' : 'SUPPLIER'}
                      inputId="local-invoice-party"
                      ariaLabel={bookingMeta.type === 'IN' ? 'Geschäftspartner / Kunde' : 'Lieferant / Rechnungssteller'}
                      placeholder="Wählen, eingeben oder neu anlegen"
                      onChange={(selection) => {
                        manuallyEditedRef.current.add('supplier')
                        setFieldSources((current) => current.filter((source) => source.field !== 'supplier'))
                        setPartyId(selection.partyId)
                        setFields((current) => ({ ...current, supplier: selection.name }))
                      }}
                    />
                  </div>
                  <Field
                    label="Rechnungsnummer"
                    sourceField="invoiceNumber"
                    onSourceFocus={focusSource}
                    value={fields.invoiceNumber}
                    onChange={(value) => updateField('invoiceNumber', value)}
                    placeholder="Noch nicht erkannt"
                  />
                  <Field
                    label="Rechnungsdatum"
                    type="date"
                    sourceField="invoiceDate"
                    onSourceFocus={focusSource}
                    value={fields.invoiceDate}
                    onChange={(value) => updateField('invoiceDate', value)}
                  />
                  <Field
                    label="Fällig am"
                    type="date"
                    sourceField="dueDate"
                    onSourceFocus={focusSource}
                    value={fields.dueDate}
                    onChange={(value) => updateField('dueDate', value)}
                  />
                  <Field
                    label="Brutto (€)"
                    error={amountError}
                    sourceField="grossAmount"
                    onSourceFocus={focusSource}
                    value={fields.grossAmount}
                    onChange={(value) => updateField('grossAmount', value)}
                    placeholder="0,00"
                  />
                  <Field
                    label="Netto (€)"
                    error={amountError}
                    sourceField="netAmount"
                    onSourceFocus={focusSource}
                    value={fields.netAmount}
                    onChange={(value) => updateField('netAmount', value)}
                    placeholder="0,00"
                  />
                  <Field
                    label="Umsatzsteuer (€)"
                    error={amountError}
                    sourceField="taxAmount"
                    onSourceFocus={focusSource}
                    value={fields.taxAmount}
                    onChange={(value) => updateField('taxAmount', value)}
                    placeholder="0,00"
                  />
                  <Field
                    label="IBAN"
                    sourceField="iban"
                    onSourceFocus={focusSource}
                    value={fields.iban}
                    onChange={(value) => updateField('iban', value)}
                    placeholder="Noch nicht erkannt"
                  />
                  {isGeneralProfile ? <SelectField
                    label="Kategorie"
                    value={String(bookingMeta.primaryClassificationValueId || '')}
                    options={categories.map((category) => ({ value: String(category.id), label: `${category.icon ? `${category.icon} ` : ''}${category.name}` }))}
                    onChange={(value) => setBookingMeta((current) => ({ ...current, primaryClassificationValueId: value ? Number(value) : null }))}
                  /> : <SelectField
                    label="Sphäre"
                    value={bookingMeta.sphere}
                    options={SPHERE_OPTIONS}
                    onChange={(value) => setBookingMeta((current) => ({ ...current, sphere: value }))}
                  />}
                  <div className="local-invoice-scan__field-span">
                    <Field
                      label="Beschreibung"
                      sourceField="description"
                    onSourceFocus={focusSource}
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
                            <AppIcon icon={IconPlus} size="control" />
                          </button>
                          <button
                            type="button"
                            className="btn ghost local-invoice-scan__icon-button"
                            onClick={() => removeOptionalSection('budgets')}
                            aria-label="Budget entfernen"
                          >
                            <AppIcon icon={IconX} size="control" />
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
                              <AppIcon icon={IconX} size="control" />
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
                            <AppIcon icon={IconPlus} size="control" />
                          </button>
                          <button
                            type="button"
                            className="btn ghost local-invoice-scan__icon-button"
                            onClick={() => removeOptionalSection('earmarks')}
                            aria-label="Zweckbindung entfernen"
                          >
                            <AppIcon icon={IconX} size="control" />
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
                              <AppIcon icon={IconX} size="control" />
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
                          <AppIcon icon={IconX} size="control" />
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
                          <AppIcon icon={IconX} size="control" />
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

        {file && <footer className="local-invoice-scan__footer">
          <div className="local-invoice-scan__footer-actions">
            <button type="button" className={`btn primary${isTransferring ? ' is-transferring' : ''}`} onClick={() => void createInvoice()} disabled={duplicateCheckInProgress || isTransferring}>
              {isTransferring ? 'Daten werden übernommen …' : submitLabel}
            </button>
          </div>
        </footer>}
      </section>
    </div>,
    document.body
  )
}
