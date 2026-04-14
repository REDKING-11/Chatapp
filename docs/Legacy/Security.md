# Security

This document describes the security model of the current Chatapp codebase as it exists in this repository today.

It is intentionally honest:

- If something is protected, it is described here.
- If something is not protected yet, that is also described here.
- If a feature exists but is not mature enough to claim strong guarantees, that is called out clearly.

This document is based on the current implementation in:

- `Application/` for the Electron client
- `chatapp-core/` for the PHP core API
- `SelfHServer/` for the self-hosted community backend

## Security status at a glance

### Account security

- Passwords are hashed on registration using PHP `password_hash(...)`.
- Login verification uses `password_verify(...)`.
- Sessions use random bearer tokens generated with `random_bytes(32)`.
- Session tokens currently expire after 30 days.
- The core API checks session expiry on authenticated requests.

### Channel and server message security

- Sending, editing, deleting, and reacting to channel messages requires a bearer token.
- Channel messages are not end-to-end encrypted.
- Channel messages are stored in plaintext JSON on the self-hosted backend.
- Message logs are also stored in plaintext and may retain previous message content after edits or deletes.
- Reading channel messages is currently not protected by authentication in `SelfHServer/routes/channel.routes.js`.

### Direct message security

- The Electron app contains a secure DM system with local encryption primitives.
- DM content is encrypted locally with AES-256-GCM.
- Per-device key exchange uses X25519.
- Device signing keys use Ed25519.
- Locally stored secure DM data is encrypted on disk with a key protected by Electron `safeStorage`.
- This is the strongest message protection currently present in the repository.
- However, this DM system should still be treated as implementation-stage security, not as an audited protocol.

### Transport security

- HTTPS can be used, but it is not enforced by the application code.
- The current codebase still supports plain HTTP endpoints.
- If Chatapp is deployed over HTTP, tokens, account data, and channel messages can be intercepted by the network path.

### Desktop client isolation

- The Electron renderer runs with `contextIsolation: true`.
- The Electron window is created with `sandbox: true`.
- `nodeIntegration` is disabled.
- Only explicit IPC APIs are exposed through the preload script.

## Architecture and trust boundaries

Chatapp currently has three security domains:

1. The Electron client in `Application/`
2. The core API in `chatapp-core/`
3. The self-hosted community backend in `SelfHServer/`

The trust model is split:

- The core API is trusted for identity, login, and session validation.
- The self-hosted backend is trusted for channel storage, message history, and server data.
- The client is trusted to hold the user's active session token and local state.

That means Chatapp does not currently operate as a zero-trust chat system. In particular:

- Server/channel operators can access channel message contents.
- Anyone with filesystem access to the self-hosted backend can read stored channel messages.
- Network operators can read traffic if the deployment uses HTTP instead of HTTPS.

## Account security

## Password handling

User passwords are not stored in plaintext in the core API database.

Current protections:

- Registration hashes passwords with PHP `password_hash(...)`.
- Login uses `password_verify(...)` against the stored hash.
- Passwords are only accepted through JSON request bodies.

Current limitations:

- Minimum password length is currently only 4 characters.
- There is no password complexity policy.
- There is no password reset flow in this repository.
- There is no multi-factor authentication.
- There is no brute-force or rate-limit protection visible in the login code.

## Session tokens

After login, the core API creates a random session token:

- generated with `bin2hex(random_bytes(32))`
- stored in the `sessions` table
- returned to the client as a bearer token
- valid for 30 days unless manually removed server-side

Authenticated requests work like this:

- The client stores the token locally.
- The token is sent as `Authorization: Bearer ...`.
- `chatapp-core/auth/me.php` and `chatapp-core/auth_required.php` verify that the token exists and is not expired.
- `SelfHServer/services/auth.service.js` forwards the token to the core API to confirm the user identity.

Current limitations:

- Session tokens are stored server-side as raw bearer tokens, not hashed session secrets.
- If the session table is exposed, active tokens could be replayed until they expire.
- No device/session management UI is visible in this repository.
- No logout endpoint was found in the current core API snapshot.

## Registration and identity data

The core API currently supports:

- username
- password
- optional email
- optional phone
- optional username tag support where the schema allows it

Current protections:

- Duplicate username checks
- Duplicate email checks
- Duplicate phone checks
- Optional username-tag uniqueness checks
- SQL statements use prepared queries

Current limitations:

