/**
 * Canton JSON API HTTP client
 * Communicates with the Canton ledger via the JSON API (default port 7575)
 */

import { execSync } from 'child_process';
import path from 'path';
import { generateJwt } from '../utils/jwt';

const CANTON_URL = process.env.CANTON_JSON_API_URL || 'http://localhost:7575';

// Package ID cache — extracted from DAR at startup
let packageId: string | null = null;

export function getPackageId(): string | null {
  return packageId;
}

// Operator party full identifier — set at startup
let operatorParty: string = 'operator';

export function setOperatorParty(party: string): void {
  operatorParty = party;
}

export function getOperatorParty(): string {
  return operatorParty;
}

interface CreateContractPayload {
  templateId: string;
  payload: Record<string, unknown>;
}

interface ExerciseChoicePayload {
  templateId: string;
  contractId: string;
  choice: string;
  argument: Record<string, unknown>;
}

interface QueryPayload {
  templateIds: string[];
  query?: Record<string, unknown>;
}

interface ContractResult {
  contractId: string;
  payload: Record<string, unknown>;
}

interface LedgerResponse {
  result: ContractResult | ContractResult[];
  status: number;
}

/**
 * Extract the package ID directly from the DAR file.
 * The DAR is a ZIP; the main DALF filename contains the package hash.
 */
export async function discoverPackageId(): Promise<string> {
  if (packageId) return packageId;

  const darPath = process.env.DAR_PATH || path.resolve(__dirname, '../../../daml/.daml/dist/cloak-0.1.0.dar');

  try {
    // List DAR contents and find our main DALF
    const output = execSync(`unzip -l "${darPath}" 2>/dev/null`).toString();
    // DALF filename format: cloak-0.1.0-<packageId>.dalf
    const match = output.match(/cloak-0\.1\.0-([a-f0-9]+)\.dalf/);
    if (match) {
      packageId = match[1];
      console.log(`  Package ID (from DAR): ${packageId.substring(0, 16)}...`);
      return packageId;
    }
  } catch {
    // unzip failed, try alternative method
  }

  // Fallback: list all packages and find ours by trying to create a contract
  console.log('  DAR parsing failed, falling back to API discovery...');
  const token = generateJwt(operatorParty);
  const res = await fetch(`${CANTON_URL}/v1/packages`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list packages: ${res.status}`);
  }

  const data = (await res.json()) as { result: string[] };

  // Upload our DAR to ensure it's loaded, then check which package has our template
  // Try each package with a create dry-run approach
  for (const pkgId of data.result) {
    const testRes = await fetch(`${CANTON_URL}/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        templateIds: [`${pkgId}:Main:UserIdentity`],
      }),
    });
    if (testRes.ok) {
      // Verify this package actually contains our template by checking the response
      const testData = (await testRes.json()) as { status: number };
      if (testData.status === 200) {
        // Double check by trying a second template
        const testRes2 = await fetch(`${CANTON_URL}/v1/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            templateIds: [`${pkgId}:Main:SecretTransfer`],
          }),
        });
        if (testRes2.ok) {
          packageId = pkgId;
          console.log(`  Package ID (from API): ${pkgId.substring(0, 16)}...`);
          return pkgId;
        }
      }
    }
  }

  throw new Error(
    'Could not find cloak package. Is the DAR uploaded to the sandbox?'
  );
}

/**
 * Get the full template ID (packageId:Module:Entity)
 */
function fullTemplateId(templateName: string): string {
  if (!packageId) {
    throw new Error('Package ID not discovered yet. Call discoverPackageId() first.');
  }
  return `${packageId}:Main:${templateName}`;
}

async function cantonFetch(
  endpoint: string,
  party: string,
  body: Record<string, unknown>
): Promise<LedgerResponse> {
  const token = generateJwt(party);
  const res = await fetch(`${CANTON_URL}/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canton API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<LedgerResponse>;
}

/**
 * Create a new contract on the ledger
 */
export async function createContract(
  party: string,
  templateId: string,
  payload: Record<string, unknown>
): Promise<ContractResult> {
  const body: CreateContractPayload = {
    templateId: fullTemplateId(templateId),
    payload,
  };
  const res = await cantonFetch('create', party, body as unknown as Record<string, unknown>);
  return res.result as ContractResult;
}

/**
 * Exercise a choice on an existing contract
 */
export async function exerciseChoice(
  party: string,
  templateId: string,
  contractId: string,
  choice: string,
  argument: Record<string, unknown> = {}
): Promise<ContractResult> {
  const body: ExerciseChoicePayload = {
    templateId: fullTemplateId(templateId),
    contractId,
    choice,
    argument,
  };
  const res = await cantonFetch('exercise', party, body as unknown as Record<string, unknown>);
  return res.result as ContractResult;
}

/**
 * Query active contracts visible to a party
 */
export async function queryContracts(
  party: string,
  templateId: string,
  filter?: Record<string, unknown>
): Promise<ContractResult[]> {
  const body: QueryPayload = {
    templateIds: [fullTemplateId(templateId)],
  };
  if (filter) {
    body.query = filter;
  }
  const res = await cantonFetch('query', party, body as unknown as Record<string, unknown>);
  return res.result as ContractResult[];
}

/**
 * Fetch a contract by its key
 */
export async function fetchByKey(
  party: string,
  templateId: string,
  key: unknown
): Promise<ContractResult | null> {
  const body = {
    templateId: fullTemplateId(templateId),
    key,
  };
  try {
    const res = await cantonFetch('fetch', party, body as Record<string, unknown>);
    return res.result as ContractResult;
  } catch {
    return null;
  }
}

/**
 * Allocate a new party on the Canton ledger
 */
export async function allocateParty(
  partyHint: string,
  displayName: string
): Promise<string> {
  const token = generateJwt('operator');
  const res = await fetch(`${CANTON_URL}/v1/parties/allocate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      identifierHint: partyHint,
      displayName,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Party allocation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { result: { identifier: string } };
  return data.result.identifier;
}

/**
 * List all parties known to the ledger
 */
export async function listParties(): Promise<string[]> {
  const token = generateJwt('operator');
  const res = await fetch(`${CANTON_URL}/v1/parties`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list parties (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { result: { identifier: string; displayName?: string }[] };
  return data.result.map((p) => p.identifier);
}
