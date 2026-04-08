# Privacy-Focused Messaging Architecture

This project now treats the PHP core as an identity service plus a minimal encrypted messaging metadata/relay layer.

## Core PHP responsibilities

The core backend is responsible for:

- registration
- login
- session validation
- user identity
- public device key storage
- friendships
- wrapped conversation-key metadata
- temporary encrypted relay delivery

The core backend is not the home for:

- plaintext private message history
- private keys
- permanent message archives

## Key model

The client now follows a per-device crypto model:

- one user account can have multiple devices
- each device generates its own X25519 encryption keypair and Ed25519 signing keypair
- private keys remain only on that device
- public keys are uploaded to the core key directory

Canonical core endpoints for this are:

- `POST /keys/devices/register.php`
- `GET /keys/devices/list.php?userId=:id`

## Local client responsibilities

The Electron client is responsible for:

- device key generation
- encrypted local storage of private keys and message history
- conversation-key wrapping and unwrapping
- encrypting and decrypting DM payloads
- future device linking / QR pairing

## Messaging and relay responsibilities

DM delivery metadata can live in the core as long as it remains minimal:

- friendships
- conversation membership
- wrapped conversation keys
- 24h encrypted offline relay

It should still not store plaintext or act as the canonical transcript.

## Current repo status

What is already implemented in the client:

- device key generation in Electron main
- encrypted local DM store
- per-conversation symmetric keys
- wrapped conversation keys

What is now canonical in the core:

- public device key directory via [2026_04_08_device_public_keys.sql](/C:/Users/REDKING/Projects/Chatapp/Server/sql/2026_04_08_device_public_keys.sql)
- minimal encrypted messaging metadata via [2026_04_08_core_messaging_minimal.sql](/C:/Users/REDKING/Projects/Chatapp/Server/sql/2026_04_08_core_messaging_minimal.sql)

What still needs more work:

- QR pairing
- multi-device key re-wrap sync
- live online routing / presence
- eventual crypto hardening to libsodium and ratcheting

## Recommended next step

Keep the current per-device client crypto model and use the core only for minimal encrypted metadata and temporary relay, while the client remains the source of truth for message history.
