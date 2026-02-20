/**
 * AWS verifier - uses STS getCallerIdentity to verify AWS credentials
 */

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { IAMClient, ListAttachedUserPoliciesCommand, GetUserCommand } from '@aws-sdk/client-iam';
import { registerVerifier, type VerificationOutput, type Verifier } from './index';

class AwsVerifier implements Verifier {
  name = 'aws';

  async verify(credential: string): Promise<VerificationOutput> {
    // Expected format: ACCESS_KEY_ID:SECRET_ACCESS_KEY
    const parts = credential.split(':');
    if (parts.length < 2) {
      return {
        success: false,
        responseId: '',
        permissions: [],
        apiEndpoint: 'sts.amazonaws.com',
        error: 'Invalid format. Expected ACCESS_KEY_ID:SECRET_ACCESS_KEY',
      };
    }

    const accessKeyId = parts[0];
    const secretAccessKey = parts.slice(1).join(':');

    const stsClient = new STSClient({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    try {
      // STS GetCallerIdentity - works for any valid AWS credentials
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));

      // Try to get permissions (may fail if limited permissions)
      let permissions: string[] = [];
      try {
        const iamClient = new IAMClient({
          credentials: { accessKeyId, secretAccessKey },
        });
        const user = await iamClient.send(new GetUserCommand({}));
        const username = user.User?.UserName;
        if (username) {
          const policies = await iamClient.send(
            new ListAttachedUserPoliciesCommand({ UserName: username })
          );
          permissions = (policies.AttachedPolicies || []).map(
            (p) => p.PolicyName || 'unknown'
          );
        }
      } catch {
        permissions = ['(unable to list - limited permissions)'];
      }

      return {
        success: true,
        responseId: identity.Account || 'unknown',
        permissions,
        apiEndpoint: 'sts.amazonaws.com/GetCallerIdentity',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        responseId: '',
        permissions: [],
        apiEndpoint: 'sts.amazonaws.com/GetCallerIdentity',
        error: message,
      };
    }
  }
}

registerVerifier('aws', new AwsVerifier());
