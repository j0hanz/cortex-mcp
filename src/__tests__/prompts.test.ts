import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createServer } from '../server.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let client!: Client;
let server!: McpServer;

before(async () => {
  server = createServer();
  client = new Client({ name: 'test-prompts', version: '0.0.1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
});

after(async () => {
  await client.close();
  await server.close();
});

// Helpers

async function createSession(): Promise<string> {
  const result = (await client.callTool({
    name: 'reasoning_think',
    arguments: {
      query: 'prompt-test query',
      level: 'basic',
      thought: 'thought for test',
    },
  })) as { content: Array<{ type: string; text?: string }> };
  const block = result.content.find((b) => b.type === 'text');
  assert.ok(block?.text);
  const parsed = JSON.parse(block.text) as {
    ok: boolean;
    result: { sessionId: string };
  };
  assert.ok(parsed.ok);
  return parsed.result.sessionId;
}

// ---------------------------------------------------------------------------
// listPrompts
// ---------------------------------------------------------------------------

describe('prompts — listPrompts', () => {
  it('lists all expected prompts', async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    const expected = [
      'get-help',
      'reasoning.basic',
      'reasoning.normal',
      'reasoning.high',
      'reasoning.expert',
      'reasoning.retry',
      'reasoning.continue',
    ];
    for (const name of expected) {
      assert.ok(
        names.includes(name),
        `Missing prompt: ${name} (found: ${names.join(', ')})`
      );
    }
  });

  it('each prompt has a description', async () => {
    const { prompts } = await client.listPrompts();
    for (const p of prompts) {
      assert.ok(
        typeof p.description === 'string' && p.description.length > 0,
        `Prompt ${p.name} has no description`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// getPrompt — get-help (no required args)
// ---------------------------------------------------------------------------

describe('prompts — get-help', () => {
  it('returns a non-empty user message', async () => {
    const result = await client.getPrompt({ name: 'get-help', arguments: {} });
    assert.ok(result.messages.length > 0);
    const msg = result.messages[0];
    assert.ok(msg);
    assert.equal(msg.role, 'user');
    assert.equal(msg.content.type, 'text');
    assert.ok(
      'text' in msg.content &&
        typeof msg.content.text === 'string' &&
        msg.content.text.length > 0
    );
  });
});

// ---------------------------------------------------------------------------
// getPrompt — reasoning.basic
// ---------------------------------------------------------------------------

describe('prompts — reasoning.basic', () => {
  it('returns a user message containing the query', async () => {
    const result = await client.getPrompt({
      name: 'reasoning.basic',
      arguments: { query: 'test query for basic prompt' },
    });
    assert.ok(result.messages.length > 0);
    const msg = result.messages[0];
    assert.ok(msg);
    assert.equal(msg.role, 'user');
    assert.ok('text' in msg.content);
    assert.ok(msg.content.text.includes('test query for basic prompt'));
  });

  it('accepts optional targetThoughts when omitted', async () => {
    // targetThoughts is z.number() on the server; prompt args are always strings,
    // so we just verify the base case works without it
    const result = await client.getPrompt({
      name: 'reasoning.basic',
      arguments: { query: 'q' },
    });
    const msg = result.messages[0];
    assert.ok(msg && 'text' in msg.content);
    assert.ok(msg.content.text.length > 0);
  });
});

// ---------------------------------------------------------------------------
// getPrompt — reasoning.normal / high / expert
// ---------------------------------------------------------------------------

describe('prompts — reasoning levels', () => {
  for (const level of ['normal', 'high', 'expert'] as const) {
    it(`reasoning.${level} returns a user message`, async () => {
      const result = await client.getPrompt({
        name: `reasoning.${level}`,
        arguments: { query: `test for ${level}` },
      });
      assert.ok(result.messages.length > 0);
      const msg = result.messages[0];
      assert.ok(msg && 'text' in msg.content);
      assert.ok(msg.content.text.length > 0);
    });
  }
});

// ---------------------------------------------------------------------------
// getPrompt — reasoning.retry
// ---------------------------------------------------------------------------

describe('prompts — reasoning.retry', () => {
  it('returns a user message with retry context', async () => {
    const result = await client.getPrompt({
      name: 'reasoning.retry',
      arguments: { query: 'retry this query', level: 'basic' },
    });
    const msg = result.messages[0];
    assert.ok(msg && 'text' in msg.content);
    assert.ok(msg.content.text.includes('retry this query'));
  });
});

// ---------------------------------------------------------------------------
// getPrompt — reasoning.continue
// ---------------------------------------------------------------------------

describe('prompts — reasoning.continue', () => {
  it('returns a user message referencing the sessionId', async () => {
    const sessionId = await createSession();
    const result = await client.getPrompt({
      name: 'reasoning.continue',
      arguments: { sessionId },
    });
    const msg = result.messages[0];
    assert.ok(msg && 'text' in msg.content);
    assert.ok(msg.content.text.includes(sessionId));
  });
});

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

describe('prompts — completions', () => {
  it('completes level argument with prefix "ba"', async () => {
    const result = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.retry' },
      argument: { name: 'level', value: 'ba' },
    });
    assert.ok(result.completion.values.length > 0, 'No completions returned');
    assert.ok(
      result.completion.values.includes('basic'),
      `basic not in ${result.completion.values.join(', ')}`
    );
  });

  it('completes level argument with empty prefix returns all levels', async () => {
    const result = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.retry' },
      argument: { name: 'level', value: '' },
    });
    const levels = ['basic', 'normal', 'high', 'expert'];
    for (const level of levels) {
      assert.ok(
        result.completion.values.includes(level),
        `${level} not in completions`
      );
    }
  });

  it('completes sessionId with known prefix', async () => {
    const sessionId = await createSession();
    const prefix = sessionId.slice(0, 8);
    const result = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.continue' },
      argument: { name: 'sessionId', value: prefix },
    });
    assert.ok(
      result.completion.values.some((v) => v === sessionId),
      `${sessionId} not found in completions for prefix "${prefix}"`
    );
  });
});
