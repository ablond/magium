import test from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresRepositoryFromPool } from '../src/repository.postgres.js'

test('postgres changeset updates use consecutive placeholders for all parameters', async () => {
  const calls = []
  const repository = createPostgresRepositoryFromPool({
    async query(sql, params) {
      calls.push({ sql, params })
      return { rows: [], rowCount: 0 }
    },
  })
  const changeset = {
    id: 'changeset-1',
    publicId: 'cs_1',
    title: 'FR ch1',
    status: 'dispatched',
    branchName: 'translation/cs_1',
    pullRequestUrl: 'https://github.com/ablond/magium/pull/1',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:01:00.000Z',
  }

  await repository.updateChangeset(changeset)

  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /UPDATE translation_changesets/)
  assert.match(calls[0].sql, /public_id=\$2/)
  assert.deepEqual(usedPlaceholders(calls[0].sql), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(calls[0].params, [
    changeset.id,
    changeset.publicId,
    changeset.title,
    changeset.status,
    changeset.branchName,
    changeset.pullRequestUrl,
    changeset.createdAt,
    changeset.updatedAt,
  ])
})

function usedPlaceholders(sql) {
  return [...new Set([...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))]
    .sort((left, right) => left - right)
}
