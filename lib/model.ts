// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// other rankable pre-token protocol below that floor: the early rows a launch radar exists to find.
// Above the floor, the watchlist is the whole board: a protocol that size which the list leaves out
// was set aside by the house's rule as an exchange's own product or a wrapped form of a traded asset.
// A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol).
// Protocols whose token already trades are never ranked: they are set aside and shown at the market's
// own values, and they do a second job instead — they are the peers this model prices the pre-token
// protocols against.
//
// Implied value follows only from the snapshot's own figures, in four stated factors:
//
//   peer       = the market-cap-to-TVL multiple of the protocol's live peers: the median ratio of the
//                snapshot's tokenised protocols in the same category, shrunk toward the global median
//                when the category's sample is thin, the global median when it has none
//   base       = tvl_usd x peer
//   growth     = 1 + clamp(change_7d, -50, 100) / 100 x 0.35   (a week of TVL movement, damped)
//   maturity   = 0.55 + 0.45 x sqrt(min(age_days, 1460) / 1460) (age unknown: 365 days)
//   breadth    = 1 + 0.03 x min(chains - 1, 5)                   (distribution beyond one chain)
//   implied    = max(1, round(base x growth x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard states
// the constants and the peer table it derived, so a reader can recompute any row from the snapshot.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'launch-radar-2';

/** The model's stated constants. */
export const MODEL = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_extra_chains: 5,
  peer_shrinkage: 5,
  peer_ratio_floor: 0.005,
  peer_ratio_cap: 10,
} as const;

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One peer group: a category's live sample and the multiple the model takes from it. */
export interface PeerGroup {
  category: string;
  sample: number;
  category_median: number | null;
  multiple: number;
}

