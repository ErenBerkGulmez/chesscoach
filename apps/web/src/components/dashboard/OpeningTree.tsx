"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadMoveTenEvals } from "@/lib/analysis/cache";
import type { OpeningBook } from "@/lib/chess/opening-book";
import { buildOpeningTree, mainLine, type OpeningTreeNode } from "@/lib/chess/opening-tree";
import { PlayerColor, type ParsedGame } from "@/types/chess";

const NO_EVALS = new Map<string, number>();

function formatEval(pawns: number) {
  const rounded = Math.round(pawns * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function scoreClass(score: number) {
  if (score >= 55) return "bg-accent";
  if (score >= 45) return "bg-inaccuracy";
  return "bg-blunder";
}

interface RowProps {
  node: OpeningTreeNode;
  depth: number;
  inheritedName: string | null;
  open: Set<string>;
  toggle: (path: string) => void;
  openGame: (id: string) => void;
}

function Row({ node, depth, inheritedName, open, toggle, openGame }: RowProps) {
  const isOpen = open.has(node.path);
  const hasChildren = node.children.length > 0;
  // Show the name only where it changes, so a line reads top to bottom.
  const name = node.name && node.name !== inheritedName ? node.name : null;
  const single = node.games === 1;

  return (
    <>
      <tr className="border-t border-border/60 hover:bg-surface-hover/60">
        <td className="py-1.5 pr-2">
          <button
            type="button"
            onClick={() => (hasChildren ? toggle(node.path) : single ? openGame(node.gameIds[0]) : undefined)}
            aria-expanded={hasChildren ? isOpen : undefined}
            className="flex items-center gap-1.5 text-left w-full"
            style={{ paddingLeft: `${Math.min(depth, 10) * 14}px` }}
          >
            <span className="w-3 shrink-0 text-text-muted text-[10px]" aria-hidden="true">
              {hasChildren ? (isOpen ? "▾" : "▸") : ""}
            </span>
            <span className="font-mono text-sm font-semibold text-text-primary whitespace-nowrap">{node.label}</span>
            {name && <span className="text-xs text-text-muted truncate">{name}</span>}
          </button>
        </td>
        <td className="py-1.5 px-2 text-right text-sm tabular-nums text-text-secondary">{node.games}</td>
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-2 justify-end">
            <div className="hidden sm:block w-16 h-1.5 rounded-full bg-border overflow-hidden" aria-hidden="true">
              <div className={`h-full ${scoreClass(node.score)}`} style={{ width: `${node.score}%` }} />
            </div>
            <span
              className="text-sm tabular-nums font-semibold text-text-primary w-10 text-right"
              title={`${node.wins} won, ${node.draws} drawn, ${node.losses} lost`}
            >
              {node.score}%
            </span>
          </div>
        </td>
        <td
          className="py-1.5 pl-2 text-right text-sm tabular-nums font-mono"
          title={node.evalAtTen === null ? "No reviewed games on this line yet" : `Average over ${node.evalGames} reviewed ${node.evalGames === 1 ? "game" : "games"}`}
        >
          {node.evalAtTen === null ? (
            <span className="text-text-muted">–</span>
          ) : (
            <span className={node.evalAtTen >= 0.3 ? "text-accent" : node.evalAtTen <= -0.3 ? "text-blunder" : "text-text-secondary"}>
              {formatEval(node.evalAtTen)}
            </span>
          )}
        </td>
      </tr>
      {isOpen &&
        node.children.map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            inheritedName={node.name ?? inheritedName}
            open={open}
            toggle={toggle}
            openGame={openGame}
          />
        ))}
    </>
  );
}

/** The player's own opening tree for one colour: games, score and the evaluation after move 10. */
export default function OpeningTree({
  games,
  username,
  book,
}: {
  games: ParsedGame[];
  username: string | null;
  book: OpeningBook | null;
}) {
  const router = useRouter();
  const [color, setColor] = useState<PlayerColor>(PlayerColor.WHITE);
  const [evals, setEvals] = useState<Map<string, number>>(NO_EVALS);
  // Rows the user opened or closed by hand, per colour. Everything else follows the main line.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    loadMoveTenEvals().then((map) => {
      if (!cancelled) setEvals(map);
    });
    return () => {
      cancelled = true;
    };
  }, [games]);

  const tree = useMemo(() => buildOpeningTree(games, color, book, { evals }), [games, color, book, evals]);

  const open = useMemo(() => {
    const set = new Set(mainLine(tree, 3));
    for (const [key, value] of Object.entries(toggled)) {
      const [c, path] = [key.slice(0, 1), key.slice(2)];
      if ((c === "W") !== (color === PlayerColor.WHITE)) continue;
      if (value) set.add(path);
      else set.delete(path);
    }
    return set;
  }, [tree, toggled, color]);

  const toggle = (path: string) => {
    const key = `${color === PlayerColor.WHITE ? "W" : "B"}:${path}`;
    setToggled((t) => ({ ...t, [key]: !open.has(path) }));
  };

  const openGame = (id: string) => {
    if (username) router.push(`/dashboard/${username}/games/${id}`);
  };

  return (
    <section className="glass-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-text-primary">Your opening tree</h3>
          <p className="text-xs text-text-muted">
            Every line you have reached as {color === PlayerColor.WHITE ? "White" : "Black"}, by how often you get it.
            Open a row to see what came next.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border self-start sm:self-auto">
          {([PlayerColor.WHITE, PlayerColor.BLACK] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                color === c ? "bg-accent text-black shadow-sm" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              As {c === PlayerColor.WHITE ? "White" : "Black"}
            </button>
          ))}
        </div>
      </div>

      {tree.games === 0 ? (
        <p className="text-sm text-text-muted py-4">No games as {color === PlayerColor.WHITE ? "White" : "Black"} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="text-xs text-text-muted">
                <th className="text-left font-semibold pb-1.5">Line</th>
                <th className="text-right font-semibold pb-1.5 px-2">Games</th>
                <th className="text-right font-semibold pb-1.5 px-2">Score</th>
                <th className="text-right font-semibold pb-1.5 pl-2 whitespace-nowrap">Eval at move 10</th>
              </tr>
            </thead>
            <tbody>
              {tree.children.map((node) => (
                <Row
                  key={node.path}
                  node={node}
                  depth={0}
                  inheritedName={null}
                  open={open}
                  toggle={toggle}
                  openGame={openGame}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Score counts a win as 1 and a draw as a half. The evaluation after move 10 is from your side and uses the games
        you have reviewed: {tree.reviewed} of {tree.games} so far. Rows with a single game open that game.
      </p>
    </section>
  );
}
