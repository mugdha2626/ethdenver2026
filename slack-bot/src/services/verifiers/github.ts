/**
 * GitHub verifier - uses GitHub API to verify personal access tokens
 */

import { registerVerifier, type VerificationOutput, type Verifier } from './index';

class GitHubVerifier implements Verifier {
  name = 'github';

  async verify(credential: string): Promise<VerificationOutput> {
    const token = credential.trim();

    try {
      // GET /user - works for any valid GitHub token
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ConfidentialConnect/0.1',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          responseId: '',
          permissions: [],
          apiEndpoint: 'api.github.com/user',
          error: `GitHub API returned ${res.status}: ${text}`,
        };
      }

      const user = (await res.json()) as { login: string; id: number; name: string | null };

      // Check token scopes from response headers
      const scopes = res.headers.get('x-oauth-scopes');
      const permissions = scopes
        ? scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : ['(fine-grained token - scopes not listed)'];

      return {
        success: true,
        responseId: user.login,
        permissions,
        apiEndpoint: 'api.github.com/user',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        responseId: '',
        permissions: [],
        apiEndpoint: 'api.github.com/user',
        error: message,
      };
    }
  }
}

registerVerifier('github', new GitHubVerifier());