/** The peer table: a global multiple and one row per category that has live peers. */
export interface PeerTable {
  global_multiple: number;
  global_sample: number;
  groups: PeerGroup[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The four factors one protocol is priced with, as the dashboard shows them. */
export interface ValueParts {
  peer_multiple: number;
  peer_sample: number;
  growth_pct: number;
  growth_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  age_days: number | null;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ValueParts;
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, its farm plan, and its totals. */
export interface RadarRow extends BoardRow {
  farm_total_cost: string;
  farm_total_time: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof MODEL;
  peers: PeerTable;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of an asset that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The exchanges the watchlist's own rule names: a name that begins with one is the exchange's own product. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol's name begins with an exchange's name, as a whole word. */
function startsWithExchange(name: string): boolean {
  return EXCHANGE_NAMES.some((e) => name === e || name.startsWith(`${e} `) || name.startsWith(`${e}-`));
}

/**
 * Categories that are derivative products of an asset that already trades (a staking receipt, a
 * restaked or bridged representation, a wrapped coin): whatever they issue rides on that asset, so
 * they are not launches of their own. The watchlist's own rule sets the same kinds aside.
 */
const DERIVATIVE_CATEGORIES = new Set([
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'Decentralized BTC',
  'Stablecoin Wrapper',
  'Canonical Bridge',
]);

/** Whether a protocol is one the board may rank: pre-token, and not an exchange, a versioned pool or a derivative product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== 'CEX' &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !startsWithExchange(p.name) &&
    !(p.category !== null && DERIVATIVE_CATEGORIES.has(p.category))
  );
}

/**
 * The peer table: what the snapshot's own tokenised protocols trade at, per unit of TVL. Exchange
 * tokens are left out — an exchange's coin is not a protocol launch's comparable. Each category's
 * median is shrunk toward the global median by its sample size, so a thin category borrows the
 * market's own centre instead of swinging on two or three names.
 */
export function peerTable(snapshot: Snapshot): PeerTable {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, MODEL.peer_ratio_floor, MODEL.peer_ratio_cap);
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const global = all.length > 0 ? median(all) : 0.2;
  const groups: PeerGroup[] = [...ratiosByCategory.entries()]
    .map(([category, ratios]) => {
      const catMedian = median(ratios);
      const multiple = (ratios.length * catMedian + MODEL.peer_shrinkage * global) / (ratios.length + MODEL.peer_shrinkage);
      return { category, sample: ratios.length, category_median: round4(catMedian), multiple: round4(multiple) };
    })
    .sort((a, b) => b.sample - a.sample || (a.category < b.category ? -1 : 1));
  return { global_multiple: round4(global), global_sample: all.length, groups };
}

/** The multiple one protocol is priced with: its category's shrunk median, or the global one. */
function peerFor(p: SnapshotProtocol, peers: PeerTable): { multiple: number; sample: number } {
  const key = p.category ?? 'Uncategorised';
  const group = peers.groups.find((g) => g.category === key);
  if (group === undefined) return { multiple: peers.global_multiple, sample: 0 };
  return { multiple: group.multiple, sample: group.sample };
}

/** The four factors and the implied value one protocol gets. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  peers: PeerTable,
): { implied: number; parts: ValueParts } {
  const age = ageDays(asOf, p.listed_at);
  const peer = peerFor(p, peers);
  const growthPct = clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  const growthFactor = 1 + (growthPct / 100) * MODEL.growth_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturityFactor =
    MODEL.maturity_floor + MODEL.maturity_range * Math.sqrt(clamp(ageForModel, 0, MODEL.maturity_days) / MODEL.maturity_days);
  const breadthFactor = 1 + MODEL.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), MODEL.breadth_max_extra_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * peer.multiple * growthFactor * maturityFactor * breadthFactor));
  return {
    implied,
    parts: {
      peer_multiple: peer.multiple,
      peer_sample: peer.sample,
      growth_pct: round4(growthPct),
      growth_factor: round4(growthFactor),
      maturity_factor: round4(maturityFactor),
      breadth_factor: round4(breadthFactor),
      age_days: age,
    },
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A round-trip gas estimate for the chain a position sits on: mainnet is dear, the rest are not. */
function gasFor(chain: string): { label: string; usd: number } {
  if (chain === 'Ethereum') return { label: '$12', usd: 12 };
  if (chain === 'Solana') return { label: 'under $1', usd: 1 };
  if (chain === 'Bitcoin') return { label: '$4', usd: 4 };
  return { label: 'about $2', usd: 2 };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

/** The category's main qualifying action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized'))
    return `Supply $${capital} of USDC as collateral in ${name} on ${chain} and leave the position open.`;
  if (c.includes('dex') || c.includes('liquidity')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the LP position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in one app on the far side.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, then keep the account active.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a liquid market on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the wallet.`;
  if (c.includes('stable') || c.includes('algo')) return `Mint $${capital} of ${name}'s stable asset on ${chain} and hold it in the wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it to term.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy to expiry.`;
  if (c.includes('launchpad')) return `Register the wallet on ${name} and complete its smallest participation tier on ${chain}.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the receipt shares.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name}'s network and make one native swap and one contract call there.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s shielded pool on ${chain} and make one shielded transfer.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: the weekly repeat that keeps an account looking real. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Each week, borrow a small amount against the position on ${name} and repay it two days later.`;
  if (c.includes('dex') || c.includes('liquidity')) return `Each week, make one small swap through ${name} on ${chain} in the same wallet.`;
  if (c.includes('bridge')) return `Each week, bridge a small amount back through ${name} so the wallet shows traffic in both directions.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Each week, open and close one small trade on ${name} so the account keeps a trading record.`;
  return `Each week, add or move a small amount in ${name} — a top-up, a claim or a vote — so the wallet stays active.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page weekly.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) — never from a hand-written list of names.
 * Returns the steps and the plan's own totals, which the dashboard shows beside them.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; totalCost: string; totalTime: string } {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(2, Math.round(hold / 7));
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it from an exchange, and keep its seed phrase offline.`,
      cost: 'under $3 to fund and make the first transaction',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas.label} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: `about ${gas.label} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, so the activity spans more than one weekly snapshot of the protocol.`,
      cost: `the $${capital} stays in the position, earning whatever it earns`,
      time: `${hold} days`,
    },
  ];
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    const gas2 = gasFor(second);
    steps.push({
      text: `Repeat a smaller position on ${second}, the protocol's second chain, so the farm is not riding on one network.`,
      cost: `$${Math.round(capital / 2)} of capital and about ${gas2.label} of gas`,
      time: '15 minutes',
    });
  }
  steps.push(
    {
      text: `Once a week, open ${p.name}'s own points or rewards page from the link the protocol itself publishes and check the wallet is counted.`,
      cost: 'nothing to check; never pay a third party to claim',
      time: '5 minutes a week',
    },
    {
      text: `Log the wallet, the dates and every transaction hash; when a token is announced or ${hold + 14} days pass with no programme, unwind in one session and keep the log.`,
      cost: `about ${gas.label} of gas to exit`,
      time: '20 minutes to unwind',
    },
  );
  const gasTotal = gas.usd * (2 + weeks) + (p.chains.length > 1 ? gasFor(p.chains[1]!).usd : 0);
  return {
    steps,
    totalCost: `$${capital} of capital plus roughly $${gasTotal} of gas over the hold`,
    totalTime: `about ${hold} days, ${10 + weeks * 10} minutes of active work`,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, peers: PeerTable = peerTable(snapshot)): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is ranked, whatever the model's own filters say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol below the watchlist floor. A pre-token
  // protocol at or above the floor that the watchlist leaves out was examined by the house's rule and
  // set aside — in this snapshot those are exchanges' own products and wrapped or staked forms of
  // assets that already trade (WBTC, the staked-ETH and wrapped-BTC products, the exchange bridges) —
  // so the radar does not promote them over the list's own judgement.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const { implied, parts } = impliedValue(p, snapshot.as_of, peers);
    const plan = farmPlan(p, parts.age_days);
    return { p, implied, parts, steps: plan.steps.map(stepText) };
  });
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.parts.age_days,
    implied_value_usd: s.implied,
    model: s.parts,
    farm_steps: s.steps,
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const peers = peerTable(snapshot);
  const board = buildBoard(snapshot, peers);
  const live = liveRows(snapshot);
  const rows: RadarRow[] = board.map((row) => {
    const protocol = snapshot.protocols.find((p) => p.slug === row.slug)!;
    const plan = farmPlan(protocol, row.age_days);
    return { ...row, farm_total_cost: plan.totalCost, farm_total_time: plan.totalTime };
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: MODEL,
    peers,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: size, coverage, ranks, order, values, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const slugs = new Set<string>();
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (slugs.has(r.slug)) return `${r.slug} appears twice`;
    slugs.add(r.slug);
    if (r.name.trim().length === 0) return `${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++)
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd)
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
