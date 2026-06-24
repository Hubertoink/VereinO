/**
 * VereinO Submission Web App
 * Mobile-first app for submitting vouchers
 */

// ===== State =====
let submissions = []
let currentImage = null
let categoryCatalog = null

const defaultPaymentMethods = [
    { id: 'BAR', label: 'Bar', icon: '💵' },
    { id: 'BANK', label: 'Bank', icon: '🏦' }
]

// ===== DOM Elements =====
const form = document.getElementById('submission-form')
const mainView = document.getElementById('main-view')
const listView = document.getElementById('list-view')
const submissionsList = document.getElementById('submissions-list')
const badgeCount = document.getElementById('badge-count')
const navBadge = document.getElementById('nav-badge')
const navForm = document.getElementById('nav-form')
const navList = document.getElementById('nav-list')
const btnBack = document.getElementById('btn-back')
const btnClear = document.getElementById('btn-clear')
const btnDownload = document.getElementById('btn-download')

// Form elements
const dateInput = document.getElementById('date')
const typeInput = document.getElementById('type')
const sphereInput = document.getElementById('sphere')
const sphereHelp = document.getElementById('sphere-help')
const paymentMethodInput = document.getElementById('paymentMethod')
const paymentMethodButtons = document.getElementById('payment-method-buttons')
const paymentMethodHelp = document.getElementById('payment-method-help')
const paymentAccountGroup = document.getElementById('payment-account-group')
const paymentAccountSelect = document.getElementById('payment-account')
const amountInput = document.getElementById('amount')
const descriptionInput = document.getElementById('description')
const counterpartyInput = document.getElementById('counterparty')
const categoryInput = document.getElementById('category')
const catalogInput = document.getElementById('catalog-input')
const catalogButton = document.getElementById('catalog-button')
const catalogClear = document.getElementById('catalog-clear')
const catalogStatus = document.getElementById('catalog-status')
const budgetGroup = document.getElementById('budget-group')
const budgetInput = document.getElementById('budget')
const earmarkGroup = document.getElementById('earmark-group')
const earmarkInput = document.getElementById('earmark')
const tagsGroup = document.getElementById('tags-group')
const tagOptions = document.getElementById('tag-options')
const submitterInput = document.getElementById('submitter')
const imageInput = document.getElementById('image-input')
const imageUpload = document.getElementById('image-upload')
const imagePreview = document.getElementById('image-preview')
const imagePlaceholder = document.getElementById('image-placeholder')
const previewImg = document.getElementById('preview-img')
const filePreview = document.getElementById('file-preview')
const fileName = document.getElementById('file-name')
const removeImageBtn = document.getElementById('remove-image')

// Type toggle buttons
const typeButtons = document.querySelectorAll('.btn-toggle[data-type]')

// ===== Initialize =====
function init() {
    // Set today's date as default
    dateInput.value = new Date().toISOString().split('T')[0]

    // Load saved data
    loadFromStorage()
    try {
        localStorage.removeItem('vereino-category-catalog')
    } catch (e) {
        console.error('Failed to clear persisted catalog', e)
    }
    categoryCatalog = null
    renderCatalogControls()
    
    // Load saved submitter name
    const savedName = localStorage.getItem('vereino-submitter')
    if (savedName) {
        submitterInput.value = savedName
    }
    
    // Update badge counts
    updateBadges()
    
    // Event listeners
    setupEventListeners()
}

