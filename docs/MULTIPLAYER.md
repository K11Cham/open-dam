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
  costs an attacker the full PBKDF2 work per guess. Eight wrong passwords
  from one network lock that network out of that username for 15 minutes,
  so nobody can lock a player out from elsewhere; 50 from all networks
  together lock the username for everyone (the backstop against guessing
  spread over many addresses). The same counts apply to recovery codes and to
  confirming the current password. One network can make five accounts an
  hour.
- **Rate limits.** `worker/rateLimit.ts` limits each network (by
  `CF-Connecting-IP`, stored only as a hash): 30 new matches an hour, 30
  sign-ins and recoveries together per 15 minutes, 120 username checks a
  minute. The counts are kept in the Accounts store (`rate_limits`, exact and
  global); Cloudflare's rate limiting binding (`RATE_LIMITER`, 120 a minute)
  sits in front as a cheap flood filter when it is bound. A refusal is a 429
  with a sentence and `Retry-After`. Requests without an address (only local
  development) are not limited.
- **Sessions.** A random token in an `HttpOnly`, `SameSite=Lax` cookie,
  stored hashed, kept 60 days from the last visit. Changing the password signs
  out every other device. Settings lists the devices and signs any of them out.
  Requests that change an account must come from this site (the Worker checks
  `Origin`), and account routes send no CORS headers.
- **A forgotten password.** Sign-up shows a recovery code once. It resets the
  password, signs out every device, and is replaced by a new code. There is
  no email, so the sign-up form and the code screen say plainly that without
  the code a forgotten password loses the account; the code can be copied or
  downloaded as a text file. Settings → Sign-in shows when the current code
  was made (`recovery_issued_at`, migration 4) and makes a new one.
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
- **Changing the tables.** `MIGRATIONS` in `worker/accountStore.ts` lists
  every change to the database, oldest first; the store runs the ones a
  database has not had when the Accounts object starts (the count is kept in a
  `schema_version` table). Add a new entry for a new column or table, never
  edit a deployed one.
- **Backups.** Cloudflare keeps 30 days of the accounts database's history.
  The owner-only `/api/admin/backup/*` routes (`worker/admin.ts`, behind the
  `ADMIN_TOKEN` secret) turn a time into a bookmark and roll the database
  back to it; `docs/OPERATIONS.md` has the runbook.
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
  one per match id, and every player of that match reaches the same one. Its
  logic is `RoomCore` (`worker/roomCore.ts`), which runs `MatchServer` with a
  `MatchStore` backed by the object's own storage; `room.ts` only connects it
  to Cloudflare, so `worker/roomCore.test.ts` runs the real thing on a fake
  storage, fake sockets and a fake clock.
