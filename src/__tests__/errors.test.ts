import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createErrorResponse,
  getErrorMessage,
  InsufficientThoughtsError,
  InvalidRunModeArgsError,
  InvalidThoughtCountError,
  isObjectRecord,
  ReasoningAbortedError,
  ReasoningError,
  ServerBusyError,
  SessionNotFoundError,
} from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('SessionNotFoundError', () => {
  it('has correct code and name', () => {
    const err = new SessionNotFoundError('abc-123');
    assert.equal(err.code, 'E_SESSION_NOT_FOUND');
    assert.equal(err.name, 'SessionNotFoundError');
    assert.ok(err instanceof ReasoningError);
    assert.ok(err instanceof Error);
    assert.match(err.message, /abc-123/);
  });
});

describe('InvalidThoughtCountError', () => {
  it('has correct code and name', () => {
    const err = new InvalidThoughtCountError('bad count');
    assert.equal(err.code, 'E_INVALID_THOUGHT_COUNT');
    assert.equal(err.name, 'InvalidThoughtCountError');
    assert.ok(err instanceof ReasoningError);
    assert.equal(err.message, 'bad count');
  });
});

describe('InsufficientThoughtsError', () => {
  it('has correct code and name', () => {
    const err = new InsufficientThoughtsError('not enough');
    assert.equal(err.code, 'E_INSUFFICIENT_THOUGHTS');
    assert.equal(err.name, 'InsufficientThoughtsError');
    assert.ok(err instanceof ReasoningError);
  });
});

describe('InvalidRunModeArgsError', () => {
  it('has correct code and name', () => {
    const err = new InvalidRunModeArgsError('bad args');
    assert.equal(err.code, 'E_INVALID_RUN_MODE_ARGS');
    assert.equal(err.name, 'InvalidRunModeArgsError');
    assert.ok(err instanceof ReasoningError);
  });
});

describe('ReasoningAbortedError', () => {
  it('has correct code and name with default message', () => {
    const err = new ReasoningAbortedError();
    assert.equal(err.code, 'E_ABORTED');
    assert.equal(err.name, 'ReasoningAbortedError');
    assert.ok(err instanceof ReasoningError);
    assert.ok(err.message.length > 0);
  });

  it('accepts custom message', () => {
    const err = new ReasoningAbortedError('user cancelled');
    assert.equal(err.message, 'user cancelled');
  });
});

describe('ServerBusyError', () => {
  it('has correct code and name with default message', () => {
    const err = new ServerBusyError();
    assert.equal(err.code, 'E_SERVER_BUSY');
    assert.equal(err.name, 'ServerBusyError');
    assert.ok(err instanceof ReasoningError);
    assert.ok(err.message.length > 0);
  });
});

// ---------------------------------------------------------------------------
// createErrorResponse
// ---------------------------------------------------------------------------

describe('createErrorResponse', () => {
  it('returns isError: true with parseable JSON content', () => {
    const res = createErrorResponse('E_TEST', 'test message');
    assert.equal(res.isError, true);
    assert.equal(res.content.length, 1);
    const textBlock = res.content[0];
    assert.ok(textBlock);
    const parsed = JSON.parse(textBlock.text) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'E_TEST');
    assert.equal(parsed.error.message, 'test message');
  });

  it('content type is text', () => {
    const res = createErrorResponse('E_X', 'msg');
    assert.equal(res.content[0]?.type, 'text');
  });
});

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------

describe('getErrorMessage', () => {
  it('returns Error.message', () => {
    assert.equal(getErrorMessage(new Error('oops')), 'oops');
  });

  it('returns string directly', () => {
    assert.equal(getErrorMessage('raw string'), 'raw string');
  });

  it('returns fallback string for null', () => {
    const msg = getErrorMessage(null);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0);
  });

  it('returns fallback string for undefined', () => {
    const msg = getErrorMessage(undefined);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0);
  });

  it('extracts message from error-like plain object', () => {
    assert.equal(getErrorMessage({ message: 'from obj' }), 'from obj');
  });

  it('serializes unknown values', () => {
    const msg = getErrorMessage(42);
    assert.equal(typeof msg, 'string');
  });
});

// ---------------------------------------------------------------------------
// isObjectRecord
// ---------------------------------------------------------------------------

describe('isObjectRecord', () => {
  it('returns true for plain objects', () => {
    assert.ok(isObjectRecord({}));
    assert.ok(isObjectRecord({ a: 1 }));
  });

  it('returns false for null', () => {
    assert.equal(isObjectRecord(null), false);
  });

  it('returns false for primitive string', () => {
    assert.equal(isObjectRecord('string'), false);
  });

  it('returns false for primitive number', () => {
    assert.equal(isObjectRecord(42), false);
  });

  it('returns false for boolean', () => {
    assert.equal(isObjectRecord(true), false);
  });

  it('returns true for arrays (objects in JS)', () => {
    assert.ok(isObjectRecord([]));
  });
});
