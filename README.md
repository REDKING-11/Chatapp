# 🚀 Project Vision (Simple)

A **Discord-like app** where:

* each server is **self-hosted**
* each channel can be **fully customized (layout + style)**
* users join servers via **invite links or discovery**
* your system acts as a **directory (“bus stop”), not the host**

---

# 🧠 Core Idea

> **You control the engine. Users control the layout. Servers control their own data.**

* You provide:

  * client app
  * rendering engine
  * layout system
  * discovery system

* Server owners provide:

  * hosting
  * community
  * content
  * customization

---

# 🏗️ Architecture Overview

## 1. 🖥 Client (Electron App)

What users download.

Responsibilities:

* UI / UX
* layout rendering engine
* layout editor
* connect to backend servers
* join via invite / discovery
* store connected servers

👉 This is the **only app normal users use**

---

## 2. 🧩 Self-Hosted Backend (Community Server)

What server owners run.

Responsibilities:

* users (local to that server)
* channels
* messages
* layouts + themes
* permissions
* invite generation

👉 Each backend = independent community

---

## 3. 🌐 Central Directory (Your Service)

“The bus stop”

Responsibilities:

* discovery (public servers)
* invite resolution
* server metadata (name, tags, icon, URL)
* optional heartbeat / online status

👉 Does NOT handle chat or core data

---

# 🔌 Connection Flow

## Join via Discovery

1. client asks your directory for servers
2. user clicks one
3. client gets backend URL
4. client connects **directly to that backend**

---

## Join via Invite

1. user opens invite
2. client sends invite code to your service
3. your service returns backend URL
4. client connects directly

---

## After joining

👉 All traffic goes directly:

```
Client ↔ Hosted Backend
```

NOT through your service

---

# 🎨 Layout System (Your Unique Feature)

## Concept

Servers can customize UI using **approved building blocks**

Examples:

* chat
* header
* members list
* text blocks
* cards
* rows / columns

---

## Important rule

❌ No custom logic
❌ No custom JS
❌ No custom React components

✅ Only:

* layout structure
* placement
* styling
* configuration

---

## Example Layout (JSON)

```json
{
  "type": "row",
  "children": [
    { "type": "channelSidebar" },
    {
      "type": "column",
      "children": [
        { "type": "header" },
        { "type": "chat" }
      ]
    },
    { "type": "members" }
  ]
}
```

---

## How it works

* backend stores layout config
* client reads layout
* client maps to real React components
* renderer builds UI

👉 You own behavior, they control structure

---

# 🛠️ Editor System

Inside the client:

* “Edit Channel Layout” button
* opens editor panel
* user can:

  * add blocks
  * move blocks
  * remove blocks
  * edit props (text, spacing, etc.)

Then:

* client saves layout → backend
* backend stores it
* layout updates instantly

---

# 🌍 Self-Hosting Model

Each server owner:

* runs backend locally or on VPS
* optionally uses:

  * port forwarding
  * domain
  * tunnel (like playit.gg for testing)
* shares invite link

---

# 🔑 Key Principles

## 1. Separation of concerns

* client = UI + rendering
* backend = data
* directory = discovery

---

## 2. Direct connection

* after join → client talks directly to backend

---

## 3. No central dependency for chat

* your service is optional for discovery
* core app still works without it

---

## 4. Controlled customization

* layout system, not code execution

---

## 5. Scalable architecture

* supports:

  * self-hosting
  * hosted version later
  * public discovery
  * private servers

---

# 🧭 Development Roadmap

## Phase 1 — Foundation ✅ (you’re here)

* Electron app
* React UI
* backend API
* basic chat working
* layout renderer

---

## Phase 2 — Layout system

* layout JSON fully working
* default layouts
* multiple block types
* per-channel layouts

---

## Phase 3 — Layout editor

* basic editor UI
* add/remove/move blocks
* live preview
* save to backend

---

## Phase 4 — Persistence

* save messages to file/db
* save servers/channels properly
* save layouts

---

## Phase 5 — Multi-server support

* multiple servers in backend
* switching servers
* improved state handling

---

## Phase 6 — Connection system

* backend URL input
* save connections
* reconnect logic

---

## Phase 7 — Invites

* generate invites on backend
* resolve invites via central service
* join servers via invite

---

## Phase 8 — Discovery (bus stop)

* central directory API
* server listing
* search / categories
* join from discovery

---

## Phase 9 — Self-host polish

* config file
* easier setup
* packaging backend
* optional installer

---

## Phase 10 — Advanced features

* realtime (WebSockets)
* roles & permissions
* file uploads
* themes system (advanced)
* updater system

---

# 🔥 One-line summary

> A self-hosted, customizable chat platform where the client renders server-defined layouts, and a central service helps users discover and join communities without hosting their data.

---

If you want, next I can turn this into:

* a **Notion page**
* a **README.md**
* or a **clean pitch / concept doc**