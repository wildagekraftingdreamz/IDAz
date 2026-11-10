// Generates IDAz's original retro sound assets and its application icon.
// Everything is synthesised / rasterised here so the repository carries no
// third-party audio or artwork.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const soundDir = join(root, 'src', 'renderer', 'assets', 'sounds')
const buildDir = join(root, 'build')
mkdirSync(soundDir, { recursive: true })
mkdirSync(buildDir, { recursive: true })

/* ------------------------------------------------------------------ audio */

const SR = 22050

function note({ from, to = from, dur, amp = 0.35, harmonics = [1, 0.22], vibrato = 0, attack = 0.006, release = 0.05 }) {
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const t = i / SR
    const k = n <= 1 ? 0 : i / (n - 1)
    const f = from + (to - from) * k
    const vib = vibrato ? 1 + Math.sin(2 * Math.PI * 5.2 * t) * vibrato : 1
    phase += (2 * Math.PI * f * vib) / SR
    let s = 0
    for (let h = 0; h < harmonics.length; h += 1) {
      s += Math.sin(phase * (h + 1)) * harmonics[h]
    }
    const env =
      Math.min(1, t / attack) *
      Math.min(1, (dur - t) / release) *
      // gentle decay gives the 2000s "boop" character
      (1 - 0.35 * k)
    out[i] = s * env * amp
  }
  return out
}

function silence(ms) {
  return new Float32Array(Math.floor((SR * ms) / 1000))
}

function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Float32Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function encodeWav(samples) {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SR, 24)
  buffer.writeUInt32LE(SR * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
  }
  return buffer
}

function writeSound(name, parts) {
  const samples = concat(parts)
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  const gain = peak > 0.92 ? 0.92 / peak : 1
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain
  writeFileSync(join(soundDir, name), encodeWav(samples))
}

// A two-note rising "uh-oh" chime: the app's signature message sound.
writeSound('message.wav', [
  note({ from: 622, to: 700, dur: 0.11, amp: 0.36, harmonics: [1, 0.3, 0.08], vibrato: 0.004 }),
  silence(16),
  note({ from: 880, to: 1010, dur: 0.2, amp: 0.44, harmonics: [1, 0.26, 0.06], vibrato: 0.005, release: 0.09 }),
])

// Outgoing message blip.
writeSound('send.wav', [
  note({ from: 1040, to: 720, dur: 0.07, amp: 0.2, harmonics: [1, 0.15], release: 0.03 }),
])

// Sign-on arpeggio.
writeSound('signon.wav', [
  note({ from: 523, dur: 0.09, amp: 0.26, harmonics: [1, 0.2] }),
  silence(20),
  note({ from: 659, dur: 0.09, amp: 0.26, harmonics: [1, 0.2] }),
  silence(20),
  note({ from: 784, to: 880, dur: 0.16, amp: 0.3, harmonics: [1, 0.2], release: 0.08 }),
])

// Soft error buzz.
writeSound('error.wav', [
  note({ from: 300, to: 180, dur: 0.22, amp: 0.3, harmonics: [1, 0.4, 0.2], release: 0.1 }),
])

/* ------------------------------------------------------------------- icon */

const W = 512
const H = 512
const pixels = new Uint8Array(W * H * 4)

function blend(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  const sa = a / 255
  pixels[i] = Math.round(pixels[i] * (1 - sa) + r * sa)
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - sa) + g * sa)
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - sa) + b * sa)
  pixels[i + 3] = Math.max(pixels[i + 3], a)
}

function roundRect(x0, y0, w, h, radius, color) {
  const r = Math.min(radius, w / 2, h / 2)
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const dx = x < x0 + r ? x0 + r - x : x > x0 + w - 1 - r ? x - (x0 + w - 1 - r) : 0
      const dy = y < y0 + r ? y0 + r - y : y > y0 + h - 1 - r ? y - (y0 + h - 1 - r) : 0
      if (dx * dx + dy * dy <= r * r) blend(x, y, color)
    }
  }
}

function circle(cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) blend(x, y, color)
    }
  }
}

function triangle(points, color) {
  const [a, b, c] = points
  const minX = Math.min(a[0], b[0], c[0])
  const maxX = Math.max(a[0], b[0], c[0])
  const minY = Math.min(a[1], b[1], c[1])
  const maxY = Math.max(a[1], b[1], c[1])
  const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / area
      const w2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / area
      const w3 = 1 - w1 - w2
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) blend(x, y, color)
    }
  }
}

// Background: dark teal slab with a vertical sheen.
for (let y = 0; y < H; y += 1) {
  const k = y / H
  for (let x = 0; x < W; x += 1) {
    const sheen = 1 - Math.abs(x - 150) / 700
    blend(x, y, [
      Math.round(8 + 8 * k + 6 * sheen),
      Math.round(38 + 26 * k + 10 * sheen),
      Math.round(34 + 20 * k + 6 * sheen),
      255,
    ])
  }
}
// Rounded mask: cut corners by painting outside transparent later.
roundRect(24, 24, W - 48, H - 48, 108, [10, 30, 27, 255])
roundRect(36, 36, W - 72, H - 72, 96, [12, 44, 39, 255])
roundRect(48, 48, W - 96, H - 96, 84, [14, 58, 50, 255])
// Inner bevel highlight
for (let x = 96; x < W - 96; x += 1) {
  blend(x, 74, [120, 230, 196, 60])
  blend(x, H - 75, [0, 0, 0, 70])
}

// Speech bubble with tail.
roundRect(104, 132, 304, 190, 58, [206, 247, 231, 255])
triangle(
  [
    [162, 296],
    [242, 296],
    [178, 386],
  ],
  [206, 247, 231, 255],
)
// Bubble inner shadow line
for (let x = 132; x < 380; x += 1) {
  blend(x, 306, [150, 205, 186, 160])
}
for (const dot of [188, 256, 324]) circle(dot, 226, 24, [12, 47, 41, 255])
// Little online LED in the corner
circle(392, 372, 34, [10, 30, 27, 255])
circle(392, 372, 25, [53, 224, 161, 255])
circle(384, 363, 8, [190, 255, 232, 200])

// Transparent outside the outer rounded slab.
const outerRadius = 108
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const dx = x < 24 + outerRadius ? 24 + outerRadius - x : x > W - 25 - outerRadius ? x - (W - 25 - outerRadius) : 0
    const dy = y < 24 + outerRadius ? 24 + outerRadius - y : y > H - 25 - outerRadius ? y - (H - 25 - outerRadius) : 0
    if (x < 24 || x > W - 25 || y < 24 || y > H - 25 || dx * dx + dy * dy > outerRadius * outerRadius) {
      const i = (y * W + x) * 4
      pixels[i] = 0
      pixels[i + 1] = 0
      pixels[i + 2] = 0
      pixels[i + 3] = 0
    }
  }
}

/* ------------------------------------------------------------------- png */

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y += 1) {
  raw[y * (W * 4 + 1)] = 0
  Buffer.from(pixels.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(join(buildDir, 'icon.png'), png)
writeFileSync(join(root, 'src', 'renderer', 'assets', 'app-icon.png'), png)

console.log('assets: sounds + icon generated')
