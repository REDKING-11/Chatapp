**Today’s Changes**

**DM privacy and conversation flow**
- Stopped unknown DM conversations from auto-importing from live delivery or relay in [`actions.js`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\features\dm\actions.js).
- Changed default DM relay retention to `0` in [`_bootstrap.php`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\chatapp-core\dm\_bootstrap.php), so new DMs do not keep server-side backlog by default.
- Kept the “start fresh instead of crash” behavior when a linked DM exists but this device has no local key in [`actions.js`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\features\friends\actions.js).
- Added logic so newly created fresh DMs also wrap keys for your own other devices in [`actions.js`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\features\dm\actions.js).
- Added notices in the Friends UI when a conversation was restarted elsewhere or this device lacks local access in [`FriendsHome.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\FriendsHome.jsx).

**Forget old conversation**
- Added a device-local “Forget old conversation” flow in [`FriendsHome.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\FriendsHome.jsx).
- Added undo/reset behavior for that forgotten state in the conversation settings area.
- Fixed the freeze caused by that feature by stabilizing the selected friend state with memoization in [`FriendsHome.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\FriendsHome.jsx).

**Friends DM bubble styling**
- Tightened the spacing between timestamp and text in friend message bubbles in [`index.css`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\index.css).
- Made DM bubbles shrink to fit content better instead of staying overly wide.

**Client settings system**
- Added a full local client settings model in [`clientSettings.js`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\features\clientSettings.js).
- Added theme presets: Midnight, Light, Forest, Sunrise.
- Added settings for text size, line height, UI density, reduced motion, high contrast, color vision mode, dyslexia-friendly font stack, and hit target size.
- Wired client settings into the app shell in [`renderer.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\renderer.jsx).
- Added the `Client Settings` modal UI in [`ClientSettingsModal.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\ClientSettingsModal.jsx).

**Client settings UI and accessibility polish**
- Reworked the Accessibility section so each option reads as `name -> description -> control at bottom` in [`ClientSettingsModal.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\ClientSettingsModal.jsx) and [`index.css`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\index.css).
- Expanded hit target sizing from a simple toggle into multiple levels: `Default`, `Large`, `Extra large`, `Maximum`.
- Made accessibility checkboxes/toggles scale more visibly with the hit target size.
- Fixed the client settings theme swatches collapsing in the theme cards.
- Fixed settings text/readability issues so modal text and dropdowns follow the current theme.
- Removed the stray `.leftM` margin hack and replaced it with proper select padding.
- Added themed scrollbar styling for the client settings modal.

**Client settings import/export**
- Added JSON export/download for client settings in [`clientSettings.js`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\features\clientSettings.js).
- Added JSON import/validation for client settings.
- Added `Download`, `Import`, `Reset`, and `Close` actions to the client settings modal in [`ClientSettingsModal.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\ClientSettingsModal.jsx).

**First-run onboarding**
- Added local onboarding state storage in [`onboarding.js`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\features\onboarding.js).
- Added a first-run setup wizard in [`InitialSetupWizard.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\InitialSetupWizard.jsx).
- The wizard now:
  1. welcomes the user
  2. offers previous settings import
  3. asks for privacy/TOS acceptance
  4. then continues to login/register
