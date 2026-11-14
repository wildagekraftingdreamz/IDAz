#!/usr/bin/env node
/**
 * Turns the report written by the `IDAZ_SMOKE=1` harness into a pass/fail.
 *
 *   IDAZ_SMOKE=1 IDAZ_SMOKE_OUT=smoke.json npx electron . --demo
 *   node scripts/check-smoke.mjs smoke.json
 *
 * The harness only reports what it saw; this decides whether it is acceptable.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2] || process.env.IDAZ_SMOKE_OUT
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

if (!file) {
  console.error('no smoke report given: pass a path or set IDAZ_SMOKE_OUT')
  process.exit(1)
}

if (!fs.existsSync(file)) {
  console.error(`smoke report missing: ${file} (the harness never finished)`)
  process.exit(1)
}

const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
console.log(`IDAz smoke report → ${path.basename(file)}\n`)

check('the harness produced a report', () => {
  assert.ok(payload && typeof payload === 'object')
})

check('both service SDKs import', () => {
  assert.equal(payload.sdkCheck?.baileys, true, `baileys: ${payload.sdkCheck?.baileys}`)
  assert.equal(payload.sdkCheck?.telegram, true, `telegram: ${payload.sdkCheck?.telegram}`)
})

check('skins and text sizes apply live', () => {
  const theme = payload.themeCheck
  assert.ok(theme && !theme.error, `theme check failed: ${theme?.error}`)
  assert.equal(theme.skin, 'classic')
  assert.equal(theme.font, 'lg')
  assert.match(String(theme.bodyFont), /^\d+(\.\d+)?px$/)
  assert.ok(String(theme.bodyBg).startsWith('rgb'), `body background: ${theme.bodyBg}`)
  assert.ok(String(theme.titlebar).length > 0)
})

check('windows rendered without errors', () => {
  const windows = payload.windows || []
  assert.ok(windows.length >= 3, `only ${windows.length} window(s) reported`)
  for (const win of windows) {
    assert.ok(!win.error, `${win.url} reported ${win.error}`)
  }
})

check('the roster shows demo contacts', () => {
  const roster = (payload.windows || []).find((w) => (w.rows || 0) > 0)
  assert.ok(roster, 'no window reported contact rows')
  assert.ok(String(roster.text).length > 0, 'roster rendered no text')
})

check('a chat window rendered message bubbles', () => {
  const chat = (payload.windows || []).find((w) => w.url.includes('#/chat/'))
  assert.ok(chat, 'no chat window in the report')
  assert.ok(chat.bubbles > 0, `chat window had ${chat.bubbles} bubbles`)
})

check('the media viewer decoded an image', () => {
  const withImage = (payload.windows || []).find((w) =>
    (w.images || []).some((i) => i.w > 0 && i.h > 0),
  )
  assert.ok(withImage, 'no window decoded a non-empty image')
})

check('clearHistory empties the transcript and the open chat', () => {
  const history = payload.historyCheck
  assert.ok(history && !history.error, `history check failed: ${history?.error}`)
  assert.ok(history.before > 0, `no messages before the wipe (${history.before})`)
  assert.equal(history.after, 0, `${history.after} messages survived the wipe`)
  // The IPC result is { ok, messages, peers } and counts every peer, so it can
  // exceed the single conversation the harness sampled.
  const removed = typeof history.cleared === 'object' ? history.cleared.messages : history.cleared
  assert.equal(typeof removed, 'number', `unexpected clearHistory result: ${JSON.stringify(history.cleared)}`)
  assert.ok(removed >= history.before, `reported ${removed} removed of ${history.before} in this chat`)
  assert.equal(history.bubblesAfterClear, 0, `${history.bubblesAfterClear} bubbles stayed on screen`)
  assert.ok(history.rows > 0, 'the roster was emptied by the wipe')
})

console.log(`\n${passed} passed, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
