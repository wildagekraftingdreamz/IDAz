// Dev-only demo data, used by `npm run dev -- --demo` to preview the UI without
// linking real accounts.
import fs from 'node:fs'
import path from 'node:path'

const now = Date.now()

export function seedDemo(store, media) {
  if (Object.keys(store.peers).length > 0) return

  let photoName = null
  try {
    const icon = path.join(process.cwd(), 'build', 'icon.png')
    if (fs.existsSync(icon)) {
      photoName = media.saveBuffer('demo-photo', fs.readFileSync(icon), 'png')
    }
  } catch {
    // demo can run without the picture
  }

  const seedPeer = (peer, messages) => {
    store.upsertPeer(peer)
    for (const message of messages) store.appendMessage(message)
    const last = messages[messages.length - 1]
    if (last) {
      store.patchPeer(peer.id, {
        lastTs: last.ts,
        lastPreview: last.kind === 'text' ? last.text : `\u{1F4F7} ${last.text || last.kind}`,
        lastFromMe: last.fromMe,
      })
    }
  }

  seedPeer(
    { id: 'demo:mira', service: 'whatsapp', name: 'Mira Halvorsen', unread: 2, meta: {} },
    [
      { id: 'demo:m1', peerId: 'demo:mira', service: 'whatsapp', fromMe: false, ts: now - 540000, kind: 'text', text: 'Did you ever get that old ICQ skin working?' },
      { id: 'demo:m2', peerId: 'demo:mira', service: 'whatsapp', fromMe: true, ts: now - 480000, kind: 'text', text: 'Better. Dark teal, floating windows, the whole thing.', status: 'read', remoteId: '1' },
      { id: 'demo:m3', peerId: 'demo:mira', service: 'whatsapp', fromMe: false, ts: now - 420000, kind: 'text', text: 'Send me a screenshot when it is ready!' },
      { id: 'demo:m4', peerId: 'demo:mira', service: 'whatsapp', fromMe: false, ts: now - 200000, kind: 'image', text: 'Found this on an old drive', media: photoName ? { kind: 'image', mime: 'image/png', name: 'lan-party.png', localPath: photoName, downloadState: 'ready' } : { kind: 'image', mime: 'image/png', downloadState: 'none' } },
      { id: 'demo:m5', peerId: 'demo:mira', service: 'whatsapp', fromMe: false, ts: now - 196000, kind: 'text', text: 'Are you around later? Going to test the audio.' },
    ],
  )

  seedPeer(
    { id: 'demo:lan', service: 'whatsapp', name: 'LAN Party 1999', isGroup: true, meta: {} },
    [
      { id: 'demo:l1', peerId: 'demo:lan', service: 'whatsapp', fromMe: false, ts: now - 3600000, kind: 'text', text: 'Bringing the CRT and my old mechanical keyboard.', author: 'Tobias' },
      { id: 'demo:l2', peerId: 'demo:lan', service: 'whatsapp', fromMe: false, ts: now - 3500000, kind: 'sticker', media: { kind: 'sticker', mime: 'image/webp', downloadState: 'none' }, author: 'Rae' },
      { id: 'demo:l3', peerId: 'demo:lan', service: 'whatsapp', fromMe: true, ts: now - 3400000, kind: 'text', text: 'I will bring the speakers. Predictable.', status: 'delivered', remoteId: '2' },
    ],
  )

  seedPeer(
    { id: 'demo:dmitri', service: 'telegram', name: 'Dmitri Volkov', meta: { username: 'dvolkov' } },
    [
      { id: 'demo:d1', peerId: 'demo:dmitri', service: 'telegram', fromMe: false, ts: now - 7200000, kind: 'text', text: 'The QR login flow works on my side now.' },
      { id: 'demo:d2', peerId: 'demo:dmitri', service: 'telegram', fromMe: true, ts: now - 7100000, kind: 'file', text: '', status: 'read', remoteId: '3', media: { kind: 'file', mime: 'application/pdf', name: 'idaz-notes.pdf', size: 482000, downloadState: 'none' } },
      { id: 'demo:d3', peerId: 'demo:dmitri', service: 'telegram', fromMe: false, ts: now - 600000, kind: 'text', text: 'Also: the sound is perfect. Very 2001.' },
    ],
  )

  seedPeer(
    { id: 'demo:sticker', service: 'telegram', name: 'Sticker Guild', isGroup: true, meta: {} },
    [
      { id: 'demo:s1', peerId: 'demo:sticker', service: 'telegram', fromMe: false, ts: now - 86400000, kind: 'gif', media: { kind: 'gif', mime: 'video/mp4', name: 'dancing.gif', downloadState: 'none' }, author: 'Nadia' },
      { id: 'demo:s2', peerId: 'demo:sticker', service: 'telegram', fromMe: false, ts: now - 86300000, kind: 'text', text: 'That animation is older than this app.', author: 'Jules' },
    ],
  )

  store.flush()
}
