// src/index.ts

/**
 * Main entry point for the AI commit review agent
 */
import { validateConfig } from './config'
import { resolveCommits } from './commits/parser'
import { generateCommitReview } from './ai/review'

/**
 * Main function that runs the commit review process
 */
async function runCommitReview() {
  try {
    // Validate environment configuration
    validateConfig()
    
    // Get the commits to review
    const commitsToReview = await resolveCommits()
    
    console.log('=== AI Commit-by-Commit Review ===')
    
    // Generate and log reviews for each commit
    for (const sha of commitsToReview) {
      const reviewText = await generateCommitReview(sha)
      
      console.log(`--- Review for commit ${sha} ---`)
      console.log(reviewText)
      console.log('---------------------------------')
    }
    
    console.log('=================================')
  } catch (error) {
    console.error('Error running commit-by-commit review agent:', error)
    process.exit(1) // Ensure CI fails if error encountered
  }
}

// Execute the commit review process
runCommitReview()