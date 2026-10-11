const REPO = "https://github.com/ErenBerkGulmez/chesscoach";

/** License, source and third-party notices. */
export default function SiteFooter() {
  return (
    <footer className="w-full border-t border-border py-4 px-4 text-center text-xs text-text-muted">
      <p>
        Chess Coach is free software under the{" "}
        <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="underline hover:text-text-secondary">
          GNU GPL v3
        </a>
        .{" "}
        <a href={REPO} target="_blank" rel="noreferrer" className="underline hover:text-text-secondary">
          Source code
        </a>
        {" · "}
        Engine:{" "}
        <a href="/stockfish/NOTICE.txt" target="_blank" rel="noreferrer" className="underline hover:text-text-secondary">
          Stockfish (GPL v3)
        </a>
        {" · "}
        Opening names:{" "}
        <a
          href="https://github.com/lichess-org/chess-openings"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-text-secondary"
        >
          lichess-org/chess-openings (CC0)
        </a>
        {" · "}
        Puzzles:{" "}
        <a
          href="https://database.lichess.org/#puzzles"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-text-secondary"
        >
          Lichess puzzle database (CC0)
        </a>
      </p>
    </footer>
  );
}
