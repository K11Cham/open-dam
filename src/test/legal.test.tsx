import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { AppProviders, AppRoutes } from '../App'

const renderAt = (path: string) =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )

describe('privacy and terms', () => {
  test('the privacy notice says what is kept, the one cookie, and where to download or delete it', async () => {
    renderAt('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'With an account' })).toBeInTheDocument()
    expect(screen.getByText('od_session')).toBeInTheDocument()
    expect(screen.getByText(/never store your IP address as it is/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    // The contact address is the owner's to add.
    expect(screen.getByText(/a contact address, which will be added here soon/)).toBeInTheDocument()
  })

  test('the terms cover fair play, behaviour and the service as it is', async () => {
    renderAt('/terms')
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument()
    for (const name of ['Playing fair', 'Being decent', 'The service']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  test('every page links both from its footer', async () => {
    renderAt('/')
    const footer = within(await screen.findByRole('navigation', { name: 'Footer' }))
    expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
  })

  test('the sign-up form says that making an account means agreeing to both', async () => {
    renderAt('/signup')
    const agree = await screen.findByText(/By creating an account you agree to the/)
    expect(within(agree).getByRole('link', { name: 'terms' })).toHaveAttribute('href', '/terms')
    expect(within(agree).getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/privacy')
  })
})
