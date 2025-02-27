// src/ai/review.ts

/**
 * AI review generator module
 */
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { fetchCommitDiff } from '../github/tools'
import { config } from '../config'

/**
 * Generates an AI review for a single commit
 * @param sha - The commit SHA to review
 * @returns Promise<string> The AI-generated review
 */
export async function generateCommitReview(sha: string): Promise<string> {
  const { text } = await generateText({
    model: openai('gpt-4o'),
    system: `You are an AI assistant that reviews code changes in a commit.
    - Summarize key modifications.
    - Flag potential security issues or code smells.
    - Suggest best practices or improvements where relevant.
    - Be concise but thorough in your review.`,
    prompt: `
    The commit to analyze is ${sha} in the ${config.github.owner}/${config.github.repo} repository.
    If you need the diff, call the "fetchCommitDiff" tool with:
    {
      "owner": "${config.github.owner}",
      "repo": "${config.github.repo}",
      "sha": "${sha}"
    }.
    `,
    tools: {
      fetchCommitDiff
    },
    maxSteps: 2
  })

  return text
}