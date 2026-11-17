# Launch Radar — a token-radar-01 entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ham919390/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ham919390/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built for make.fun's [token-radar-01 bounty](https://make.fun/bounty/token-radar-01).
The program reads the competition's sealed DefiLlama snapshot, prices every pre-token protocol
against the live peers in its own category, and hands in two things: a ranked board of the
protocols most likely to launch a token, and a static dashboard a reader can actually farm from.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Node 22.18 or later, standard library only — there is nothing to install. A run writes
`board.json` and `data.js`, copies `dashboard/` and `screenshots/` across, and finishes by
writing `dossier.json` into the output directory. The output is deterministic: given the same
snapshot, the program writes the same bytes on every run.

## The model (launch-radar-2)

An implied value is derived only from figures inside the snapshot itself. Each pre-token
protocol is priced at the median market-cap/TVL multiple of the tokenised protocols in its own
category, then adjusted for its recent growth, its maturity, and its chain breadth:

```
peer     = median market-cap / TVL of the snapshot's tokenised protocols in the same category
           (exchange tokens excluded), shrunk toward the global median when the sample is thin
base     = tvl_usd x peer
growth   = 1 + clamp(change_7d, -50, 100) / 100 x 0.35
maturity = 0.55 + 0.45 x sqrt(min(age_days, 1460) / 1460)     (age unknown: 365 days)
breadth  = 1 + 0.03 x min(chains - 1, 5)
implied  = max(1, round(base x growth x maturity x breadth))
```

The board covers all 40 watchlist protocols plus every other rankable pre-token protocol below
the watchlist floor — 186 rows on this snapshot. Some things are deliberately not ranked:
exchanges and their own products, versioned pools of other protocols, and derivative products
of assets that already trade (liquid staking, restaking, wrapped and canonical-bridge forms).
Protocols whose token already trades are set aside instead — they form the peer yardstick the
pre-token names are priced against. Above the floor, the watchlist is the whole board: a
protocol of that size which the list leaves out was set aside by the house's rule, and the
radar does not promote it.

Every row also carries a seven-step farm plan derived from that protocol's category, chains,
TVL and age, with a cost and a time attached to each step and plan totals alongside. No
protocol name is special-cased anywhere in the model.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the peer table, the pricing function, the farm plans, the board builder and
  the gate-shape self-check.
- `dashboard/` — the static page: a sortable, filterable board, a per-protocol detail drawer
  that shows the pricing factor by factor and the farm plan, a live-token view of the peer
  yardstick, and a model panel publishing the formula and the peer table. It renders entirely
  from `data.js`, which `main.ts` writes beside it; it makes no network requests.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte as shipped.
- `screenshots/` — three screenshots of the dashboard (board, detail view, filtered view).

## Screenshots

`screenshots/` is intentionally not populated in this commit: the three images must be real
captures of this dashboard rendered in a browser — the board, one protocol's detail view, and
a filtered view — each a whole PNG or JPEG of at most 512 KiB, with a long side of at most
1440 px and a short side of at least 800 px. Capture them, place them in `screenshots/` as
`1-board.png`, `2-detail.png` and `3-filtered.png`, and re-run the program before submitting:
`main.ts` refuses to hand in fewer than three.
