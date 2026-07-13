import { filePayloadToBuffer, normalizeUploadFilesForJson } from '../../electron/main/services/filePayload'
import { AiInvoiceExtractInput, AttachmentAddInput, VoucherCreateInput } from '../../electron/main/ipc/schemas'

describe('binary file payloads', () => {
  it('decodes only the selected Uint8Array view', () => {
    const source = new Uint8Array([99, 1, 2, 3, 88])
    const view = source.subarray(1, 4)

    expect(Array.from(filePayloadToBuffer({ dataBytes: view }))).toEqual([1, 2, 3])
  })

  it('keeps Base64 payloads compatible', () => {
    expect(filePayloadToBuffer({ dataBase64: 'AQID' })).toEqual(Buffer.from([1, 2, 3]))
    expect(normalizeUploadFilesForJson([
      { name: 'test.bin', dataBytes: new Uint8Array([1, 2, 3]) }
    ])).toEqual([{ name: 'test.bin', dataBase64: 'AQID' }])
  })

  it('accepts binary bytes in voucher, attachment and AI schemas', () => {
    const bytes = new Uint8Array([1, 2, 3])

    expect(VoucherCreateInput.parse({
      date: '2026-07-13',
      type: 'OUT',
      sphere: 'IDEELL',
      grossAmount: 1,
      vatRate: 0,
      files: [{ name: 'beleg.pdf', dataBytes: bytes, mime: 'application/pdf' }]
    }).files?.[0].dataBytes).toEqual(bytes)
    expect(AttachmentAddInput.parse({
      voucherId: 1,
      fileName: 'beleg.pdf',
      dataBytes: bytes
    }).dataBytes).toEqual(bytes)
    expect(AiInvoiceExtractInput.parse({
      file: { fileName: 'beleg.pdf', mimeType: 'application/pdf', dataBytes: bytes }
    }).file.dataBytes).toEqual(bytes)
  })

  it('rejects file metadata without content', () => {
    expect(() => AttachmentAddInput.parse({ voucherId: 1, fileName: 'leer.pdf' })).toThrow()
  })
})
