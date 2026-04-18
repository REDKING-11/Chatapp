RedFolder INC Presents

# Project Vision

A self-hosted chat platform where each backend represents a single independent community.

Key characteristics:

- each server is self-hosted
- clients connect directly to backends
- channels support structured, customizable layouts
- servers are accessed via direct connection or invite resolution
- a central API handles authentication and optional discovery

Stack (current):
- Client: Electron + React
- Backend: Node.js (Express)
- Core API: PHP + MySQL

---

# Core Concept

The system is split into three parts:

- Client  
  - renders the UI  
  - stores local state (joined servers, session)  
  - connects directly to backends  

- Backend (per server)  
  - stores messages, channels, layouts  
  - handles permissions and server logic  
  - represents a single independent community  

- Core API  
  - handles authentication (`/auth/login`, `/auth/me`)  
  - resolves invites to backend URLs  
  - optionally provides server discovery  

Data flow:

Client ↔ Backend (messages, channels)  
Client ↔ Core API (auth, invites)

---

# Architecture Overview

## 1. Client (Electron Application)

The application used by end users.

Responsibilities:

* user interface and experience
* layout rendering engine
* layout editor (planned)
* authentication via core service
* ~~connection to multiple backends~~
* local storage of joined servers

---

## 2. Self-Hosted Backend

Each backend represents an independent server.

Responsibilities:

- channels  
- messages  
- layouts  
- permissions  
- invite handling (optional)

---

## 3. Core API (Central)

Responsibilities:

- user accounts and authentication
- session validation (`/auth/login`, `/auth/me`)
- invite resolution
- optional discovery features
- optional server metadata

The core API does not store or process chat data.

It is only responsible for identity and connection metadata. All messages, channels, and server data remain on individual backends.

---

# Authentication System

## Flow

* users authenticate through the core service
* the client stores the authentication token locally (for now if i find more secure idea)
* on startup, the client validates the session via `/auth/me`

This allows sessions to persist across restarts.

## Key Principle

**Identity is global**

* users have a single identity across all servers
* servers do not manage user accounts independently

---

# Connection Model

## Joining a Server

### Direct Connection (current)

User provides backend URL:

```
https://chat.example.com
```

Flow:

1. client calls `/api/join`
2. backend returns server information
3. client stores the server locally

---

### Invite-Based Connection (planned)

```
app://invite/abc123
```

Flow:

1. client requests invite resolution from core service
2. core returns backend URL (Planned to chance the proccess)
3. client connects directly

---

## Communication Model

After joining:

```
Client ↔ Backend
```

All communication is direct. The core service is not involved in message flow.

---

# Local Persistence

The client stores:

### Authentication

```
authToken
```

### Joined Servers

```
joinedServers[]
selectedJoinedServerId
```
(Planned to chance for the Core to handle the storage)
### Planned

`lost of improvements essentially`
`Make More blocks`
---

# Layout System

## Concept

Channels are rendered using structured layout definitions.

Example:

```json
{
  "type": "column",
  "children": [
    { "type": "text", "props": { "text": "Header" } },
    { "type": "chat" }
  ]
}
```
(planned to make it better if i figure out how)
---

## Supported Blocks

* chat
* row
* column
* text

---

## Constraints

For safety and consistency:

* no custom JavaScript
* no custom React components
* no logic injection

Allowed:

* layout structure
* styling
* configuration

---

# UI Structure

## Joined Servers Sidebar

* displays joined servers
* allows switching between servers
* includes entry point for joining new servers

---

## Channel Sidebar

* displays channels for the selected server

---

## Main View

* renders the active channel layout
* injects chat and other UI blocks

(so if you like the layout of discord it just that really)
---

# Layout Editor (Planned)

The client will support:

* editing channel layouts
* ~~drag-and-drop block placement~~
* configuration of block properties
* saving layouts to the backend

---

# Self-Hosting Model

Server owners:

* run their own backend instance
* expose it via HTTPS URL for remote access (e.g. `https://chat.example.com`)

Optional enhancements:

* custom domain
* reverse proxy
* tunneling services

(if i figure it out)

---

# Local TLS Development

Chatapp now expects TLS for every app-facing endpoint, including local development.

Use the repo `Caddyfile` to terminate TLS locally:

* `https://core.localhost` -> `chatapp-core`
* `wss://core.localhost/ws/` -> `chatapp-realtime`
* `https://server.localhost` -> `SelfHServer`

Recommended local loopback services behind the proxy:

* `127.0.0.1:4000` -> `chatapp-core`
* `127.0.0.1:3010` -> `chatapp-realtime`
* `127.0.0.1:3000` -> `SelfHServer`

Start the proxy with:

```bash
caddy run --config Caddyfile
```

---

# Lightsail HTTPS/WSS Deployment

For the desktop app to talk to the Lightsail server over HTTPS/WSS, create an untracked `Application/.env.local`:

```env
VITE_CORE_API_BASE=https://56.228.2.7
```

Leave `VITE_REALTIME_WS_BASE` unset so the client derives `wss://56.228.2.7/ws/`.
Leave `VITE_SELFHOST_API_BASE` unset unless you want to prefill a specific community-server URL in the Join Server modal.

At the Lightsail edge, terminate TLS with Caddy and split traffic like this:

* `/ws/*` -> `chatapp-realtime` on `127.0.0.1:3010`
* all other HTTPS paths -> `chatapp-core` on `127.0.0.1:8080`

The Lightsail Caddy template also sets `default_sni 56.228.2.7` so clients that omit SNI for raw-IP HTTPS can still receive the loaded IP certificate.

Use the repo templates in [deploy/Caddyfile.lightsail](C:/Users/REDKING/Projects/Chatapp/deploy/Caddyfile.lightsail:1) and [deploy/nginx-chatapp-core.lightsail.conf](C:/Users/REDKING/Projects/Chatapp/deploy/nginx-chatapp-core.lightsail.conf:1), and follow the full guide in [docs/LIGHTSAIL_HTTPS.md](C:/Users/REDKING/Projects/Chatapp/docs/LIGHTSAIL_HTTPS.md:1).

`SelfHServer` is still for community servers and is not required on the central Lightsail core/realtime host.

---

# Roadmap

## Phase 1 — Foundation (complete)

* authentication system
* backend connectivity
* messaging
* layout system
* server persistence

---

## Phase 2 — User Experience

* improved join flow
* error handling
* loading states
* reconnection logic

---

## Phase 3 — Layout Editor

* visual editor
* block configuration
* backend persistence

---

## Phase 4 — Discovery

* server listing
* categorization
* search

---

## Phase 5 — Realtime

* WebSocket integration
* live updates

---

## Phase 6 — Advanced Features

* roles and permissions
* themes
* update system

---

# Summary

A self-hosted communication platform where:

* communities run their own infrastructure
* users maintain a unified identity
* the client provides a flexible and customizable interface
