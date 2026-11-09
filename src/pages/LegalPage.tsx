import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import Panel from '../components/ui/Panel'
import { usePageTitle } from '../lib/usePageTitle'

/**
 * Where people can write to the owner. Null until the owner adds one; the
 * pages then say an address is coming. (Owner: put an email address here.)
 */
const OWNER_CONTACT: string | null = 'kylar11cham@gmail.com'

const UPDATED = '8 November 2026'

function Contact() {
  return OWNER_CONTACT ? (
    <a href={`mailto:${OWNER_CONTACT}`}>{OWNER_CONTACT}</a>
  ) : (
    <span>a contact address, which will be added here soon</span>
  )
}

/** `/privacy`: what the site keeps about people, why, for how long, and what they can do about it. */
export function PrivacyPage() {
  usePageTitle('Privacy')
  return (
    <AppShell>
      <div className="page page--narrow legal">
        <Panel as="article" aria-labelledby="privacy-h">
          <h1 id="privacy-h" className="panel__title">
            Privacy
          </h1>
          <p className="panel__text">Last updated {UPDATED}.</p>

          <h2>In short</h2>
          <p>
            Open Dam keeps what it needs to run accounts, ratings and online games, and nothing to sell or to follow you around.
            There are no adverts, no trackers and no third-party scripts. You can download or delete everything kept about you.
          </p>

          <h2>Without an account</h2>
          <p>
            Games against the computer and pass-and-play games stay in your browser: the game in progress, your last 50 finished
            games, your settings and the puzzles you have solved. The app also saves itself in your browser so it works offline.
            None of this is sent anywhere. Clearing the site's data in your browser removes it.
          </p>
          <p>
            An online game is played through the server, which keeps the game (its moves and result) while it is played and
            deletes it 30 days after anyone last opened it.
          </p>

          <h2>With an account</h2>
          <ul>
            <li>
              <strong>Your profile:</strong> username, display name, avatar colour, bio, whether your games are public, and when
              you joined.
            </li>
            <li>
              <strong>Your password:</strong> never sent to us. Your browser turns it into a key, and we keep only a salted hash
              of that key. Your recovery code is kept the same way.
            </li>
            <li>
              <strong>Signed-in devices:</strong> for each, a hash of its session token, a description such as "Chrome on Windows"
              taken from the browser, and when it was signed in and last used.
            </li>
            <li>
              <strong>Your play:</strong> ratings for each board size and clock, and your online games (moves, result and rating
              changes).
            </li>
            <li>
              <strong>Kept in step across your devices:</strong> theme, sound, preferences, your last new-game choices, solved
              puzzles, and up to 200 finished games played on your devices.
            </li>
            <li>
              <strong>Reports</strong> you make about another player: who reported whom, the reason, and when.
            </li>
          </ul>

          <h2>Your network address</h2>
          <p>
            We never store your IP address as it is. To stop abuse (too many sign-ups or sign-in attempts from one network), we
            keep a keyed hash of it: on a new account for 24 hours, and in short-lived counters that are cleared when their window
            ends. Cloudflare, which hosts the site, keeps request logs for a few days.
          </p>

          <h2>Cookies</h2>
          <p>
            One cookie, <code>od_session</code>, and only once you sign in. It keeps you signed in for 60 days after you last use
            the site. There are no other cookies.
          </p>

          <h2>What is public</h2>
          <p>
            Your profile page shows your username, display name, avatar colour, bio, ratings and record. Your recent online games
            are listed there too unless you hide them in Settings. A finished online game can be opened by anyone who has its
            link, even if you hide your games; links are long and random, so nobody can guess them.
          </p>

          <h2>Errors</h2>
          <p>
            If the app crashes, it sends the page's address (without anything after a ?) and the error's message, so we can fix
            it. Nothing about you or your account is sent with it.
          </p>

          <h2>How long</h2>
          <p>
            Account data is kept until you delete the account. Signed-in devices are forgotten 60 days after they were last used.
            When you delete your account, everything above goes at once; your past online games stay in your opponents' histories
            with your side shown as a deleted player.
          </p>

          <h2>Your choices</h2>
          <p>
            In <Link to="/settings">Settings</Link> → Your data you can download everything kept for your account, clear your game
            history, and delete the account. You can hide your games, change your profile, and sign out any device.
          </p>

          <h2>Who runs it</h2>
          <p>
            Open Dam is run by its owner, a private person, and hosted on Cloudflare. To ask about your data, write to <Contact />
            .
          </p>
        </Panel>
      </div>
    </AppShell>
  )
}

/** `/terms`: the few rules of the site, in plain words. */
export function TermsPage() {
  usePageTitle('Terms')
  return (
    <AppShell>
      <div className="page page--narrow legal">
        <Panel as="article" aria-labelledby="terms-h">
          <h1 id="terms-h" className="panel__title">
            Terms
          </h1>
          <p className="panel__text">Last updated {UPDATED}.</p>

          <h2>Playing fair</h2>
          <ul>
            <li>Play rated games yourself, without help from a program or another person.</li>
            <li>Keep one account. Do not play your own accounts against each other to move ratings.</li>
            <li>Do not leave or stall a rated game to avoid losing; the clock will end it.</li>
          </ul>

          <h2>Being decent</h2>
          <ul>
            <li>
              No abuse, hate or harassment in usernames, display names or bios, and no pretending to be someone else (including
              the computer players or the site itself).
            </li>
            <li>Do not try to break, overload or get around the limits of the site.</li>
          </ul>
          <p>
            Anyone can report a player from their profile. We may reset a name or bio, rename an account, or suspend it, when
            these rules are broken.
          </p>

          <h2>The service</h2>
          <p>
            Open Dam is free and provided as it is, without any promise that it will always be available, free of mistakes, or
            that your games and ratings will be kept forever. It may change or stop. You can download your data from Settings at
            any time.
          </p>
          <p>
            The code is open source; its licence is in the project's <code>LICENSE</code> file. How we handle your data is in the{' '}
            <Link to="/privacy">privacy notice</Link>.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms: <Contact />.
          </p>
        </Panel>
      </div>
    </AppShell>
  )
}
