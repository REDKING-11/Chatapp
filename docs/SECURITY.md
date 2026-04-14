# Security

This document describes the security model of the current Chatapp codebase as it exists in this repository today.

It is intentionally direct:

- If something is protected, it is described here.
- If something is only partially protected, that is described here.
- If a feature exists but does not justify a stronger claim, that is described here too.

This document is based on the current implementation in:

- `Application/` for the Electron client
- `chatapp-core/` for the PHP core API
- `chatapp-realtime/` for the realtime DM delivery service
- `SelfHServer/` for the self-hosted community backend

## Security status at a glance

### Account security

- Passwords are hashed on registration using PHP `password_hash(...)`.
- Login verification uses `password_verify(...)`.
- Sessions use random bearer tokens generated with `random_bytes(32)`.
- The core auth layer supports hashed session lookup with SHA-256 token hashes and public session IDs when the upgraded session schema is available.
- TOTP-based MFA setup, login challenge handling, enable, disable, and status checks are implemented in `chatapp-core/auth/`.
- Session listing and session revocation endpoints are implemented in `chatapp-core/auth/`.

### Channel and server message security

- Sending, editing, deleting, and reacting to channel messages requires a bearer token on the self-hosted backend.
- Channel messages are not end-to-end encrypted.
- Channel messages are stored in plaintext JSON on the self-hosted backend.
- Message logs are also stored in plaintext and may retain previous message content after edits or deletes.
- Reading channel messages is currently unauthenticated in `SelfHServer/routes/channel.routes.js`.
- Channel creation and server customization writes are currently unauthenticated in `SelfHServer/routes/server.routes.js` and `SelfHServer/routes/customization.routes.js`.

### Direct message security

- The Electron app contains a secure DM system with local encryption primitives.
- DM content is encrypted locally with AES-256-GCM.
- Per-device key exchange uses X25519.
- Device signing keys use Ed25519.
- Device bundles are signed, versioned, and verified before use.
- Conversation safety numbers and per-device verification state are supported.
- New device registration can require approval from an already trusted device.
- Device revocation and wrapped-key re-distribution are implemented.
- Locally stored secure DM data is encrypted on disk with a key protected by Electron `safeStorage`.
- Core DM relay and realtime delivery handle encrypted envelopes and signatures rather than plaintext message bodies.
- This is the strongest message protection currently present in the repository.
- It should still be treated as implementation-stage security, not as an audited messaging protocol.

### Transport security

- The Electron client normalizes remote backend URLs to `https://` and remote realtime URLs to `wss://` by default.
- `http://` and `ws://` are allowed for localhost development.
- Environment configuration can still opt into insecure remote URLs.
- The self-hosted backend and realtime service are plain Node services and rely on deployment to provide TLS.
- The self-hosted auth bridge accepts multiple configured core-auth base URLs, including localhost fallback.

### Desktop client isolation

- The Electron renderer runs with `contextIsolation: true`.
- The Electron window is created with `sandbox: true`.
- `nodeIntegration` is disabled.
- Only explicit IPC APIs are exposed through the preload script.
- Electron fuses disable `RunAsNode`, disable `NODE_OPTIONS`, disable CLI inspect arguments, enable cookie encryption, enable ASAR integrity validation, and load the app only from ASAR.
- The desktop auth token is persisted through a main-process store protected by Electron `safeStorage`.

## Architecture and trust boundaries

Chatapp currently has four security domains:

1. The Electron client in `Application/`
2. The core API in `chatapp-core/`
3. The realtime DM delivery service in `chatapp-realtime/`
4. The self-hosted community backend in `SelfHServer/`

The trust model is split:

- The core API is trusted for identity, login, MFA, session validation, and device registration state.
- The realtime service is trusted to authenticate devices and relay encrypted DM envelopes between online and offline devices.
- The self-hosted backend is trusted for channel storage, message history, customization data, and profile asset hosting.
- The client is trusted to hold the user's active session token, local secure DM state, and local verification state.

That means Chatapp does not currently operate as a zero-trust chat system. In particular:

