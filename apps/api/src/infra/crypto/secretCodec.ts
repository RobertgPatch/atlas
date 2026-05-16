import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { config } from '../../config.js'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'

const keyMaterial = () =>
  config.persistenceSecretKey || config.databaseUrl || 'atlas-local-development-secret'

const key = () => createHash('sha256').update(keyMaterial()).digest()

export const isDedicatedSecretKeyConfigured = () => config.persistenceSecretKey.length > 0

export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export const decryptSecret = (encoded: string): string => {
  const [version, ivText, tagText, ciphertextText] = encoded.split(':')
  if (version !== VERSION || !ivText || !tagText || !ciphertextText) {
    throw new Error('Unsupported encrypted secret format')
  }

  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