function setupEventListeners() {
    // Form submission
    form.addEventListener('submit', handleFormSubmit)
    
    // Type toggle
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => b.classList.remove('active'))
            btn.classList.add('active')
            typeInput.value = btn.dataset.type
        })
    })
    
    // Image upload
    imagePreview.addEventListener('click', () => imageInput.click())
    imageInput.addEventListener('change', handleImageSelect)
    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        clearImage()
    })
    
    // Sphere help
    sphereHelp.addEventListener('click', (e) => {
        e.preventDefault()
        showSphereHelp()
    })

    paymentAccountSelect.addEventListener('change', () => {
        const selectedAccount = findPaymentAccount(paymentAccountSelect.value)
        if (selectedAccount) {
            paymentMethodInput.value = selectedAccount.paymentMethod === 'BAR' ? 'BAR' : 'BANK'
            renderPaymentMethodControls()
            paymentMethodHelp.textContent = `Zahlkonto: ${selectedAccount.label}`
            return
        }
        renderPaymentMethodControls()
    })

    // Category catalog import
    catalogButton.addEventListener('click', () => catalogInput.click())
    catalogInput.addEventListener('change', handleCatalogSelect)
    catalogClear.addEventListener('click', clearCatalog)
    
    // Navigation
    navForm.addEventListener('click', () => showView('form'))
    navList.addEventListener('click', () => showView('list'))
    btnBack.addEventListener('click', () => showView('form'))
    
    // List actions
    btnClear.addEventListener('click', handleClearAll)
    btnDownload.addEventListener('click', handleDownload)
    
    // Save submitter name on change
    submitterInput.addEventListener('blur', () => {
        if (submitterInput.value.trim()) {
            localStorage.setItem('vereino-submitter', submitterInput.value.trim())
        }
    })
}

// ===== Form Handling =====
function handleFormSubmit(e) {
    e.preventDefault()
    
    // Validate required fields
    if (!dateInput.value || !amountInput.value || !descriptionInput.value || !submitterInput.value) {
        showToast('Bitte alle Pflichtfelder ausfüllen', 'error')
        return
    }
    
    const selectedBudget = findCatalogItem('budgets', budgetInput.value)
    const selectedEarmark = findCatalogItem('earmarks', earmarkInput.value)
    const selectedTags = getSelectedTags()
    const selectedPaymentAccount = findPaymentAccount(paymentAccountSelect.value)
    const selectedPaymentMethod = selectedPaymentAccount
        ? {
            id: selectedPaymentAccount.paymentMethod === 'BAR' ? 'BAR' : 'BANK',
            label: selectedPaymentAccount.label,
            icon: selectedPaymentAccount.icon,
            paymentMethod: selectedPaymentAccount.paymentMethod || 'BANK',
            accountId: selectedPaymentAccount.accountId ?? selectedPaymentAccount.id,
            kind: selectedPaymentAccount.kind || null
        }
        : findPaymentMethod(paymentMethodInput.value)
    const selectedPaymentMethodValue = selectedPaymentMethod?.paymentMethod || 'BAR'
    
    // Create submission object
    const submission = {
        id: generateId(),
        date: dateInput.value,
        type: typeInput.value,
        sphere: sphereInput.value,
        paymentMethod: selectedPaymentMethodValue,
        paymentMethodLabel: selectedPaymentMethod?.label || null,
        paymentMethodIcon: selectedPaymentMethod?.icon || null,
        paymentAccountId: selectedPaymentMethod?.accountId ?? null,
        paymentAccountKind: selectedPaymentMethod?.kind || null,
        grossAmount: Math.round(parseFloat(amountInput.value) * 100), // Convert to cents
        description: descriptionInput.value.trim(),
        counterparty: counterpartyInput.value.trim() || null,
        categoryHint: categoryInput.value.trim() || null,
        budgetId: selectedBudget?.id ?? null,
        budgetLabel: selectedBudget?.label ?? null,
        budget: selectedBudget ? {
            id: selectedBudget.id,
            label: selectedBudget.label,
            year: selectedBudget.year ?? null,
            sphere: selectedBudget.sphere ?? null
        } : null,
        earmarkId: selectedEarmark?.id ?? null,
        earmarkLabel: selectedEarmark?.label ?? null,
        earmark: selectedEarmark ? {
            id: selectedEarmark.id,
            code: selectedEarmark.code ?? null,
            name: selectedEarmark.name ?? selectedEarmark.label,
            label: selectedEarmark.label
        } : null,
        tags: selectedTags.map(tag => ({
            id: tag.id,
            name: tag.name,
            color: tag.color ?? null
        })),
        submittedBy: submitterInput.value.trim(),
        submittedAt: new Date().toISOString(),
        attachment: currentImage
    }
    
    // Add to list
    submissions.push(submission)
    
    // Save to storage
    saveToStorage()
    
    // Update UI
    updateBadges()
    showToast('Buchung hinzugefügt!', 'success')
    
    // Reset form (keep date and submitter)
    resetForm()
}

