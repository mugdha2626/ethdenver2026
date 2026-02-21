# Cloak

**A privacy black box for secrets, powered by Canton + Slack.**

Share secrets securely. Prove credentials are valid without revealing them. Canton's sub-transaction privacy means secrets literally don't exist on non-party nodes — not encrypted, just absent.

---

## What It Does

### Mode 1: SHARE — Securely transfer a secret
```
Alice has an AWS key. Bob needs it.

Alice → /cloak-send aws @bob → pastes key in modal
Canton creates a contract visible ONLY to Alice and Bob.
Bob → /cloak-inbox → sees the key → clicks Acknowledge
Contract archived. Key gone from Canton. No Slack logs. No email trail.
```

### Mode 2: VERIFY — Prove a secret is valid without revealing it
```
Alice has an AWS key. Auditor needs to confirm it works.

Alice → /cloak-commit aws → hashes key on Canton
Alice → /cloak-verify aws → live API call confirms it's valid
Alice → /cloak-prove aws @auditor → shares RESULT (not key)

Auditor sees: "AWS | Passed | Account 123456789012"
Auditor NEVER sees: the actual key
```

---

## Why Canton?

On **Ethereum/Solana**: Data is public. You'd need ZK proofs, encryption layers, and complex circuits.

On **Canton**: Contracts are visible **only to their parties**. If Alice creates a contract with Bob, that data doesn't exist on anyone else's node. It's not encryption — it's absence.

**Why this beats Slack DMs / email / shared vaults:**
- Slack DMs: Admins can read them. Persist forever on Slack's servers.
- Email: Plaintext. Forwarded. Stored on multiple servers.
- 1Password: Centralized — if compromised, everything leaks.
- **Canton**: Secret exists only on two party nodes. When archived, it's gone. No central server ever had it.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              SLACK WORKSPACE                  │
│                                              │
│  SHARE MODE          VERIFY MODE             │
│  /cloak-send            /cloak-commit              │
│  /cloak-inbox           /cloak-verify              │
│  /cloak-status          /cloak-prove               │
│                      /cloak-audit               │
│                      /cloak-register            │
└──────────────┬───────────────────────────────┘
               │ Socket Mode (WebSocket)
┌──────────────┴───────────────────────────────┐
│         SLACK BOT (Node.js / TypeScript)      │
│  @slack/bolt + Canton JSON API client         │
│  + Pluggable verifiers (AWS, Stripe, GitHub)  │
│  + SQLite (party mappings, salts)             │
└──────────────┬───────────────────────────────┘
               │ HTTP (JSON API, port 7575)
┌──────────────┴───────────────────────────────┐
│           CANTON SANDBOX (Daml)               │
│  5 contract templates:                        │
│  • UserIdentity     (Slack ↔ Canton party)    │
│  • SecretCommitment (hash of secret)          │
│  • VerificationResult (live API result)       │
│  • SharedProof      (result for auditor)      │
│  • SecretTransfer   (actual secret transfer)  │
└──────────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js** v18+
- **Java 11+** (for Canton/Daml sandbox)
- **Daml SDK** 2.9.3+
- A **Slack workspace** where you can create apps

---

## Setup

### 1. Install Daml SDK

```bash
curl -sSL https://get.daml.com/ | sh
export PATH=$PATH:$HOME/.daml/bin
echo 'export PATH=$PATH:$HOME/.daml/bin' >> ~/.zshrc
```

If you need Java 11:
```bash
brew install openjdk@11
sudo ln -sfn $(brew --prefix openjdk@11)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-11.jdk
export JAVA_HOME=$(/usr/libexec/java_home -v 11)
```

### 2. Build Daml Contracts

```bash
cd daml/
daml build
```

This produces `daml/.daml/dist/cloak-0.1.0.dar`.

### 3. Start Canton Sandbox

```bash
cd daml/
daml sandbox --dar .daml/dist/cloak-0.1.0.dar --port 6865 &
sleep 10
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens
```

Leave this running. The sandbox listens on port 6865 (gRPC) and the JSON API on port 7575 (HTTP).

### 4. Create Slack App

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. **Socket Mode** (left sidebar) → toggle **ON** → create app-level token with `connections:write` scope → copy the `xapp-...` token
3. **OAuth & Permissions** → add Bot Token Scopes:
   - `commands`
   - `chat:write`
   - `users:read`
