import { EventEmitter } from 'node:events';

import { getErrorMessage } from '../lib/errors.js';
import type { ReasoningLevel } from '../lib/types.js';

export interface EngineEvents {
  'thought:added': [{ sessionId: string; index: number; content: string }];
  'thought:revised': [
    { sessionId: string; index: number; content: string; revision: number },
  ];
  'session:created': [{ sessionId: string; level: ReasoningLevel }];
  'session:expired': [{ sessionId: string }];
  error: [unknown];
}

interface TypedEmitter<T> extends Omit<EventEmitter, 'on' | 'off' | 'emit'> {
  on<K extends keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void
  ): this;
  off<K extends keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void
  ): this;
  emit<K extends keyof T>(
    event: K,
    ...args: T[K] extends unknown[] ? T[K] : never
  ): boolean;
}

/**
 * Engine event emitter.
 *
 * Events:
 * - 'thought:added': { sessionId, index, content }
 * - 'thought:revised': { sessionId, index, content, revision }
 * - 'session:created': { sessionId, level }
 * - 'session:expired': { sessionId }
 */
export const engineEvents = new EventEmitter({
  captureRejections: true,
}) as TypedEmitter<EngineEvents>;

engineEvents.on('error', (err) => {
  process.stderr.write(`[engine] ${getErrorMessage(err)}\n`);
});
