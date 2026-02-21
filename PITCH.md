# Cloak — Hackathon Pitch

**Canton ETHDenver Bounty | $8K, 3 Winners**

Judging criteria: Technical implementation, privacy model innovation, utility/impact, documentation/demo quality.

---

## Opening Hook (15 sec)

> "Every company shares secrets through Slack DMs. API keys, passwords, credentials — sitting in plaintext on Slack's servers forever. Admins can read them. They never expire. One breach and everything leaks."
>
> "We built **Cloak** — a privacy black box where secrets travel through Canton and literally don't exist anywhere else."

---

## The Problem (30 sec)

**Target: Enterprise / institutional secret sharing**

- **Slack DMs:** Admins can read them. Persist forever on Slack's servers. One breach = everything.
- **Email:** Plaintext on multiple servers. Forwarded endlessly.
- **Shared vaults (1Password, etc.):** Centralized — single point of failure.
- **Public blockchains (Ethereum, Solana):** ALL data is public. You'd need ZK circuits, encryption layers, complex infrastructure.

> "Institutions need to share credentials with partners, rotate API keys with team members, prove to auditors that keys are valid — all without the actual secret ever being exposed. Today, there's no good way to do this."

---

## The Solution (45 sec)

> "Cloak is a Slack bot where you type `/cloak-send aws-key @bob`, paste your secret, and it travels through Canton. Here's what's different:"

### Three killer features

1. **Secrets are ABSENT, not encrypted** — Canton's sub-transaction privacy means the secret contract only exists on Alice's and Bob's nodes. Other nodes on the network don't have it encrypted — they don't have it at all. It's as if the data never existed.

2. **Zero-knowledge viewing** — When Bob gets a notification, he clicks a one-time link. The secret is encrypted in Alice's browser with Bob's public key (RSA-OAEP + AES-256-GCM), stored as ciphertext on Canton, and decrypted only in Bob's browser using a private key that never leaves his device. The bot server never sees the plaintext. Slack never sees it. Only Browser → Canton → Browser.

3. **Self-destructing contracts** — Bob clicks "Acknowledge" and the Canton contract is archived. The secret is permanently gone from the ledger. Combined with TTL expiration (30 seconds to 7 days), secrets have a guaranteed shelf life.

---

## Why Only Canton Can Do This (30 sec)

> "This is the slide that matters. On Ethereum, all transaction data is public — everyone sees everything. To build this on Ethereum, you'd need homomorphic encryption or ZK circuits for every read and write. That's months of cryptography engineering."
>
> "On Canton, we wrote **5 Daml contract templates** and got protocol-level privacy for free. The `SecretTransfer` contract has `signatory sender, observer recipient` — Canton's runtime guarantees that no other participant ever receives this data. It's not an encryption layer we bolted on. It's the ledger's architecture."

---

## Live Demo Script (60 sec)

| Step | Who | Action | What the audience sees |
|------|-----|--------|----------------------|
| 1 | Alice | `/cloak-register` | Gets a Canton party identity + DM with encryption key setup link |
| 2 | Alice | Opens setup link in browser | Browser generates RSA-OAEP 2048-bit keypair. Private key stored in IndexedDB (never leaves device). Public key sent to server. |
| 3 | Bob | `/cloak-register` + sets up keys | Same flow — now both have encryption keys |
| 4 | Alice | `/cloak-send prod-api-key @bob` | Gets a 10-minute compose link |
| 5 | Alice | Opens compose link, pastes API key, picks "5 minute" TTL | Browser fetches Bob's public key, encrypts with AES-256-GCM + RSA-OAEP, POSTs ciphertext. **Plaintext never leaves Alice's browser.** |
| 6 | Bob | Receives DM | One-time link + live countdown timer |
| 7 | Bob | Clicks the one-time link | Secret decrypted in Bob's browser using his IndexedDB private key. Fetched from Canton via 60-second read-only JWT. |
| 8 | Bob | `/cloak-inbox` → clicks "Acknowledge Receipt" | Contract archived. Secret permanently gone from Canton. |
| 9 | Anyone | Try the link again | 410 Gone — one-time token already consumed |

> "From send to acknowledge, the plaintext secret existed only in two browsers. Not Slack's servers. Not our bot server. Not any other node on the network. And now it's gone forever."

---

