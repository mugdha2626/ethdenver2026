/**
 * Canton JSON API HTTP client
 * Supports both v1 (local sandbox, port 7575) and v2 (DevNet/production)
 *
 * Set CANTON_API_VERSION=v2 in .env to switch to the v2 JSON Ledger API.
 * v2 uses different endpoints, request formats, and template ID conventions.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { generateJwt, generateAdminToken } from '../utils/jwt';

const API_VERSION = process.env.CANTON_API_VERSION || 'v1';
const CANTON_URL = process.env.CANTON_JSON_API_URL || 'http://localhost:7575';
const PACKAGE_NAME = process.env.CANTON_PACKAGE_NAME || 'confidential-connect';
const APP_USER_ID = 'confidential-connect';

// Package ID cache (v1 only — v2 uses #packageName format)
let packageId: string | null = null;

// Operator party full identifier — set at startup
let operatorParty: string = 'operator';

export function setOperatorParty(party: string): void {
  operatorParty = party;
}

export function getOperatorParty(): string {
  return operatorParty;
}

// ──────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────

export interface ContractResult {
  contractId: string;
  payload: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// Auth helper
// ──────────────────────────────────────────────

function getToken(party?: string): string {
  // Pre-issued token takes priority (e.g., DevNet admin token)
  if (process.env.CANTON_AUTH_TOKEN) return process.env.CANTON_AUTH_TOKEN;
  if (API_VERSION === 'v2') return generateAdminToken();
  return generateJwt(party || operatorParty);
}

// ──────────────────────────────────────────────
// Template ID formatting
// ──────────────────────────────────────────────

function fullTemplateId(templateName: string): string {
  if (API_VERSION === 'v2') {
    // v2 supports #packageName:Module:Entity (no package hash needed)
    return `#${PACKAGE_NAME}:Main:${templateName}`;
  }
  // v1 requires packageId:Module:Entity
  if (!packageId) {
    throw new Error('Package ID not discovered. Call discoverPackageId() first.');
  }
  return `${packageId}:Main:${templateName}`;
}

// ──────────────────────────────────────────────
// V1 low-level fetch
// ──────────────────────────────────────────────

async function v1Fetch(
  endpoint: string,
  party: string,
  body: Record<string, unknown>
): Promise<{ result: any; status: number }> {
  const token = getToken(party);
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

  return res.json() as Promise<{ result: any; status: number }>;
}

// ──────────────────────────────────────────────
// V2 low-level fetch
// ──────────────────────────────────────────────

async function v2Fetch(
  endpoint: string,
  method: string = 'POST',
  body?: unknown
): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${CANTON_URL}${endpoint}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canton v2 API error (${res.status}): ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

/** Get the current ledger end offset (v2 only — needed for active-contracts queries) */
async function v2GetLedgerEnd(): Promise<number> {
  const data = await v2Fetch('/v2/state/ledger-end', 'GET');
  return data.offset ?? 0;
}

// ──────────────────────────────────────────────
// Package / DAR management
// ──────────────────────────────────────────────

/**
 * v1: Extract package ID from the DAR file (needed for template IDs)
 * v2: Upload the DAR to Canton (template IDs use package name, no hash needed)
 */
