/**
 * Stripe verifier - uses Stripe API to verify API keys
 */

import Stripe from 'stripe';
import { registerVerifier, type VerificationOutput, type Verifier } from './index';

class StripeVerifier implements Verifier {
  name = 'stripe';

  async verify(credential: string): Promise<VerificationOutput> {
    const key = credential.trim();

    if (!key.startsWith('sk_live_') && !key.startsWith('sk_test_') && !key.startsWith('rk_')) {
      return {
        success: false,
        responseId: '',
        permissions: [],
        apiEndpoint: 'api.stripe.com',
        error: 'Invalid format. Expected sk_live_xxx, sk_test_xxx, or rk_xxx',
      };
    }

    try {
      const stripe = new Stripe(key);

      // Retrieve account info - works for any valid Stripe key
      const account = await stripe.accounts.retrieve();

      const permissions: string[] = [];
      if (key.startsWith('sk_test_')) permissions.push('test-mode');
      if (key.startsWith('sk_live_')) permissions.push('live-mode');
      if (key.startsWith('rk_')) permissions.push('restricted-key');
      if (account.charges_enabled) permissions.push('charges');
      if (account.payouts_enabled) permissions.push('payouts');

      return {
        success: true,
        responseId: account.id,
        permissions,
        apiEndpoint: 'api.stripe.com/v1/accounts',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        responseId: '',
        permissions: [],
        apiEndpoint: 'api.stripe.com/v1/accounts',
        error: message,
      };
    }
  }
}

registerVerifier('stripe', new StripeVerifier());
