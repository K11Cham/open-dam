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

## What exists today

- Create an online game on New game (opponent "Online") or from Home. The host
  tab shows an invite link (`/online/<id>?seat=player2`).
- Open the link in another tab of the same browser to join.
- Moves, calls, chains, offers, resignations and clocks sync. The board stays
  locked until both players are connected. The host saves the game, so
  reloading the host tab resumes it; a reloaded guest tab rejoins.

## Adding a real server

The browser code does not need to change shape. The steps:

1. **Write a WebSocket transport** in `src/net/` implementing `Transport`:
   connect to `wss://…/matches/<id>`, `JSON.stringify` on send, parse and check
   with `isNetMessage` on receive, reconnect with backoff.
2. **Run the host on the server.** In Node, create a `MatchHost` from the
   stored record and attach it with `linkHost(host, serverTransport, …)`. Make
   both seats `remote`. `src/game`, `src/match` and `src/net` have no browser
   dependencies and run unchanged in Node.
3. **Make both browsers guests.** `OnlinePage` currently hosts in the creating
   tab; with a server, every player uses `MatchGuest` with the WebSocket
   transport.
4. **Use the server's clock.** The host stamps `at` with its own time, so with a
   server host, time is server time. The server also needs a timer that
   submits `{ type: 'engine', action: { type: 'timeout', player } }` as
   `system` at `flagTime(state.clock)`, which is what `useMatchController`
   does for a browser host today.
5. **Persist records** in a database keyed by match id. Saving the full record
   after each action is simple and small (a long game is a few hundred actions).
6. **Identity.** Replace the per-tab client id with an authenticated user id
   when binding seats in `linkHost`.
7. **Matchmaking.** `settingsAreCompatible` and `filterCompatibleSeeks` in
   `src/game/settings.ts` already define which rule sets can be paired;
   `resolvePromotionPolicy` resolves the "match opponent" option.

Rows w25 and w26 on the handover board track the server and ratings work.

## Versioning

`format` and `version` on the record, and `v` on every message, exist so old
saves and old clients can be recognised. `parseRecord` in `src/match/storage.ts`
rejects unknown versions instead of guessing. If you change the meaning of an
intent, bump the version and add a migration.
