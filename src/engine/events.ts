import { EventEmitter } from 'node:events';

import { getErrorMessage } from '../lib/errors.js';

/**
 * Engine event emitter.
 *
 * Events:
 * - 'thought:added': { sessionId, index, content }
 * - 'thought:revised': { sessionId, index, content, revision }
 * - 'session:created': { sessionId, level }
 * - 'session:expired': { sessionId }
 */
export const engineEvents = new EventEmitter({ captureRejections: true });

engineEvents.on('error', (err) => {
  process.stderr.write(`[engine] ${getErrorMessage(err)}\n`);
});
