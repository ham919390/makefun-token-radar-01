# Launch Radar — a token-radar-01 entry

A token launch radar for make.fun's **token-radar-01** bounty. The program reads the competition's
sealed DefiLlama snapshot, prices every pre-token protocol against its live peers, and hands in a
ranked board plus a dashboard a reader can farm from.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Node 22.18 or later, standard library only. It writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory. Given the same snapshot it writes the
same bytes on every run.

## The model (launch-radar-2)

Implied value follows only from the snapshot's own figures:

```
peer     = median market-cap / TVL of the snapshot's tokenised protocols in the same category
           (exchange tokens excluded), shrunk toward the global median when the sample is thin
base     = tvl_usd x peer
growth   = 1 + clamp(change_7d, -50, 100) / 100 x 0.35
maturity = 0.55 + 0.45 x sqrt(min(age_days, 1460) / 1460)     (age unknown: 365 days)
breadth  = 1 + 0.03 x min(chains - 1, 5)
implied  = max(1, round(base x growth x maturity x breadth))
```

The board covers all 40 watchlist protocols and every other rankable pre-token protocol below the
watchlist floor (186 rows on this snapshot). Exchanges and their own products, versioned pools of
other protocols, and derivative products of assets that already trade (liquid staking, restaking,
wrapped and canonical-bridge forms) are not ranked; protocols whose token already trades are set
aside as the peer yardstick. Above the floor the watchlist is the whole board: a protocol that size
which the list leaves out was set aside by the house's rule, and the radar does not promote it.
Each row carries a seven-step farm plan derived from the protocol's category, chains, TVL and age,
with a cost and a time on every step. No protocol name is special-cased anywhere.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the peer table, the pricing function, the farm plans, the board builder and the
  gate-shape self-check.
- `dashboard/` — the static page (board, filters, detail drawer, live-token view, model panel).
  It renders entirely from `data.js`, which `main.ts` writes beside it; no network.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte as shipped.
- `screenshots/` — three screenshots of the dashboard (board, detail view, filtered view).

## Screenshots

`screenshots/` is intentionally not populated in this commit: the three images must be real
captures of this dashboard rendered in a browser (board, a protocol's detail view, and a filtered
view; each a whole PNG or JPEG, at most 512 KiB, long side at most 1440 px, short side at least
800 px). Capture them, place them as `1-board.png`, `2-detail.png` and `3-filtered.png`, and re-run
the program before submitting — `main.ts` refuses to hand in fewer than three.