export async function discoverPackageId(): Promise<string> {
  if (API_VERSION === 'v2') {
    await uploadDar();
    packageId = PACKAGE_NAME;
    return PACKAGE_NAME;
  }

  // ── V1 ──
  if (packageId) return packageId;

  const darPath =
    process.env.DAR_PATH ||
    path.resolve(__dirname, '../../../daml/.daml/dist/confidential-connect-0.1.0.dar');

  try {
    const output = execSync(`unzip -l "${darPath}" 2>/dev/null`).toString();
    const match = output.match(/confidential-connect-0\.1\.0-([a-f0-9]+)\.dalf/);
    if (match) {
      packageId = match[1];
      console.log(`  Package ID (from DAR): ${packageId.substring(0, 16)}...`);
      return packageId;
    }
  } catch {
    // Fall through to API discovery
  }

  // Fallback: try each package on the ledger
  console.log('  DAR parsing failed, falling back to API discovery...');
  const token = getToken(operatorParty);
  const res = await fetch(`${CANTON_URL}/v1/packages`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list packages: ${res.status}`);
  }

  const data = (await res.json()) as { result: string[] };
  for (const pkgId of data.result) {
    const testRes = await fetch(`${CANTON_URL}/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ templateIds: [`${pkgId}:Main:UserIdentity`] }),
    });
    if (testRes.ok) {
      const testData = (await testRes.json()) as { status: number };
      if (testData.status === 200) {
        const testRes2 = await fetch(`${CANTON_URL}/v1/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ templateIds: [`${pkgId}:Main:SecretTransfer`] }),
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
    'Could not find confidential-connect package. Is the DAR uploaded to the sandbox?'
  );
}

/**
 * Upload the DAR file to Canton v2
 */
async function uploadDar(): Promise<void> {
  const darPath =
    process.env.DAR_PATH ||
    path.resolve(__dirname, '../../../daml/.daml/dist/confidential-connect-0.1.0.dar');

  try {
    const darData = readFileSync(darPath);
    const token = getToken();
    const res = await fetch(`${CANTON_URL}/v2/packages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${token}`,
      },
      body: darData,
    });

    if (res.ok) {
      console.log('  DAR uploaded to Canton');
    } else {
      const text = await res.text();
      // Not fatal if package already exists
      if (text.includes('ALREADY_EXISTS') || text.includes('duplicate')) {
        console.log('  DAR already uploaded');
      } else {
        console.warn(`  DAR upload warning (${res.status}): ${text.substring(0, 200)}`);
      }
    }
  } catch (err) {
    console.warn(`  DAR upload skipped: ${err instanceof Error ? err.message : err}`);
  }
}

// ──────────────────────────────────────────────
// Create contract
// ──────────────────────────────────────────────

export async function createContract(
  party: string,
  templateName: string,
  payload: Record<string, unknown>
): Promise<ContractResult> {
  if (API_VERSION === 'v2') {
    const data = await v2Fetch('/v2/commands/submit-and-wait-for-transaction', 'POST', {
      commands: [
        {
          CreateCommand: {
            templateId: fullTemplateId(templateName),
            createArguments: payload,
          },
        },
      ],
      userId: APP_USER_ID,
      commandId: randomUUID(),
      actAs: [party],
      readAs: [party],
    });

    // Extract CreatedEvent from the transaction response
    const events = data?.transaction?.events || [];
    for (const event of events) {
      if (event.CreatedEvent) {
        return {
          contractId: event.CreatedEvent.contractId,
          payload: event.CreatedEvent.createArgument || event.CreatedEvent.createArguments || {},
        };
      }
    }

    // Fallback: return updateId as contractId if no events parsed
    if (data?.transaction?.updateId) {
      return { contractId: data.transaction.updateId, payload };
    }
    throw new Error('No CreatedEvent found in v2 transaction response');
  }

  // ── V1 ──
  const body = { templateId: fullTemplateId(templateName), payload };
  const res = await v1Fetch('create', party, body);
  return res.result as ContractResult;
}

// ──────────────────────────────────────────────
// Exercise choice
// ──────────────────────────────────────────────

export async function exerciseChoice(
  party: string,
  templateName: string,
  contractId: string,
  choice: string,
  argument: Record<string, unknown> = {}
): Promise<ContractResult> {
  if (API_VERSION === 'v2') {
    await v2Fetch('/v2/commands/submit-and-wait-for-transaction', 'POST', {
      commands: [
        {
          ExerciseCommand: {
            templateId: fullTemplateId(templateName),
            contractId,
            choice,
            choiceArgument: argument,
          },
        },
      ],
      userId: APP_USER_ID,
      commandId: randomUUID(),
      actAs: [party],
      readAs: [party],
    });

    return { contractId, payload: {} };
  }

  // ── V1 ──
  const body = {
    templateId: fullTemplateId(templateName),
    contractId,
    choice,
    argument,
  };
  const res = await v1Fetch('exercise', party, body);
  return res.result as ContractResult;
}

// ──────────────────────────────────────────────
// Query active contracts
// ──────────────────────────────────────────────

export async function queryContracts(
  party: string,
  templateName: string,
  filter?: Record<string, unknown>
): Promise<ContractResult[]> {
  if (API_VERSION === 'v2') {
    // Get current ledger offset (required for v2 active-contracts query)
    const offset = await v2GetLedgerEnd();

    const data = await v2Fetch('/v2/state/active-contracts', 'POST', {
      filter: {
        filtersByParty: {
          [party]: {
            cumulative: [
              {
                identifierFilter: {
                  TemplateFilter: {
                    value: {
                      templateId: fullTemplateId(templateName),
                      includeCreatedEventBlob: false,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: true,
      activeAtOffset: offset,
    });

    // Parse response — handle multiple possible response shapes
    const entries = Array.isArray(data)
      ? data
      : data?.contractEntries || data?.result || [];

    const results: ContractResult[] = [];

    for (const entry of entries) {
      const active =
        entry?.contractEntry?.JsActiveContract ||
        entry?.JsActiveContract ||
        entry;

      const ce = active?.createdEvent;
      if (!ce?.contractId) continue;

      const contractPayload = ce.createArgument || ce.createArguments || {};

      // Apply client-side filter (v2 doesn't support field-level filtering)
      if (filter) {
        const matches = Object.entries(filter).every(
          ([k, v]) => contractPayload[k] === v
        );
        if (!matches) continue;
      }

      results.push({ contractId: ce.contractId, payload: contractPayload });
    }

    return results;
  }

  // ── V1 ──
  const body: Record<string, unknown> = {
    templateIds: [fullTemplateId(templateName)],
  };
  if (filter) {
    body.query = filter;
  }
  const res = await v1Fetch('query', party, body);
  return res.result as ContractResult[];
}

// ──────────────────────────────────────────────
// Fetch contract by key
// ──────────────────────────────────────────────

export async function fetchByKey(
  party: string,
  templateName: string,
  key: unknown
): Promise<ContractResult | null> {
  if (API_VERSION === 'v2') {
    // v2 has no direct fetch-by-key — query all and match client-side
    const all = await queryContracts(party, templateName);
    for (const contract of all) {
      // Daml keys are typically tuples like [party, label]
      if (Array.isArray(key) && key.length === 2) {
        const p = contract.payload;
        if (
          (p.owner === key[0] && p.label === key[1]) ||
          (p.operator === key[0] && p.slackUserId === key[1])
        ) {
          return contract;
        }
      }
    }
    return null;
  }

  // ── V1 ──
  const body = { templateId: fullTemplateId(templateName), key };
  try {
    const res = await v1Fetch('fetch', party, body);
    return res.result as ContractResult;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// Party management
// ──────────────────────────────────────────────

export async function allocateParty(
  partyHint: string,
  displayName: string
): Promise<string> {
  if (API_VERSION === 'v2') {
    const data = await v2Fetch('/v2/parties', 'POST', {
      partyIdHint: partyHint,
      identityProviderId: '',
    });
    return data.partyDetails.party;
  }

  // ── V1 ──
  const token = getToken('operator');
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

export async function listParties(): Promise<string[]> {
  if (API_VERSION === 'v2') {
    const data = await v2Fetch('/v2/parties', 'GET');
    return (data.partyDetails || []).map((p: any) => p.party);
  }

  // ── V1 ──
  const token = getToken('operator');
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

  const data = (await res.json()) as {
    result: { identifier: string; displayName?: string }[];
  };
  return data.result.map((p) => p.identifier);
}