function resetForm() {
    amountInput.value = ''
    descriptionInput.value = ''
    counterpartyInput.value = ''
    categoryInput.value = ''
    budgetInput.value = ''
    earmarkInput.value = ''
    tagOptions.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.checked = false
    })
    clearImage()
    
    // Reset type to OUT
    typeButtons.forEach(b => b.classList.remove('active'))
    document.querySelector('.btn-toggle[data-type="OUT"]').classList.add('active')
    typeInput.value = 'OUT'

    // Reset payment method to default
    paymentMethodInput.value = defaultPaymentMethods[0].id
    paymentAccountSelect.value = ''
    renderPaymentMethodControls()
}

// ===== Image/File Handling =====
function handleImageSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    
    // Check file size (max 10MB for files, 5MB for images)
    const isImage = file.type.startsWith('image/')
    const maxSize = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024
    
    if (file.size > maxSize) {
        showToast(`Datei zu groß (max. ${isImage ? '5' : '10'}MB)`, 'error')
        return
    }
    
    const reader = new FileReader()
    reader.onload = (event) => {
        if (isImage) {
            // Compress image
            compressImage(event.target.result, file.type, (compressedData) => {
                currentImage = {
                    name: file.name,
                    mimeType: file.type || 'image/jpeg',
                    dataBase64: compressedData.split(',')[1] // Remove data URL prefix
                }
                
                // Show image preview
                previewImg.src = compressedData
                previewImg.hidden = false
                filePreview.hidden = true
                imagePlaceholder.hidden = true
                removeImageBtn.hidden = false
            })
        } else {
            // Handle non-image files (PDF, documents, etc.)
            currentImage = {
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                dataBase64: event.target.result.split(',')[1] // Remove data URL prefix
            }
            
            // Show file preview
            previewImg.hidden = true
            filePreview.hidden = false
            fileName.textContent = file.name
            imagePlaceholder.hidden = true
            removeImageBtn.hidden = false
        }
    }
    reader.readAsDataURL(file)
}

function compressImage(dataUrl, mimeType, callback) {
    const img = new Image()
    img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        // Calculate new dimensions (max 1200px)
        let { width, height } = img
        const maxSize = 1200
        
        if (width > maxSize || height > maxSize) {
            if (width > height) {
                height = Math.round((height * maxSize) / width)
                width = maxSize
            } else {
                width = Math.round((width * maxSize) / height)
                height = maxSize
            }
        }
        
        canvas.width = width
        canvas.height = height
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.8)
        callback(compressed)
    }
    img.src = dataUrl
}

function clearImage() {
    currentImage = null
    imageInput.value = ''
    previewImg.src = ''
    previewImg.hidden = true
    filePreview.hidden = true
    fileName.textContent = ''
    imagePlaceholder.hidden = false
    removeImageBtn.hidden = true
}

// ===== View Navigation =====
function showView(view) {
    if (view === 'form') {
        mainView.hidden = false
        listView.hidden = true
        navForm.classList.add('active')
        navList.classList.remove('active')
    } else {
        mainView.hidden = true
        listView.hidden = false
        navForm.classList.remove('active')
        navList.classList.add('active')
        renderSubmissionsList()
    }
}

