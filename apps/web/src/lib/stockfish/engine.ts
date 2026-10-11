/**
 * Stockfish WASM Engine Wrapper
 * 
 * Manages a Stockfish WASM instance running in a Web Worker.
 * Provides a clean async API for position evaluation with MultiPV support.
 * 
 * Usage:
 *   const engine = new StockfishEngine();
 *   await engine.init();
 *   const result = await engine.evaluate('fen...', { depth: 20, multiPv: 3 });
 *   engine.destroy();
 */

export interface EvalResult {
  depth: number;
  score: number;       // Centipawns from white's perspective
  mate: number | null;  // Mate in N (positive = white mates, negative = black mates)
  pv: string[];         // Principal variation in UCI format
  multipv: number;      // Which PV line (1 = best)
  nodes?: number;
  nps?: number;
  time?: number;
}

export interface EvalOptions {
  depth?: number;
  multiPv?: number;
  threads?: number;
  hash?: number;
}

const DEFAULT_OPTIONS: Required<EvalOptions> = {
  depth: 20,
  multiPv: 3,
  threads: 2,
  hash: 64,
};

/**
 * Hash size (MB) that is safe for this device. Phones, iOS Safari in
 * particular, can kill the page when a WASM worker grabs 64MB.
 */
export function safeHashMb(): number {
  if (typeof window === 'undefined') return DEFAULT_OPTIONS.hash;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return lowMemory || coarse ? 16 : DEFAULT_OPTIONS.hash;
}

type EngineState = 'idle' | 'initializing' | 'ready' | 'evaluating' | 'destroyed';

export class StockfishEngine {
  private worker: Worker | null = null;
  private state: EngineState = 'idle';
  private multiPv = DEFAULT_OPTIONS.multiPv;
  private messageBuffer: string[] = [];
  private resolveReady: (() => void) | null = null;
  private currentEval: {
    resolve: (results: EvalResult[]) => void;
    reject: (error: Error) => void;
    results: Map<number, EvalResult>;
    targetDepth: number;
  } | null = null;

  private onEvalProgress?: (results: EvalResult[]) => void;

