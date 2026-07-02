export async function createPostgresRepository(databaseUrl) {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: databaseUrl })
  await ensureSchemaCompatibility(pool)

  return {
    async createProposal(proposal, contact) {
      await pool.query(
        `INSERT INTO translation_proposals (
          id, public_id, status, content_version, locale, chapter_id, scene_id, message_id, target_type,
          segment_index, segment_count, current_text, current_text_hash, source_text_hash, proposed_text, final_text, note,
          pseudonym, credit_requested, credit_approved, moderator_note, changeset_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        proposalParams(proposal),
      )
      if (contact) {
        await pool.query(
          `INSERT INTO translation_proposal_contacts (proposal_id, email, token_hash, confirmed_at, created_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [proposal.id, contact.email, contact.tokenHash, contact.confirmedAt ?? null, contact.createdAt],
        )
      }
      return proposal
    },
    async getProposalByPublicId(publicId) {
      const { rows } = await pool.query('SELECT * FROM translation_proposals WHERE public_id = $1', [publicId])
      return rows[0] ? rowToProposal(rows[0]) : null
    },
    async getProposalById(id) {
      const { rows } = await pool.query('SELECT * FROM translation_proposals WHERE id = $1', [id])
      return rows[0] ? rowToProposal(rows[0]) : null
    },
    async listProposals({ status } = {}) {
      const result = status
        ? await pool.query('SELECT * FROM translation_proposals WHERE status = $1 ORDER BY created_at DESC', [status])
        : await pool.query('SELECT * FROM translation_proposals ORDER BY created_at DESC')
      return result.rows.map(rowToProposal)
    },
    async updateProposal(proposal) {
      await pool.query(
        `UPDATE translation_proposals SET
          public_id=$2, status=$3, content_version=$4, locale=$5, chapter_id=$6, scene_id=$7, message_id=$8,
          target_type=$9, segment_index=$10, segment_count=$11, current_text=$12, current_text_hash=$13, source_text_hash=$14,
          proposed_text=$15, final_text=$16, note=$17, pseudonym=$18, credit_requested=$19,
          credit_approved=$20, moderator_note=$21, changeset_id=$22, created_at=$23, updated_at=$24
         WHERE id=$1`,
        proposalParams(proposal),
      )
      return proposal
    },
    async getContactByProposalId(proposalId) {
      const { rows } = await pool.query('SELECT * FROM translation_proposal_contacts WHERE proposal_id = $1', [proposalId])
      return rows[0] ? rowToContact(rows[0]) : null
    },
    async confirmContact(proposalId, confirmedAt) {
      const { rows } = await pool.query(
        'UPDATE translation_proposal_contacts SET confirmed_at = $2 WHERE proposal_id = $1 RETURNING *',
        [proposalId, confirmedAt],
      )
      return rows[0] ? rowToContact(rows[0]) : null
    },
    async deleteContact(proposalId) {
      await pool.query('DELETE FROM translation_proposal_contacts WHERE proposal_id = $1', [proposalId])
    },
    async getEmailConsentById(id) {
      const { rows } = await pool.query('SELECT * FROM translation_email_consents WHERE id = $1', [id])
      return rows[0] ? rowToEmailConsent(rows[0]) : null
    },
    async saveEmailConsent(consent) {
      const { rows } = await pool.query(
        `INSERT INTO translation_email_consents (id, email_hmac, token_hash, confirmed_at, last_used_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           email_hmac=EXCLUDED.email_hmac,
           token_hash=EXCLUDED.token_hash,
           confirmed_at=EXCLUDED.confirmed_at,
           last_used_at=EXCLUDED.last_used_at,
           expires_at=EXCLUDED.expires_at
         RETURNING *`,
        [consent.id, consent.emailHmac, consent.tokenHash, consent.confirmedAt, consent.lastUsedAt, consent.expiresAt],
      )
      return rowToEmailConsent(rows[0])
    },
    async deleteExpiredEmailConsents(now) {
      const { rowCount } = await pool.query('DELETE FROM translation_email_consents WHERE expires_at <= $1', [now])
      return rowCount
    },
    async createChangeset(changeset) {
      await pool.query(
        `INSERT INTO translation_changesets (id, public_id, title, status, branch_name, pull_request_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [changeset.id, changeset.publicId, changeset.title, changeset.status, changeset.branchName ?? null, changeset.pullRequestUrl ?? null, changeset.createdAt, changeset.updatedAt],
      )
      for (const item of changeset.items) {
        await pool.query(
          'UPDATE translation_proposals SET status=$2, changeset_id=$3, updated_at=$4 WHERE id=$1',
          [item.proposalId, 'changeset', changeset.id, changeset.updatedAt],
        )
      }
      return changeset
    },
    async getChangesetByPublicId(publicId) {
      const { rows } = await pool.query('SELECT * FROM translation_changesets WHERE public_id = $1', [publicId])
      if (!rows[0]) return null
      const { rows: proposalRows } = await pool.query(
        'SELECT * FROM translation_proposals WHERE changeset_id = $1 ORDER BY locale, chapter_id, message_id',
        [rows[0].id],
      )
      return rowToChangeset(rows[0], proposalRows.map(rowToChangesetItem))
    },
    async listChangesets({ status } = {}) {
      const query = `
        SELECT c.*, COUNT(p.id)::int AS item_count
        FROM translation_changesets c
        LEFT JOIN translation_proposals p ON p.changeset_id = c.id
        ${status ? 'WHERE c.status = $1' : ''}
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `
      const { rows } = status ? await pool.query(query, [status]) : await pool.query(query)
      return rows.map(rowToChangesetSummary)
    },
    async updateChangeset(changeset) {
      await pool.query(
        `UPDATE translation_changesets SET title=$3, status=$4, branch_name=$5, pull_request_url=$6, created_at=$7, updated_at=$8
         WHERE id=$1`,
        [changeset.id, changeset.publicId, changeset.title, changeset.status, changeset.branchName ?? null, changeset.pullRequestUrl ?? null, changeset.createdAt, changeset.updatedAt],
      )
      return changeset
    },
    async listChangesetContacts(changesetId) {
      const { rows } = await pool.query(
        `SELECT p.*, c.email, c.token_hash, c.confirmed_at, c.created_at AS contact_created_at
         FROM translation_proposals p
         JOIN translation_proposal_contacts c ON c.proposal_id = p.id
         WHERE p.changeset_id = $1 AND c.confirmed_at IS NOT NULL`,
        [changesetId],
      )
      return rows.map((row) => ({
        proposal: rowToProposal(row),
        contact: {
          proposalId: row.id,
          email: row.email,
          tokenHash: row.token_hash,
          confirmedAt: row.confirmed_at?.toISOString?.() ?? row.confirmed_at,
          createdAt: row.contact_created_at?.toISOString?.() ?? row.contact_created_at,
        },
      }))
    },
    async deleteContactsForChangeset(changesetId) {
      await pool.query(
        `DELETE FROM translation_proposal_contacts c
         USING translation_proposals p
         WHERE c.proposal_id = p.id AND p.changeset_id = $1`,
        [changesetId],
      )
    },
  }
}

async function ensureSchemaCompatibility(pool) {
  try {
    await pool.query('ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS segment_index integer')
    await pool.query('ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS segment_count integer')
    await pool.query('ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS current_text text')
  } catch (error) {
    if (error?.code !== '42P01') throw error
  }
}

function proposalParams(proposal) {
  return [
    proposal.id,
    proposal.publicId,
    proposal.status,
    proposal.contentVersion,
    proposal.locale,
    proposal.chapterId,
    proposal.sceneId,
    proposal.messageId,
    proposal.targetType,
    proposal.segmentIndex,
    proposal.segmentCount,
    proposal.currentText ?? '',
    proposal.currentTextHash,
    proposal.sourceTextHash,
    proposal.proposedText,
    proposal.finalText,
    proposal.note,
    proposal.pseudonym,
    proposal.creditRequested,
    proposal.creditApproved,
    proposal.moderatorNote,
    proposal.changesetId,
    proposal.createdAt,
    proposal.updatedAt,
  ]
}

function rowToProposal(row) {
  return {
    id: row.id,
    publicId: row.public_id,
    status: row.status,
    contentVersion: row.content_version,
    locale: row.locale,
    chapterId: row.chapter_id,
    sceneId: row.scene_id,
    messageId: row.message_id,
    targetType: row.target_type,
    segmentIndex: row.segment_index ?? null,
    segmentCount: row.segment_count ?? null,
    currentText: row.current_text ?? '',
    currentTextHash: row.current_text_hash,
    sourceTextHash: row.source_text_hash,
    proposedText: row.proposed_text,
    finalText: row.final_text,
    note: row.note ?? '',
    pseudonym: row.pseudonym ?? '',
    creditRequested: row.credit_requested,
    creditApproved: row.credit_approved,
    moderatorNote: row.moderator_note ?? '',
    changesetId: row.changeset_id,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

function rowToContact(row) {
  return {
    proposalId: row.proposal_id,
    email: row.email,
    tokenHash: row.token_hash,
    confirmedAt: row.confirmed_at?.toISOString?.() ?? row.confirmed_at,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}

function rowToEmailConsent(row) {
  return {
    id: row.id,
    emailHmac: row.email_hmac,
    tokenHash: row.token_hash,
    confirmedAt: row.confirmed_at?.toISOString?.() ?? row.confirmed_at,
    lastUsedAt: row.last_used_at?.toISOString?.() ?? row.last_used_at,
    expiresAt: row.expires_at?.toISOString?.() ?? row.expires_at,
  }
}

function rowToChangeset(row, items) {
  return {
    id: row.id,
    publicId: row.public_id,
    title: row.title,
    status: row.status,
    branchName: row.branch_name ?? '',
    pullRequestUrl: row.pull_request_url ?? '',
    items,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

function rowToChangesetSummary(row) {
  return {
    id: row.id,
    publicId: row.public_id,
    title: row.title,
    status: row.status,
    branchName: row.branch_name ?? '',
    pullRequestUrl: row.pull_request_url ?? '',
    itemCount: row.item_count ?? 0,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

function rowToChangesetItem(row) {
  const proposal = rowToProposal(row)
  return {
    proposalId: proposal.id,
    publicId: proposal.publicId,
    locale: proposal.locale,
    chapterId: proposal.chapterId,
    messageId: proposal.messageId,
    targetType: proposal.targetType,
    segmentIndex: proposal.segmentIndex,
    segmentCount: proposal.segmentCount,
    currentTextHash: proposal.currentTextHash,
    finalText: proposal.finalText,
    credit: proposal.creditApproved && proposal.pseudonym ? proposal.pseudonym : '',
  }
}