// ===== List Rendering =====
function renderSubmissionsList() {
    if (submissions.length === 0) {
        submissionsList.innerHTML = `
            <div class="empty-state">
                <span class="icon">📭</span>
                <p>Noch keine Buchungen eingereicht</p>
            </div>
        `
        return
    }
    
    submissionsList.innerHTML = submissions.map(sub => `
        <div class="submission-card type-${sub.type.toLowerCase()}">
            <button type="button" class="btn-delete-submission" data-id="${sub.id}" aria-label="Löschen">×</button>
            <div class="submission-header">
                <span class="submission-amount type-${sub.type.toLowerCase()}">
                    ${sub.type === 'OUT' ? '-' : '+'}${formatAmount(sub.grossAmount)}
                </span>
                <span class="submission-date">${formatDate(sub.date)}</span>
            </div>
            <div class="submission-description">${escapeHtml(sub.description)}</div>
            <div class="submission-meta">
                ${sub.paymentMethodIcon || (sub.paymentMethod === 'BAR' ? '💵' : sub.paymentMethod === 'BANK' ? '🏦' : '💳')} ${escapeHtml(sub.paymentMethodLabel || (sub.paymentMethod === 'BAR' ? 'Bar' : sub.paymentMethod === 'BANK' ? 'Bank' : 'Sonstiger Zahlungsweg'))} · ${sub.sphere === 'W' ? 'Wirtschaftlich' : 'Ideell'}
                ${sub.counterparty ? ` · ${escapeHtml(sub.counterparty)}` : ''}
                ${sub.categoryHint ? ` · ${escapeHtml(sub.categoryHint)}` : ''}
                ${sub.budgetLabel ? ` · Budget: ${escapeHtml(sub.budgetLabel)}` : ''}
                ${sub.earmarkLabel ? ` · Zweckbindung: ${escapeHtml(sub.earmarkLabel)}` : ''}
                ${sub.tags?.length ? ` · Tags: ${sub.tags.map(tag => escapeHtml(tag.name || tag)).join(', ')}` : ''}
            </div>
            ${sub.attachment ? '<div class="submission-image-indicator">📎 Beleg angehängt</div>' : ''}
        </div>
    `).join('')
    
    // Add delete handlers
    submissionsList.querySelectorAll('.btn-delete-submission').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteSubmission(btn.dataset.id))
    })
}

function handleDeleteSubmission(id) {
    showConfirm({
        icon: '🗑️',
        title: 'Buchung löschen?',
        message: 'Diese Buchung wird aus der Liste entfernt.',
        confirmText: 'Löschen',
        onConfirm: () => {
            submissions = submissions.filter(s => s.id !== id)
            saveToStorage()
            updateBadges()
            renderSubmissionsList()
            showToast('Buchung gelöscht', 'success')
        }
    })
}

function handleClearAll() {
    showConfirm({
        icon: '⚠️',
        title: 'Alle löschen?',
        message: 'Alle Buchungen werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        confirmText: 'Alle löschen',
        onConfirm: () => {
            submissions = []
            saveToStorage()
            updateBadges()
            renderSubmissionsList()
            showToast('Alle Buchungen gelöscht', 'success')
        }
    })
}

// ===== Download =====
function handleDownload() {
    if (submissions.length === 0) {
        showToast('Keine Buchungen zum Download', 'error')
        return
    }
    
    // Prepare export data
    const exportData = {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        sourceCatalog: categoryCatalog ? {
            organization: categoryCatalog.organization || null,
            exportedAt: categoryCatalog.exportedAt || null,
            paymentMethods: categoryCatalog.paymentMethods || []
        } : null,
        submissions: submissions.map(sub => ({
            externalId: sub.id,
            date: sub.date,
            type: sub.type,
            sphere: sub.sphere,
            paymentMethod: sub.paymentMethod,
            grossAmount: sub.grossAmount,
            description: sub.description,
            counterparty: sub.counterparty,
            categoryHint: sub.categoryHint,
            budgetId: sub.budgetId ?? null,
            budgetLabel: sub.budgetLabel ?? null,
            budget: sub.budget ?? null,
            earmarkId: sub.earmarkId ?? null,
            earmarkLabel: sub.earmarkLabel ?? null,
            earmark: sub.earmark ?? null,
            tags: sub.tags || [],
            paymentMethodLabel: sub.paymentMethodLabel || null,
            paymentMethodIcon: sub.paymentMethodIcon || null,
            paymentAccountId: sub.paymentAccountId || null,
            paymentAccountKind: sub.paymentAccountKind || null,
            submittedBy: sub.submittedBy,
            submittedAt: sub.submittedAt,
            attachment: sub.attachment
        }))
    }
    
    // Create and download file
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const date = new Date().toISOString().split('T')[0]
    const filename = `buchungen-${date}.vereino-submission.json`
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    showToast(`${submissions.length} Buchung(en) exportiert`, 'success')
}

