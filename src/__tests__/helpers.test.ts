import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool-response.js';

describe('getErrorMessage', () => {
  it('returns message from Error object', () => {
    assert.equal(getErrorMessage(new Error('test error')), 'test error');
  });

  it('returns string directly', () => {
    assert.equal(getErrorMessage('string error'), 'string error');
  });

  it('returns Unknown error for null', () => {
    assert.equal(getErrorMessage(null), 'Unknown error');
  });

  it('returns Unknown error for undefined', () => {
    assert.equal(getErrorMessage(undefined), 'Unknown error');
  });

  it('stringifies non-string non-Error values', () => {
    assert.equal(getErrorMessage(42), '42');
  });

  it('returns message from error-like objects', () => {
    const payload = { message: 'wrapped error message' };
    assert.equal(getErrorMessage(payload), 'wrapped error message');
  });

  it('falls back to inspect for circular values', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const message = getErrorMessage(circular);
    assert.notEqual(message, 'Unknown error (serialization failed)');
    assert.match(message, /Circular|self/);
  });
});

describe('createToolResponse', () => {
  it('returns correct shape with content and structuredContent', () => {
    const input = { ok: true, result: { data: 'test' } };
    const response = createToolResponse(input);

    assert.equal(response.content.length, 1);
    assert.equal(response.content[0]!.type, 'text');
    assert.equal(response.content[0]!.text, JSON.stringify(input));
    assert.deepEqual(response.structuredContent, input);
  });
});

describe('createErrorResponse', () => {
  it('returns correct shape with isError true', () => {
    const response = createErrorResponse('E_TEST', 'Test error');

    assert.equal(response.isError, true);
    assert.equal(response.content.length, 1);
    assert.equal(response.content[0]!.type, 'text');

    const parsed = JSON.parse(response.content[0]!.text) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'E_TEST');
    assert.equal(parsed.error.message, 'Test error');
  });
});
