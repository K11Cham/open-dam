import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import AppShell from '../components/layout/AppShell'
import BrandMark from '../components/layout/BrandMark'
import { ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { usePageTitle } from '../lib/usePageTitle'

/**
 * Sections only the owner can write: the game's history, how it is played in
 * the village, its local names and variations, a photograph. Facts about
 * Gambian culture must come from the owner, not be made up, so this list
 * starts empty and the page shows nothing for it until the owner adds a
 * section. (Owner: add `{ title, paragraphs }` entries here.)
 */
const OWNER_SECTIONS: Array<{ title: string; paragraphs: string[] }> = []

/**
 * `/about`: Dam in The Gambia. Everything on it comes from the README and the
 * owner's own words elsewhere in the app; the computer players' names and
 * meanings are read from `DIFFICULTIES`, so they cannot drift apart.
 */
export default function AboutPage() {
  usePageTitle('Dam in The Gambia')
  return (
    <AppShell>
      <div className="page page--narrow about-dam">
        <Panel as="article" aria-labelledby="about-dam-h">
          <BrandMark className="about-dam__mark" />
          <h1 id="about-dam-h" className="panel__title">
            Dam in The Gambia
          </h1>

          <h2>A game drawn in the sand</h2>
          <p>
            Dam is a board game played across The Gambia, often on a grid drawn in the sand, with sticks for one side and stones
            for the other. There are many variations. The most common is a 5×5 board for two players, and it is played by children
            and adults alike.
          </p>

          <h2>Where this version comes from</h2>
          <p>
            Open Dam was made by someone who lived in The Gambia for about eight years. On trips to their father’s home village,
            Kerr Jarga Jobe in the North Bank Region, Dam was one of the most common games. This app is a way to keep those
            memories, to play any time, and to share a piece of Gambian culture with anyone who wants to try it.
          </p>

          <h2>The computer players’ names</h2>
          <p>The five computer opponents are named in Wolof, from the weakest to the strongest:</p>
          <dl className="about-dam__names">
            {DIFFICULTY_IDS.map((id) => (
              <div key={id} className="about-dam__name">
                <dt>{DIFFICULTIES[id].name}</dt>
                <dd>{DIFFICULTIES[id].meaning}</dd>
              </div>
            ))}
          </dl>

          <h2>The sand, in the app</h2>
          <p>
            The Sand theme draws the board the way it is played outdoors: a grid scratched into sand, stones against sticks. The
            logo is the opening position of a small board, four sticks against four stones with the centre left open.
          </p>

          {OWNER_SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ))}

          <div className="panel__actions">
            <ButtonLink to="/learn" variant="primary">
              Learn the rules
            </ButtonLink>
            <ButtonLink to="/play">Play a game</ButtonLink>
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}
