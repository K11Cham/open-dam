# CLAUDE.md

Open Dam is a React + TypeScript web version of Dam, a Gambian board game.

- Start with `docs/HANDOVER.md`: where the work list is, branch rules, how to
  verify, and the shift log. Then `codebase.md` (file map) and
  `docs/WALKTHROUGH.md` (how it fits together).
- Work on `feat/overhaul`. Never push, force, or delete branches and tags.
- Layers: `src/game` (rules, pure) → `src/ai` and `src/match` (pure) →
  `src/net` → `src/hooks` → `src/components`, `src/pages`. Lower layers never
  import higher ones. Visual decisions belong to `src/themes`.
- Run `npm run verify` before committing; run `npm run check:ai` after AI changes.
- Code style: no semicolons, single quotes, 130 columns (Prettier); comments
  explain why, in plain sentences.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
