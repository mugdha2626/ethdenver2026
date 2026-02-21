# Cloak

**Privacy-first secret sharing over Slack, powered by Canton.**

Share credentials without the secret ever touching a server. Canton's sub-transaction privacy means secrets are *absent* from non-party nodes, not encrypted, just gone. We stack E2E browser encryption and ephemeral contracts on top.


## How It Works

1. **Register** — `/cloak-register` allocates a Canton party and creates a `UserIdentity` contract. User opens a setup link in the browser, which generates an RSA-OAEP 2048-bit keypair client-side. Private key stays in IndexedDB (non-extractable). Only the public key is uploaded.

2. **Send** — `/cloak-send api-key @bob` gives a compose link. The browser encrypts the secret with AES-256-GCM, wraps the AES key with Bob's RSA public key, and posts only the ciphertext envelope to Canton. Bob gets a one-time link, decrypts in his browser, acknowledges, and the contract self-destructs.

3. **Verify** — `/cloak-commit`, `/cloak-verify`, `/cloak-prove` let you hash a credential, verify it against a live API (AWS/Stripe/GitHub), and share the *result* with an auditor — without ever revealing the credential itself.

The plaintext exists only in two browsers, only for the moments they need it.

---

## Stack

- **Daml** — 5 contract templates (UserIdentity, SecretCommitment, VerificationResult, SharedProof, SecretTransfer)
- **Canton Sandbox / DevNet** — Privacy-first L1 ledger (v1 + v2 API support)
- **TypeScript / Node.js** — Slack bot + Express web server
- **@slack/bolt** — Socket Mode (no webhooks, no public URLs)
- **Web Crypto API + node-forge** — RSA-OAEP + AES-256-GCM hybrid encryption in browser
- **SQLite** — Party mappings, encryption keys, tokens
- **Express** — Reverse proxy to Canton API, key setup, compose, and viewer pages

---

## Prerequisites

- Node.js v18+
- Java 11+ (for Canton/Daml sandbox)
- Daml SDK 2.9.3+
- A Slack workspace where you can create apps

---

## Setup

### 1. Install Daml SDK

```bash
curl -sSL https://get.daml.com/ | sh
export PATH=$PATH:$HOME/.daml/bin
```

### 2. Build and start Canton

```bash
cd daml/
daml build
daml sandbox --dar .daml/dist/cloak-0.1.0.dar --port 6865 &
sleep 10
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens
```

### 3. Create Slack App

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. **Socket Mode** → ON → create app-level token (`connections:write`) → copy `xapp-...` token
3. **OAuth & Permissions** → add scopes: `commands`, `chat:write`, `users:read`
4. **Install to Workspace** → copy `xoxb-...` token
5. **Slash Commands** → create: `/cloak-register`, `/cloak-send`, `/cloak-inbox`
### 4. Configure and run

```bash
cp .env.example .env
# Edit .env with your SLACK_BOT_TOKEN and SLACK_APP_TOKEN

cd slack-bot/
npm install
npm run dev
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/cloak-register` | Create your Canton identity + browser encryption keys |
| `/cloak-send <label> @user` | Send an E2E encrypted secret via compose link |
| `/cloak-inbox` | View received secrets + acknowledge receipt |
---

## Security Model

Three independent privacy layers:

- **Canton sub-transaction privacy** — SecretTransfer contracts exist only on sender + recipient nodes. All other nodes have nothing.
- **E2E browser encryption** — Secrets are encrypted client-side before reaching Canton. Private keys never leave the browser (IndexedDB, non-extractable). Even Canton only stores ciphertext.
- **Ephemeral contracts** — One-time view links, 60-second read-only JWTs, auto-archiving on acknowledgement. After receipt, the secret is gone from the ledger.

The bot server is a coordinator that only ever handles ciphertext, it cannot see secrets even if compromised.


