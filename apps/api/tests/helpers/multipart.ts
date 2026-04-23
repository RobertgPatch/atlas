import { randomUUID } from 'node:crypto'

export interface MultipartField {
  name: string
  value: string
}

export interface MultipartFile {
  name: string
  filename: string
  contentType: string
  data: Buffer
}

/**
 * Build a multipart/form-data request body suitable for Fastify's
 * `app.inject({ method:'POST', payload, headers })`.
 */
export const buildMultipart = (
  fields: MultipartField[],
  files: MultipartFile[],
): { body: Buffer; contentType: string } => {
  const boundary = `----atlas-${randomUUID()}`
  const CRLF = '\r\n'
  const parts: Buffer[] = []

  for (const field of fields) {
    parts.push(Buffer.from(`--${boundary}${CRLF}`))
    parts.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${field.name}"${CRLF}${CRLF}`,
      ),
    )
    parts.push(Buffer.from(`${field.value}${CRLF}`))
  }

  for (const file of files) {
    parts.push(Buffer.from(`--${boundary}${CRLF}`))
    parts.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"${CRLF}` +
          `Content-Type: ${file.contentType}${CRLF}${CRLF}`,
      ),
    )
    parts.push(file.data)
    parts.push(Buffer.from(CRLF))
  }

  parts.push(Buffer.from(`--${boundary}--${CRLF}`))

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

/** A minimal PDF header so any MIME-sniffing logic that inspects the first bytes is satisfied. */
export const fakePdfBytes = (sizeBytes = 1024): Buffer => {
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const padding = Buffer.alloc(Math.max(0, sizeBytes - header.byteLength), 0x20)
  return Buffer.concat([header, padding])
}
