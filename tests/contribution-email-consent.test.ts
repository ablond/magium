import { describe, expect, it } from 'vitest'
import { hashContributionEmail, parseContributionEmailConsentFragment, removeContributionEmailConsentFragment } from '../src/lib/contributions/storage'

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

  it('removes the API confirmation fragment without leaking the consent payload', () => {
    const payload = encodeURIComponent(JSON.stringify({
      publicId: 'tr_public',
      id: 'ec_local',
      token: 'secret-token',
      expiresAt: '2027-07-02T10:00:00.000Z',
    }))
    const replacedUrls: string[] = []
    const location = {
      pathname: '/reader',
      search: '?locale=fr',
      hash: `#chapter=ch1&translation-email-consent=${payload}`,
    } as Location
    const history = {
      replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
        replacedUrls.push(String(url))
      },
    } as History

    removeContributionEmailConsentFragment(location, history)

    expect(replacedUrls).toEqual(['/reader?locale=fr#chapter=ch1'])
    expect(replacedUrls[0]).not.toContain('translation-email-consent')
    expect(replacedUrls[0]).not.toContain('secret-token')
  })
})
