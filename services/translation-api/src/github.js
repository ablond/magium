export async function dispatchChangesetWorkflow(config, changeset) {
  if (!config.githubToken || !config.githubRepository) {
    const error = new Error('GitHub dispatch is not configured')
    error.statusCode = 500
    throw error
  }

  const response = await fetch(
    `https://api.github.com/repos/${config.githubRepository}/actions/workflows/${encodeURIComponent(config.githubWorkflowFile)}/dispatches`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${config.githubToken}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: config.githubRef,
        inputs: {
          changeset_id: changeset.publicId,
          api_url: config.publicApiUrl,
        },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    const error = new Error(`GitHub workflow dispatch failed: ${response.status} ${detail}`)
    error.statusCode = 502
    throw error
  }
}