4. **Install App** → Install to Workspace → copy the `xoxb-...` token
5. **Slash Commands** → create all 8 commands (set Request URL to `https://placeholder.com` — Socket Mode ignores it):

| Command | Description |
|---------|-------------|
| `/cloak-register` | Register your Canton identity |
| `/cloak-commit` | Commit a secret hash |
| `/cloak-verify` | Verify a secret via live API |
| `/cloak-prove` | Share proof with someone |
| `/cloak-send` | Send a secret securely |
| `/cloak-inbox` | View received secrets |
| `/cloak-audit` | Auditor dashboard |
| `/cloak-status` | Your overview |

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
```

### 6. Start the Bot

```bash
cd slack-bot/
npm install
npm run dev
```

You should see:
```
  Connecting to Canton...
  Operator party: operator::1220...
  Package ID (from DAR): d9664c75...

  ╔══════════════════════════════════════════════════╗
  ║        Cloak is running!           ║
  ╚══════════════════════════════════════════════════╝
```

### 7. Multi-Device Demo Access

Cloak's web viewer needs to be reachable from the device opening the secret link. Three options:

**Option A: LAN (zero setup)**
If the demo devices are on the same Wi-Fi network, Cloak auto-detects your LAN IP and uses it for DM links. Nothing to configure.

**Option B: ngrok (recommended for demos)**
For internet-accessible links (e.g. audience phones on conference Wi-Fi):

1. Sign up at [ngrok.com](https://ngrok.com) and copy your authtoken
2. Add to `.env`:
   ```
   NGROK_AUTHTOKEN=your-token-here
   ```
3. Restart the bot — the startup banner will show the public ngrok URL and all DM links will use it automatically.

**Option C: Tailscale (persistent)**
For a stable URL across sessions, install [Tailscale](https://tailscale.com) and set `WEB_BASE_URL` manually:
```
WEB_BASE_URL=http://your-machine.tail1234.ts.net:3100
```

---

## Commands

### Registration
| Command | What it does |
|---------|-------------|
| `/cloak-register` | Creates a Canton party for your Slack identity. Run once. |

### Share Mode (send actual secrets)
| Command | What it does |
|---------|-------------|
| `/cloak-send <label> @user` | Opens a modal to paste a secret. Creates a Canton contract visible only to you and the recipient. |
| `/cloak-inbox` | Shows secrets sent to you. Each has an **Acknowledge** button that archives the contract. |
| `/cloak-status` | Overview of all your commitments, verifications, and transfers. |

### Verify Mode (prove without revealing)
| Command | What it does |
|---------|-------------|
| `/cloak-commit <label>` | Opens a modal to paste a secret. Hashes it (SHA-256 + salt) and stores only the hash on Canton. Secret is never stored. |
| `/cloak-verify <label>` | Opens a modal to re-enter the secret. Checks hash match, then calls the live external API (AWS STS, Stripe, GitHub). Records result on Canton. |
| `/cloak-prove <label> @user` | Shares the verification **result** (not the secret) with someone. They see "Passed, Account 123456" but never the key. |
| `/cloak-audit` | Shows all verification proofs shared with you. |

---

## Demo Script (5 min)

### Setup (before demo)
- Both users run `/cloak-register`
- Have a test GitHub PAT or AWS key ready

### Act 1: Share Mode (2 min)
```
Alice:  /cloak-send aws-key @bob
        → pastes AWS key in modal
        → "Secret sent to @bob. Only you and Bob can see this on Canton."

Bob:    /cloak-inbox
        → sees the actual key in ephemeral message
        → clicks [Acknowledge Receipt]
        → message replaced with "Secret archived!"

Alice:  /cloak-status
        → transfer no longer listed — contract archived, key gone from Canton
```

**Talking point:** "The key traveled through Canton — not Slack servers. Only Alice and Bob's nodes ever had it. After Bob acknowledged, the contract was archived. The data is gone."

### Act 2: Verify Mode (2 min)
```
Alice:  /cloak-commit github
        → pastes GitHub token in modal
        → "Secret committed. Hash: e7f8a9..."