- Server and channel operators can access channel message contents.
- Anyone with filesystem access to the self-hosted backend can read stored channel messages and message logs.
- A malicious self-hosted backend can alter channel layouts, customization, and profile-asset hosting behavior.
- DM servers still observe metadata such as timing, participant identifiers, device identifiers, and relay TTLs even when DM plaintext is encrypted.

## Account security

## Password handling

User passwords are not stored in plaintext in the core API database.

Current protections:

- Registration hashes passwords with PHP `password_hash(...)`.
- Login uses `password_verify(...)` against the stored hash.
- Passwords are only accepted through JSON request bodies.
- SQL statements around account creation and login use prepared queries.

Current limitations:

- Minimum password length is currently only 4 characters.
- There is no password complexity policy.
- There is no password reset flow in this repository.
- There is no visible brute-force or rate-limit protection in the login flow.

## Session tokens

After login, the core API creates a random session token:

- generated with `bin2hex(random_bytes(32))`
- returned to the client as a bearer token
- valid for 30 days unless revoked or expired

Authenticated requests work like this:

- The Electron client stores the token through `Application/src/main/auth/storage.js`, which uses Electron `safeStorage`.
- The preload script exposes only reviewed token get/set/clear operations.
- `chatapp-core/auth/me.php` and `chatapp-core/auth_required.php` validate the bearer token against the session table and expiry time.
- The self-hosted backend forwards bearer tokens to the core API to confirm identity.
- The realtime service authenticates sockets with a bearer token plus an active registered device ID.

Current protections:

- Upgraded core-auth schema support includes `token_hash`, `public_id`, `last_seen_at`, `revoked_at`, `session_name`, `user_agent`, and `mfa_completed_at`.
- When that schema is available, the core auth layer hashes session tokens with SHA-256 for lookup and stores a non-secret public session ID for session management UI.
- The core API updates `last_seen_at` on authenticated activity when the upgraded session schema is available.
- Session listing is available through `chatapp-core/auth/sessions_list.php`.
- Session revocation is available through `chatapp-core/auth/sessions_revoke.php`.

Current limitations:

- Legacy or restricted installations that cannot apply the upgraded auth schema may continue operating on the legacy session layout until they are migrated.
- There is no dedicated one-step logout endpoint that revokes the current session server-side; the desktop client clears the local token, and session revocation uses the session-management endpoints.
- Session lifetime is still relatively long at 30 days.

## Multi-factor authentication

The core API implements TOTP-based MFA.

Current protections:

- MFA setup status is available through `chatapp-core/auth/mfa_status.php`.
- MFA setup can generate a TOTP secret and `otpauth://` URI through `chatapp-core/auth/mfa_setup.php`.
- MFA enable and disable flows require a valid TOTP code.
- MFA-enabled accounts require a login challenge plus a valid TOTP code during login.
- MFA secrets are encrypted at rest in the core database using AES-256-GCM with a key derived from `APP_SECRET`.

Current limitations:

- No backup codes are present.
- No WebAuthn or hardware security key flow is present.
- No MFA recovery flow is shown in this repository.

## Registration and identity data

The core API currently supports:

- username
- optional username tags
- password
- optional email
- optional phone
- optional display name

Current protections:

- Duplicate username checks
- Duplicate email checks
- Duplicate phone checks
- Optional username-tag uniqueness checks
- Prepared SQL statements

Current limitations:

- Email ownership verification is not present.
- Phone ownership verification is not present.
- There is no account recovery workflow shown in this repository.

## Message security

## Server and channel messages

Regular server and channel chat messages are protected differently from direct messages.

### In transit and authorization

For write operations, the self-hosted backend requires a valid bearer token before it will:

- send a message
- edit a message
- delete a message
- add or remove a reaction

The backend gets the user identity by calling the core API with the bearer token.

Current limitations:

- This protects against unauthenticated writes.
- It does not encrypt message content end-to-end.
- The self-hosted backend does not currently enforce channel membership or server-role checks around these write routes.
- `POST /api/server/channels` is currently unauthenticated.
- `PUT /api/customization` and `POST /api/customization/reset` are currently unauthenticated.

### At rest

Regular channel messages are currently stored in plaintext here:

- `SelfHServer/data/messages.json`
- `SelfHServer/data/messageLogs.json`

