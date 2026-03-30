# 🚀 Project Vision

A **Discord-like app** where:

* each server is **self-hosted (one backend = one community)**
* users can join **multiple servers from one client**
* channels support **custom layouts (UI blocks)**
* servers are joined via **invite or discovery**
* a central service acts as a **directory (“bus stop”), not a host**

---

# 🧠 Core Idea

> **Client = UI engine. Backend = community. Directory = discovery.**

* You provide:

  * client app (Electron)
  * layout rendering engine
  * layout editor
  * central directory (optional)

* Server owners provide:

  * hosting
  * community
  * data (users, messages, channels)
  * customization (layouts)

---

# 🏗️ Architecture Overview

## 1. 🖥 Client (Electron App)

What users download.

Responsibilities:

* UI / UX
* layout rendering engine
* layout editor
* authentication (central)
* connect to multiple backends
* store joined servers locally

👉 This is the **only app users interact with**

---

## 2. 🧩 Self-Hosted Backend (Community Server)

What server owners run.

⚠️ Important:

> **One backend = one server/community**

Responsibilities:

* channels
* messages
* layouts
* permissions
* invite handling (optional)

👉 Backend does NOT manage multiple servers

---

## 3. 🌐 Central Core (Your Service)

“The bus stop”

Responsibilities:

* user accounts (global login)
* authentication (`/auth/login`, `/auth/me`)
* invite resolution
* discovery (optional)
* server metadata (optional)

👉 Does NOT host chat data

---

# 🔐 Authentication System

## How it works

* users register/login via **central core API**
* client stores:

```js
localStorage.setItem("authToken", token)
```

* on app start:

  * client calls `/auth/me`
  * restores session automatically

👉 Login persists across restarts

---

## Key idea

> **One identity across all servers**

Unlike Discord:

* servers do NOT own users
* identity comes from central service

---

# 🧭 Connection Model

## Joining a Server

### Option 1 — Direct (current implementation)

User enters backend URL:

```
http://localhost:3000
```

Client:

1. calls `/api/join`
2. receives server info
3. stores it locally

👉 Saved in:

```js
localStorage("joinedServers")
```

---

### Option 2 — Invite (planned)

```
app://invite/abc123
```

Flow:

1. client → core service
2. core resolves invite
3. returns backend URL
4. client connects directly

---

## After joining

All traffic is direct:

```
Client ↔ Backend
```

NOT through your server

---

# 💾 Local Persistence (Already Implemented)

The client stores:

### ✅ Auth

```js
authToken
```

### ✅ Joined servers

```js
joinedServers[]
selectedJoinedServerId
```

### 🔜 (next upgrade)

```js
lastOpenedChannelPerServer
```

👉 This allows:

* auto login
* auto reconnect
* persistent server list

---

# 🎨 Layout System

## Concept

Servers define UI using **safe layout JSON**

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

---

## Supported blocks (current)

* chat → 
* row → 
* column → 
* text → 

Rendered via:

👉 

---

## Rules

❌ No custom JS
❌ No custom React
❌ No logic injection

✅ Only:

* structure
* layout
* styling
* configuration

---

# 🧱 UI Structure (Current)

You now have:

### 1. Joined Servers Sidebar

👉 

* shows servers user joined
* "+" button → join server

---

### 2. Channel Sidebar

👉 

* shows channels of selected backend

---

### 3. Main View

👉 

* renders layout
* injects chat + blocks

---

# 🔥 Important Design Decision

> Backend is NOT multi-server.

Correct mental model:

```
Client
 ├── Server A (backend A)
 ├── Server B (backend B)
 └── Server C (backend C)
```

NOT:

```
Backend → multiple servers ❌
```

---

# 🛠️ Editor System (Planned)

Inside client:

* edit channel layout
* drag blocks
* configure props
* save → backend

---

# 🌍 Self-Hosting Model

Server owner:

* runs backend (Node)
* exposes:

```
http://their-ip:3000
```

Optional:

* domain
* reverse proxy
* tunnel (playit.gg)

---

# 🧭 Updated Roadmap

## Phase 1 — Foundation ✅

* auth system working
* backend connection working
* chat working
* layout system working
* joined servers working

---

## Phase 2 — UX polish (NOW)

* better join flow (invite)
* error handling
* loading states
* reconnect logic

---

## Phase 3 — Layout editor

* drag & drop
* block config UI
* save to backend

---

## Phase 4 — Discovery system

* central listing
* categories
* search

---

## Phase 5 — Realtime

* WebSockets
* live chat updates

---

## Phase 6 — Advanced

* roles
* permissions
* themes
* updater system

---

# 🔥 One-line summary

> A self-hosted chat platform where users connect to independent servers, while a central service handles identity and discovery — and the client renders customizable layouts safely.

You’re basically building:

> **Discord + WordPress + decentralized hosting**

---
