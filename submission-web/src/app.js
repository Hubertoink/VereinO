/**
 * VereinO Submission Web App
 * Mobile-first app for submitting vouchers
 */

// ===== State =====
let submissions = []
let currentImage = null

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
const amountInput = document.getElementById('amount')
const descriptionInput = document.getElementById('description')
const counterpartyInput = document.getElementById('counterparty')
const categoryInput = document.getElementById('category')
const submitterInput = document.getElementById('submitter')
const imageInput = document.getElementById('image-input')
const imageUpload = document.getElementById('image-upload')
const imagePreview = document.getElementById('image-preview')
const imagePlaceholder = document.getElementById('image-placeholder')
const previewImg = document.getElementById('preview-img')
const removeImageBtn = document.getElementById('remove-image')

// Type toggle buttons
const typeButtons = document.querySelectorAll('.btn-toggle[data-type]')

// ===== Initialize =====
function init() {
    // Set today's date as default
    dateInput.value = new Date().toISOString().split('T')[0]
    
    // Load saved data
    loadFromStorage()
    
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
    
    // Create submission object
    const submission = {
        id: generateId(),
        date: dateInput.value,
        type: typeInput.value,
        grossAmount: Math.round(parseFloat(amountInput.value) * 100), // Convert to cents
        description: descriptionInput.value.trim(),
        counterparty: counterpartyInput.value.trim() || null,
        categoryHint: categoryInput.value.trim() || null,
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
    clearImage()
    
    // Reset type to OUT
    typeButtons.forEach(b => b.classList.remove('active'))
    document.querySelector('.btn-toggle[data-type="OUT"]').classList.add('active')
    typeInput.value = 'OUT'
}

// ===== Image Handling =====
function handleImageSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Bild zu groß (max. 5MB)', 'error')
        return
    }
    
    // Read and compress image
    const reader = new FileReader()
    reader.onload = (event) => {
        compressImage(event.target.result, file.type, (compressedData) => {
            currentImage = {
                name: file.name,
                mimeType: file.type || 'image/jpeg',
                dataBase64: compressedData.split(',')[1] // Remove data URL prefix
            }
            
            // Show preview
            previewImg.src = compressedData
            previewImg.hidden = false
            imagePlaceholder.hidden = true
            removeImageBtn.hidden = false
        })
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
                ${sub.counterparty ? `${escapeHtml(sub.counterparty)} · ` : ''}
                ${sub.categoryHint ? `${escapeHtml(sub.categoryHint)}` : ''}
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
    if (!confirm('Diese Buchung wirklich löschen?')) return
    
    submissions = submissions.filter(s => s.id !== id)
    saveToStorage()
    updateBadges()
    renderSubmissionsList()
    showToast('Buchung gelöscht', 'success')
}

function handleClearAll() {
    if (!confirm('Alle Buchungen löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return
    
    submissions = []
    saveToStorage()
    updateBadges()
    renderSubmissionsList()
    showToast('Alle Buchungen gelöscht', 'success')
}

// ===== Download =====
function handleDownload() {
    if (submissions.length === 0) {
        showToast('Keine Buchungen zum Download', 'error')
        return
    }
    
    // Prepare export data
    const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        submissions: submissions.map(sub => ({
            externalId: sub.id,
            date: sub.date,
            type: sub.type,
            grossAmount: sub.grossAmount,
            description: sub.description,
            counterparty: sub.counterparty,
            categoryHint: sub.categoryHint,
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

// ===== Start App =====
init()