This means:

- The self-hosted backend operator can read channel messages.
- Anyone with server filesystem access can read channel messages and message logs.
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
- No server role or permission enforcement is visible around channel reads.
- Strong separation between public server metadata and private channel content is not yet enforced on the self-hosted backend.

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

The secure DM implementation spans:

- `Application/src/main/dm/`
- `chatapp-core/dm/`
- `chatapp-core/keys/`
- `chatapp-realtime/app.js`

### What is protected

The secure DM implementation currently includes:

- per-device identity generation
- X25519 key exchange
- Ed25519 signing key generation
- per-conversation symmetric keys
- AES-256-GCM payload encryption
- signed device bundles
- encrypted local DM storage
- replay detection using message IDs and envelope signatures
- disappearing-message policy support
- encrypted attachment chunk transfer in the Electron main process
- device approval and device revocation workflows
- conversation-key rewrap and redistribution support
- local device-verification state and conversation safety numbers

Local secure DM storage is protected as follows:

- A random master key is generated locally.
- That key is protected with Electron `safeStorage`, which relies on OS-backed secure storage.
- The secure DM store is written to `store.json.enc`.
- The stored payload is encrypted with AES-256-GCM.

### Relay and delivery properties

The DM relay path is materially stronger than the channel-message path because:

- Messages are encrypted before they are persisted locally.
- Core DM send routes accept `ciphertext`, `nonce`, `aad`, `tag`, and `signature`, rather than plaintext bodies.
- The realtime service authenticates sockets with both a bearer token and a registered active device.
- The realtime service checks conversation access and recipient device membership before delivering or queueing DM envelopes.
- Offline DM relay entries are stored with a TTL in the database queue.

### Important limitations

This repository does not yet justify claiming a fully audited end-to-end messaging system.

Reasons:

- No formal cryptographic audit is present.
- Human identity verification still depends on users comparing safety numbers or verifying devices out of band.
- The first contact with a device bundle still depends on trusting the fetched bundle until a user verifies it.
- The surrounding services still observe delivery metadata even when they do not see DM plaintext.

So the correct statement today is:

- Secure DM encryption features exist.
- They are materially stronger than normal channel message protection.
- They should not yet be described as audited, production-hardened end-to-end security.

## Transport security

## HTTPS and TLS

Chatapp prefers secure transport for remote endpoints at the client layer.

Current behavior:

- `Application/src/lib/env.js` requires `https://` for remote backend URLs and `wss://` for remote realtime URLs unless a development override is enabled.
- The Electron main process uses the same rule when checking remote backend health.
- `http://` and `ws://` are allowed for localhost development.

Current limitations:

- The self-hosted backend itself is a plain Express server with no built-in TLS layer.
- The realtime service is a plain Node HTTP and WebSocket server with no built-in TLS layer.
- Environment configuration can explicitly allow insecure remote URLs.
- This repository snapshot currently includes environment values that opt into insecure remote URLs for a remote host.
- `SelfHServer/services/auth.service.js` accepts multiple configured core-auth base URLs, including localhost fallback.

Security impact:

- Over HTTPS and WSS, traffic benefits from TLS in transit.
- Over HTTP and WS, account tokens, message contents, and metadata can be observed by the network path.

## CORS and origin handling

The current codebase uses broad origin rules in some places.

### Core API

`chatapp-core/db.php` allows origins from a narrow localhost allowlist, but it also allows:

- `null`

Limitation:

- Allowing `null` origin increases risk for unusual embedding or local-file access scenarios.

### Self-hosted backend

`SelfHServer/app.js` uses:

- `cors({ origin: true, credentials: false })`

Limitation:

- This reflects any origin by default.
- It is convenient for development.
- It is not a strict production origin policy.

## Desktop client security

## Electron hardening already present

The Electron app has several good baseline protections:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- preload-only IPC exposure through `contextBridge`
- Electron fuses that disable `RunAsNode`, disable `NODE_OPTIONS`, disable CLI inspect arguments, enable cookie encryption, enable ASAR integrity validation, and load only from ASAR

This reduces the impact of renderer-side compromise compared to a less restricted Electron setup.

