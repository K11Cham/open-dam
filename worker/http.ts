/** Reading request bodies, apart from the routes so the tests can reach it. */

/** A request the Worker refuses, with its status and a sentence for people. */
export class BadRequest extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Requests are a few hundred bytes; a finished game a few tens of kilobytes. Anything far bigger is not real. */
export const MAX_BODY_BYTES = 4096

/**
 * A JSON object from the request body, refusing anything over `limit` bytes.
 * The declared length is checked before reading, so an oversized upload is
 * turned away without being read; then the bytes actually read are counted
 * (not characters: "é" is two bytes), since a declared length can lie or be
 * missing.
 */
export async function readJson(request: Request, limit = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > limit) throw new BadRequest(413, 'Request too large.')
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > limit) throw new BadRequest(413, 'Request too large.')
  if (bytes.byteLength === 0) return {}
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('not an object')
    return body as Record<string, unknown>
  } catch {
    throw new BadRequest(400, 'Request is not JSON.')
  }
}
