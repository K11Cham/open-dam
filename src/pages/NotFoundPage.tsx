import AppShell from '../components/layout/AppShell'
import { ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { usePageTitle } from '../lib/usePageTitle'

export default function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <AppShell>
      <div className="page page--narrow">
        <Panel>
          <h1 className="panel__title">Page not found</h1>
          <p className="panel__text">That address does not match anything in Open Dam.</p>
          <div className="panel__actions">
            <ButtonLink to="/" variant="primary">
              Home
            </ButtonLink>
            <ButtonLink to="/play">New game</ButtonLink>
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}
