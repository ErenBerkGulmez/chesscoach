/**
 * Clock helpers: reading `[%clk h:mm:ss]` annotations from a PGN and
 * deciding when a move was played in time trouble.
 */

const CLOCK = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g;

/** Clock readings in move order, in milliseconds. Empty when the PGN has none. */
export function parseClocks(pgn: string): number[] {
  const out: number[] = [];
  for (const m of pgn.matchAll(CLOCK)) {
    out.push(Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000));
  }
  return out;
}

/**
 * Starting time of a live game from a Chess.com time control ("600", "180+2").
 * Daily games ("1/86400") have no meaningful clock and return null.
 */
export function baseTimeMs(timeControl: string | undefined): number | null {
  if (!timeControl || timeControl.includes('/')) return null;
  const base = Number(timeControl.split('+')[0]);
  return Number.isFinite(base) && base > 0 ? base * 1000 : null;
}

/** "0:07", "12:30", "1:02:05". Fractions of a second are dropped. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Share of the starting time below which a move counts as played in time trouble. */
export const TIME_TROUBLE_SHARE = 0.1;

export function isTimeTrouble(clockMs: number | undefined, baseMs: number | null | undefined): boolean {
  if (clockMs === undefined || !baseMs) return false;
  return clockMs < baseMs * TIME_TROUBLE_SHARE;
}

export interface ClockContext {
  /** Time left after the move. */
  clockMs?: number;
  /** Starting time of the game. */
  baseMs?: number | null;
}
