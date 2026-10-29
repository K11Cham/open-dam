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

- `BroadcastChannelTransport` works between tabs of one browser. It powers the
  "Online (preview)" mode today.
- `MemoryHub` / `MemoryTransport` simulate a network in tests (asynchronous,
  JSON-copied messages).
- `WebSocketTransport` (`src/net/websocket.ts`) connects a browser to a match
  server. Nothing in the app uses it yet; see below.

## What exists today

- Create an online game on New game (opponent "Online") or from Home. The host
  tab shows an invite link (`/online/<id>?seat=player2`).
- Open the link in another tab of the same browser to join.
- Moves, calls, chains, offers, resignations and clocks sync. The board stays
  locked until both players are connected. The host saves the game, so
  reloading the host tab resumes it; a reloaded guest tab rejoins.

## Adding a real server

The browser code does not need to change shape. Steps 1, 2 and 4 are written
and tested, as are the pure halves of 8 and 9; the rest need a host to run on.

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
3. **Listen on a port.** Still to do: a small Node entry point that runs a
   WebSocket server (for example with the `ws` package) and hands connections
   to `MatchServer`. `src/game`, `src/match` and `src/net` have no browser
   dependencies and run unchanged in Node.
4. **Use the server's clock — done.** The room's host stamps `at` with server
   time, and the room submits `{ type: 'engine', action: { type: 'timeout',
player } }` as `system` at `flagTime(state.clock)`, retrying shortly if a
   timer fires a hair early.
5. **Persist records.** `MatchStore` is the seam: `save` is called after
   every accepted action with the full record (a long game is a few hundred
   actions). Back it with a database keyed by match id.
6. **Make both browsers guests.** `OnlinePage` currently hosts in the creating
   tab; with a server, every player uses `MatchGuest` with
   `WebSocketTransport`.
7. **Identity.** Replace the per-tab client id with an authenticated user id
   when binding seats in `linkHost`.
8. **Matchmaking — queue done.** `SeekQueue` in `src/net/matchmaking.ts`
   pairs two seeks whose rules agree (`settingsAreCompatible`) and whose
   ratings are within a window that starts at 100 points and widens by 50
   every 5 s of waiting, up to 500. It prefers the closest rating, never pairs
   a player with themselves, picks who moves first at random, and resolves
   "match opponent" with `agreedSettings`. Call `sweep(now)` every few
   seconds; turn each pairing into a game with `MatchServer.createMatch`.
   Still to do: messages for posting and cancelling a seek, and telling both
   players where their game is.
9. **Ratings — arithmetic done.** `src/match/rating.ts` has Elo per pool
   (board size and time control; K 40 for the first 20 games, then 20) and
   `ratedScore`, which skips unfinished games and games where a side never
   moved. `MatchServer`'s `onFinished(record, state)` fires once per game,
   after the final save, which is where a server rates it. Still to do:
   storing ratings, and the leaderboard reading them instead of
   `src/data/leaderboards.ts`.

Rows w25 and w26 on the handover board track the server and ratings work.

## Versioning

`format` and `version` on the record, and `v` on every message, exist so old
saves and old clients can be recognised. `parseRecord` in `src/match/storage.ts`
rejects unknown versions instead of guessing. If you change the meaning of an
intent, bump the version and add a migration.
