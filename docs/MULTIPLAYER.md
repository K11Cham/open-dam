# Multiplayer

What exists today, why it is shaped this way, and exactly what a real server
needs to do.

## The one idea: a game is a log

A match is a `MatchRecord` (`src/match/types.ts`):

```ts
{
  format: 'open-dam/match',
  version: 1,
  config: { id, mode, settings, seats, createdAt },
  actions: [ { seq, at, by, intent }, ... ]
}
```

- `config` fixes the rules and who sits where (`human`, `ai` or `remote`).
- `actions` is everything that happened, in order. `seq` starts at 1 and has
  no gaps. `at` is when it was accepted (epoch ms). `by` is `player1`,
  `player2`, or `system` (clock flags, pause and resume).
- Everything else, including the board, the move list, the clocks and pending
  offers, is **derived** by replaying the log through `replay()` in
  `src/match/reducer.ts`.

This gives the project several things from one mechanism:

| Need                | How the log provides it                                             |
| ------------------- | ------------------------------------------------------------------- |
| Save and resume     | Save the record; replay it on load.                                 |
| Review any move     | Replay keeps every position (`state.timeline`).                     |
| Undo                | An accepted undo is an action; the reducer rolls the timeline back. |
| Clocks              | Time is computed from action timestamps, so replay reproduces it.   |
| Online sync         | Send the actions; every client replays the same log.                |
| Cheating resistance | A server replays the log and rejects anything invalid.              |

## Who decides: the reducer

`stepMatch(state, by, intent, at)` is the only place that decides whether
something is allowed. It checks turn ownership, that offers are made and
answered by the right people, the per-turn limits on offers, and that a
timeout is only claimed when the clock really ran out (with 250 ms tolerance).
Then it hands board actions to the engine (`applyAction`), which checks the
rules.

The same function judges a local click, an AI decision and a message from a
remote player. A server runs exactly this code.

## Sessions

A `MatchSession` (`src/match/session.ts`) is the live, observable form of a
match that React subscribes to:

- **`MatchHost`** owns the log and is authoritative. `submit(by, intent)`
  validates, stamps `seq` and `at`, appends, and notifies subscribers. Every
  local game (pass and play, vs computer) is a host with nobody attached.
- **`MatchGuest`** (`src/net/guest.ts`) mirrors a remote host. It never decides
  anything: it sends intents and applies the stamped actions the host sends
  back. If it sees a gap in `seq`, it rejoins and receives a full snapshot.

## The wire protocol

`src/net/protocol.ts`. Every message carries `v` (protocol version),
`matchId`, and `from` (the sender's client id; one per browser tab, kept in
sessionStorage so a reloaded tab is the same client).

Guest to host:

| Message                        | Meaning                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `join {seat}`                  | Claim a remote seat, or reclaim it after a reload.             |
| `intent {seat, intent, nonce}` | Ask for something. The nonce matches a refusal to its request. |
| `ping {seat}`                  | Heartbeat every 2 s.                                           |
| `leave {seat}`                 | The tab is closing.                                            |

Host to guests:

| Message                        | Meaning                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `welcome {to, seat, record}`   | Seat granted; here is the whole game.                          |
| `seat-taken {to, seat}`        | Someone else holds that seat and is online.                    |
| `snapshot {record}`            | The whole game (sent when the host starts or a guest resyncs). |
| `action {action}`              | One accepted action, for everyone.                             |
| `rejected {to, nonce, reason}` | Your intent was refused, and why.                              |
| `presence {online}`            | Who is connected. Also the host's heartbeat.                   |
| `closed`                       | The host left.                                                 |

A seat claim expires after 6 s without a heartbeat, so a guest that crashed
can be replaced.

## Transports

`src/net/transport.ts`. A transport moves messages and nothing else:

```ts
interface Transport {
  send(message: NetMessage): void
  onMessage(handler: (message: NetMessage) => void): () => void
  close(): void
}
```

- `WebSocketTransport` (`src/net/websocket.ts`) connects a browser to the
  match server. This is what the Online page uses.
- `BroadcastChannelTransport` works between tabs of one browser. The app used
  it before the server existed; it is kept for experiments.
- `MemoryHub` / `MemoryTransport` simulate a network in tests (asynchronous,
  JSON-copied messages).

The `Transport` interface itself lives in `protocol.ts`, so the server can use
it without pulling in the browser-only transports.

## What exists today

- New game → Online → **Find a rated game** (signed in) searches the lobby for
  someone near your rating who wants the same rules; the game opens as soon as
  one is found, in the seat the lobby drew.
- New game → Online → **Invite a friend** asks the server for a game
  (`POST /api/matches` with the rules) and opens `/online/<id>?seat=<your side>`.
- While the opponent is away, a bar above the board shows the invite link
  (`/online/<id>?seat=<their side>`), with Copy and, on phones, Share.
- Both players are guests of the server, on any device. Moves, calls, chains,
  offers, resignations and clocks sync. The board stays locked until both
  players are connected.
