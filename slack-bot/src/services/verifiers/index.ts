/**
 * Verifier registry and interface
 * Each verifier checks if a secret is valid for a given service
 */

export interface VerificationOutput {
  success: boolean;
  responseId: string;     // Safe non-secret ID (AWS account, GitHub username)
  permissions: string[];  // What the secret can do
  apiEndpoint: string;    // Which API was called
  error?: string;
}

export interface Verifier {
  /** The service name (e.g., "aws", "stripe", "github") */
  name: string;
  /** Verify the credential and return a safe result */
  verify(credential: string): Promise<VerificationOutput>;
}

// Registry of all available verifiers
const verifiers = new Map<string, Verifier>();

/**
 * Register a verifier for a service
 */
export function registerVerifier(name: string, verifier: Verifier): void {
  verifiers.set(name.toLowerCase(), verifier);
}

/**
 * Get a verifier by service name
 */
export function getVerifier(name: string): Verifier | undefined {
  return verifiers.get(name.toLowerCase());
}

/**
 * Get all registered verifier names
 */
export function getAvailableServices(): string[] {
  return Array.from(verifiers.keys());
}

/**
 * Auto-detect which verifier to use based on the secret format
 */
export function detectService(secret: string): string | null {
  if (secret.startsWith('AKIA') && secret.includes(':')) return 'aws';
  if (secret.startsWith('sk_live_') || secret.startsWith('sk_test_')) return 'stripe';
  if (secret.startsWith('ghp_') || secret.startsWith('github_pat_')) return 'github';
  return null;
}
