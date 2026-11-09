import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import ErrorBoundary from '../components/layout/ErrorBoundary'
import { reportClientError, setErrorReporting } from '../net/errorReport'

function Broken(): never {
  throw new Error('board size is undefined')
}

afterEach(() => {
  setErrorReporting(false)
  vi.restoreAllMocks()
})

describe('when a page breaks', () => {
  test('a plain screen offers a reload and home, and the crash is reported with the page and message only', () => {
    setErrorReporting(true)
    const sent = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    // React logs the caught error; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText(/Any game in progress is saved on this device/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(sent).toHaveBeenCalledTimes(1)
    const [url, init] = sent.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/client-errors$/)
    const body = JSON.parse(String(init.body)) as Record<string, string>
    expect(body.kind).toBe('render')
    expect(body.route).toBe('/')
    expect(body.message).toMatch(/^board size is undefined/)
    expect(Object.keys(body).sort()).toEqual(['kind', 'message', 'route'])
  })

  test('the same error is reported once per page load, and nothing is sent outside a production build', () => {
    const sent = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    reportClientError('error', 'not sent: reporting is off in tests')
    expect(sent).not.toHaveBeenCalled()
    setErrorReporting(true)
    reportClientError('error', 'twice')
    reportClientError('error', 'twice')
    expect(sent).toHaveBeenCalledTimes(1)
  })
})