// ===== Storage =====
function saveToStorage() {
    try {
        localStorage.setItem('vereino-submissions', JSON.stringify(submissions))
    } catch (e) {
        console.error('Failed to save to localStorage', e)
    }
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem('vereino-submissions')
        if (saved) {
            submissions = JSON.parse(saved)
        }
    } catch (e) {
        console.error('Failed to load from localStorage', e)
        submissions = []
    }
}

// ===== Category Catalog =====
function handleCatalogSelect(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result)
            categoryCatalog = normalizeCatalog(parsed)
            renderCatalogControls()
            showToast('Kategorien importiert', 'success')
        } catch (err) {
            console.error('Invalid catalog file', err)
            showToast('Kategorien-Datei konnte nicht gelesen werden', 'error')
        } finally {
            catalogInput.value = ''
        }
    }
    reader.readAsText(file)
}

function normalizeCatalog(data) {
    const categories = data?.categories || data || {}
    const budgets = Array.isArray(categories.budgets) ? categories.budgets : []
    const earmarks = Array.isArray(categories.earmarks || categories.purposeBindings) ? (categories.earmarks || categories.purposeBindings) : []
    const tags = Array.isArray(categories.tags) ? categories.tags : []
    const paymentMethodCandidates = Array.isArray(data?.paymentMethods) ? data.paymentMethods : Array.isArray(data?.paymentMethodOptions) ? data.paymentMethodOptions : []
    const paymentAccountCandidates = Array.isArray(data?.paymentAccounts) ? data.paymentAccounts : []

    const looksLikePaymentAccount = (item) => {
        if (!item || typeof item === 'string') return false
        return item?.accountId != null
            || item?.paymentAccountId != null
            || item?.kind
            || String(item?.id || '').startsWith('account:')
            || String(item?.value || '').startsWith('account:')
    }

    const normalizePaymentMethod = (item) => {
        if (typeof item === 'string') {
            const value = String(item || '').trim()
            return value ? { id: value, label: value, icon: null, paymentMethod: value === 'BAR' ? 'BAR' : value === 'BANK' ? 'BANK' : 'BANK' } : null
        }
        const id = String(item?.id || item?.value || item?.key || '').trim()
        if (!id) return null
        const label = String(item?.label || item?.name || item?.title || item?.value || id).trim()
        const icon = String(item?.icon || item?.symbol || '').trim() || null
        const paymentMethod = String(item?.paymentMethod || (item?.value === 'BAR' ? 'BAR' : item?.value === 'BANK' ? 'BANK' : 'BANK')).trim()
        return { id, label, icon, paymentMethod }
    }

    const normalizePaymentAccount = (item) => {
        if (typeof item === 'string') {
            const value = String(item || '').trim()
            return value ? { id: value, label: value, icon: null, paymentMethod: value === 'BAR' ? 'BAR' : 'BANK', accountId: null, kind: null } : null
        }
        const id = String(item?.id || item?.value || item?.key || '').trim()
        if (!id) return null
        const label = String(item?.label || item?.name || item?.title || item?.value || id).trim()
        const icon = String(item?.icon || item?.symbol || '').trim() || null
        const kind = String(item?.kind || '').trim().toUpperCase()
        const paymentMethod = String(item?.paymentMethod || (kind === 'CASH' ? 'BAR' : kind === 'BANK' ? 'BANK' : 'BANK')).trim()
        const accountId = item?.accountId != null ? Number(item.accountId) : (item?.id && String(item.id).startsWith('account:') ? Number(String(item.id).split(':').pop()) : null)
        return { id, label, icon, paymentMethod, accountId, kind }
    }

    const normalizedPaymentMethods = paymentMethodCandidates
        .filter((item) => !looksLikePaymentAccount(item))
        .map(normalizePaymentMethod)
        .filter(Boolean)

    const normalizedPaymentAccounts = [
        ...paymentAccountCandidates.map(normalizePaymentAccount).filter(Boolean),
        ...paymentMethodCandidates.filter(looksLikePaymentAccount).map(normalizePaymentAccount).filter(Boolean)
    ]

    return {
        type: 'vereino-submission-catalog',
        version: data?.version || '1.0',
        exportedAt: data?.exportedAt || null,
        organization: data?.organization || null,
        paymentMethods: normalizedPaymentMethods,
        paymentAccounts: normalizedPaymentAccounts,
        categories: {
            budgets: budgets.map(item => ({
                ...item,
                id: Number(item.id),
                label: item.label || item.name || [item.year, item.categoryName || item.projectName].filter(Boolean).join(' - ') || `Budget ${item.id}`,
                color: normalizeColor(item.color)
            })).filter(item => Number.isFinite(item.id)),
            earmarks: earmarks.map(item => ({
                ...item,
                id: Number(item.id),
                label: item.label || [item.code, item.name].filter(Boolean).join(' - ') || `Zweckbindung ${item.id}`,
                color: normalizeColor(item.color)
            })).filter(item => Number.isFinite(item.id)),
            tags: tags.map(item => ({
                ...item,
                id: Number(item.id),
                name: String(item.name || '').trim(),
                color: normalizeColor(item.color)
            })).filter(item => Number.isFinite(item.id) && item.name)
        }
    }
}

