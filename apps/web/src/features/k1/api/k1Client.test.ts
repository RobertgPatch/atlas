import { describe, expect, it } from 'vitest'

import { parseS3UploadFailure } from './k1Client'

describe('parseS3UploadFailure', () => {
  it('turns a browser CORS or network failure into an actionable upload error', () => {
    const error = parseS3UploadFailure({ status: 0 })

    expect(error.code).toBe('UPLOAD_NETWORK_ERROR')
    expect(error.status).toBe(0)
    expect(error.payload).toEqual({
      message: 'The browser could not upload to S3. Verify that the bucket CORS policy allows this app origin.',
    })
  })

  it('preserves an AWS XML error code without exposing the raw response', () => {
    const error = parseS3UploadFailure({
      status: 403,
      responseText: '<Error><Code>AccessDenied</Code><Message>sensitive AWS detail</Message></Error>',
    })

    expect(error.code).toBe('AccessDenied')
    expect(error.status).toBe(403)
    expect(error.payload).toEqual({
      message: 'AWS denied the S3 upload. Verify the API task role, KMS key permissions, bucket policy, and presigned upload headers.',
    })
  })

  it('falls back to the HTTP status for an unstructured S3 response', () => {
    const error = parseS3UploadFailure({ status: 503, responseText: 'unavailable' })

    expect(error.code).toBe('HTTP_503')
    expect(error.payload).toEqual({ message: 'S3 rejected the PDF upload (HTTP 503).' })
  })
})