- The server saves the game after every move. Reloading either tab, or losing
  the connection, rejoins the same seat; a game nobody has opened for 30 days
  is deleted.
- A link to a game the server does not have shows "Game not found".
- Anyone holding an invite link can take its seat while it is free. A
  signed-in player who takes a seat owns it from then on: nobody else can take
  it, even after they leave. Seats in a rated game belong to their two
  accounts from the start.
- Finished games with at least one signed-in player are stored for good in
  the players' histories (`/u/<name>`), and anyone with the link can review
  them at `/game/<id>`.

## Accounts and ratings

Accounts live on the same server, in one more Durable Object (`Accounts`,
`worker/accounts.ts`) whose SQLite database holds every account. The logic is
`AccountStore` in `worker/accountStore.ts`, plain code over a SQL connection,
so `worker/accountStore.test.ts` runs it on Node's own SQLite.

- **Signing in.** A username and a password; no email. The browser never
  sends the password: `stretchPassword` (`src/net/account.ts`) turns it into a
  key with PBKDF2 (210,000 rounds, salted with the username), and the server
  stores a salted SHA-256 of that key. The slow part runs in the browser
  because a free Worker has only milliseconds of CPU; a stolen database still
  costs an attacker the full PBKDF2 work per guess. Eight wrong passwords lock
  a username for 15 minutes; one network can make five accounts an hour.
- **Sessions.** A random token in an `HttpOnly`, `SameSite=Lax` cookie,
  stored hashed, kept 60 days from the last visit. Changing the password signs
  out every other device. Settings lists the devices and signs any of them out.
  Requests that change an account must come from this site (the Worker checks
  `Origin`), and account routes send no CORS headers.
- **A forgotten password.** Sign-up shows a recovery code once. It resets the
  password, signs out every device, and is replaced by a new code.
- **Ratings.** Elo per pool (board size and clock), from rated games only.
  The match room reports a finished game to `Accounts.recordGame`, which
  stores it once (a second report changes nothing), rates it if both seats are
  different accounts, the game was made rated, and both sides moved, and sends
  back the new ratings, which the room shows the players at once.
- **Matchmaking.** `LobbyRoom` (`worker/lobbyRoom.ts`) runs the `Lobby` for
  signed-in players only. It reads each player's ratings from `Accounts` when
  they connect, so the browser never says how strong it is, and makes each
  pairing a match room whose seats already belong to the two accounts.
- **Settings across devices.** `src/net/accountSync.ts` keeps theme, sound,
  preferences, the last New Game form and solved puzzles the same on every
  device (newest change wins; solved puzzles are combined), and finished local
  games combined by id (the account keeps 200, a device 50). Signing out
  removes the account's games and puzzle progress from the device.
- **Your data.** Settings can download everything the server keeps for an
  account as JSON, clear the game history, and delete the account (password
  needed). A deleted player's online games stay in their opponents' histories,
  without a name.

The worker routes are listed at the top of `worker/index.ts`.

## The online server (`worker/`)

The server runs on Cloudflare Workers, on the free plan:

- `worker/index.ts` is the front door. It creates matches, sends each
  WebSocket to its match's Durable Object, and serves the built app from
  `dist/` for every other path, so the site and the server share one address
  and need no CORS. The rules a browser asks for pass through
  `sanitizeSettings` (`src/game/settings.ts`): unknown fields are dropped,
  wrong values take the default, and a clock must be one of `TIME_CONTROLS`.
  Saved games loaded by `parseRecord` go through it too.
- `worker/room.ts` is `MatchRoom`, a Durable Object: Cloudflare runs exactly
  one per match id, and every player of that match reaches the same one. It
  runs `MatchServer` unchanged, with a `MatchStore` backed by the object's
  own storage.
