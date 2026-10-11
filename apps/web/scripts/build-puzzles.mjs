/**
 * Builds the puzzle shards in public/puzzles/ from the Lichess puzzle database.
 *
 * The source (https://database.lichess.org/#puzzles, lichess_db_puzzle.csv.zst)
 * is released under CC0. It is about 300 MB, so it is not kept in the
 * repository and this script is not shipped with the app. To rebuild:
 *
 *   curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst
 *   node scripts/build-puzzles.mjs lichess_db_puzzle.csv.zst [puzzles per skill]
 *
 * Needs Node 22.15 or later (for zstd). It keeps well-rated, short puzzles,
 * sorts them into one shard per coaching skill by their themes, spreads them
 * evenly over ratings 600 to 2400, and writes each shard gzipped.
 *
 * Shard line format: FEN|moves|rating|theme
 * The first move is the opponent's; the rest alternate, starting with the solver.
 */
import { closeSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { gzipSync, zstdDecompressSync } from 'node:zlib';

const file = process.argv[2];
const perSkill = Number(process.argv[3] ?? 5000);
if (!file) {
  console.error('Usage: node scripts/build-puzzles.mjs <lichess_db_puzzle.csv.zst> [puzzles per skill]');
  process.exit(1);
}

/** Lichess themes behind each coaching skill (the keys match SKILLS in lib/coach/report.ts). */
const SKILL_THEMES = {
  'blunder-check': ['hangingPiece', 'trappedPiece', 'capturingDefender'],
  'opponent-threats': ['fork', 'pin', 'skewer'],
  'own-tactics': ['mateIn1', 'mateIn2', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'sacrifice'],
  'king-safety': ['kingsideAttack', 'queensideAttack', 'exposedKing', 'attackingF2F7'],
  endgame: ['rookEndgame', 'pawnEndgame', 'queenEndgame', 'knightEndgame', 'bishopEndgame', 'promotion'],
  plans: ['quietMove', 'advancedPawn', 'zugzwang', 'defensiveMove', 'intermezzo'],
};
const SKILLS = Object.keys(SKILL_THEMES);

const MIN_RATING = 600;
const MAX_RATING = 2400;
const BIN = 200;
const BINS = (MAX_RATING - MIN_RATING) / BIN;
const quota = Math.ceil(perSkill / BINS);

const ZSTD_FRAME = 0xfd2fb528;
const isSkippable = (magic) => magic >= 0x184d2a50 && magic <= 0x184d2a5f;

/**
 * Yield the decompressed text of the file, piece by piece.
 *
 * The download is written by a parallel compressor: many zstd frames, each
 * preceded by a small "skippable" frame that holds the size of the frame
 * after it. Node's streaming decompressor stops at those, so the frames are
 * read and decompressed one at a time.
 */
function* decompressed(path) {
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(8);
  let offset = 0;
  let nextSize = null;
  try {
    for (;;) {
      if (readSync(fd, head, 0, 8, offset) < 8) return;
      const magic = head.readUInt32LE(0);
      if (isSkippable(magic)) {
        const size = head.readUInt32LE(4);
        if (size === 4) {
          const data = Buffer.alloc(4);
          readSync(fd, data, 0, 4, offset + 8);
          nextSize = data.readUInt32LE(0);
        }
        offset += 8 + size;
        continue;
      }
      if (magic !== ZSTD_FRAME) throw new Error(`Not a zstd file (unexpected bytes at ${offset})`);
      if (nextSize === null) throw new Error('This zstd file has no frame sizes; decompress it first and pass the .csv');
      const frame = Buffer.alloc(nextSize);
      readSync(fd, frame, 0, nextSize, offset);
      offset += nextSize;
      nextSize = null;
      yield zstdDecompressSync(frame);
    }
  } finally {
    closeSync(fd);
  }
}

/** Yield complete lines from chunks that may end mid-line (or mid-character). */
function* linesOf(chunks) {
  const decoder = new TextDecoder();
  let rest = '';
  for (const chunk of chunks) {
    const parts = (rest + decoder.decode(chunk, { stream: true })).split('\n');
    rest = parts.pop();
    yield* parts;
  }
  if (rest) yield rest;
}

/** shards[skill][bin] = lines */
const shards = Object.fromEntries(SKILLS.map((s) => [s, Array.from({ length: BINS }, () => [])]));
let full = 0;
let rows = 0;

for (const line of linesOf(decompressed(file))) {
  rows++;
  if (rows === 1) continue; // header
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
  const [, fen, moves, ratingText, deviation, popularity, plays, themesText] = line.split(',');
  const rating = Number(ratingText);
  if (!(rating >= MIN_RATING && rating < MAX_RATING)) continue;
  if (Number(deviation) > 85 || Number(popularity) < 90 || Number(plays) < 500) continue;
  const count = moves.split(' ').length;
  if (count < 2 || count > 6 || count % 2 !== 0) continue;

  const themes = themesText.split(' ');
  const bin = Math.floor((rating - MIN_RATING) / BIN);

  // Of the skills this puzzle fits, give it to the one that needs it most.
  let best = null;
  let bestTheme = '';
  for (const skill of SKILLS) {
    const theme = SKILL_THEMES[skill].find((t) => themes.includes(t));
    if (!theme) continue;
    const have = shards[skill][bin].length;
    if (have >= quota) continue;
    if (best === null || have < shards[best][bin].length) {
      best = skill;
      bestTheme = theme;
    }
  }
  if (!best) continue;

  shards[best][bin].push(`${fen}|${moves}|${rating}|${bestTheme}`);
  if (shards[best][bin].length === quota) full++;
  if (full === SKILLS.length * BINS) break;
}

const outDir = new URL('../public/puzzles/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const manifest = {};
let totalBytes = 0;
let totalPuzzles = 0;
for (const skill of SKILLS) {
  const all = shards[skill].flat().sort((a, b) => Number(a.split('|')[2]) - Number(b.split('|')[2]));
  const gz = gzipSync(all.join('\n') + '\n', { level: 9 });
  writeFileSync(new URL(`${skill}.txt.gz`, outDir), gz);
  manifest[skill] = { count: all.length, bytes: gz.length };
  totalBytes += gz.length;
  totalPuzzles += all.length;
  console.log(`${skill}: ${all.length} puzzles, ${(gz.length / 1024).toFixed(0)} KB`);
}
writeFileSync(new URL('manifest.json', outDir), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${rows} rows read, ${totalPuzzles} puzzles kept, ${(totalBytes / 1024 / 1024).toFixed(2)} MB in total`);
