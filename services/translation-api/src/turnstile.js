const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstileToken({ token, secretKey, remoteIp, disabled = false }) {
  if (disabled) return { success: true, skipped: true }
  if (!secretKey) {
    const error = new Error('Turnstile secret key is not configured')
    error.statusCode = 500
    throw error
  }
  if (!token) {
    const error = new Error('captchaToken is required')
    error.statusCode = 400
    throw error
  }

  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: secretKey,
      response: token,
      remoteip: remoteIp,
    }),
  })
  const result = await response.json()
  if (!result.success) {
    const error = new Error('Captcha verification failed')
    error.statusCode = 400
    error.details = result['error-codes'] ?? []
    throw error
  }
  return result
}