Alice:  /cloak-verify github
        → re-enters token in modal
        → bot calls GitHub API → "GitHub verified! Username: octocat"

Alice:  /cloak-prove github @auditor
        → "Shared with @auditor. They can see the result but not your secret."

Auditor: /cloak-audit
        → sees: "@alice | github | Passed | octocat | Feb 19 2026"
        → cannot see: the token, the hash, or anything else
```

**Talking point:** "The auditor confirmed Alice's GitHub token is valid and saw the username. But they never saw the actual token. Canton enforces this at the protocol level."

### Act 3: Why Canton (30 sec)
"Two modes. Share mode sends real secrets through Canton's privacy black box. Verify mode proves secrets are valid without revealing them. Both powered by Canton's sub-transaction privacy — something no public blockchain can do."

---

## Supported Verifiers

| Service | API Called | Secret Format | Safe Response ID |
|---------|-----------|---------------|-----------------|
| AWS | `STS.getCallerIdentity()` | `ACCESS_KEY:SECRET_KEY` | Account ID |
| Stripe | `accounts.retrieve()` | `sk_live_xxx` or `sk_test_xxx` | Account ID |
| GitHub | `GET /user` | `ghp_xxx` | Username |

### Adding a Custom Verifier

Create a new file in `slack-bot/src/services/verifiers/`:

```typescript
import { registerVerifier, type VerificationOutput, type Verifier } from './index';

class MyVerifier implements Verifier {
  name = 'my-service';
  async verify(credential: string): Promise<VerificationOutput> {
    const res = await fetch('https://api.example.com/verify', {
      headers: { Authorization: `Bearer ${credential}` },
    });
    return {
      success: res.ok,
      responseId: 'account-123',
      permissions: ['read', 'write'],
      apiEndpoint: 'api.example.com/verify',
    };
  }
}

registerVerifier('my-service', new MyVerifier());
```

Then import it in `src/index.ts`.

---

## Project Structure

```
ethdenver2026/
  daml/
    daml.yaml                        # Daml project config
    Main.daml                        # 5 contract templates
  slack-bot/
    src/
      index.ts                       # Entry point
      commands/
        register.ts                  # /cloak-register
        commit.ts                    # /cloak-commit
        verify.ts                    # /cloak-verify
        prove.ts                     # /cloak-prove
        send.ts                      # /cloak-send
        inbox.ts                     # /cloak-inbox
        audit.ts                     # /cloak-audit
        status.ts                    # /cloak-status
      services/
        canton.ts                    # Canton JSON API client
        crypto.ts                    # SHA-256 + salt hashing
        verifiers/
          index.ts                   # Verifier interface + registry
          aws.ts                     # AWS STS verifier
          stripe.ts                  # Stripe verifier
          github.ts                  # GitHub verifier
      stores/
        db.ts                        # SQLite setup
        party-mapping.ts             # Slack ↔ Canton party mapping
        salt-store.ts                # Salt storage for commitments
      utils/
        jwt.ts                       # JWT for Canton JSON API auth
        slack-blocks.ts              # Slack Block Kit builders
    package.json
    tsconfig.json
  .env.example
  docker-compose.yml                 # Optional Docker setup
```

---

## Security Model

| What | Where it lives | Who can see it |
|------|---------------|----------------|
| Actual secret | Nowhere (hashed then discarded) | Only the user, transiently |
| SHA-256 hash | Canton (`SecretCommitment`) | Owner + bot |
| Salt | Local SQLite | Bot only |
| Verification result | Canton (`VerificationResult`) | Owner + bot |
| Shared proof | Canton (`SharedProof`) | Owner + recipient |
| Transferred secret | Canton (`SecretTransfer`) | Sender + recipient only |

After acknowledge/archive, transferred secrets are gone from Canton entirely.

---

## Tech Stack

- **Daml** — Smart contract language for Canton
- **Canton Sandbox** — Privacy-first blockchain runtime
- **@slack/bolt** — Slack app framework (Socket Mode)
- **better-sqlite3** — Local storage for party mappings and salts
- **TypeScript** — Type-safe bot implementation
- **AWS SDK / Stripe SDK / GitHub API** — Live credential verification

---

Built for ETHDenver 2026.
