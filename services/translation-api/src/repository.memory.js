export function createMemoryRepository() {
  const proposals = new Map()
  const contacts = new Map()
  const emailConsents = new Map()
  const changesets = new Map()

  return {
    async createProposal(proposal, contact) {
      proposals.set(proposal.publicId, { ...proposal })
      if (contact) contacts.set(proposal.id, { ...contact })
      return { ...proposal }
    },
    async getProposalByPublicId(publicId) {
      const proposal = proposals.get(publicId)
      return proposal ? { ...proposal } : null
    },
    async getProposalById(id) {
      for (const proposal of proposals.values()) {
        if (proposal.id === id) return { ...proposal }
      }
      return null
    },
    async listProposals({ status } = {}) {
      return [...proposals.values()]
        .filter((proposal) => !status || proposal.status === status)
        .map((proposal) => ({ ...proposal }))
    },
    async updateProposal(proposal) {
      proposals.set(proposal.publicId, { ...proposal })
      return { ...proposal }
    },
    async getContactByProposalId(proposalId) {
      const contact = contacts.get(proposalId)
      return contact ? { ...contact } : null
    },
    async confirmContact(proposalId, confirmedAt) {
      const contact = contacts.get(proposalId)
      if (!contact) return null
      const next = { ...contact, confirmedAt }
      contacts.set(proposalId, next)
      return { ...next }
    },
    async deleteContact(proposalId) {
      contacts.delete(proposalId)
    },
    async getEmailConsentById(id) {
      const consent = emailConsents.get(id)
      return consent ? { ...consent } : null
    },
    async saveEmailConsent(consent) {
      emailConsents.set(consent.id, { ...consent })
      return { ...consent }
    },
    async deleteExpiredEmailConsents(now) {
      const cutoff = new Date(now).getTime()
      let deleted = 0
      for (const [id, consent] of emailConsents.entries()) {
        if (new Date(consent.expiresAt).getTime() <= cutoff) {
          emailConsents.delete(id)
          deleted += 1
        }
      }
      return deleted
    },
    async createChangeset(changeset) {
      changesets.set(changeset.publicId, { ...changeset })
      for (const item of changeset.items) {
        const proposal = await this.getProposalById(item.proposalId)
        if (proposal) {
          await this.updateProposal({
            ...proposal,
            status: 'changeset',
            changesetId: changeset.id,
            updatedAt: changeset.updatedAt,
          })
        }
      }
      return { ...changeset }
    },
    async getChangesetByPublicId(publicId) {
      const changeset = changesets.get(publicId)
      return changeset ? { ...changeset, items: [...changeset.items] } : null
    },
    async listChangesets({ status } = {}) {
      return [...changesets.values()]
        .filter((changeset) => !status || changeset.status === status)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .map((changeset) => ({ ...changeset, items: [...changeset.items], itemCount: changeset.items.length }))
    },
    async updateChangeset(changeset) {
      changesets.set(changeset.publicId, { ...changeset, items: [...changeset.items] })
      return { ...changeset }
    },
    async listChangesetContacts(changesetId) {
      const result = []
      for (const proposal of proposals.values()) {
        if (proposal.changesetId !== changesetId) continue
        const contact = contacts.get(proposal.id)
        if (contact?.confirmedAt) {
          result.push({ proposal: { ...proposal }, contact: { ...contact } })
        }
      }
      return result
    },
    async deleteContactsForChangeset(changesetId) {
      for (const proposal of proposals.values()) {
        if (proposal.changesetId === changesetId) {
          contacts.delete(proposal.id)
        }
      }
    },
  }
}
