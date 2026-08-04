"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function LandingPage() {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim()) return;

      setIsLoading(true);
      setError(null);

      try {
        // Quick validation — check if the Chess.com profile exists
        const res = await fetch(
          `https://api.chess.com/pub/player/${username.trim().toLowerCase()}`,
          {
            headers: { "User-Agent": "ChessCoachAI/1.0" },
          }
        );

        if (!res.ok) {
          setError("Player not found. Check the username and try again.");
          setIsLoading(false);
          return;
        }

        router.push(`/dashboard/${username.trim().toLowerCase()}`);
      } catch {
        setError("Could not reach Chess.com. Check your connection and try again.");
        setIsLoading(false);
      }
    },
    [username, router]
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
        }}
      />

      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-accent/3 rounded-full blur-[100px] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center gap-8 px-4 max-w-2xl w-full">
        {/* Logo & Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* Chess Knight SVG Logo */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19 22H5v-2h14v2zM17.16 8.26A4.26 4.26 0 0016.8 5.1C16.04 3.58 14.58 2.5 12.87 2.1 12.37 2 11.86 2 11.37 2.05c-.04 0-.08.01-.12.02-.24.04-.47.14-.64.33-.19.2-.29.47-.29.74 0 .14.03.28.08.41L12 7.25l-3.77 3.77c-.41.41-.41 1.08 0 1.49.2.2.47.31.74.31.28 0 .55-.11.75-.31l2.65-2.65C13.19 9 14 9.42 14 10.58c0 .82-.3 1.62-.83 2.24L9 18h8l.18-.36c.49-.99.82-2.06.82-3.16 0-2.25-1.11-4.32-2.84-5.58l2-2.64z"
                fill="currentColor"
                className="text-accent"
              />
            </svg>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-primary mb-3">
            Chess Coach{" "}
            <span className="bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent">
              AI
            </span>
          </h1>

          <p className="text-text-secondary text-lg sm:text-xl max-w-md mx-auto leading-relaxed">
            Deep game analysis powered by Stockfish &amp; AI coaching.
            Understand every move.
          </p>
        </motion.div>

        {/* Username Input */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={handleSubmit}
          className="w-full max-w-md"
        >
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/30 to-emerald-500/30 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex items-center bg-surface border border-border rounded-xl overflow-hidden transition-all focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_rgba(129,182,76,0.1)]">
              {/* Chess.com icon */}
              <div className="pl-4 pr-2 text-text-muted">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M8 12a4 4 0 108 0 4 4 0 00-8 0z"
                    fill="currentColor"
                    opacity="0.3"
                  />
                </svg>
              </div>

              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder="Enter Chess.com username"
                className="flex-1 bg-transparent py-3.5 px-2 text-text-primary placeholder-text-muted outline-none text-base"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={isLoading}
              />

              <button
                id="analyze-button"
                type="submit"
                disabled={!username.trim() || isLoading}
                className="mr-1.5 px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Checking...
                  </div>
                ) : (
                  "Analyze"
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-blunder text-sm mt-3 text-center"
            >
              {error}
            </motion.p>
          )}
        </motion.form>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg mt-4"
        >
          {[
            {
              icon: "♟",
              title: "Stockfish 18",
              desc: "Deep engine analysis",
            },
            {
              icon: "🤖",
              title: "AI Coach",
              desc: "Natural language insights",
            },
            {
              icon: "📊",
              title: "Full Statistics",
              desc: "Track your progress",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="glass-card p-4 text-center hover:border-accent/20 transition-colors"
            >
              <div className="text-2xl mb-2">{feature.icon}</div>
              <h3 className="text-sm font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="text-xs text-text-muted mt-1">{feature.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-text-muted text-xs text-center mt-4"
        >
          Free &amp; open source • No account required • Uses Chess.com public
          API
        </motion.p>
      </main>
    </div>
  );
}
