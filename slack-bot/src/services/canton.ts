/**
 * Canton JSON API HTTP client
 * Communicates with the Canton ledger via the JSON API (default port 7575)
 */

import { generateJwt } from '../utils/jwt';

const CANTON_URL = process.env.CANTON_JSON_API_URL || 'http://localhost:7575';

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
    templateId: `Main:${templateId}`,
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
    templateId: `Main:${templateId}`,
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
    templateIds: [`Main:${templateId}`],
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
    templateId: `Main:${templateId}`,
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
