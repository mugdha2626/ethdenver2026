# Cloak — ETHDenver 2026 Submission

**Canton L1 Bounty | Privacy-First Secret Sharing**

---

## Video Script (3 minutes)

### HOOK (0:00 - 0:15)

"I'll Slack you the password." Every engineer has said it. Every company does it. API keys, database credentials, production secrets — pasted into Slack DMs, sitting in plaintext on Slack's servers forever. Admins can read them. They never expire. One breach and everything leaks.

We built Cloak — a Slack bot where secrets travel through Canton's privacy ledger and literally don't exist anywhere else.

### THE PROBLEM (0:15 - 0:45)

The alternatives aren't better.

Email? Plaintext on multiple servers. Forwarded endlessly.

Password vaults like 1Password? Centralized. Single point of failure. If their server is breached, everything leaks.

Public blockchains? Ethereum, Solana — every transaction is public. Every node sees everything. To build private secret sharing on Ethereum, you'd need ZK circuits, homomorphic encryption, and months of cryptography engineering just to hide a single API key.

The industry has no good answer for sharing a secret and knowing — truly knowing — that it can't leak.

### THE SOLUTION (0:45 - 1:30)

Cloak changes this with one groundbreaking idea: trust no one.

Here's how it works. Alice types `/cloak-send aws-key @bob` in Slack. She gets a compose link. She opens it in her browser, pastes the secret, picks a TTL — say five minutes.

Her browser generates a random AES-256 key, encrypts the secret, then encrypts that AES key with Bob's RSA public key. The ciphertext — and only the ciphertext — gets posted to Canton.

Bob gets a DM with a one-time link and a live countdown timer. He clicks it. His browser fetches the encrypted contract from Canton using a sixty-second read-only JWT, decrypts it with his private key from IndexedDB, and displays the secret.

Bob clicks "Acknowledge Receipt." The Canton contract archives itself. The secret is permanently gone from the ledger.

From start to finish, the plaintext existed in exactly two places: Alice's browser and Bob's browser. Not Slack's servers. Not our bot server. Not Canton. And now it's gone forever.

### WHY ONLY CANTON (1:30 - 2:00)

This is the part that matters. Three independent privacy layers — each one sufficient on its own. We stack all three.

**Layer one — Canton's sub-transaction privacy.** The SecretTransfer contract lives only on the sender's and recipient's nodes. Every other participant on the network has nothing. Not encrypted nothing — actual nothing. The data was never sent to them.

**Layer two — end-to-end browser encryption.** Before the secret even reaches Canton, it's encrypted in the browser. The private key lives in IndexedDB and never leaves the device. Even Canton only stores ciphertext.

**Layer three — everything is ephemeral.** One-time links. Sixty-second read-only tokens. Auto-clearing viewers. Acknowledge receipt and the contract self-destructs.

We wrote five Daml contract templates and got protocol-level privacy that would take months to build on any other chain. That's not a shortcut — that's the right tool for the job.

### LIVE DEMO (2:00 - 2:45)

*[Screen recording of Slack + browser]*

Watch — Alice registers with `/cloak-register`, sets up her encryption keys in the browser. Bob does the same.

Alice runs `/cloak-send prod-api-key @bob`. Opens the compose link. Pastes a test AWS key. Picks five-minute expiry. Hits send.

Bob gets a DM — one-time link with a countdown. Clicks it. The secret appears in his browser — decrypted locally. He runs `/cloak-inbox`, hits "Acknowledge Receipt." Contract archived. Done.

Now try that link again — 410 Gone. The one-time token is consumed. The secret is off the ledger. It doesn't exist anymore.

### CLOSING (2:45 - 3:00)

Cloak. The only way to share a secret where the secret literally doesn't exist anywhere it shouldn't. Absent, not encrypted. Built on Canton because this is the one thing only Canton can do.

---

## DevFolio: "The problem it solves"

### What people use it for

Every organization shares sensitive credentials — API keys, database passwords, signing keys, tokens — and today they do it through Slack DMs, email, or shared password vaults. All of these have fundamental problems:

- **Slack DMs** persist forever on Slack's servers. Workspace admins can read them. A single Slack breach exposes every secret ever shared.
- **Email** is plaintext across multiple servers, easily forwarded, and impossible to revoke.
- **Password vaults (1Password, LastPass)** are centralized single points of failure. If the vault provider is breached, everything leaks.
- **Public blockchains** make all transaction data visible to every node — fundamentally incompatible with secret sharing.

**Cloak solves this** by giving teams a familiar Slack interface (`/cloak-send`, `/cloak-inbox`) where secrets are:

