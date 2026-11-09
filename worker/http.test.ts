// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BadRequest, readJson } from './http'

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://play.example/api/x', { method: 'POST', body, headers })

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error instanceof BadRequest ? { status: error.status, message: error.message } : error
  }
  return null
}

describe('reading a request body', () => {
  it('reads a JSON object, and treats an empty body as an empty object', async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 })
    expect(await readJson(post(''))).toEqual({})
  })

  it('refuses a body whose declared length is too big, without reading it', async () => {
    let read = false
    // Nothing is pulled from this stream until someone reads the body.
    const stream = new ReadableStream(
      {
        pull() {
          read = true
        },
      },
      { highWaterMark: 0 },
    )
    const request = new Request('https://play.example/api/x', {
      method: 'POST',
      body: stream,
      headers: { 'Content-Length': '999999' },
      duplex: 'half',
    } as RequestInit)
    expect(await refusal(readJson(request, 100))).toEqual({ status: 413, message: 'Request too large.' })
    expect(read).toBe(false)
  })

  it('counts bytes, not characters', async () => {
    // 60 "é" are 60 characters but 120 bytes.
    const body = JSON.stringify({ name: 'é'.repeat(60) })
    expect(body.length).toBeLessThan(100)
    expect(await refusal(readJson(post(body), 100))).toEqual({ status: 413, message: 'Request too large.' })
    expect(await readJson(post(body), 200)).toEqual({ name: 'é'.repeat(60) })
  })

  it('refuses what is not a JSON object', async () => {
    for (const body of ['{oops', '[1,2]', '"text"', 'null']) {
      expect(await refusal(readJson(post(body))), body).toEqual({ status: 400, message: 'Request is not JSON.' })
    }
  })
})