function normalizeColor(color) {
    const value = String(color || '').trim()
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : null
}

function clearCatalog() {
    categoryCatalog = null
    budgetInput.value = ''
    earmarkInput.value = ''
    renderCatalogControls()
    showToast('Kategorien entfernt', 'success')
}

function getPaymentMethods() {
    return Array.isArray(categoryCatalog?.paymentMethods) && categoryCatalog.paymentMethods.length > 0
        ? categoryCatalog.paymentMethods
        : defaultPaymentMethods
}

function getPaymentAccounts() {
    return Array.isArray(categoryCatalog?.paymentAccounts) ? categoryCatalog.paymentAccounts : []
}

function findPaymentMethod(methodId) {
    const value = String(methodId || '').trim()
    if (!value) return defaultPaymentMethods[0] || null
    return getPaymentMethods().find((method) => method.id === value) || null
}

function findPaymentAccount(accountId) {
    const value = String(accountId || '').trim()
    if (!value) return null
    return getPaymentAccounts().find((account) => String(account.id) === value) || null
}

function renderPaymentMethodControls() {
    const methods = getPaymentMethods()
    paymentMethodButtons.innerHTML = methods.map((method) => `
        <button type="button" class="btn-toggle btn-toggle-pay${paymentMethodInput.value === method.id ? ' active' : ''}" data-pay="${escapeHtml(method.id)}" data-label="${escapeHtml(method.label)}">
            ${method.icon ? escapeHtml(method.icon) + ' ' : ''}${escapeHtml(method.label)}
        </button>
    `).join('')

    const buttons = paymentMethodButtons.querySelectorAll('.btn-toggle-pay[data-pay]')
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            buttons.forEach((b) => b.classList.remove('active'))
            btn.classList.add('active')
            paymentMethodInput.value = btn.dataset.pay
            const selectedMethod = findPaymentMethod(btn.dataset.pay)
            paymentMethodHelp.textContent = selectedMethod
                ? `Ausgewählt: ${selectedMethod.label}`
                : 'Zahlweg ausgewählt'
        })
    })

    const selectedMethod = findPaymentMethod(paymentMethodInput.value)
    if (selectedMethod) {
        paymentMethodInput.value = selectedMethod.id
        const activeButton = paymentMethodButtons.querySelector(`.btn-toggle-pay[data-pay="${selectedMethod.id}"]`)
        if (activeButton) {
            buttons.forEach((b) => b.classList.remove('active'))
            activeButton.classList.add('active')
        }
        paymentMethodHelp.textContent = categoryCatalog
            ? `Zahlweg aus der Kategorien-Datei: ${selectedMethod.label}`
            : `Standard: ${selectedMethod.label}`
    }
}

