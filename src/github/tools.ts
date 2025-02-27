// src/github/tools.ts

/**
 * GitHub API tools for the AI commit review agent
 */
import { tool } from 'ai'
import { z } from 'zod'
import { config } from '../config'

/**
 * A tool to retrieve the diff for a GitHub commit.
 * @public
 */
export const fetchCommitDiff = tool({
  description: 'A tool to retrieve the diff for a GitHub commit.',
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    sha: z.string()
  }),
  /**
   * Retrieves the raw diff for a given commit SHA.
   * @param params - owner, repo, and sha of the commit
   * @returns The raw diff as plain text
   */
  execute: async ({ owner, repo, sha }) => {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3.diff',
          Authorization: `Bearer ${config.github.token}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(
        `Failed to fetch commit diff for ${sha}: ${response.status} - ${response.statusText}`
      )
    }

    return await response.text()
  }
})

/**
 * Retrieves commit data from GitHub's compare endpoint
 * @param base - Base commit SHA
 * @param head - Head commit SHA
 * @returns Array of commit SHAs or throws an error
 */
export async function fetchCompareCommits(base: string, head: string): Promise<string[]> {
  const { owner, repo, token } = config.github
  
  const compareUrl = `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`
  
  const compareResponse = await fetch(compareUrl, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`
    }
  })

  if (!compareResponse.ok) {
    const bodyText = await compareResponse.text()
    console.log(`DEBUG: Compare response body = ${bodyText}`)
    throw new Error(
      `Failed to compare commits: ${compareResponse.status} - ${compareResponse.statusText}`
    )
  }

  const compareData = await compareResponse.json()
  if (!compareData.commits) {
    throw new Error('No commits found in the specified commit range.')
  }

  const commits = compareData.commits.map((c: { sha: string }) => c.sha)
  if (!commits.length) {
    throw new Error('No commits available in the comparison data.')
  }
  
  return commits
}