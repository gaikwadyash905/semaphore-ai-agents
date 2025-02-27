// src/config.ts

/**
 * Configuration module for the AI commit review agent
 * Manages environment variables and validation
 */
export const config = {
  github: {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN
  },
  semaphore: {
    gitSha: process.env.SEMAPHORE_GIT_SHA,
    gitCommitRange: process.env.SEMAPHORE_GIT_COMMIT_RANGE
  }
}

/**
 * Validates that all required configuration is present
 * @throws Error if any required config is missing
 */
export function validateConfig() {
  if (!config.github.owner) {
    throw new Error('Environment variable GITHUB_OWNER is not set.')
  }
  if (!config.github.repo) {
    throw new Error('Environment variable GITHUB_REPO is not set.')
  }
  if (!config.github.token) {
    throw new Error('Environment variable GITHUB_TOKEN is not set.')
  }
}