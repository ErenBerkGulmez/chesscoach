"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/layout/SiteFooter";

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
            headers: { "User-Agent": "ChessCoach/1.0" },
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
    <div className="min-h-screen flex flex-col items-center px-4">
      <main className="flex-1 flex flex-col items-center justify-center gap-8 max-w-md w-full py-8">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-primary">
            <span className="text-accent">♞</span> Chess Coach
          </h1>
          <p className="text-text-secondary text-base sm:text-lg mt-3 leading-relaxed">
            Review your Chess.com games. See what you missed and what to work on.
          </p>
        </div>

        {/* Username Input */}
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md"
        >
          <div className="relative">
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
            <p
              className="text-blunder text-sm mt-3 text-center"
            >
              {error}
            </p>
          )}
        </form>

        <p className="text-text-muted text-xs text-center">
          Free, no account needed. Analysis runs on your device.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
