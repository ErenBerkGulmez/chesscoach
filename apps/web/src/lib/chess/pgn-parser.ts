/**
 * PGN Parser & Game Normalizer
 * 
 * Parses Chess.com game data into our internal ParsedGame format.
 * Uses chess.js for move validation and FEN generation.
 */

import { Chess } from 'chess.js';
import type { ChessComGame, ParsedGame, ParsedMove } from '@/types/chess';
import { PlayerColor, TimeClass, GameResult } from '@/types/chess';
import { parseResult } from '@/lib/api/chess-com';

/**
 * Parse a Chess.com game into our internal format.
 */
export function parseChessComGame(
  game: ChessComGame,
  targetUsername: string
): ParsedGame {
  const isWhite = game.white.username.toLowerCase() === targetUsername.toLowerCase();
  const playerData = isWhite ? game.white : game.black;
  const opponentData = isWhite ? game.black : game.white;

  const playerColor = isWhite ? PlayerColor.WHITE : PlayerColor.BLACK;
  const result = parseResult(playerData.result) as GameResult;

  // Parse time class
  const timeClass = mapTimeClass(game.time_class);

  // Parse PGN moves
  const moves = parsePgnMoves(game.pgn);

  // Extract opening info from PGN headers
  const pgnHeaders = parsePgnHeaders(game.pgn);

  const accuracy = isWhite ? game.accuracies?.white : game.accuracies?.black;

  return {
    id: generateGameId(game.url),
    chessComUrl: game.url,
    pgn: game.pgn,
    moves,
    playerColor,
    playerUsername: playerData.username,
    opponentUsername: opponentData.username,
    playerRating: playerData.rating,
    opponentRating: opponentData.rating,
    timeControl: game.time_control,
    timeClass,
    result,
    termination: pgnHeaders['Termination'] || undefined,
    eco: pgnHeaders['ECO'] || undefined,
    openingName: pgnHeaders['ECOUrl']
      ? decodeOpeningFromUrl(pgnHeaders['ECOUrl'])
      : undefined,
    playedAt: new Date(game.end_time * 1000),
    moveCount: Math.ceil(moves.length / 2),
    accuracy: typeof accuracy === 'number' ? accuracy : undefined,
  };
}

/**
 * Parse PGN move text into an array of ParsedMove objects.
 * Each move includes the FEN before and after, plus tactical flags.
 */
export function parsePgnMoves(pgn: string): ParsedMove[] {
  const chess = new Chess();
  const moves: ParsedMove[] = [];

  // Strip clock annotations, brackets, NAGs, RAVs, and comments to prevent chess.js parser crash
  const cleanPgn = pgn
    .replace(/\{.*?\}/g, '') // Remove standard comments like {[%clk 0:02:59]}
    .replace(/\[%.*?\]/g, '') // Remove custom bracket annotations
    .replace(/\(.*?\)/g, '') // Remove RAV variations
    .replace(/\$\d+/g, '') // Remove NAG glyph indicators ($1, $2, etc.)
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();

  let loaded = false;
  try {
    chess.loadPgn(cleanPgn);
    loaded = true;
  } catch (error) {
    // Fallback: extract move tokens sequentially and play them on the board
    try {
      const moveText = cleanPgn.replace(/\[.*?\]\s*/g, '').trim(); // Remove headers
      const tokens = moveText
        .split(/\s+/)
        .filter((t) => t && !t.match(/^\d+\.+$/) && !t.includes('-') && !t.includes('/')); // Remove numbers and results
      
      chess.reset();
      for (const token of tokens) {
        try {
          chess.move(token);
        } catch {
          // Break on first invalid token to return whatever moves were valid
          break;
        }
      }
      loaded = true;
    } catch {
      console.warn('Failed to parse PGN moves:', pgn.substring(0, 100));
    }
  }

  if (loaded) {
    const history = chess.history({ verbose: true });
    
    // Reset and replay to get FEN at each position
    chess.reset();
    
    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const fenBefore = chess.fen();
      const moveNumber = Math.floor(i / 2) + 1;
      const color = move.color === 'w' ? PlayerColor.WHITE : PlayerColor.BLACK;

      chess.move(move.san);
      const fenAfter = chess.fen();

      moves.push({
        moveNumber,
        color,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ''}`,
        fen: fenAfter,
        fenBefore,
        isCapture: !!move.captured,
        isCheck: chess.isCheck(),
        isCastle: move.san === 'O-O' || move.san === 'O-O-O',
        isPromotion: !!move.promotion,
      });
    }
  }

  return moves;
}

/**
 * Parse PGN headers into a key-value map.
 */
export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;

  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }

  return headers;
}

/**
 * Extract the move text from a PGN (removing headers and result).
 */
function extractMoveText(pgn: string): string {
  // Remove headers
  let text = pgn.replace(/\[.*?\]\s*/g, '').trim();
  // Remove result
  text = text.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim();
  return text;
}

/**
 * Generate a deterministic game ID from the Chess.com URL.
 */
function generateGameId(url: string): string {
  // Extract the game ID from the URL
  const match = url.match(/\/game\/(?:live|daily)\/(\d+)/);
  if (match) return `cc_${match[1]}`;
  
  // Fallback: hash the URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `cc_${Math.abs(hash).toString(36)}`;
}

/**
 * Map Chess.com time_class string to our TimeClass enum.
 */
function mapTimeClass(timeClass: string): TimeClass {
  switch (timeClass.toLowerCase()) {
    case 'bullet': return TimeClass.BULLET;
    case 'blitz': return TimeClass.BLITZ;
    case 'rapid': return TimeClass.RAPID;
    case 'daily': return TimeClass.DAILY;
    default: return TimeClass.RAPID;
  }
}

/**
 * Decode opening name from Chess.com ECOUrl header.
 * Example: "https://www.chess.com/openings/Sicilian-Defense" → "Sicilian Defense"
 */
function decodeOpeningFromUrl(url: string): string {
  const match = url.match(/\/openings\/(.+)/);
  if (!match) return '';
  return decodeURIComponent(match[1])
    .replace(/-/g, ' ')
    .replace(/\.\.\./g, '…');
}

/**
 * Determine the game phase based on move number and piece count.
 */
export function getGamePhase(fen: string, moveNumber: number): 'opening' | 'middlegame' | 'endgame' {
  // Count pieces from FEN
  const piecePart = fen.split(' ')[0];
  const pieceCount = (piecePart.match(/[pnbrqkPNBRQK]/g) || []).length;
  const queenCount = (piecePart.match(/[qQ]/g) || []).length;

  if (moveNumber <= 10) return 'opening';
  if (pieceCount <= 12 || (pieceCount <= 16 && queenCount === 0)) return 'endgame';
  return 'middlegame';
}
