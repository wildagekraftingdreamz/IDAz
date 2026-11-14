#!/usr/bin/env node
/**
 * Checks the persistence layer without Electron: settings validation, peer
 * bookkeeping, message de-duplication, the 400-message cap, atomic saves and
 * what clearHistory does and does not drop.
 *
 *   npm test
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Store } from '../src/main/store.js'

let passed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures.push(name)
    console.log(`  FAIL ${name} — ${error.message}`)
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idaz-store-test-'))
const file = path.join(dir, 'idaz-state.json')

try {
  console.log(`IDAz store test → ${dir}\n`)

  const store = new Store(dir)

  check('a fresh store starts from defaults', () => {
    assert.equal(store.settings.skin, 'teal')
    assert.equal(store.settings.fontSize, 'md')
    assert.equal(store.data.accounts.whatsapp.linked, false)
    assert.deepEqual(store.messages('nobody'), [])
  })

  check('a fresh store writes nothing until asked', () => {
    assert.equal(fs.existsSync(file), false)
  })

  check('valid settings are applied', () => {
    store.patchSettings({ skin: 'classic', fontSize: 'lg', sound: false })
    assert.equal(store.settings.skin, 'classic')
    assert.equal(store.settings.fontSize, 'lg')
    assert.equal(store.settings.sound, false)
  })

  check('invalid settings are ignored', () => {
    store.patchSettings({ skin: 'neon', fontSize: 'huge', volume: 3, unknown: 'x' })
    assert.equal(store.settings.skin, 'classic')
    assert.equal(store.settings.fontSize, 'lg')
    assert.equal(store.settings.volume, 0.7)
    assert.equal('unknown' in store.settings, false)
  })

  check('string settings are trimmed', () => {
    store.patchSettings({ telegramApiId: '  12345  ' })
    assert.equal(store.settings.telegramApiId, '12345')
  })

  check('accounts can be linked', () => {
    store.setAccount('whatsapp', { linked: true, name: 'Me', id: 'me-1' })
    assert.equal(store.data.accounts.whatsapp.linked, true)
    assert.equal(store.data.accounts.whatsapp.name, 'Me')
    assert.equal(store.setAccount('carrier-pigeon', { linked: true }), null)
  })

  check('a new peer starts clean', () => {
    const peer = store.upsertPeer({ id: 'p1', service: 'whatsapp', name: 'Mira' })
    assert.equal(peer.unread, 0)
    assert.equal(peer.lastPreview, '')
    assert.equal(peer.muted, false)
  })

  check('peer state updates and keeps mute/recency', () => {
    store.upsertPeer({ id: 'p2', service: 'telegram', name: 'Kai' })
    store.patchPeer('p1', { unread: 3, lastPreview: 'hello', lastTs: 111, muted: true })
    const peer = store.peer('p1')
    assert.equal(peer.unread, 3)
    assert.equal(peer.lastPreview, 'hello')
    assert.equal(peer.muted, true)
    assert.equal(store.patchPeer('missing', { unread: 1 }), null)
  })

  check('messages append in time order', () => {
    store.appendMessage({ id: 'm2', peerId: 'p1', fromMe: true, text: 'second', ts: 2 })
    store.appendMessage({ id: 'm1', peerId: 'p1', fromMe: false, text: 'first', ts: 1 })
    const list = store.messages('p1')
    assert.deepEqual(list.map((m) => m.id), ['m1', 'm2'])
    assert.equal(store.lastMessage('p1').id, 'm2')
  })

  check('duplicate messages are not stored twice', () => {
    assert.equal(store.appendMessage({ id: 'm1', peerId: 'p1', text: 'again', ts: 5 }).added, false)
    store.appendMessage({ id: 'm3', peerId: 'p1', remoteId: 'r-9', text: 'remote', ts: 3 })
    assert.equal(store.appendMessage({ id: 'm4', peerId: 'p1', remoteId: 'r-9', text: 'dup', ts: 4 }).added, false)
    assert.equal(store.messages('p1').length, 3)
  })

  check('history is capped at 400 messages per chat', () => {
    for (let i = 0; i < 500; i += 1) {
      store.appendMessage({ id: `bulk-${i}`, peerId: 'p2', text: 'x', ts: 1000 + i })
    }
    const list = store.messages('p2')
    assert.equal(list.length, 400)
    assert.equal(list[list.length - 1].id, 'bulk-499')
  })

  check('flush writes valid JSON', () => {
    store.flush()
    assert.equal(fs.existsSync(file), true)
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(parsed.settings.skin, 'classic')
    assert.equal(parsed.peers.p1.muted, true)
  })

  check('the save file is owner-only where the OS allows it', () => {
    if (process.platform === 'win32') return
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  })

  check('state reloads from disk', () => {
    const reloaded = new Store(dir)
    assert.equal(reloaded.settings.skin, 'classic')
    assert.equal(reloaded.settings.telegramApiId, '12345')
    assert.equal(reloaded.data.accounts.whatsapp.linked, true)
    assert.equal(reloaded.peer('p1').muted, true)
    assert.equal(reloaded.messages('p1').length, 3)
  })

  check('clearHistory drops messages but keeps the account usable', () => {
    const result = store.clearHistory()
    assert.equal(result.peers, 2)
    assert.equal(result.messages, 403)
    assert.deepEqual(store.messages('p1'), [])
    assert.deepEqual(store.messages('p2'), [])
    assert.equal(store.lastMessage('p1'), null)
    const peer = store.peer('p1')
    assert.equal(peer.unread, 0)
    assert.equal(peer.lastPreview, '')
    assert.equal(peer.lastFromMe, false)
    assert.equal(peer.muted, true, 'mute state must survive a wipe')
    assert.equal(peer.lastTs, 111, 'recency stamp must survive a wipe')
    assert.equal(peer.name, 'Mira')
  })

  check('clearHistory keeps settings and linked accounts', () => {
    assert.equal(store.settings.skin, 'classic')
    assert.equal(store.settings.telegramApiId, '12345')
    assert.equal(store.data.accounts.whatsapp.linked, true)
  })

  check('a wiped store persists the wipe', () => {
    store.flush()
    const reloaded = new Store(dir)
    assert.deepEqual(reloaded.data.messages, {})
    assert.equal(reloaded.peer('p1').unread, 0)
    assert.equal(reloaded.settings.skin, 'classic')
  })

  check('a corrupt save file starts fresh instead of crashing', () => {
    fs.writeFileSync(file, '{ not json', 'utf8')
    const recovered = new Store(dir)
    assert.equal(recovered.settings.skin, 'teal')
    assert.deepEqual(recovered.data.peers, {})
  })

  console.log(`\n${passed} passed, ${failures.length} failed`)
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