## What the Daml Contracts Enable (30 sec — roadmap / depth)

> "Beyond Share mode, our Daml contracts support a full Verify mode — prove a credential is valid without revealing it."

- **`SecretCommitment`** — stores only a SHA-256 hash of the secret. The actual secret is never on the ledger.
- **`VerificationResult`** — records that a live API call (AWS STS, Stripe, GitHub) succeeded against the hash.
- **`SharedProof`** — lets you share the result with an auditor who sees "AWS | Passed | Account 123456" but never the key itself.

> "All enforced at the contract level — `signatory owner, observer recipient`. Canton makes it impossible for the auditor to see anything beyond what the contract exposes."

---

## Closing (15 sec)

> "Cloak. Institutional-grade secret sharing where the secret literally doesn't exist anywhere it shouldn't. Built on Canton because this is the one thing only Canton can do."

---

## Q&A Prep

### Q: How is this different from just encrypting a Slack message?

A: Encrypted messages still sit on Slack's servers. An admin or breach exposes the ciphertext. With Canton, the data is absent from non-party nodes — there's nothing to decrypt because there's nothing there. And we add E2E encryption on top: the bot server itself never sees the plaintext.

### Q: What if the bot server is compromised?

A: The bot is a coordinator, not a custodian. Secrets are encrypted in the sender's browser and decrypted in the recipient's browser. The bot only ever handles ciphertext. The private keys live in the browser's IndexedDB (non-extractable). The viewer uses a 60-second read-only JWT — Canton serves the encrypted contract directly to the browser, which decrypts locally.

### Q: Why Slack and not a standalone app?

A: Because this is where institutions actually share secrets today. Meeting users where they are. Slack Socket Mode means no public URLs, no webhooks — the bot connects outbound only, reducing attack surface.

### Q: What about the Verify mode?

A: The Daml contracts fully support it — `SecretCommitment`, `VerificationResult`, `SharedProof` are all implemented and tested in our Daml scripts. Share mode with the zero-knowledge web viewer is the working MVP. Verify mode is the next feature, and the contracts are ready for it.

### Q: How does the E2E encryption work?

A: Hybrid encryption. The sender's browser generates a random AES-256 key, encrypts the secret with AES-256-GCM, then encrypts the AES key with the recipient's RSA-OAEP public key. The resulting envelope `{v:1, k, iv, t, c}` is what gets stored on Canton. Only the recipient's browser has the private key (in IndexedDB, non-extractable) to reverse this.

### Q: What happens if the recipient loses their browser / clears storage?

A: The private key is in IndexedDB. If cleared, they'd need to re-register (`/cloak-register`) and set up new keys. Any secrets encrypted with the old key would be unrecoverable — by design. This is a feature, not a bug: it means there's no master key or recovery backdoor.

---

## Bounty Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Functional Deployment on DevNet | Ready | v2 API support, deploy-devnet.sh, .env.devnet |
| Meaningful Daml Usage | Strong | 5 contract templates with proper signatory/observer, keys, choices |
| Open Source | Yes | Public GitHub repo |
| Documentation | Strong | Detailed README with setup, architecture, security model, E2E encryption flow |
| Working Demo | Record using script above | 2-5 min video following the demo script |
| UI/UX | Web viewer + Slack | One-time links, zero-knowledge browser viewer, compose page, key setup flow |
| Privacy Model Demo | Core strength | Party isolation + E2E encryption: sender encrypts in browser, recipient decrypts in browser, Canton ensures contract visibility is limited to parties only |

---

## Technical Architecture (for deep-dive questions)

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

## The Soundbite

**"Absent, not encrypted."**

On every other platform, your secret is encrypted and stored somewhere. On Canton, it doesn't exist on non-party nodes at all. And with our E2E encryption, even the party nodes only have ciphertext — the plaintext lives only in the browser, only for the moment you need it.

---

## Pitch Style Reminders

- Lead with the PROBLEM (everyone does this wrong today)
- "Absent, not encrypted" is the memorable soundbite — repeat it
- Live demo > slides. Show the one-time link dying after use (410 Gone).
- Don't oversell Verify mode — be honest: "contracts support it, Share mode is the MVP"
- Frame as enterprise/institutional: "banks sharing API keys with partners", "compliance teams verifying credentials"
- The E2E encryption story is strong — emphasize that the bot server itself is not trusted with secrets
