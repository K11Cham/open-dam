/**
 * The security headers every response carries. Static files get them from
 * `public/_headers`, which Cloudflare applies to assets; responses the Worker
 * makes itself (everything under /api) get them from `secured`, because
 * `_headers` is not applied to those. A test keeps the two the same.
 *
 * The policy, piece by piece:
 *  - scripts, workers (the computer opponent, the service worker), fonts,
 *    images and the manifest come only from this site;
 *  - styles may be inline: framer-motion and React write `style` attributes;
 *  - `connect-src 'self' wss:` lets the app reach its own API and sockets. A
 *    bare `'self'` covers same-host sockets in current browsers; `wss:` keeps
 *    online play working in older Safari, which did not;
 *  - nobody may frame the site (`frame-ancestors 'none'`, plus
 *    `X-Frame-Options` for old browsers), and plugins are off.
 *
 * HSTS is left to the owner: once sent with preload it cannot be taken back
 * quickly.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' wss:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

/** The same response with the security headers added. A WebSocket upgrade is passed through untouched. */
export function secured(response: Response): Response {
  if (response.status === 101) return response
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!headers.has(name)) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