## Local secret storage

The client currently stores these values through stronger storage paths:

- `authToken` in a main-process store protected by Electron `safeStorage`
- secure DM key material inside the encrypted secure-DM store

The client still stores non-secret local state in browser storage, including:

- `authUser`
- client settings
- onboarding state
- joined-server UI state
- trusted-device UI state

Important distinction:

- Normal auth session data is not intended to remain in renderer `localStorage`.
- Legacy `authToken` values are migrated into the main-process secure store and removed from `localStorage` during session hydration.
- Secure DM local data is stored separately and encrypted in the Electron main process.

## Untrusted content and UI customization

Current protections:

- Markdown rendering is sanitized with DOMPurify.
- Mermaid rendering is run with `securityLevel: "strict"`.
- The preload layer does not expose a generic IPC bridge or shell-open helper.

Current limitations:

- Self-hosted server customization includes arbitrary `customCss`.
- The renderer applies that CSS directly to a `<style>` element.
- A malicious or compromised self-hosted backend can therefore restyle, obscure, or spoof parts of the client UI for users connected to that server.

## Backend and data-at-rest security

## Core API database

Good protections currently visible:

- Prepared SQL statements are used.
- Passwords are hashed.
- Session expiry is checked.
- Upgraded schema support provides hashed session lookup and public session IDs.
- MFA secrets are encrypted before being stored.
- Session listing and revocation are implemented.

Current limitations:

- No database encryption-at-rest layer is implemented in application code.
- No visible rate limiting, anomaly detection, or audit logging is present.
- Runtime schema upgrades are attempted from application code and may fall back silently on restricted installations.

## Realtime DM service

Good protections currently visible:

- Realtime sockets must authenticate with a bearer token and active device ID.
- Delivery is limited to registered active devices.
- Conversation membership is checked before DM delivery.
- Offline relay entries are queued with expiry.

Current limitations:

- The service itself does not terminate TLS.
- It relies on deployment to provide HTTPS and WSS at the network edge.

## Self-hosted backend storage

The self-hosted backend stores data in local JSON files and media files.

This includes:

- messages
- message logs
- customization data
- server profile descriptions
- profile asset files and metadata

Current limitations:

- No application-level encryption for stored server and channel messages
- No file integrity protection
- No signing or tamper-evidence
- No retention controls for message logs
- Profile asset manifests and image files are readable by user ID routes without authentication on the self-hosted backend

## Authorization model

Authorization is currently mixed: strong in some core and DM paths, incomplete in the self-hosted backend.

What is enforced:

- Token-based identity in the core API
- TOTP MFA for accounts that enable it
- Session listing and revocation for authenticated users
- Device registration, approval, and revocation for DM key material
- DM conversation participant checks in core DM routes
- Active-device checks in realtime DM delivery
- Author-only edit and delete checks for channel messages
- Authenticated writes for profile assets and per-server profile descriptions

What is not yet clearly enforced:

- Channel membership checks on self-hosted channel reads
- Channel membership checks on self-hosted channel writes
- Role-based permissions for moderation or administration on the self-hosted backend
- Authentication around self-hosted channel creation
- Authentication around self-hosted customization writes and resets
- Privacy controls around self-hosted profile-asset reads

This means the current authorization model should still be considered incomplete on the self-hosted backend side.

## Privacy considerations

Users and operators should assume the following for the current codebase:

- Server and channel messages are visible to the self-hosted backend operator.
- Server and channel messages may be visible to anyone who can reach the self-hosted backend read endpoints.
- Deleted server and channel messages may still remain in logs.
- Profile asset files may be retrievable from the self-hosted backend by user ID routes.
- DM servers still observe metadata even when DM plaintext is encrypted.
- Session tokens remain highly sensitive even though the desktop client stores them through OS-backed secret storage.
- Email and phone fields are account identifiers, not verified contact proofs.
- Device public keys are intentionally distributed to authenticated users for DM bootstrap and verification.

## Repository and deployment notes

This repository snapshot includes deployment-sensitive material that should not be treated as public documentation:

