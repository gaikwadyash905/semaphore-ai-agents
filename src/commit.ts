// src/commit.ts

import { openai } from '@ai-sdk/openai'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_TOKEN,
  SEMAPHORE_GIT_SHA,
  SEMAPHORE_GIT_COMMIT_RANGE,
} = process.env

if (!GITHUB_OWNER) {
  throw new Error('Environment variable GITHUB_OWNER is not set.')
}
if (!GITHUB_REPO) {
  throw new Error('Environment variable GITHUB_REPO is not set.')
}
if (!GITHUB_TOKEN) {
  throw new Error('Environment variable GITHUB_TOKEN is not set.')
}

// Tool to fetch raw diff for a single commit
const fetchCommitDiff = tool({
  description: 'A tool to retrieve the diff for a GitHub commit.',
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    sha: z.string(),
  }),
  execute: async ({ owner, repo, sha }) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3.diff',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch commit diff for ${sha}: ${response.status} - ${response.statusText}`)
    }

    return await response.text()
  },
})

async function runCommitReview() {
  try {
    console.log('DEBUG: SEMAPHORE_GIT_COMMIT_RANGE:', SEMAPHORE_GIT_COMMIT_RANGE)
    console.log('DEBUG: SEMAPHORE_GIT_SHA:', SEMAPHORE_GIT_SHA)

    let commitRange = SEMAPHORE_GIT_COMMIT_RANGE
    let commitsToReview: string[] = []

    // Convert .. to ... if needed
    if (commitRange && commitRange.includes('..') && !commitRange.includes('...')) {
      commitRange = commitRange.replace('..', '...')
      console.log('DEBUG: Replaced two-dot with three-dot =>', commitRange)
    }

    if (commitRange && commitRange.includes('...')) {
      const [base, head] = commitRange.split('...')
      console.log(`DEBUG: Base commit = ${base}`)
      console.log(`DEBUG: Head commit = ${head}`)

      const compareUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${base}...${head}`
      console.log(`DEBUG: Compare URL = ${compareUrl}`)

      try {
        const compareResponse = await fetch(compareUrl, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${GITHUB_TOKEN}`,
          },
        })

        if (!compareResponse.ok) {
          const bodyText = await compareResponse.text()
          console.log('DEBUG: Compare response body =', bodyText)
          throw new Error(`Failed to compare commits: ${compareResponse.status} - ${compareResponse.statusText}`)
        }

        const compareData = await compareResponse.json()
        if (!compareData.commits) {
          throw new Error('No commits found in compare data.')
        }

        commitsToReview = compareData.commits.map((c: { sha: string }) => c.sha)
        if (!commitsToReview.length) {
          throw new Error('No commits available in comparison data.')
        }
      } catch (error) {
        console.warn('Compare failed, falling back to single commit. Error =>', error)
        commitsToReview = [head]
      }
    } else {
      // Single commit fallback
      const singleCommit = commitRange || SEMAPHORE_GIT_SHA
      if (!singleCommit) {
        throw new Error('No commit or commit range found in environment variables.')
      }
      console.log('DEBUG: Single commit flow with:', singleCommit)
      commitsToReview = [singleCommit]
    }

    console.log('=== AI Commit-by-Commit Review ===')
    for (const sha of commitsToReview) {
      const { text } = await generateText({
        model: openai('gpt-4o'),
        system: `
          You are an AI assistant that reviews code changes in a commit.
          - Summarize key modifications.
          - Flag potential security issues or code smells.
          - Suggest best practices or improvements where relevant.
          - Be concise but thorough in your review.
        `,
        prompt: `
          The commit to analyze is ${sha} in the ${GITHUB_OWNER}/${GITHUB_REPO} repository.
          If you need the diff, call "fetchCommitDiff" with:
          {
            "owner": "${GITHUB_OWNER}",
            "repo": "${GITHUB_REPO}",
            "sha": "${sha}"
          }.
        `,
        tools: { fetchCommitDiff },
        maxSteps: 2,
      })

      console.log(`--- Review for commit ${sha} ---`)
      console.log(text)
      console.log('---------------------------------')
    }
    console.log('=================================')
  } catch (error) {
    console.error('Error running commit-by-commit review agent:', error)
    process.exit(1)
  }
}

runCommitReview()