- Email ownership verification is not present.
- Phone ownership verification is not present.
- There is no account recovery workflow shown in this repository.

## Message security

## Server and channel messages

Regular server/channel chat messages are protected differently from direct messages.

### In transit

For write operations, the self-hosted backend requires a valid bearer token before it will:

- send a message
- edit a message
- delete a message
- add or remove a reaction

The backend gets the user identity by calling the core API with the bearer token.

Important limitation:

- This protects against unauthenticated writes.
- It does not encrypt message content end-to-end.
- If the connection is over HTTP, the message content and bearer token can be observed in transit.

### At rest

Regular channel messages are currently stored in plaintext here:

- `SelfHServer/data/messages.json`
- `SelfHServer/data/messageLogs.json`

This means:

- The self-hosted backend operator can read channel messages.
- Anyone with server filesystem access can read channel messages.
- Messages are not encrypted at rest by the application itself.

### Access control

Current protections:

- Only authenticated users can create messages.
- Users can only edit their own messages.
- Users can only delete their own messages.
- Reactions are associated with authenticated user IDs.

Current limitations:

- `GET /api/channels/:channelId/messages` is currently unauthenticated.
- `GET /api/channels/:channelId/message-logs` is currently unauthenticated.
- No channel membership checks are present in these read routes.
- No server role or permission enforcement is visible around message reads.

This means that in the current self-hosted backend implementation, anyone who can reach the backend may be able to read channel messages and message logs.

### Deletion behavior

Deleting a channel message does not fully erase it from storage.

Current behavior:

- The visible message content is replaced with `[deleted]`.
- `isDeleted` is set to `true`.
- A message log entry is written.
- The log entry records the old content before deletion.

Security consequence:

- Message deletion is currently a soft delete, not secure erasure.
- Historical message content may remain available in logs.

## Direct messages

The Electron app contains a separate secure DM subsystem in `Application/src/main/dm/`.

### What is protected

The secure DM implementation currently includes:

- per-device identity generation
- X25519 key exchange
- Ed25519 signing key generation
- per-conversation symmetric keys
- AES-256-GCM payload encryption
- encrypted local DM storage
- disappearing message support through local TTL pruning

Local secure DM storage is protected as follows:

- A random master key is generated locally.
- That key is protected with Electron `safeStorage`, which relies on OS-backed secure storage.
- The secure DM store is written to `store.json.enc`.
- The stored payload is encrypted with AES-256-GCM.

### What this means

This is stronger than the current channel message system because:

- DM plaintext does not need to be stored in cleartext on disk by the Electron client.
- Conversation keys are wrapped per recipient device.
- Messages are encrypted before they are persisted in the secure DM store.

### Important limitations

This repository does not yet justify claiming a fully audited end-to-end messaging system.

Reasons:

- No formal cryptographic audit is present.
- No fingerprint verification or trust-on-first-use UX is visible.
- No full key-verification ceremony is shown for human identity checking.
- The surrounding relay/server-side DM transport was not fully represented as an audited end-to-end pipeline in this repository snapshot.

So the correct statement today is:

- Secure DM encryption features exist.
- They are materially stronger than normal channel message protection.
- They should not yet be described as audited, production-hardened end-to-end security.

## Transport security

## HTTPS and TLS

Chatapp can use HTTPS, but the code does not enforce it.

Evidence in the current code:

- The self-hosted auth service tries both `http://56.228.2.7` and `https://56.228.2.7`.
- The README uses `http://localhost:3000` examples.
- The self-hosted backend itself is a plain Express server with no built-in TLS layer.

Security impact:

- Over HTTPS, traffic benefits from TLS in transit.
- Over HTTP, account tokens, message contents, and metadata are exposed to the network.

Recommended deployment posture:

- Use HTTPS for the core API.
- Use HTTPS for every self-hosted backend reachable outside localhost.
- Place the self-hosted backend behind a reverse proxy that enforces TLS.

## CORS and origin handling

The current codebase uses permissive CORS in some places.

### Core API

`chatapp-core/db.php` allows origins from a small allowlist that includes:

- localhost development URLs
- `null`

Limitation:

- Allowing `null` origin increases risk for unusual embedding or local-file access scenarios.

### Self-hosted backend

`SelfHServer/app.js` uses:

- `cors({ origin: true, credentials: false })`

This reflects any origin by default.

Limitation:

- It is broad and convenient for development.
- It is not a strict production origin policy.

## Desktop client security

## Electron hardening already present

