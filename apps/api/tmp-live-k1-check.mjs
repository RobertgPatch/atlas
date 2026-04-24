import { authenticator } from 'otplib'
import { readFile } from 'node:fs/promises'

const baseUrl = 'http://localhost:3000/v1'

const readJson = async (response) => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const loginResponse = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@atlas.com', password: 'password123' }),
})
const loginBody = await readJson(loginResponse)
console.log('login', loginResponse.status, loginBody)

if (loginBody.status !== 'MFA_ENROLL_REQUIRED') {
  throw new Error(`Expected MFA_ENROLL_REQUIRED, got ${JSON.stringify(loginBody)}`)
}

const code = authenticator.generate(loginBody.manualEntryKey)
const enrollResponse = await fetch(`${baseUrl}/auth/mfa/enroll/complete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enrollmentToken: loginBody.enrollmentToken, code }),
})
const enrollBody = await readJson(enrollResponse)
console.log('enroll', enrollResponse.status, enrollBody.user)

const cookie = enrollResponse.headers.get('set-cookie')?.split(';')[0]
if (!cookie) throw new Error('No session cookie returned')

const listResponse = await fetch(`${baseUrl}/k1-documents?tax_year=2025&sort=uploaded_at&direction=desc&limit=50`, {
  headers: { cookie },
})
const listBody = await readJson(listResponse)
console.log('initial list count', listResponse.status, listBody.items?.length)
const failedRows = (listBody.items ?? []).filter((item) => item.parseError)
console.log('failed rows', failedRows.map((item) => ({ id: item.id, parseError: item.parseError, status: item.status })))

const pdf = await readFile('d:/Projects/atlas/new_k1.pdf')
const boundary = '----atlas-live-check'
const crlf = '\r\n'
const parts = []
const fields = [
  ['partnershipId', (listBody.items?.[0]?.partnership?.id) ?? ''],
  ['entityId', (listBody.items?.[0]?.entity?.id) ?? ''],
  ['taxYear', '2025'],
]
for (const [name, value] of fields) {
  parts.push(Buffer.from(`--${boundary}${crlf}`))
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`))
}
parts.push(Buffer.from(`--${boundary}${crlf}`))
parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="new_k1.pdf"${crlf}Content-Type: application/pdf${crlf}${crlf}`))
parts.push(pdf)
parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`))

const uploadResponse = await fetch(`${baseUrl}/k1-documents`, {
  method: 'POST',
  headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
  body: Buffer.concat(parts),
})
const uploadBody = await readJson(uploadResponse)
console.log('upload', uploadResponse.status, uploadBody)

if (uploadResponse.status === 201) {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const detailResponse = await fetch(`${baseUrl}/k1-documents/${uploadBody.k1DocumentId}`, {
    headers: { cookie },
  })
  const detailBody = await readJson(detailResponse)
  console.log('detail after upload', detailResponse.status, detailBody)

  if (detailBody.parseError) {
    const reparseResponse = await fetch(`${baseUrl}/k1-documents/${uploadBody.k1DocumentId}/reparse`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
    })
    const reparseBody = await readJson(reparseResponse)
    console.log('reparse', reparseResponse.status, reparseBody)
  }
}