function renderPaymentAccountControls() {
    const accounts = getPaymentAccounts()
    paymentAccountGroup.hidden = accounts.length === 0
    paymentAccountSelect.innerHTML = '<option value="">Kein spezielles Konto</option>' + accounts.map((account) => `
        <option value="${escapeHtml(String(account.id))}">${escapeHtml(account.label)}</option>
    `).join('')

    if (paymentAccountSelect.value && !accounts.some((account) => String(account.id) === paymentAccountSelect.value)) {
        paymentAccountSelect.value = ''
    }
}

function renderCatalogControls() {
    renderPaymentMethodControls()
    renderPaymentAccountControls()

    const budgets = categoryCatalog?.categories?.budgets || []
    const earmarks = categoryCatalog?.categories?.earmarks || []
    const tags = categoryCatalog?.categories?.tags || []
    const orgName = categoryCatalog?.organization?.name

    catalogStatus.textContent = categoryCatalog
        ? `${orgName ? `${orgName}: ` : ''}${budgets.length} Budget(s), ${earmarks.length} Zweckbindung(en), ${tags.length} Tag(s)`
        : 'Optional: Kategorien-Datei vom Kassier importieren.'
    catalogClear.hidden = !categoryCatalog

    budgetGroup.hidden = budgets.length === 0
    budgetInput.innerHTML = '<option value="">Kein Budget</option>' + budgets.map(item => (
        `<option value="${item.id}">${escapeHtml(item.label)}</option>`
    )).join('')

    earmarkGroup.hidden = earmarks.length === 0
    earmarkInput.innerHTML = '<option value="">Keine Zweckbindung</option>' + earmarks.map(item => (
        `<option value="${item.id}">${escapeHtml(item.label)}</option>`
    )).join('')

    tagsGroup.hidden = tags.length === 0
    tagOptions.innerHTML = tags.map(item => {
        const colorStyle = item.color ? ` style="--tag-color: ${escapeHtml(item.color)}"` : ''
        return `
            <label class="tag-option"${colorStyle}>
                <input type="checkbox" value="${item.id}">
                <span>${escapeHtml(item.name)}</span>
            </label>
        `
    }).join('')
}

function findCatalogItem(type, id) {
    if (!id || !categoryCatalog?.categories?.[type]) return null
    const numericId = Number(id)
    return categoryCatalog.categories[type].find(item => item.id === numericId) || null
}

function getSelectedTags() {
    const tags = categoryCatalog?.categories?.tags || []
    const selectedIds = new Set(Array.from(tagOptions.querySelectorAll('input[type="checkbox"]:checked')).map(input => Number(input.value)))
    return tags.filter(tag => selectedIds.has(tag.id))
}

// ===== UI Helpers =====
function updateBadges() {
    const count = submissions.length
    badgeCount.textContent = count
    navBadge.textContent = count
    navBadge.dataset.count = count
}

function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.toast')
    if (existing) existing.remove()
    
    // Create toast
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message
    document.body.appendChild(toast)
    
    // Show
    requestAnimationFrame(() => {
        toast.classList.add('show')
    })
    
    // Hide after 3s
    setTimeout(() => {
        toast.classList.remove('show')
        setTimeout(() => toast.remove(), 300)
    }, 3000)
}

