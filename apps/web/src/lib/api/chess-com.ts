/**
 * Chess.com Public API Client
 * 
 * Wraps the Chess.com PubAPI with proper rate limiting,
 * error handling, and response typing.
 * 
 * API docs: https://www.chess.com/news/view/published-data-api
 * Base URL: https://api.chess.com/pub/
 */

import type { ChessComPlayer, ChessComPlayerStats, ChessComGame } from '@/types/chess';

const BASE_URL = 'https://api.chess.com/pub';
const USER_AGENT = 'ChessCoachAI/1.0 (chess-coach-ai)';

// Rate limiting: Chess.com allows ~1 request per second
const RATE_LIMIT_MS = 1100;
let lastRequestTime = 0;

/**
 * Rate-limited fetch wrapper for Chess.com API
 */
async function chessComFetch<T>(endpoint: string): Promise<T> {
  // Enforce rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();

  const url = `${BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (response.status === 404) {
    throw new ChessComApiError(`Player not found`, 404);
  }

  if (response.status === 429) {
    // Rate limited — wait and retry once
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return chessComFetch<T>(endpoint);
  }

  if (!response.ok) {
    throw new ChessComApiError(
      `Chess.com API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export class ChessComApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ChessComApiError';
  }
}

// ─── API Methods ────────────────────────────────────────────

/**
 * Fetch a player's profile information
 */
export async function fetchPlayerProfile(username: string): Promise<ChessComPlayer> {
  return chessComFetch<ChessComPlayer>(`/player/${username.toLowerCase()}`);
}

/**
 * Fetch a player's stats (ratings for all time controls)
 */
export async function fetchPlayerStats(username: string): Promise<ChessComPlayerStats> {
  return chessComFetch<ChessComPlayerStats>(`/player/${username.toLowerCase()}/stats`);
}

/**
 * Fetch the list of monthly archive URLs for a player
 */
export async function fetchArchiveList(username: string): Promise<string[]> {
  const response = await chessComFetch<{ archives: string[] }>(
    `/player/${username.toLowerCase()}/games/archives`
  );
  return response.archives;
}

/**
 * Fetch all games from a specific monthly archive
 */
export async function fetchMonthlyGames(
  username: string,
  year: number,
  month: number
): Promise<ChessComGame[]> {
  const monthStr = month.toString().padStart(2, '0');
  const response = await chessComFetch<{ games: ChessComGame[] }>(
    `/player/${username.toLowerCase()}/games/${year}/${monthStr}`
  );
  return response.games;
}

/**
 * Fetch all games for a player across all archives.
 * 
 * @param username - Chess.com username
 * @param sinceArchiveUrl - If provided, only fetch archives after this URL (for incremental sync)
 * @param onProgress - Called with (archivesCompleted, totalArchives) for progress tracking
 */
export async function fetchAllGames(
  username: string,
  sinceArchiveUrl?: string,
  onProgress?: (completed: number, total: number) => void,
  maxArchives: number = 3
): Promise<ChessComGame[]> {
  const archives = await fetchArchiveList(username);
  
  // Reverse to get the latest archives first (newest to oldest)
  const reversedArchives = [...archives].reverse();
  
  // Filter to only new archives if incremental
  let archivesToFetch = reversedArchives;
  if (sinceArchiveUrl) {
    const idx = reversedArchives.indexOf(sinceArchiveUrl);
    if (idx !== -1) {
      // Fetch from the sinceArchiveUrl up to the newest (since they are reversed, it's the slice from 0 to idx+1)
      archivesToFetch = reversedArchives.slice(0, idx + 1);
    }
  }

  // Enforce maxArchives limit to ensure fast initial fetch
  if (maxArchives > 0 && archivesToFetch.length > maxArchives) {
    archivesToFetch = archivesToFetch.slice(0, maxArchives);
  }

  const allGames: ChessComGame[] = [];
  
  for (let i = 0; i < archivesToFetch.length; i++) {
    const archiveUrl = archivesToFetch[i];
    // Extract year/month from archive URL
    const match = archiveUrl.match(/\/games\/(\d{4})\/(\d{2})$/);
    if (!match) continue;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);

    try {
      const games = await fetchMonthlyGames(username, year, month);
      allGames.push(...games);
    } catch (error) {
      console.error(`Failed to fetch archive ${year}/${month}:`, error);
      // Continue with other archives
    }

    onProgress?.(i + 1, archivesToFetch.length);
  }

  return allGames;
}

/**
 * Parse the time control string into a TimeClass.
 * Chess.com returns time_class directly, but this is a fallback parser.
 * 
 * Examples: "600" = 10 min rapid, "180+2" = 3+2 blitz, "1/86400" = daily
 */
export function parseTimeClass(timeControl: string, timeClass?: string): string {
  if (timeClass) return timeClass;
  
  if (timeControl.includes('/')) return 'daily';
  
  const baseTime = parseInt(timeControl.split('+')[0], 10);
  const increment = parseInt(timeControl.split('+')[1] || '0', 10);
  const totalTime = baseTime + increment * 40; // Estimate 40 moves per game

  if (totalTime < 180) return 'bullet';
  if (totalTime < 600) return 'blitz';
  return 'rapid';
}

/**
 * Parse Chess.com result string to our GameResult enum.
 */
export function parseResult(
  playerResult: string,
): 'WIN' | 'LOSS' | 'DRAW' {
  switch (playerResult) {
    case 'win':
      return 'WIN';
    case 'checkmated':
    case 'timeout':
    case 'resigned':
    case 'abandoned':
    case 'kingofthehill':
    case 'threecheck':
    case 'bughousepartnerlose':
      return 'LOSS';
    case 'agreed':
    case 'stalemate':
    case 'repetition':
    case 'insufficient':
    case 'timevsinsufficient':
    case '50move':
      return 'DRAW';
    default:
      return 'LOSS';
  }
}
