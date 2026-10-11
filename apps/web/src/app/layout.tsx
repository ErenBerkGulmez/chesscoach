import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chess Coach — Review your Chess.com games with Stockfish",
  description:
    "Free in-browser game review powered by Stockfish. Enter your Chess.com username to get move-by-move analysis, explanations and opening statistics.",
  keywords: ["chess", "analysis", "stockfish", "chess.com", "game review"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint to avoid a dark flash for light-mode users. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("chess-coach-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