// ===== Utility Functions =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function formatAmount(cents) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
    }).format(cents / 100)
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    })
}

function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
}

// ===== Confirm Modal =====
let confirmCallback = null

// ===== Alert Modal (info only) =====
const alertModal = document.getElementById('alert-modal')
const alertIcon = document.getElementById('alert-icon')
const alertTitle = document.getElementById('alert-title')
const alertMessage = document.getElementById('alert-message')
const alertOk = document.getElementById('alert-ok')

function showAlert({ icon = '💡', title = 'Info', message = '' }) {
    alertIcon.textContent = icon
    alertTitle.textContent = title
    alertMessage.textContent = message
    
    alertModal.hidden = false
    alertModal.offsetHeight
    alertModal.classList.add('show')
}

function hideAlert() {
    alertModal.classList.remove('show')
    setTimeout(() => {
        alertModal.hidden = true
    }, 200)
}

alertOk.addEventListener('click', hideAlert)
alertModal.addEventListener('click', (e) => {
    if (e.target === alertModal) hideAlert()
})

// ===== Sphere Help Modal =====
function showSphereHelp() {
    showAlert({
        icon: '💡',
        title: 'Was ist die Sphäre?',
        message: `Die Sphäre beschreibt den Bereich des Vereins, dem diese Buchung zugeordnet wird:

• IDEELL – Ideeller Bereich (gemeinnützige Aktivitäten)
• ZWECK – Zweckbetrieb (wirtschaftliche Aktivitäten für den Satzungszweck)
• VERMOEGEN – Vermögensverwaltung (Kapitalerträge, Mieteinnahmen)
• WGB – Wirtschaftlicher Geschäftsbetrieb (steuerpflichtige wirtschaftliche Tätigkeiten)`
    })
}

// ===== Confirm Modal Elements =====
const confirmModal = document.getElementById('confirm-modal')
const confirmIcon = document.getElementById('confirm-icon')
const confirmTitle = document.getElementById('confirm-title')
const confirmMessage = document.getElementById('confirm-message')
const confirmOk = document.getElementById('confirm-ok')
const confirmCancel = document.getElementById('confirm-cancel')

function showConfirm({ icon = '⚠️', title = 'Bestätigung', message = 'Sind Sie sicher?', confirmText = 'OK', onConfirm }) {
    confirmIcon.textContent = icon
    confirmTitle.textContent = title
    confirmMessage.textContent = message
    confirmOk.textContent = confirmText
    confirmCallback = onConfirm
    
    confirmModal.hidden = false
    // Trigger reflow for animation
    confirmModal.offsetHeight
    confirmModal.classList.add('show')
}

function hideConfirm() {
    confirmModal.classList.remove('show')
    setTimeout(() => {
        confirmModal.hidden = true
        confirmCallback = null
    }, 200)
}

confirmOk.addEventListener('click', () => {
    if (confirmCallback) confirmCallback()
    hideConfirm()
})

confirmCancel.addEventListener('click', hideConfirm)

confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) hideConfirm()
})

// ===== Info Modal =====
const infoModal = document.getElementById('info-modal')
const infoBtn = document.getElementById('info-btn')
const infoOk = document.getElementById('info-ok')

function showInfo() {
    infoModal.hidden = false
    // Trigger reflow for animation
    infoModal.offsetHeight
    infoModal.classList.add('show')
}

function hideInfo() {
    infoModal.classList.remove('show')
    setTimeout(() => {
        infoModal.hidden = true
    }, 200)
}

infoBtn.addEventListener('click', showInfo)
infoOk.addEventListener('click', hideInfo)
infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) hideInfo()
})

// Close modals on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!alertModal.hidden) hideAlert()
        if (!confirmModal.hidden) hideConfirm()
        if (!infoModal.hidden) hideInfo()
    }
})

// ===== Start App =====
init()