- `worker/accounts.ts` and `worker/lobbyRoom.ts` are the accounts database
  and the matchmaking lobby, one Durable Object each (see "Accounts and
  ratings" above).
- `wrangler.jsonc` binds them and declares the Durable Objects as
  SQLite-backed, the kind the free plan includes. Each new class needs a new
  migration tag (`v1` was the match rooms, `v2` the accounts and the lobby);
  a deployed tag is never edited.

Why this host: a Durable Object is "one small server per game", which is
exactly the shape `MatchServer` already had. It does not sleep the way free
Node hosts do, and the free plan's limits (requests, duration, storage) are far
above what a board game uses. Check the current limits on Cloudflare's pricing
page before relying on numbers.

### Running it locally

`npm run server` builds the app and runs the Worker under `wrangler dev` at
http://127.0.0.1:8787, with a local Durable Object store in `.wrangler/`. No
Cloudflare account is needed. To work on the app with hot reload instead, keep
that running and use `npm run dev`: Vite forwards `/api` (WebSockets
included) to port 8787.

`npm run check:online` plays real games against it: creation, refusals,
two players, a dropped link coming back, a third client turned away, a game
reloaded from storage after everyone left, and unknown ids. Its second file
(`scripts/online-server-accounts.test.ts`) signs up throwaway accounts,
checks sign-in, profiles, settings and devices, pairs two of them in the
lobby, plays a rated game, finds them on the leaderboard, and deletes them. Point it at a
deployed server with `ONLINE_URL=https://… npm run check:online`.

### Deploying

1. A free Cloudflare account, and `npx wrangler login` once on this computer.
2. `npm run deploy` runs `verify`, then `wrangler deploy`. The first deploy
   prints the address, `https://play.<your-subdomain>.workers.dev`. A new
   subdomain can refuse connections for a minute or two while Cloudflare
   issues its certificate.
3. Run `ONLINE_URL=<that address> npm run check:online`.

The live copy is https://play.open-dam.workers.dev.

A copy of the app hosted elsewhere (the static build) can use the deployed
server: build it with `VITE_MATCH_SERVER=<address>`. Without that, the static
build's Online page says online play is not available there.

## Server roadmap

All nine steps are done.

1. **WebSocket transport — done.** `WebSocketTransport` in
   `src/net/websocket.ts` sends JSON, checks every frame with `isNetMessage`,
   queues messages while the socket is down (up to 32), and reconnects with
   doubling delays (0.5 s up to 15 s) until closed.
2. **The server's match logic — done.** `MatchServer` in `src/net/server.ts`
   does everything except listen on a port. Give each new connection to
   `accept(socket)`, pass every text frame to `receive`, and call `drop` when
   it closes. It opens one room per match from a `MatchStore`, runs a
   `MatchHost` linked with `linkHost(host, room, { hostSeat: null, … })`, sends
   a snapshot to each new connection, frees a seat as soon as its connection
   closes, and closes the room when the last one leaves. `createMatch`
   starts a game with both seats `remote`. A connection keeps the first
   client id it uses, so it cannot act for another client. A ping from a guest
   whose seat claim was lost (for example after a server restart) wins the
   seat back if nobody else holds it.
3. **Listen for connections — done.** The Cloudflare Worker and Durable
   Object above. `src/game`, `src/match` and `src/net/server.ts` have no
   browser dependencies, so they run unchanged there (and would in Node).
4. **Use the server's clock — done.** The room's host stamps `at` with server
   time, and the room submits `{ type: 'engine', action: { type: 'timeout',
player } }` as `system` at `flagTime(state.clock)`, retrying shortly if a
   timer fires a hair early.
5. **Persist records — done.** `MatchStore` is the seam: `save` is called
   after every accepted action with the full record. `MatchRoom` keeps it in
   memory and writes it to Durable Object storage; Cloudflare holds back the
   room's outgoing messages until the write is durable.
6. **Make both browsers guests — done.** `OnlinePage` uses `MatchGuest` with
   `WebSocketTransport` for both players.
7. **Identity — done.** The Worker reads the session cookie and passes the
   account to the room (`MatchServer.accept(socket, identity)`). The room
   binds a seat to the first signed-in account welcomed into it and refuses
   that seat to anyone else; client ids still tell one tab from another.
8. **Matchmaking — queue done.** `SeekQueue` in `src/net/matchmaking.ts`
   pairs two seeks whose rules agree (`settingsAreCompatible`) and whose
   ratings are within a window that starts at 100 points and widens by 50
   every 5 s of waiting, up to 500. It prefers the closest rating, never pairs
   a player with themselves, picks who moves first at random, and resolves
   "match opponent" with `agreedSettings`. Call `sweep(now)` every few
   seconds; turn each pairing into a game with `MatchServer.createMatch`.
   **Lobby — logic done.** `Lobby` in `src/net/lobby.ts` takes connections
   like `MatchServer` does. A player sends `{ channel: 'lobby', type: 'seek',
settings }` (or `cancel`); the lobby passes the settings through
   `sanitizeSettings`, looks the rating up itself with `ratingOf(player,
pool)`, answers `seeking`, sweeps every 2 s while two or more wait, and on
   a pairing calls `createMatch` and sends each player `paired` with the
   match id, their seat and the opponent's rating (or `seek-ended` if the game
   could not be made). Leaving or cancelling ends the seek. With
   `requireAccount`, the lobby takes the account id the server checked in
   place of the client id. **Done:** the `LobbyRoom` Durable Object at
   `/api/lobby/socket`, the Play page's "Find a rated game", and seats
   reserved for the two paired accounts.
9. **Ratings — arithmetic done.** `src/match/rating.ts` has Elo per pool
   (board size and time control; K 40 for the first 20 games, then 20) and
   `ratedScore`, which skips unfinished games and games where a side never
   moved. `MatchServer`'s `onFinished(record, state)` fires once per game,
   after the final save, which is where a server rates it. **Done:** stored
   per account in `Accounts`, shown live in the game, on profiles and on the
   leaderboards (`/leaderboards?pool=5x5:10+1`).

Rows w25 and w26 on the handover board tracked the server and ratings work.

## Versioning

`format` and `version` on the record, and `v` on every message, exist so old
saves and old clients can be recognised. `parseRecord` in `src/match/storage.ts`
rejects unknown versions instead of guessing. If you change the meaning of an
intent, bump the version and add a migration.