1. **Encrypted in the sender's browser** before touching any server (RSA-OAEP + AES-256-GCM)
2. **Routed through Canton's privacy ledger** where non-party nodes never receive the data at all — not encrypted, absent
3. **Decrypted only in the recipient's browser** using a private key that never leaves the device
4. **Self-destructing** — acknowledge receipt and the contract archives permanently

**Use cases:**
- DevOps teams rotating production credentials
- Banks sharing API keys with integration partners
- Compliance teams proving credentials are valid without revealing them (Verify mode)
- Any organization that needs to share a secret and guarantee it can't leak

Cloak meets developers where they already work (Slack) and adds three independent layers of privacy that no other tool combines.

---

## DevFolio: "Challenges I ran into"

### Canton v2 API Migration (v1 sandbox → v2 DevNet)

The Canton sandbox uses the v1 JSON API (`/v1/create`, `/v1/query`), but Canton DevNet (Splice 0.5.10+) only supports v2 (`/v2/commands/submit-and-wait`, `/v2/state/active-contracts`). The request/response formats are completely different — v2 uses command wrappers with `CreateCommand`/`ExerciseCommand`, NDJSON streaming responses, and requires a two-step query flow (get ledger offset, then fetch active contracts).

**How we solved it:** Built a dual-mode Canton client (`CANTON_API_VERSION=v1|v2`) that abstracts the API differences. Each function branches on version — same Daml contracts, different HTTP call patterns. The v2 path handles NDJSON parsing, ledger offset management, Host header routing for nginx, and DAR auto-upload.

### True Zero-Knowledge Architecture

The initial version had the bot server see the plaintext secret (it was passed through the Slack modal). We realized this violated the "trust no one" principle — if the bot server is compromised, all secrets are exposed.

**How we solved it:** Moved all encryption/decryption to the browser. The `/cloak-send` flow now opens a separate compose page where the sender's browser fetches the recipient's RSA public key, generates a random AES-256-GCM key, encrypts the secret, encrypts the AES key with RSA-OAEP, and POSTs only the ciphertext envelope `{v:1, k, iv, t, c}` to Canton. The recipient's browser reverses the process using a private key stored in IndexedDB (non-extractable via `crypto.subtle`). The bot server never touches plaintext.

### Browser Crypto on HTTP (LAN Demo)

`crypto.subtle` (the Web Crypto API) only works on HTTPS or localhost. During hackathon demos over LAN (e.g., `http://192.168.x.x:3100`), the browser blocks all cryptographic operations. This broke the entire E2E encryption flow on demo devices.

**How we solved it:** Added a `node-forge` polyfill that activates automatically when `crypto.subtle` is unavailable. The fallback implements the same RSA-OAEP + AES-256-GCM hybrid encryption using forge's pure-JS crypto. The compose and viewer pages detect the environment and transparently switch between native WebCrypto and the forge fallback — same security guarantees, works on HTTP LAN.

### DevNet Validator Deployment

Canton DevNet requires connecting to external sequencer nodes (Tradeweb, Cumberland) via gRPC over TLS. The Docker containers' JVM trust store didn't trust some sequencer certificates, and some sequencers were returning placeholder Kubernetes Ingress certificates. Debugging required checking TLS from inside Docker containers, verifying DNS resolution, and diagnosing HOCON config generation from environment variables.

**How we solved it:** Methodical diagnosis — checked openssl from host vs Docker, verified Java cacerts, identified that Cumberland sequencers had self-signed fake certificates (server-side issue). Used the validator's infinite retry mechanism while waiting for infrastructure fixes. Built the entire codebase to be dual-mode (v1 sandbox for development, v2 DevNet for deployment) so development was never blocked.

---

## Technical Architecture

```
Sender's Browser                    Canton Ledger                    Recipient's Browser
     |                                   |                                   |
     |  1. Generate AES-256 key          |                                   |
     |  2. Encrypt secret (AES-GCM)      |                                   |
     |  3. Encrypt AES key (RSA-OAEP     |                                   |
     |     with recipient's public key)  |                                   |
     |  4. POST ciphertext envelope      |                                   |
     |  ────────────────────────────────> |                                   |
     |                                   |  5. SecretTransfer contract        |
     |                                   |     created (ciphertext only)      |
     |                                   |     visible to sender + recipient  |
     |                                   |     ABSENT from all other nodes    |
     |                                   |                                   |
     |                                   |  6. One-time link via Slack DM     |
     |                                   |  ────────────────────────────────> |
     |                                   |                                   |
     |                                   |  7. 60-sec read-only JWT           |
     |                                   | <──────────────────────────────── |
     |                                   |                                   |
     |                                   |  8. Fetch encrypted contract       |
     |                                   | ──────────────────────────────── >|
     |                                   |                                   |
     |                                   |     9. Decrypt AES key (RSA-OAEP  |
     |                                   |        with private key from      |
     |                                   |        IndexedDB)                 |
     |                                   |    10. Decrypt secret (AES-GCM)   |
     |                                   |    11. Display plaintext          |
     |                                   |                                   |
     |                                   | <── 12. Acknowledge ────────────  |
     |                                   |                                   |
     |                                   |  13. Contract archived.           |
     |                                   |      Secret gone forever.         |
```

