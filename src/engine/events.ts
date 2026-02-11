import { EventEmitter } from 'node:events';

/**
 * Engine event emitter.
 *
 * Events:
 * - 'thought:added': { sessionId, index, content }
 * - 'thought:revised': { sessionId, index, content, revision }
 * - 'session:created': { sessionId, level }
 * - 'session:expired': { sessionId }
 */
export const engineEvents = new EventEmitter();

engineEvents.on('error', (err) => {
  console.error('[engine]', err);
});
