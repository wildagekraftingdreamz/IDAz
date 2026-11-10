// Local media cache and the idaz-media:// protocol used by every window.
// Files are content-addressed by the store key so repeated downloads reuse the
// same file, and range requests are supported so video seeking works.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { mimeFromExt } from './util.js'

export const MEDIA_SCHEME = 'idaz-media'

export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ])
}

function hashKey(key) {
  return crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 24)
}

export class MediaStore {
  constructor(dir) {
    this.dir = dir
    fs.mkdirSync(this.dir, { recursive: true })
  }

  filenameFor(key, ext) {
    const clean = String(ext || 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 6)
    return `${hashKey(key)}.${clean || 'bin'}`
  }

  pathFor(name) {
    return path.join(this.dir, path.basename(String(name || '')))
  }

  urlFor(name) {
    return `${MEDIA_SCHEME}://media/${encodeURIComponent(path.basename(String(name)))}`
  }

  exists(name) {
    try {
      return fs.statSync(this.pathFor(name)).isFile()
    } catch {
      return false
    }
  }

  saveBuffer(key, buffer, ext) {
    const name = this.filenameFor(key, ext)
    const file = this.pathFor(name)
    if (!this.exists(name)) fs.writeFileSync(file, buffer)
    return name
  }

  ensurePath(key, ext) {
    return this.pathFor(this.filenameFor(key, ext))
  }
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (!match) return null
  let start = match[1] === '' ? null : Number(match[1])
  let end = match[2] === '' ? null : Number(match[2])
  if (start === null && end === null) return null
  if (start === null) {
    start = Math.max(0, size - end)
    end = size - 1
  } else if (end === null || end >= size) {
    end = size - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end }
}

export function serveMedia(mediaStore) {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
        return new Response('Not found', { status: 404 })
      }
      const file = mediaStore.pathFor(name)
      const stat = await fsp.stat(file)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })

      const type = mimeFromExt(path.extname(file).slice(1))
      const range = request.headers.get('range')
      const parsed = range ? parseRange(range, stat.size) : null

      if (parsed) {
        const { start, end } = parsed
        const stream = fs.createReadStream(file, { start, end })
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }

      const stream = fs.createReadStream(file)
      return new Response(Readable.toWeb(stream), {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch (error) {
      if (error && error.code !== 'ENOENT') console.warn('[media] serve failed:', error.message)
      return new Response('Not found', { status: 404 })
    }
  })
}
