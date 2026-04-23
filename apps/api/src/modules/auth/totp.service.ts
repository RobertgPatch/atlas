import { authenticator } from 'otplib'
import { config } from '../../config.js'
import QRCode from 'qrcode'

authenticator.options = { window: 1 }

export const totpService = {
  generateSecret() {
    return authenticator.generateSecret()
  },

  buildOtpAuthUrl(email: string, secret: string) {
    return authenticator.keyuri(email, config.totpIssuer, secret)
  },

  async buildQrCodeDataUrl(otpAuthUrl: string) {
    return QRCode.toDataURL(otpAuthUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    })
  },

  verify(code: string, secret: string): boolean {
    return authenticator.check(code, secret)
  },
}