- Wired onboarding before auth in [`renderer.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\renderer.jsx).

**Global CSS / theming support**
- Added a large client-settings CSS override layer in [`index.css`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\index.css).
- Moved many shared UI surfaces to use client-level CSS variables for colors, focus rings, spacing, contrast, motion, and sizing.
- Added styling for onboarding, client settings cards, controls, import/export errors, and modal layout.

**Small fixes**
- Fixed the broken theme swatch row.
- Fixed unreadable select text in the settings modal.
- Fixed malformed JSX left behind during the select tweak in [`ClientSettingsModal.jsx`](C:\Users\samuel.lamberg\Desktop\'\Chatapp\Application\src\components\ClientSettingsModal.jsx).
- Rewrote the onboarding file once to clean up encoding glitches in the copy.

If you want, I can turn this into a cleaner changelog grouped by file next.



Here’s the full change list from today, grouped by area.

**Friends / DMs**
- Added group DM creation flow on the real DM stack.
- Added `Encrypt chat` onboarding for fresh DMs.
- Made DMs unsendable before encryption.
- Reworked the encryption UI into a large centered lock stage.
- Rebuilt the lock logic so it no longer disappears mid-animation.
- Fixed the bug where encrypting a chat incorrectly triggered `forget old conversation`.
- Cleaned up overlapping old-conversation/restart warnings.
- Improved direct conversation import/open behavior when the conversation exists but the local device has not imported it yet.
- Friend cards now show last-message previews instead of `DM ready` once any message has ever been sent.
- Added preview truncation like `hey hows it g...`.
- Added desktop notifications for DMs and group chats when the app is unfocused.
- Added unread/highlight glow for chats with new incoming messages.
- Replaced the old time-based glow with real viewed/unread tracking.
- Unread glow now clears only when the exact conversation is actually open, focused, and visible.
- Made unread glow colors adapt to the active client theme.
- Made the Friends/DM screen itself non-scrolling while sidebars and message lists scroll internally.
- Moved add-friend into its own popup.
- Moved incoming/outgoing friend requests into that popup too.
- Removed the mistaken add-friend button next to tagged folders.
- Fixed friend right-click menus so they clamp to the viewport.
- Nudged the context menu away from the cursor a bit.
- Added collapsible tagged friend folders in the Friends rail.
- Persisted collapsed/open folder state per user.

**Friends code cleanup**
- Split `FriendsHome.jsx` into smaller components:
  - [FriendsHeader.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendsHeader.jsx)
  - [FriendsRail.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendsRail.jsx)
  - [FriendsConversationPanel.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendsConversationPanel.jsx)
  - [FriendConversationSettingsModal.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendConversationSettingsModal.jsx)
  - [FriendsCreateGroupModal.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendsCreateGroupModal.jsx)
  - [FriendContextMenu.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendContextMenu.jsx)
  - [FriendsAddFriendModal.jsx](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/components/friends/FriendsAddFriendModal.jsx)

**Friend tags**
- Turned friend tags into editable folder/tag definitions in Client Settings.
- Styled the Friend Tags editor so it matches the app.
- Grouped friends under their assigned tag folders in the Friends rail.
- Grouped tag options by folder in the friend context menu.
- Fixed the big bug where tag definitions saved but friend-to-tag assignments reset.
- Moved friend-tag assignments into client settings too, so definitions and assignments persist together.

**Servers / trust / warnings**
- Ignored `SelfHServer` when working on group DM architecture, then later used it only for the profile-image hosting work you explicitly wanted.
- Added visible server trust warnings saying server messages are stored and readable by the host/backend.
- Added a first-open server warning modal per server/device.
- Kept a smaller in-page trust banner in server view.

**Themes / visual behavior**
- Made DMs use the client theme instead of accidentally inheriting server theme colors.
- Later kept the idea that client theming should affect DMs, while actual server pages still use server theming.
- Added theme-aware unread notification glow.

**Debug mode / safer errors**
- Added a `Debug mode` client setting.
- Added friendly error formatting for normal mode and raw details only in debug mode.
- Added debug helpers in [debug.js](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/lib/debug.js).
- Fixed the bug where debug details could still show even when debug mode was off.

**Setup / onboarding**
- Removed `Download Current Settings` from the initial setup wizard because it was confusing there.

**Profile dock / sidebar identity**
- Added a bottom-left profile dock component.
- First version was in the server icon rail.
- Then moved it to the correct place: docked at the bottom of the side panel under Channels/Friends, Discord-style.
- Left click opens a larger profile card.
- Right click opens a smaller action menu with settings/copy handle/logout.
- Styled the dock and profile card.

**Profile images / backgrounds**
- Added server-hosted profile asset support to `SelfHServer`:
  - [profileAssets.routes.js](C:/Users/samuel.lamberg/Desktop/'/Chatapp/SelfHServer/routes/profileAssets.routes.js)
  - [profileAssets.service.js](C:/Users/samuel.lamberg/Desktop/'/Chatapp/SelfHServer/services/profileAssets.service.js)
- Added client-side profile asset actions in [actions.js](C:/Users/samuel.lamberg/Desktop/'/Chatapp/Application/src/features/profile/actions.js).
- Added profile media settings:
  - load avatars
  - load profile backgrounds
  - shared servers only
- Wired the profile dock to upload/change/remove avatar and background through the selected or first joined server.
- Added size/type limits for profile image uploads.

**Client Settings reorganization**
- Reorganized Client Settings into tabs:
  - `General`
  - `Profile`
  - `Advanced`
- Moved profile-related settings into the `Profile` tab.
- Made sections collapsible like folder blocks.

**Smaller fixes**
- Fixed the top chrome of Friends so the page itself no longer drifts/scrolls awkwardly.
- Kept `npx vite build` passing after the implemented frontend changes.
- Ran Node syntax checks on the new server-side profile asset files.

**Started but not finished**
- I started the groundwork for `display name + name#tag` style profiles with [user_profile.php](C:/Users/samuel.lamberg/Desktop/'/Chatapp/chatapp-core/user_profile.php), but that system is not fully rolled out through auth/friends/UI yet.

If you want, I can turn this into a cleaner changelog format next, like:
- `finished today`
- `partly started`
- `still needs follow-up`