  /**
   * Initialize the Stockfish WASM engine.
   * Must be called before any evaluation.
   */
  async init(options?: Partial<EvalOptions>): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot init engine in state: ${this.state}`);
    }

    this.state = 'initializing';
    const opts = { ...DEFAULT_OPTIONS, hash: safeHashMb(), ...options };

    return new Promise<void>((resolve, reject) => {
      try {
        // Create a Web Worker using the local served stockfish script
        this.worker = new Worker('/stockfish/stockfish-18-lite-single.js');

        this.resolveReady = resolve;

        this.worker.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data);
        };

        this.worker.onerror = (error) => {
          console.error('[Stockfish] Worker error:', error);
          if (this.state === 'initializing') {
            reject(new Error('Failed to initialize Stockfish'));
          }
        };

        // Send UCI initialization commands
        this.sendCommand('uci');
      } catch (error) {
        this.state = 'idle';
        reject(error);
      }
    }).then(() => {
      // Configure engine options after UCI handshake
      this.sendCommand(`setoption name Threads value ${opts.threads}`);
      this.sendCommand(`setoption name Hash value ${opts.hash}`);
      this.sendCommand(`setoption name MultiPV value ${opts.multiPv}`);
      this.multiPv = opts.multiPv;
      this.sendCommand('isready');

      return new Promise<void>((resolve) => {
        this.resolveReady = () => {
          this.state = 'ready';
          resolve();
        };
      });
    });
  }

  /**
   * Evaluate a position given as a FEN string.
   * Returns all PV lines when evaluation completes.
   */
  async evaluate(
    fen: string,
    options?: Partial<EvalOptions>,
    onProgress?: (results: EvalResult[]) => void
  ): Promise<EvalResult[]> {
    if (this.state === 'destroyed') {
      throw new Error('Cannot evaluate on a destroyed Stockfish engine');
    }

    if (this.state === 'initializing') {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.state === 'ready' || this.state === 'evaluating') {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    }

    // If an evaluation is already in progress, stop it and resolve previous call with partial results
    if (this.state === 'evaluating' && this.currentEval) {
      const prevEval = this.currentEval;
      this.currentEval = null;
      this.sendCommand('stop');
      const partialResults = Array.from(prevEval.results.values()).sort(
        (a, b) => a.multipv - b.multipv
      );
      prevEval.resolve(partialResults);
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.state = 'evaluating';
    this.onEvalProgress = onProgress;

    // Update MultiPV if it differs from what the engine is set to
    if (opts.multiPv !== this.multiPv) {
      this.sendCommand(`setoption name MultiPV value ${opts.multiPv}`);
      this.multiPv = opts.multiPv;
    }

    return new Promise<EvalResult[]>((resolve, reject) => {
      this.currentEval = {
        resolve,
        reject,
        results: new Map(),
        targetDepth: opts.depth,
      };

      this.sendCommand('stop');
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${opts.depth}`);
    });
  }

  /**
   * Stop the current evaluation.
   */
  stop(): void {
    if (this.state === 'evaluating') {
      this.sendCommand('stop');
    }
  }

  /**
   * Destroy the engine and release resources.
   */
  destroy(): void {
    if (this.worker) {
      this.sendCommand('quit');
      this.worker.terminate();
      this.worker = null;
    }
    this.state = 'destroyed';
    this.currentEval = null;
    this.onEvalProgress = undefined;
  }

  /**
   * Check if the engine is ready for evaluation.
   */
  isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Get the current engine state.
   */
  getState(): EngineState {
    return this.state;
  }

  // ─── Private Methods ────────────────────────────────────────

  private sendCommand(command: string): void {
    if (this.worker) {
      this.worker.postMessage(command);
    }
  }

  private handleMessage(data: string): void {
    const line = typeof data === 'string' ? data.trim() : String(data).trim();
    if (!line) return;

    this.messageBuffer.push(line);

    // Handle UCI identification
    if (line === 'uciok') {
      if (this.state === 'initializing' && this.resolveReady) {
        this.resolveReady();
        this.resolveReady = null;
      }
      return;
    }

    // Handle readyok
    if (line === 'readyok') {
      if (this.resolveReady) {
        this.resolveReady();
        this.resolveReady = null;
      }
      return;
    }

    // Handle evaluation info lines
    if (line.startsWith('info') && this.currentEval) {
      const evalResult = this.parseInfoLine(line);
      if (evalResult) {
        this.currentEval.results.set(evalResult.multipv, evalResult);
        
        // Send progress update
        if (this.onEvalProgress) {
          const results = Array.from(this.currentEval.results.values())
            .sort((a, b) => a.multipv - b.multipv);
          this.onEvalProgress(results);
        }
      }
      return;
    }

    // Handle bestmove (evaluation complete)
    if (line.startsWith('bestmove') && this.currentEval) {
      const results = Array.from(this.currentEval.results.values())
        .sort((a, b) => a.multipv - b.multipv);
      
      this.currentEval.resolve(results);
      this.currentEval = null;
      this.onEvalProgress = undefined;
      this.state = 'ready';
      return;
    }
  }

  /**
   * Parse a UCI "info" line into an EvalResult.
   * 
   * Example info line:
   * info depth 20 seldepth 28 multipv 1 score cp 35 nodes 1234567 nps 2345678 time 526 pv e2e4 e7e5 g1f3
   */
  private parseInfoLine(line: string): EvalResult | null {
    const tokens = line.split(' ');
    
    const depthIdx = tokens.indexOf('depth');
    const multipvIdx = tokens.indexOf('multipv');
    const scoreIdx = tokens.indexOf('score');
    const pvIdx = tokens.indexOf('pv');
    const nodesIdx = tokens.indexOf('nodes');
    const npsIdx = tokens.indexOf('nps');
    const timeIdx = tokens.indexOf('time');

    // Must have depth and score to be useful
    if (depthIdx === -1 || scoreIdx === -1) return null;

    const depth = parseInt(tokens[depthIdx + 1], 10);
    const multipv = multipvIdx !== -1 ? parseInt(tokens[multipvIdx + 1], 10) : 1;

    // Parse score
    let score = 0;
    let mate: number | null = null;

    if (tokens[scoreIdx + 1] === 'cp') {
      score = parseInt(tokens[scoreIdx + 2], 10);
    } else if (tokens[scoreIdx + 1] === 'mate') {
      mate = parseInt(tokens[scoreIdx + 2], 10);
      // Convert mate to large centipawn value for comparison
      score = mate > 0 ? 10000 - mate : -10000 - mate;
    }

    // Parse PV
    const pv: string[] = [];
    if (pvIdx !== -1) {
      for (let i = pvIdx + 1; i < tokens.length; i++) {
        if (tokens[i].match(/^[a-h][1-8][a-h][1-8][qrbn]?$/)) {
          pv.push(tokens[i]);
        } else {
          break;
        }
      }
    }

    // Parse optional fields
    const nodes = nodesIdx !== -1 ? parseInt(tokens[nodesIdx + 1], 10) : undefined;
    const nps = npsIdx !== -1 ? parseInt(tokens[npsIdx + 1], 10) : undefined;
    const time = timeIdx !== -1 ? parseInt(tokens[timeIdx + 1], 10) : undefined;

    return { depth, score, mate, pv, multipv, nodes, nps, time };
  }
}

/**
 * Convert a centipawn score to a human-readable evaluation string.
 * Examples: "+1.35", "-0.50", "M3", "-M5"
 */
export function formatEval(score: number, mate: number | null): string {
  if (mate !== null) {
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  }
  const pawns = score / 100;
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}

/**
 * Convert evaluation to a normalized bar percentage (0-100).
 * 50 = equal, 100 = white winning, 0 = black winning.
 */
export function evalToBarPercentage(score: number, mate: number | null): number {
  if (mate !== null) {
    return mate > 0 ? 100 : 0;
  }
  // Use a sigmoid function to map centipawns to 0-100
  // At ±400cp, the bar is nearly full
  const sigmoid = 1 / (1 + Math.exp(-score / 200));
  return Math.round(sigmoid * 100);
}

/**
 * Convert eval score to a win percentage (Lichess formula).
 */
export function evalToWinPercent(score: number, mate: number | null): number {
  if (mate !== null) {
    return mate > 0 ? 100 : 0;
  }
  // Lichess win probability formula
  const winP = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score)) - 1);
  return Math.min(100, Math.max(0, winP));
}
