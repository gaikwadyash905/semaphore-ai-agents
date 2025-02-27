// src/commits/parser.ts

/**
 * Commit range and SHA parser for the AI agent
 */
import { config } from '../config'
import { fetchCompareCommits } from '../github/tools'

/**
 * Resolves the commit range into an array of commit SHAs
 * @returns Promise<string[]> Array of commit SHAs to analyze
 */
export async function resolveCommits(): Promise<string[]> {
  let commitRange = config.semaphore.gitCommitRange
  let commitsToReview: string[] = []

  console.log('DEBUG: SEMAPHORE_GIT_COMMIT_RANGE:', config.semaphore.gitCommitRange)
  console.log('DEBUG: SEMAPHORE_GIT_SHA:', config.semaphore.gitSha)

  // Convert a two-dot commit range (..) to triple-dot (...) for GitHub's compare endpoint
  if (commitRange && commitRange.includes('..') && !commitRange.includes('...')) {
    commitRange = commitRange.replace('..', '...')
    console.log(`DEBUG: Replaced two-dot with three-dot in commit range => ${commitRange}`)
  }

  // If we have a commit range containing '...', use the compare endpoint
  if (commitRange && commitRange.includes('...')) {
    const [base, head] = commitRange.split('...')
    console.log(`DEBUG: Base commit = ${base}`)
    console.log(`DEBUG: Head commit = ${head}`)
    
    try {
      commitsToReview = await fetchCompareCommits(base, head)
    } catch (error) {
      console.error('Error fetching commit range:', error)
      // Fall back to single commit below
    }
  } 
  
  // Fallback to single commit if no commit range or compare failed
  if (commitsToReview.length === 0) {
    const singleCommit = commitRange || config.semaphore.gitSha
    if (!singleCommit) {
      throw new Error('No commit or commit range found in environment variables.')
    }

    console.log('DEBUG: Using single commit flow with commit:', singleCommit)
    commitsToReview = [singleCommit]
  }

  return commitsToReview
}