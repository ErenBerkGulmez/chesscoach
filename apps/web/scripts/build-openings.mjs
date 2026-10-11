/**
 * Builds public/openings/book.tsv from the lichess-org/chess-openings tables.
 *
 * The source data (https://github.com/lichess-org/chess-openings, a.tsv to
 * e.tsv) is in the public domain under CC0. This script is not shipped with
 * the app; run it again only to pick up new opening names:
 *
 *   node scripts/build-openings.mjs <folder with a.tsv ... e.tsv>
 *
 * Output columns: position (the first four FEN fields), ECO code, name.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/build-openings.mjs <folder with a.tsv ... e.tsv>');
  process.exit(1);
}

const seen = new Map();
let rows = 0;
for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const lines = readFileSync(join(dir, `${file}.tsv`), 'utf8').split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const position = chess.fen().split(' ').slice(0, 4).join(' ');
    rows++;
    // Transpositions: the first name listed for a position wins.
    if (!seen.has(position)) seen.set(position, `${position}\t${eco}\t${name}`);
  }
}

const out = new URL('../public/openings/book.tsv', import.meta.url);
writeFileSync(out, [...seen.values()].join('\n') + '\n');
console.log(`${rows} openings read, ${seen.size} positions written`);
