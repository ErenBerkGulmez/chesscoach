/**
 * The sparring bot: a thin client for the worker in public/maia-worker.js.
 * Positions are encoded here, the network runs in the worker, and the move
 * is chosen here from what comes back.
 */
import { chooseMove, prepareInput, rankMoves, type RankedMove } from './maia';

/** Where the model is served from. Hosts that keep it elsewhere can point this at it. */
export const MAIA_MODEL_URL = process.env.NEXT_PUBLIC_MAIA_MODEL_URL ?? '/maia/maia_rapid.onnx';
/** Size of the model download, for telling the player before it starts. */
export const MAIA_MODEL_MB = 93;

export class MaiaMissingError extends Error {}

type Pending = { resolve: (logits: Float32Array) => void; reject: (error: Error) => void };

export class MaiaBot {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  /**
   * Start the worker and load the model. Safe to call more than once.
   * Rejects with MaiaMissingError when the model or runtime is not installed.
   */
  load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const worker = new Worker('/maia-worker.js');
      this.worker = worker;
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'progress') onProgress?.(message.loaded, message.total);
        else if (message.type === 'ready') resolve();
        else if (message.type === 'error') {
          this.dispose();
          reject(message.missing ? new MaiaMissingError(message.message) : new Error(message.message));
        } else if (message.type === 'result' || message.type === 'failed') {
          const waiting = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.type === 'result') waiting?.resolve(message.logits as Float32Array);
          else waiting?.reject(new Error(message.message));
        }
      };
      worker.onerror = () => {
        this.dispose();
        reject(new Error('The bot could not be started'));
      };
      worker.postMessage({ type: 'load', modelUrl: MAIA_MODEL_URL });
    });
    return this.ready;
  }

  /** How a player of `botRating` would move here, likeliest move first. Null when there is no legal move. */
  async predict(fen: string, botRating: number, opponentRating: number): Promise<RankedMove[] | null> {
    await this.load();
    const input = prepareInput(fen, botRating, opponentRating);
    if (!input || !this.worker) return null;
    const id = this.nextId++;
    const logits = await new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage(
        { type: 'run', id, board: input.board, ratingSelf: input.ratingSelf, ratingOpponent: input.ratingOpponent },
        [input.board.buffer]
      );
    });
    return rankMoves(logits, input.legal);
  }

  /** The bot's move for a position, sampled the way a person of that rating would choose. */
  async move(fen: string, botRating: number, opponentRating: number, rand: () => number): Promise<RankedMove | null> {
    const ranked = await this.predict(fen, botRating, opponentRating);
    return ranked ? chooseMove(ranked, rand) : null;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const waiting of this.pending.values()) waiting.reject(new Error('The bot was stopped'));
    this.pending.clear();
  }
}
