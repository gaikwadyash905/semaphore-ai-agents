// src/release.ts

import { openai } from '@ai-sdk/openai'
import { generateText, tool } from 'ai'
import { z } from 'zod'

// Environment variables
const {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_TOKEN,
  OPENAI_API_KEY,
  RELEASE_TAG_RANGE, // e.g. "v1.0.0..v1.1.0"
} = process.env

if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
  throw new Error('Missing required environment variables for GitHub access.')
}
if (!OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable.')
}

// Tool to compare two refs (tags or commits)
const fetchCommitsViaCompare = tool({
  description: 'Compare two refs on GitHub to list commit messages.',
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    base: z.string(),
    head: z.string(),
  }),
  execute: async ({ owner, repo, base, head }) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`
    console.log('DEBUG: Compare URL =>', url)

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
    })

    if (!response.ok) {
      const bodyText = await response.text()
      console.log('DEBUG: Compare response body =>', bodyText)
      throw new Error(`Failed to compare: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()
    if (!data.commits) {
      throw new Error('No commits found in compare data.')
    }
    return data.commits.map((c: any) => c.commit.message)
  },
})

// Tool for fallback: fetch the last N commits
const fetchRecentCommits = tool({
  description: 'Retrieve a list of recent commits from a GitHub repo.',
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    perPage: z.number().default(10),
  }),
  execute: async ({ owner, repo, perPage }) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}`
    console.log('DEBUG: Fallback fetch URL =>', url)

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch commits: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()
    return data.map((commit: any) => commit.commit.message)
  },
})

async function generateReleaseNotes() {
  try {
    console.log('DEBUG: GITHUB_OWNER:', GITHUB_OWNER)
    console.log('DEBUG: GITHUB_REPO:', GITHUB_REPO)
    console.log('DEBUG: RELEASE_TAG_RANGE:', RELEASE_TAG_RANGE || '(none)')

    let commitMessages: string[] = []

    if (RELEASE_TAG_RANGE) {
      // Convert two-dot ".." to triple-dot "..." if needed
      let compareRange = RELEASE_TAG_RANGE
      if (compareRange.includes('..') && !compareRange.includes('...')) {
        compareRange = compareRange.replace('..', '...')
        console.log('DEBUG: Replaced ".." with "..." =>', compareRange)
      }

      if (compareRange.includes('...')) {
        const [base, head] = compareRange.split('...')
        console.log('DEBUG: Base =>', base, 'Head =>', head)
        try {
          // Get commits via compare
          const { text } = await generateText({
            model: openai('gpt-4o'),
            system: `
              You are an AI assistant that calls a tool to retrieve commit messages
              between two refs (base and head).
            `,
            prompt: `
              Call "fetchCommitsViaCompare" tool to get commits between ${base} and ${head}.
            `,
            tools: { fetchCommitsViaCompare },
            maxSteps: 1,
            functionCall: {
              name: 'fetchCommitsViaCompare',
              arguments: {
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                base,
                head,
              },
            },
          })

          // Attempt to parse JSON output
          try {
            commitMessages = JSON.parse(text)
          } catch {
            // fallback to splitting lines
            commitMessages = text.split('\n').map((l) => l.trim()).filter(Boolean)
          }
        } catch (err) {
          console.warn('Compare failed, fallback to recent commits =>', err)
        }
      } else {
        console.warn('Invalid RELEASE_TAG_RANGE format, expected triple-dot. Fallback to recent commits.')
      }
    }

    // Fallback if no commit messages from compare
    if (!commitMessages.length) {
      console.log('DEBUG: No compare-based commits found, fetching recent commits.')
      const { text } = await generateText({
        model: openai('gpt-4o'),
        system: `
          You are an AI assistant that fetches recent commits as a fallback.
        `,
        prompt: `
          Call "fetchRecentCommits" to retrieve the last 10 commits for ${GITHUB_OWNER}/${GITHUB_REPO}.
        `,
        tools: { fetchRecentCommits },
        maxSteps: 1,
        functionCall: {
          name: 'fetchRecentCommits',
          arguments: {
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            perPage: 10,
          },
        },
      })

      try {
        commitMessages = JSON.parse(text)
      } catch {
        commitMessages = text.split('\n').map((l) => l.trim()).filter(Boolean)
      }
    }

    if (!commitMessages.length) {
      throw new Error('No commit messages retrieved from either compare or fallback.')
    }

    console.log('DEBUG: Combined commit messages =>\n', commitMessages.join('\n'))

    // Summarize
    const { text: releaseText } = await generateText({
      model: openai('gpt-4o'),
      system: `
        You are an AI assistant that organizes commit messages into release notes.
        - Categorize them (feat, fix, docs, etc.).
        - Provide a concise, Markdown-friendly summary of changes.
      `,
      prompt: `
        Here are the commit messages:

        ${commitMessages.join('\n')}

        Please produce comprehensive but concise release notes in Markdown format.
      `,
      maxSteps: 0,
    })

    console.log('=== AI-Generated Release Notes ===')
    console.log(releaseText)
    console.log('==================================')
  } catch (err) {
    console.error('Error generating release notes:', err)
    process.exit(1)
  }
}

generateReleaseNotes()