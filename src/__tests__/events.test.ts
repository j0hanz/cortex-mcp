import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { engineEvents } from '../engine/events.js';

describe('engineEvents', () => {
  it('captures rejected async listeners as error events', async () => {
    const rawEngineEvents = engineEvents as unknown as EventEmitter;
    const testEvent = `test:rejection:${randomUUID()}`;
    const expected = new Error(`listener failed: ${testEvent}`);

    const onTestEvent = async (): Promise<void> => {
      throw expected;
    };
    rawEngineEvents.on(testEvent, onTestEvent);

    try {
      const errorEvent = once(rawEngineEvents, 'error');
      rawEngineEvents.emit(testEvent);

      const result = await Promise.race([
        errorEvent,
        delay(500).then(() => {
          throw new Error('Timed out waiting for error event');
        }),
      ]);
      const [actual] = result as [unknown];
      assert.equal(actual, expected);
    } finally {
      rawEngineEvents.off(testEvent, onTestEvent);
    }
  });
});