- committed `.env` files with connection settings
- committed database credentials in `chatapp-realtime/.env`
- committed plaintext self-hosted message data in `SelfHServer/data/`

There is also a debug connectivity script at:

- `chatapp-core/test_db.php`

Current limitation:

- If `test_db.php` is deployed and reachable, it enables `display_errors` and returns raw database exception text.

## Secure coding notes from the current implementation

Positive findings:

- Password hashing is used.
- Random session tokens are used.
- Hashed session lookup and public session IDs are supported on upgraded auth schema.
- TOTP MFA is implemented.
- Session listing and session revocation are implemented.
- SQL queries are parameterized.
- Electron renderer isolation is enabled.
- Electron fuses harden the packaged desktop app.
- Desktop auth tokens use OS-backed secret storage.
- Secure DM local storage uses OS-backed encryption support.
- Secure DM device bundles are signed and verified.
- Secure DM replay detection is implemented.
- Secure DM device approval and revocation flows are implemented.
- The desktop client prefers HTTPS and WSS for remote endpoints by default.

Security issues and gaps currently visible:

- No visible brute-force or rate-limit protection on core auth endpoints
- Low minimum password length
- No password reset or account recovery flow
- Core CORS allowlist includes `null` origin
- Permissive self-hosted CORS policy
- Unauthenticated self-hosted channel read endpoints
- Unauthenticated self-hosted customization write and reset endpoints
- Unauthenticated self-hosted channel creation endpoint
- Missing self-hosted membership and role checks for channel access
- Plaintext message storage on the self-hosted backend
- Soft-delete logging preserves prior message content
- Public self-hosted profile-asset reads by user ID
- Custom server CSS can restyle and spoof UI inside the desktop renderer
- Insecure remote transport can still be enabled by environment configuration
- The current repository snapshot includes committed env secrets and plaintext data files
- `chatapp-core/test_db.php` exposes debug DB output if deployed
- `chatapp-core/invites/resolve.php` increments invite usage when an invite is resolved, not when a join is completed

## Current security claims that are accurate

The following statements are accurate for the current repository:

- Account passwords are hashed, not stored in plaintext.
- The core API supports TOTP-based MFA.
- Account sessions are bearer-token based, expire after 30 days, and support session listing and revocation.
- The desktop client stores the auth token in OS-backed secret storage rather than renderer `localStorage`.
- Regular server and channel messages are authenticated for writes but are not end-to-end encrypted.
- Regular server and channel messages are currently stored in plaintext on the self-hosted backend.
- Direct messages have a stronger local encryption and device-verification design than normal channel messages.
- The Electron app uses safer-than-default renderer isolation settings and Electron fuse hardening.
- Remote backend and realtime URLs are intended to use HTTPS and WSS by default, with explicit development opt-outs.
- The self-hosted backend authorization model is incomplete and should not be treated as private-by-default.

## Claims that should not be made yet

The following claims would currently be inaccurate or too strong:

- "All messages are end-to-end encrypted"
- "Deleted messages are fully erased"
- "All deployments enforce HTTPS and WSS with no override path"
- "The self-hosted backend prevents all unauthorized channel reads"
- "The self-hosted backend enforces membership and role checks for all channel access"
- "The system is production-audited"
- "Profile media hosted by the self-hosted backend is private by default"

## Conclusion

Chatapp currently includes several meaningful security foundations:

- hashed passwords
- random session tokens
- MFA support
- session management
- Electron renderer isolation and fuse hardening
- OS-backed auth-token storage
- a materially stronger secure DM subsystem

At the same time, the current implementation still has important limitations:

- channel messages are not end-to-end encrypted
- self-hosted channel reads are too open
- self-hosted customization and channel-creation endpoints are too open
- plaintext message storage is used on the self-hosted backend
- self-hosted authorization is incomplete
- transport security still depends heavily on deployment configuration

The most accurate summary of the current state is:

- Account security is stronger than a basic password-only system and includes MFA, session management, and secure desktop token storage.
- Secure DM protections are materially stronger than normal chat protections and include device signing, verification, approval, replay detection, and encrypted local storage.
- Regular server and channel chat on the self-hosted backend is still only partially secured and should not be marketed as private or end-to-end encrypted.
