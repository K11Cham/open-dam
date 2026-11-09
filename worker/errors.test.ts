// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_CLIENT_ERROR_BYTES, clientErrorReport, internalError } from './errors'

const collect = () => {
  const lines: Record<string, unknown>[] = []
  return { lines, log: (line: Record<string, unknown>) => lines.push(line) }
}

const report = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://play.example/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('an unexpected error in the Worker', () => {
  it('is answered as JSON with a request id that matches one structured log line', async () => {
    const { lines, log } = collect()
    const request = new Request('https://play.example/api/me?x=1', { headers: { 'cf-ray': 'ray-123' } })
    const response = internalError(new Error('database is locked'), request, log)
    expect(response.status).toBe(500)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(await response.json()).toEqual({
      error: 'Something went wrong on the server. Try again in a moment.',
      requestId: 'ray-123',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      level: 'error',
      event: 'worker-error',
      route: 'GET /api/me',
      status: 500,
      requestId: 'ray-123',
      message: 'database is locked',
    })
  })

  it('gets a fresh request id when Cloudflare gave none', async () => {
    const response = internalError('odd', new Request('https://play.example/api/x'), () => {})
    expect(((await response.json()) as { requestId: string }).requestId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('client error reports', () => {
  it('log the page and the message, without the query string', async () => {
    const { lines, log } = collect()
    const response = await clientErrorReport(
      report({ route: '/u/kylar?token=secret', message: 'x is undefined', kind: 'render' }),
      log,
    )
    expect(response.status).toBe(204)
    expect(lines[0]).toMatchObject({
      level: 'error',
      event: 'client-error',
      kind: 'render',
      route: '/u/kylar',
      message: 'x is undefined',
    })
    expect(JSON.stringify(lines[0])).not.toContain('secret')
  })

  it('cut a long message and refuse what is not a report', async () => {
    const { lines, log } = collect()
    await clientErrorReport(report({ route: '/', message: 'm'.repeat(2000) }), log)
    expect((lines[0].message as string).length).toBe(500)
    expect((await clientErrorReport(report('{oops'), log)).status).toBe(400)
    expect((await clientErrorReport(report({ route: '/' }), log)).status).toBe(400)
    expect((await clientErrorReport(report({ route: 'http://elsewhere', message: 'x' }), log)).status).toBe(400)
    expect((await clientErrorReport(report([1, 2]), log)).status).toBe(400)
    expect(lines).toHaveLength(1)
  })

  it('refuse a body over the size cap, by its declared length or its bytes', async () => {
    const big = { route: '/', message: 'é'.repeat(MAX_CLIENT_ERROR_BYTES) }
    expect((await clientErrorReport(report(big), () => {})).status).toBe(413)
    expect((await clientErrorReport(report({ route: '/', message: 'x' }, { 'Content-Length': '999999' }), () => {})).status).toBe(
      413,
    )
  })
})