**What never sees the plaintext:** Slack, the bot server, Canton (stores only ciphertext), any non-party Canton node.

**What sees the plaintext:** Sender's browser (transiently), recipient's browser (transiently).

---

## Daml Contracts (5 templates)

| Contract | Purpose | Signatory | Observer | Privacy Guarantee |
|----------|---------|-----------|----------|-------------------|
| `UserIdentity` | Slack-to-Canton party mapping | operator | user | Registration data only on operator + user nodes |
| `SecretCommitment` | SHA-256 hash of secret (Verify mode) | owner | operator | Only hash stored — never the secret |
| `VerificationResult` | Live API verification outcome | operator | owner | Result on operator + owner nodes only |
| `SharedProof` | Verification receipt for auditor | owner | recipient | Auditor sees result, never the secret |
| `SecretTransfer` | E2E encrypted secret transfer (Share mode) | sender | recipient, operator | Ciphertext only on party nodes; absent everywhere else |

---

## Stack

- **Daml** — 5 smart contract templates with proper signatory/observer privacy
- **Canton Sandbox / DevNet** — Privacy-first L1 ledger (v1 + v2 API support)
- **TypeScript / Node.js** — Slack bot + Express web server
- **@slack/bolt** — Socket Mode (no webhooks, no public URLs)
- **Web Crypto API + node-forge** — RSA-OAEP + AES-256-GCM hybrid encryption in browser
- **SQLite** — Local storage for party mappings, encryption keys, tokens
- **Express** — Reverse proxy to Canton API, key setup, compose, and viewer pages

---

## Bounty Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Functional Deployment on Canton L1 | Yes | Dual-mode v1 (sandbox) + v2 (DevNet) support |
| Meaningful Daml Usage | Strong | 5 contract templates with signatory/observer, contract keys, choices |
| Open Source | Yes | Public GitHub repo |
| README with setup instructions | Yes | Full setup guide with prerequisites, Slack app config, env vars |
| Privacy model explanation | Yes | Three-layer privacy model documented in README and PITCH |
| Working Demo (2-5 min video) | Yes | Live Slack demo: register, send, view, acknowledge, link death |
| UI/UX | Web + Slack | Key setup page, compose page, viewer page, Slack Block Kit UI |
| Reproducible | Yes | `npm install && npm run dev` with Canton sandbox |

---

## Q&A Prep

**Q: How is this different from encrypting a Slack message?**
A: Encrypted messages still sit on Slack's servers. An admin or breach exposes ciphertext. With Canton, data is absent from non-party nodes — nothing to find. And we add E2E encryption on top: even the party nodes only hold ciphertext.

**Q: What if the bot server is compromised?**
A: The bot is a coordinator, not a custodian. It only handles ciphertext. Private keys live in browser IndexedDB (non-extractable). The viewer uses a 60-second read-only JWT. The bot server literally cannot see the secret.

**Q: Why Slack and not a standalone app?**
A: This is where secrets get shared today. Meeting users where they are. Socket Mode means no public URLs, no webhooks — outbound-only connections, minimal attack surface.

**Q: How does the E2E encryption work?**
A: Hybrid encryption. Sender's browser generates random AES-256-GCM key, encrypts the secret, then encrypts the AES key with recipient's RSA-OAEP 2048-bit public key. The envelope `{v:1, k, iv, t, c}` is stored on Canton. Only the recipient's browser can reverse it.

**Q: What if the recipient loses their browser data?**
A: They re-register and generate new keys. Secrets encrypted with the old key are unrecoverable — by design. No master key. No recovery backdoor.

---

## The Soundbite

**"Absent, not encrypted."**

On every other platform, your secret is encrypted and stored somewhere. On Canton, it doesn't exist on non-party nodes at all. And with our E2E encryption, even the party nodes only have ciphertext. The plaintext lives only in the browser, only for the moment you need it.