The Electron app has several good baseline protections:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- preload-only IPC exposure through `contextBridge`

This reduces the impact of renderer-side compromise compared to a less restricted Electron setup.

## Local storage

The client currently stores these values in browser local storage:

- `authToken`
- `authUser`
- joined server selections and trust-warning flags

Security impact:

- Local storage is not the same as OS-protected secret storage.
- If renderer JavaScript is compromised, the bearer token may be exposed.
- Any local malware or highly privileged local attacker may also be able to extract it.

Important distinction:

- Normal auth session data is stored in local storage.
- Secure DM local data is stored separately and encrypted in the Electron main process.

## Backend and data-at-rest security

## Core API database

Good protections currently visible:

- Prepared SQL statements are used.
- Passwords are hashed.
- Session expiry is checked.

Current limitations:

- Session tokens appear to be stored in plaintext form in the database.
- No database encryption-at-rest layer is implemented in application code.
- No visible audit logging, anomaly detection, or rate limiting is present.

## Self-hosted backend storage

The self-hosted backend stores data in local JSON files.

This includes:

- messages
- message logs
- customization data
- server profile assets and metadata

Current limitations:

- No application-level encryption for stored server/channel messages
- No file integrity protection
- No signing or tamper-evidence
- No retention controls for message logs

## Authorization model

Authorization is currently partial.

What is enforced:

- Token-based identity for writes to channel messages
- Author-only edit/delete checks for messages

What is not yet clearly enforced:

- Channel membership checks for reads
- Role-based permissions for moderation or administration
- Protection around channel creation in `POST /api/server/channels`
- Strong separation between public server metadata and private chat content

This means the current authorization model should be considered incomplete.

## Privacy considerations

Users and operators should assume the following for the current codebase:

- Server/channel messages are visible to the backend operator.
- Server/channel messages may be visible to anyone who can access backend read endpoints.
- Deleted server/channel messages may still remain in logs.
- Session tokens are long-lived and should be treated as highly sensitive.
- Email and phone fields are account identifiers, not verified contact proofs.

## Secure coding notes from the current implementation

Positive findings:

- Password hashing is used.
- Random session tokens are used.
- SQL queries are parameterized.
- Electron renderer isolation is enabled.
- Secure DM local storage uses OS-backed encryption support.

Security issues and gaps currently visible:

- No enforced HTTPS
- Auth token stored in local storage
- Unauthenticated message read endpoints
- Plaintext message storage on the self-hosted backend
- Soft-delete logging preserves prior message content
- No multi-factor authentication
- No visible rate limiting
- No password reset/account recovery flow
- Permissive self-hosted CORS policy
- Low minimum password length
- Session tokens stored server-side in replayable form
- `chatapp-core/auth/register.php` enables PHP error display
- `chatapp-core/auth/me.php` returns debug auth-header fields when no token is supplied

## Current security claims that are accurate

The following statements are accurate for the current repository:

- Account passwords are hashed, not stored in plaintext.
- Account sessions are bearer-token based and expire after 30 days.
- Regular server/channel messages are authenticated for writes but are not end-to-end encrypted.
- Regular server/channel messages are currently stored in plaintext on the self-hosted backend.
- Direct messages have a stronger local encryption design than normal channel messages.
- The Electron app uses safer-than-default renderer isolation settings.
- HTTPS is supported by deployment, but not enforced by the application.

## Claims that should not be made yet

The following claims would currently be inaccurate or too strong:

- "All messages are end-to-end encrypted"
- "Deleted messages are fully erased"
- "Accounts are protected with MFA"
- "The backend prevents all unauthorized message reads"
- "The system is production-audited"
- "Tokens are stored in hardware-backed secret storage everywhere"

## Conclusion

This page is meant to give interested users, server operators, and contributors a clear picture of how security currently works in this repository.

Chatapp already includes several meaningful security foundations:

- hashed passwords
- random session tokens
- Electron renderer isolation
- a promising secure DM encryption subsystem

At the same time, the current implementation still has important limitations:

- channel messages are not end-to-end encrypted
- self-hosted channel message reads are too open
- plaintext message storage is used on the backend
- HTTPS is not enforced
- account/session handling is functional but not yet hardened

The most accurate summary of the current state is:

- Account security exists but needs hardening.
- Secure DM protections exist and are stronger than normal chat protections.
- Regular server/channel chat is currently only partially secured and should not be marketed as private or end-to-end encrypted.
