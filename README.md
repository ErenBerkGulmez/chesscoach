# ♚ Chess Coach AI — Deterministic Chess Knowledge Engine

> **A fully offline, deterministic, zero-LLM chess coaching engine and interactive game review platform.**

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Why No LLM?](#-why-no-llm)
- [Core Philosophy](#-core-philosophy)
- [Engine Architecture & Pipeline](#-engine-architecture--pipeline)
- [Detailed Module Breakdown](#-detailed-module-breakdown)
- [UI & User Experience Features](#-ui--user-experience-features)
- [Two-Mode Coaching (Normal vs Technical)](#-two-mode-coaching-normal-vs-technical)
- [Position Example: The Promotion Blunder](#-position-example-the-promotion-blunder)
- [Technology Stack](#-technology-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started & Installation](#-getting-started--installation)
- [License](#-license)

---

## 🚀 Overview

**Chess Coach AI** is a state-of-the-art, 100% offline chess analysis and coaching application designed to deliver human-quality game reviews comparable to (or exceeding) *Chess.com Game Review*—**without requiring internet access, cloud servers, or Large Language Models (LLMs)**.

By pairing **Stockfish 18 WASM** (multi-PV analysis running locally in WebAssembly) with a **14-Module Deterministic Chess Knowledge Engine**, the system evaluates raw board position heuristics, tactical motifs, king safety, pawn structure, and forcing opponent replies to generate verified, position-grounded natural language coaching explanations.

---

## 💡 Why No LLM?

Traditional AI applications rely on cloud LLMs (GPT-4, Claude, Llama) to summarize chess positions. However, LLMs present critical flaws when applied to chess analysis:

1. **Hallucination & Factual Errors**: LLMs regularly misidentify piece positions, propose illegal moves, or miscalculate tactical consequences.
2. **High Latency & Cloud Dependence**: API calls take 2–5 seconds per move and require a active internet connection.
3. **High Operational Costs**: Calling external APIs for 60+ moves per game creates recurring API costs.
4. **Lack of Determinism**: Re-analyzing the same game move can produce conflicting explanations.

**Chess Coach AI solves all four problems**:
- **0ms Server Latency**: Runs entirely in the client browser.
- **100% Deterministic**: The same board position produces verified, reproducible coaching output every single time.
- **100% Free & Private**: No user data leaves the device; zero API tokens required.

---

## 🧠 Core Philosophy

1. **Stockfish is Evidence, Not Explanation**: Stockfish provides raw numerical evaluations (`+1.4`, `-7.2`, `#3`). The Knowledge Engine translates evaluation shifts into human concepts: *What happened? Why is it bad? What did the opponent play? What was lost? What was the alternative? What is the takeaway?*
2. **Objective Severity Precedence**: Narrative heuristics never override tactical ground-truth. Severe centipawn losses enforce strict language guardrails, prohibiting positive or neutral wording (e.g. banning "playable" or "steady" for a move losing 7 pawns).
3. **Causal Grounding & Tactical Specificity**: Explanations explicitly identify the concrete piece and square mechanics (e.g. explaining that a promoted queen on `g8` is captured by `...Rxg8`).
4. **Deterministic Diversity**: Sentence structures and openers vary dynamically across moves using deterministic seeds and in-game memory to prevent repetitive phrasing.

---

## 🏗️ Engine Architecture & Pipeline

```
                               Stockfish 18 WASM
                                (Multi-PV Depth)
                                       │
                                       ▼
                       Objective Severity Model (Step 0)
                                       │
                                       ▼
                         Forcing Reply Search Engine
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
Position Understanding        Tactical & Strategic         Move Quality & Intent
 • Game Phase Detector         • Tactical Pattern Engine    • Move Diagnostician
 • Piece Activity Evaluator    • Strategic Theme Engine     • Intent Engine
 • Pawn Structure Engine       • Threat Detector            • Mistake Taxonomy
 • King Safety Analyzer        • Forcing Reply Search       • Candidate Comparator
         │                             │                             │
         └─────────────────────────────┼─────────────────────────────┘
                                       ▼
                        Structured Reason Extractor
                                       │
                                       ▼
                         Concrete Causal Graph Engine
                                       │
                                       ▼
                    Counterfactual & Candidate Story Engine
                                       │
                                       ▼
                          Explanation Planner (V3)
                                       │
                                       ▼
                   Deterministic Diversity Controller (V3)
                                       │
                                       ▼
                 NLG Builder (Normal | Technical Modes)
                                       │
                                       ▼
                      Reasoning & Consistency Validator
                                       │
                                       ▼
                           Interactive UI / Coach Panel
```

---

## 🔍 Detailed Module Breakdown

| Module | File Path | Responsibilities |
|---|---|---|
| **Severity Model** | `severity-model.ts` | Computes `EvaluationSeverity` tiers (`NEGLIGIBLE` → `CATASTROPHIC`). Enforces forbidden positive language gates for blunders. |
| **Forcing Reply Search** | `forcing-reply-search.ts` | Evaluates Stockfish PV lines after a move to identify opponent's immediate checks, captures, target squares, and piece names. |
| **Reason Extractor** | `reason-extractor.ts` | Extracts first-class structured reasoning (`ExplanationReasoning`, `PromotionAnalysis`, `TacticalExplanation`). |
| **Causal Graph Engine** | `causal-graph-engine.ts` | Generates concrete cause-and-effect board chains (*Played move → Target square attacked → Opponent capture → Material lost*). |
| **Counterfactual Engine** | `counterfactual-engine.ts` | Explains why Stockfish's top recommended alternative works (e.g. keeping promotion threat alive while preventing the capture). |
| **Diversity Controller** | `diversity-controller.ts` | Manages structured opener families and tracks `ExplanationHistory` memory to prevent repetitive phrasing across game moves. |
| **Explanation Planner** | `explanation-planner.ts` | Calculates move importance scores (0–100) and adaptive information density (Brief, Compact, Detailed, Full). |
| **Intent Engine** | `intent-engine.ts` | Infers intended player goals (e.g. *Challenge Center, Promote Pawn, Protect King*) and contrasts intent vs actual outcome. |
| **Move Diagnostician** | `move-diagnostician.ts` | Classifies move quality types (*Tactical Oversight, Passive Square Choice, Delayed Mobilization, Catastrophic Failure*). |
| **Threat Detector** | `threat-detector.ts` | Identifies tactical threats created or unaddressed (forks, pins, skewers, mate threats). |
| **Narrative Engine** | `narrative-engine.ts` | Maintains game turning points and narrative arcs (*Equal Balanced, Player Initiative, Decisive Turning Point*). |
| **Reasoning Validator** | `reasoning-validator.ts` | Pre-display sanity validator checking semantic consistency and **Causal Completeness** for severe blunders. |
| **NLG Builder** | `explanation-flow-nlg.ts` | Synthesizes final coaching text into **NORMAL** or **TECHNICAL** presentation modes. |

---

## 🎨 UI & User Experience Features

- ♟️ **Interactive Chessboard**: Built with `react-chessboard` and `chess.js`. Supports drag-and-drop, keyboard arrow navigation (`←`, `→`, `Home`, `End`), board flip (`F`), and variation exploration mode.
- 📌 **Sticky Analysis Sidebar**: Fixed 450px sidebar with independent scrolling move list and coach panel styled after modern chess platforms.
- 📊 **Visual Analytics**:
  - **King Safety & Piece Activity Meters**: Real-time percentage meters measuring king shelter, attacker/defender balance, and piece mobility.
  - **Evaluation & Threat Timeline**: Interactive SVG evaluation graph showing score fluctuations, zero-line balance, cursor indicator, and classification badges (`!!`, `!`, `??`, `?`, `?!`).
- 📈 **4-Category Independent Opening Analytics**:
  - *My White Openings* (Openings chosen as White)
  - *Defenses vs My White* (Responses faced playing White)
  - *My Black Defenses* (Defenses chosen as Black)
  - *Responses vs My Black* (Openings faced playing Black)
- 🌓 **Theme Toggle**: Dark & Light mode support with persistent `localStorage` preference.

---

## 🎙️ Two-Mode Coaching (Normal vs Technical)

Users can toggle seamlessly between two presentation modes in the `AICoachPanel`:

### 1. NORMAL Mode (Default)
Human, concise, natural coaching following the central contract:
- **What you tried to do** (Intent acknowledgment)
- **What actually happened** (Board outcome)
- **Why it failed or succeeded** (Concrete tactical mechanism)
- **Better alternative** (Counterfactual option)
- **General takeaway lesson** (Actionable principle)

### 2. TECHNICAL Mode
Exposes complete engine transparency for advanced players:
- Raw Evaluation before → after (Delta in pawns)
- Centipawn Loss (CPL) & Severity Score
- Exact Opponent Forcing Response (`...Rxg8`)
- Tactical Motif & PV Line
- Causal Graph Chain Flow

---

## ♟️ Position Example: The Promotion Blunder

Consider a game where White plays `g8=Q??` in an equal position (`0.00 → -7.20` evaluation drop) because Black's rook on `g1` can capture `g8`:

### ❌ Old V2 Output (Generic Severity):
> **Decisive Mistake (-7.2 pawns)**  
> *This is the decisive mistake. g8=Q collapses the position by 7.2 pawns due to an immediate tactical vulnerability.*

### ✅ New V3 NORMAL Mode Output (Causally Grounded):
> **The promotion fails tactically. (g8=Q)**  
> *You were trying to promote your passed pawn, which is completely natural. Promoting with g8=Q puts the new queen directly onto g8, where it can immediately be captured by ...Rxg8. You lose the promoted piece without adequate compensation. The stronger continuation is [bestMove], which keeps the promotion threat while avoiding the capture. Remember this pattern: Before promoting, always check whether the promotion square is actually safe from captures.*

### 🛠️ New V3 TECHNICAL Mode Output (Raw Evidence):
> **[TECHNICAL] g8=Q (BLUNDER) | CPL: 720cp**  
> *Evaluation: 0.00 → -7.20 (Delta: -7.20).*  
> *Classification: BLUNDER | Severity Tier: CATASTROPHIC.*  
> *Critical Response: Opponent's rook immediately captures your queen on g8 (Rxg8).*  
> *Tactical Motif: CAPTURE.*  
> *Causal Graph: Promoted pawn (g8=Q) → New queen appears on g8 → g8 square controlled by opponent rook → Opponent captures with ...Rxg8 → Promoted queen is removed → Material balance collapses.*

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI / Animation**: React 19, Tailwind CSS, Framer Motion, Lucide Icons, Recharts
- **State Management**: Zustand
- **Chess Logic**: Chess.js
- **Engine**: Stockfish WASM (Multi-PV depth 14–20 execution)
- **Language**: TypeScript (Strict Mode)

---

## 📁 Project Directory Structure

```
chess-coach/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx                      # Landing page (username input)
│       │   │   ├── dashboard/[username]/
│       │   │   │   ├── page.tsx                  # Dashboard (games list & stats)
│       │   │   │   └── games/[gameId]/
│       │   │   │       └── page.tsx              # Sticky Game Review page
│       │   ├── components/
│       │   │   ├── analysis/
│       │   │   │   ├── AICoachPanel.tsx          # Coach panel (Normal/Technical)
│       │   │   │   └── PositionMeters.tsx        # King Safety & Piece Activity
│       │   │   ├── chess/
│       │   │   │   ├── BoardControls.tsx         # Navigation & tool controls
│       │   │   │   ├── ChessBoard.tsx            # Interactive board & eval bar
│       │   │   │   ├── EngineLines.tsx           # Multi-PV engine lines & variations
│       │   │   │   ├── EvalGraph.tsx             # Interactive SVG eval timeline
│       │   │   │   └── MoveList.tsx              # Game move list with badges
│       │   │   ├── dashboard/
│       │   │   │   ├── OpeningAnalytics.tsx      # 4-Category opening dashboard
│       │   │   │   └── StatsOverview.tsx         # General player statistics
│       │   │   ├── games/
│       │   │   │   ├── GameFilters.tsx           # Game filters & search bar
│       │   │   │   └── GameList.tsx              # Paginated game table
│       │   │   └── layout/
│       │   │       └── ThemeToggle.tsx           # Dark/Light theme toggle
│       │   ├── lib/
│       │   │   ├── api/                          # Chess.com public API client
│       │   │   ├── chess/                        # PGN parser & move classifier
│       │   │   ├── engine/                       # 14-Module Knowledge Engine
│       │   │   └── stockfish/                    # Stockfish WASM worker wrapper
│       │   ├── stores/                           # Zustand analysis & player stores
│       │   └── types/                            # Shared TypeScript interfaces
└── README.md
```

---

## 📦 Getting Started & Installation

### Prerequisites

- Node.js 18.x or later
- npm or pnpm

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/chess-coach.git
   cd chess-coach
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000) and enter any public Chess.com username (e.g. `hikaru`, `magnuscarlsen`, `dannyrensch`).

### Production Verification

To verify TypeScript and compile the production bundle:
```bash
npx next build
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