- `worker/accounts.ts` and `worker/lobbyRoom.ts` are the accounts database
  and the matchmaking lobby, one Durable Object each (see "Accounts and
  ratings" above).
- `wrangler.jsonc` binds them and declares the Durable Objects as
  SQLite-backed, the kind the free plan includes. Each new class needs a new
  migration tag (`v1` was the match rooms, `v2` the accounts and the lobby);
  a deployed tag is never edited.

### Sleeping between moves (hibernation)

A Durable Object holding an ordinary WebSocket stays in memory, and is billed
for every second, as long as the socket is open, even while both players
think. The free plan allows 13,000 GB-s of Durable Object duration a day
(about 28 object-hours at 128 MB), so a few games left open would use it up.
Both socket objects therefore use the **Hibernatable WebSockets API**:

- `ctx.acceptWebSocket` instead of `socket.accept()`, and the
  `webSocketMessage` / `webSocketClose` / `webSocketError` handlers. Between
  frames, the runtime may evict the object while its sockets stay open.
- **No timers.** The server's host link runs in `presence: 'connection'`
  mode: a seat is held while its client's connection is open (or until it has
  been silent for 20 s and someone else asks for the seat), not by heartbeat
  pings, so no interval runs. A clock's flag is a Durable Object alarm, not a
  `setTimeout` (`MatchServer`'s `schedule` and `runDue`). The lobby's sweep is
  an alarm too, and stops once no rating window can widen further.
- **Keepalives that do not wake the object.** Once a socket has sent one full
  message, `WebSocketTransport` sends each later heartbeat ping as the fixed
  text `KEEPALIVE_REQUEST`. `MatchRoom` registers it with
  `setWebSocketAutoResponse`, so the runtime answers it (with an `alive`
  message for that match) without waking the room. A server that does wake for
  one treats it as a ping from whoever holds that connection. Older clients
  that still send full pings get an `alive` answer too.
- **Waking up.** Each socket carries an attachment: its own id, its account,
  and what `MatchServer` needs to pick it up (`ConnectionMemo`: client id and
  matches joined). Seat holders are kept in storage (`seats`). When the object
  wakes, `RoomCore.open` hands every open socket to `MatchServer.resume`,
  which reopens the room with the same seats, sending nothing. In the lobby a
  waiting seek lives in its socket's attachment and `Lobby.resume` puts it back
  on the queue.

A deploy or a restart of `wrangler dev` drops the sockets. The clients
reconnect on their own; the first message on each new socket is a full one,
so the server learns who they are and gives them their seats back.

### One alarm, three deadlines

`MatchRoom` keeps one alarm, set for the earliest of:

1. **The running clock's flag.** When it rings, the room opens the game even
   with nobody connected, submits the timeout as `system`, saves, and reports
   the result. A rated game abandoned by both players therefore ends on time
   and is rated: the side whose clock ran out loses.
2. **A report to retry.** When a game with accounts ends, the room writes a
   `pendingReport` to storage before calling `Accounts.recordGame`, and
   deletes it only after that succeeds. A failure is logged
   (`report-failed`) and retried after 1 minute, 5 minutes, 30 minutes, then
   hourly. `recordGame` is idempotent per game id, so a retry that races a
   slow success stores the game once. Ratings that arrive late are announced
   to whoever is still connected.
3. **The clean-up.** A game nobody has opened for 30 days is deleted (a game
   with accounts lives on in their histories). A report still pending then is
   logged as `report-abandoned`.

The deadlines are stored under `deadlines` so a woken object knows which one
rang.

**Rated play is timed only**, so every rated game has a clock that ends it.
The lobby refuses an untimed seek (`requireClock`, with the reason "Rated
games need a clock…"), the Play page hides "Untimed" while "Find a rated game"
is chosen and starts the form at 10+1, and untimed pools are no longer
featured on the leaderboards (`FEATURED_POOLS`). Ratings earned in untimed
pools before this stay in the database and still show on profiles. Casual
games (invite links, the computer, pass and play) may be untimed.

A rated game in which one side never moved has no running clock (the clock
starts after both first moves). It is cleaned up after 30 days without being
stored; it would not have been rated anyway (`ratedScore`).

### Security headers

Every response carries a Content Security Policy (scripts, workers, fonts and
images only from this site; inline styles allowed for framer-motion; no
framing; no plugins), `X-Content-Type-Options: nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a
`Permissions-Policy` that turns off camera, microphone and location. Static
files get them from `public/_headers`; the Worker's own `/api` answers get the
same ones from `worker/securityHeaders.ts`, because Cloudflare does not apply
`_headers` to responses a Worker makes. `/sw.js` is `no-cache`. HSTS is not
sent: that is the owner's decision. `npm run check:browser` loads every page
in real Chrome and fails on any policy violation.

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
deployed server with `ONLINE_URL=https://… npm run check:online`. With
`ONLINE_SLOW=1` it also plays a 1+0 game both players leave and checks, a
minute later, that the room's alarm flagged it (`scripts/online-server-clock.test.ts`).

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
   timer fires a hair early. On Cloudflare that time is an alarm, so it fires
   with nobody connected (see "One alarm, three deadlines").
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
   could not be made). The sweep runs only while some window can still widen
   (`SeekQueue.canWiden`); with `schedule` it is an alarm instead of a timer.
   With `requireClock`, untimed seeks are refused. Leaving or cancelling ends the seek. With
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
