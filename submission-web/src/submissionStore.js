const DATABASE = 'vereino-submissions'
const LEGACY_KEY = 'vereino-submissions'
const STORES = ['submissions', 'attachments']

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve
        transaction.onabort = () => reject(transaction.error || new Error('Speichervorgang abgebrochen.'))
    })
}

function openDatabase() {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
        const db = request.result
        // Auto-increment preserves insertion order, including the legacy list order.
        db.createObjectStore('submissions', { autoIncrement: true }).createIndex('id', 'id', { unique: true })
        db.createObjectStore('attachments')
        db.createObjectStore('migration')
    }
    return requestResult(request)
}

function legacyRecord(submission) {
    if (typeof submission?.id !== 'string' || !submission.id) throw new Error('Ungültige gespeicherte Buchung.')
    if (!submission.attachment) return { row: submission }
    const { name, mimeType, dataBase64 } = submission.attachment
    if (typeof dataBase64 !== 'string') throw new Error('Ungültiger gespeicherter Beleg.')
    const bytes = Uint8Array.from(atob(dataBase64), character => character.charCodeAt(0))
    return { row: { ...submission, attachment: { name, mimeType } }, blob: new Blob([bytes], { type: mimeType }) }
}

async function migrateLegacy(db) {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw === null) return
    // Separate validation from the write transaction. A malformed legacy entry leaves the original intact.
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) throw new Error('Ungültige gespeicherte Buchungsliste.')
    const records = entries.map(legacyRecord)
    const tx = db.transaction([...STORES, 'migration'], 'readwrite')
    const done = transactionDone(tx)
    const marker = tx.objectStore('migration')
    for (const { row, blob } of records) {
        const check = marker.get(row.id)
        check.onsuccess = () => {
            if (check.result) return
            tx.objectStore('submissions').add(row)
            if (blob) tx.objectStore('attachments').add(blob, row.id)
            marker.put(true, row.id)
        }
    }
    await done
    // A crash after commit is safe: the marker prevents replaying the same import.
    try {
        if (localStorage.getItem(LEGACY_KEY) === raw) localStorage.removeItem(LEGACY_KEY)
    } catch (error) {
        console.warn('Legacy storage cleanup deferred', error)
    }
}

let connection
function database() {
    connection ??= openDatabase().then(async db => {
        db.onversionchange = () => { db.close(); connection = undefined }
        try {
            await migrateLegacy(db)
            return db
        } catch (error) {
            db.close()
            throw error
        }
    }).catch(error => { connection = undefined; throw error })
    return connection
}

export async function listSubmissions() {
    const db = await database()
    return requestResult(db.transaction('submissions').objectStore('submissions').getAll())
}

// Publish only after both stores have committed. Returning this transaction's list
// also picks up records added in another tab without replacing its changes.
async function changeSubmissions(change) {
    const db = await database()
    const tx = db.transaction(STORES, 'readwrite')
    const done = transactionDone(tx)
    const rows = tx.objectStore('submissions')
    const attachments = tx.objectStore('attachments')
    let snapshot
    const readList = () => {
        const list = rows.getAll()
        list.onsuccess = () => { snapshot = list.result }
    }
    try {
        change(rows, attachments, readList)
    } catch (error) {
        tx.abort()
        await done.catch(() => {})
        throw error
    }
    await done
    return snapshot
}

export function addSubmission(row, blob) {
    return changeSubmissions((rows, attachments, readList) => {
        rows.add(row)
        if (blob) attachments.add(blob, row.id)
        readList()
    })
}

export function deleteSubmission(id) {
    return changeSubmissions((rows, attachments, readList) => {
        const key = rows.index('id').getKey(id)
        key.onsuccess = () => {
            if (key.result !== undefined) rows.delete(key.result)
            attachments.delete(id)
            readList()
        }
    })
}

export function clearSubmissions() {
    return changeSubmissions((rows, attachments, readList) => {
        rows.clear()
        attachments.clear()
        readList()
    })
}

function base64ForExport(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

export async function readSubmissionsForExport() {
    const db = await database()
    const tx = db.transaction(STORES)
    const attachments = tx.objectStore('attachments')
    const [rows, ids, blobs] = await Promise.all([
        requestResult(tx.objectStore('submissions').getAll()),
        requestResult(attachments.getAllKeys()),
        requestResult(attachments.getAll())
    ])
    const byId = new Map(ids.map((id, index) => [id, blobs[index]]))
    for (const row of rows) {
        if (!row.attachment) continue
        const blob = byId.get(row.id)
        if (!blob) throw new Error('Gespeicherter Beleg fehlt.')
        row.attachment.dataBase64 = await base64ForExport(blob)
    }
    return rows
}
