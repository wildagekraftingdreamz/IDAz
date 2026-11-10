# IDAz

A nostalgic desktop messenger for **WhatsApp** and **Telegram**, dressed up like ICQ 5: a dark teal contact roster, separate floating chat windows, beveled buttons, a synthesized "uh-oh" message chime, four skins and four text sizes.

IDAz is an original tribute app. It is not affiliated with ICQ, WhatsApp, Telegram or Meta.

## What it does

- **WhatsApp**: link as a device by scanning a QR code (Baileys, no embedded browser). The link survives restarts.
- **Telegram**: sign in with a QR code or a phone number + login code (+ two-step password when enabled). The MTProto session survives restarts.
- **Roster**: contacts sorted by recent activity, unread badges, message previews, live "typing…" status, per-service indicator.
- **Search**: search contact names and message history from the roster. A message result opens that chat at the matching message. Press `Ctrl/Cmd+F` to focus search, `↑`/`↓` to move through message results, `Enter` to open the active one, `F3`/`Shift+F3` for next/previous, and `Esc` to clear. After scoping results to a contact, **Open chat** in the scope bar (or `Alt+Enter`) jumps straight to that conversation. **Profile** (or `Alt+P`) opens the contact's profile window, and **All chats** (or `Alt+A`) clears the contact scope.
- **Result menu**: right-click a message search result to open it, open the contact's profile, copy the full message text, search only that conversation, switch back to all chats, or mute/unmute the contact.
- **Profiles**: open a contact's profile from a message result to see its service, username, last activity, unread count and notification state, then open the chat or mute it there.
- **Mute**: mute notifications from the bell on each roster row, from the chat header, or from a contact's right-click menu. Muted chats still count unread messages but make no sound and do not flash the window.
- **Clear history**: one button in Settings wipes every stored message, preview and unread badge while keeping linked accounts, contacts, mute state, recency order, skins and settings. Open chat windows empty immediately.
- **Unread**: right-click a contact to mark it read (sends read receipts) or clear unread locally without sending receipts. Both actions are disabled when there is nothing unread.
- **Chat windows**: one real desktop window per conversation, so several people can be open side by side.
- **Chat shortcuts**: `Enter` or `Ctrl+Enter` sends, `Shift+Enter` adds a line, `Esc` closes the chat, `Ctrl+R`/`Ctrl+E` quote the last received/sent message, and `Ctrl+B`/`I`/`U` wrap the selection in message markup. The `?` button in a chat header shows the list.
- **Roster shortcuts**: the `?` button in the roster header opens a compact guide to search, result navigation, and scoped-search keys.
- **Messages**: text, read receipts (✓ / ✓✓), typing indicators, attachments.
- **Media**: photos, videos, GIFs, stickers, voice notes and arbitrary files. Click any media item for a fullscreen viewer with save/open actions.
- **Skin/typography**: Deep Teal (default), ICQ Classic, Midnight Plum, Amber CRT; Small–XL text.
- **Cross-platform**: Windows (NSIS + portable), macOS (DMG + ZIP) and Linux (AppImage + DEB).

## Requirements

- Node.js 20.19+ or 22.12+ (developed on Node 24).
- Windows 10+, macOS 11+ or a modern Linux desktop.

## Run it

```bash
npm install
npm run dev
```

`npm install` may be blocked by npm's install-script policy (npm 11 asks before running package scripts). If Electron's binary is missing afterwards, run:

```bash
node node_modules/electron/install.js
```

Then:

```bash
npm run dev          # Vite + Electron, with hot reload for the UI
npm run dev -- --demo  # fake contacts, no account needed (UI preview)
npm run build        # production renderer bundle
npm start            # run the built app
```

## Link your accounts

Open the **+** button in the roster (or the gear → Accounts) to open the linking window.

### WhatsApp

1. Choose **Link with QR code**.
2. On your phone: WhatsApp → **Settings → Linked devices → Link a device**.
3. Scan the code shown in IDAz.

This is the same linked-device mechanism WhatsApp Web uses. Your phone remains the primary device. Unlinking from the phone signs IDAz out.

### Telegram API credentials

Telegram requires every client to identify itself with an API ID and hash:

1. Visit [my.telegram.org](https://my.telegram.org) and log in.
2. Open **API development tools**, create an app (any name/short name).
3. Copy the **api_id** and **api_hash** into IDAz → Settings → Telegram (or the linking window).

These values are stored locally with the rest of IDAz's settings. They are per-application identifiers, not your account password.

Then choose **QR code** (Telegram → Settings → Devices → Link desktop device) or **Phone number** (enter it in international format; the login code arrives inside Telegram).

## Where your data lives

IDAz keeps everything on this computer, under Electron's application-data directory:

| Platform | Folder |
| --- | --- |
| Windows | `%APPDATA%\IDAz` |
| macOS | `~/Library/Application Support/IDAz` |
| Linux | `~/.config/IDAz` |

- `idaz-state.json` — settings, contacts, message history (last 400 per chat), media metadata.
- `sessions/whatsapp.json` — WhatsApp linked-device credentials and signal keys.
- `sessions/telegram.session` — Telegram MTProto string session.
- `media/` — downloaded and sent media.

**Treat the session files like passwords.** A WhatsApp session file or Telegram string session grants full access to that account. They are written with owner-only permissions where the OS supports it, but they are not encrypted at rest beyond your OS account protection. Sign out from Settings (or unlink the device on your phone) if a machine is lost or shared.

Messages travel directly between this app and WhatsApp/Telegram; there is no SoulApps relay server.

## Architecture

```
src/
  main/                  Electron main process
    main.js              app lifecycle, single instance, dev smoke harness
    windows.js           roster, per-chat windows, login, fullscreen viewer
    ipc.js               narrow typed IPC surface
    messenger.js         orchestration, unread state, media cache, broadcasts
    store.js             atomic JSON persistence
    media.js             local cache + idaz-media:// streaming protocol
    adapters/whatsapp.js Baileys adapter
    adapters/telegram.js GramJS (MTProto) adapter
  preload/preload.cjs    contextBridge API (contextIsolation + sandbox)
  renderer/              React 19 + Vite UI, skins in styles/base.css
```

Security posture: `nodeIntegration` is off, `contextIsolation` and `sandbox` are on, the renderer only receives sanitized JSON, sessions and network libraries stay in the main process, and all media is served from a local custom protocol.

## Packaging

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Artifacts land in `release/`. Each platform must be built on that platform (or in a suitable CI image); macOS signing/notarization is not configured.

## Known limits

- WhatsApp support uses an unofficial multi-device client. WhatsApp can change its protocol at any time and may consider unofficial clients a terms-of-service violation; use it on your own account at your own risk.
- WhatsApp history is whatever the linked device sync provides; older history cannot always be fetched on demand.
- Telegram needs your own API ID/hash; without them the Telegram tab explains what to do.
- Attachments are limited to 250 MB; WhatsApp itself enforces a lower limit.
- No voice/video calls, group administration, or message editing/deletion.
- The message chime is an original synthesized two-note sound inspired by the era, not the trademarked ICQ audio asset.

## Development checks

```bash
npm run typecheck
npm run build
# UI smoke test with demo data (opens roster, a chat and the viewer, prints DOM checks, quits)
IDAZ_SMOKE=1 npx electron . --demo
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 SoulApps.
