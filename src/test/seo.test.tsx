import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { AppProviders, AppRoutes } from '../App'

describe('crawlers', () => {
  test('an unknown address says so and asks not to be indexed', async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/no-such-page']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    )
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
  })
})
