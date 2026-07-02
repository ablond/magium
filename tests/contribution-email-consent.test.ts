import { describe, expect, it } from 'vitest'
import { hashContributionEmail, parseContributionEmailConsentFragment } from '../src/lib/contributions/storage'

describe('translation contribution email consent storage helpers', () => {
  it('hashes normalized emails without storing the raw address', async () => {
    await expect(hashContributionEmail(' Reader@Example.test ')).resolves.toBe(await hashContributionEmail('reader@example.test'))
  })

  it('parses the API confirmation redirect fragment', () => {
    const payload = {
      publicId: 'tr_public',
      id: 'ec_local',
      token: 'token',
      expiresAt: '2027-07-02T10:00:00.000Z',
    }
    const fragment = `#translation-email-consent=${encodeURIComponent(JSON.stringify(payload))}`

    expect(parseContributionEmailConsentFragment(fragment)).toEqual(payload)
    expect(parseContributionEmailConsentFragment('#other=value')).toBeNull()
  })
})
