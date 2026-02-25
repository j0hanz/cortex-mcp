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
  client = new Client({ name: 'test-resources', version: '0.0.1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
});

after(async () => {
  await client.close();
  await server.close();
});

// Helpers

async function callToolRaw(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}> {
  return client.callTool({
    name: 'reasoning_think',
    arguments: args,
  }) as Promise<
    typeof callToolRaw extends (...args: unknown[]) => Promise<infer R>
      ? R
      : never
  >;
}

async function createSession(): Promise<string> {
  const result = await callToolRaw({
    query: 'resource test session',
    level: 'basic',
    thought: 'resource test thought',
  });
  const block = result.content.find((b) => b.type === 'text');
  assert.ok(block?.text);
  const parsed = JSON.parse(block.text) as {
    ok: boolean;
    result: { sessionId: string };
  };
  assert.ok(parsed.ok, 'Failed to create test session');
  return parsed.result.sessionId;
}

// ---------------------------------------------------------------------------
// Resource listing
// ---------------------------------------------------------------------------

describe('resources — listResources', () => {
  it('lists static internal resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    assert.ok(
      uris.includes('internal://instructions'),
      `instructions not found: ${uris.join(', ')}`
    );
    assert.ok(uris.includes('internal://tool-catalog'));
    assert.ok(uris.includes('internal://workflows'));
    assert.ok(uris.includes('reasoning://sessions'));
  });

  it('lists resource templates', async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    const uriTemplates = resourceTemplates.map((rt) => rt.uriTemplate);
    assert.ok(
      uriTemplates.some((t) => t.includes('{sessionId}')),
      `No session template found: ${uriTemplates.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// Static resources — read
// ---------------------------------------------------------------------------

describe('resources — internal://instructions', () => {
  it('returns non-empty markdown text', async () => {
    const result = await client.readResource({
      uri: 'internal://instructions',
    });
    const content = result.contents[0];
    assert.ok(content, 'No content returned');
    assert.ok(
      'text' in content &&
        typeof content.text === 'string' &&
        content.text.length > 0
    );
  });
});

describe('resources — internal://tool-catalog', () => {
  it('returns non-empty text', async () => {
    const result = await client.readResource({
      uri: 'internal://tool-catalog',
    });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    assert.ok(content.text.length > 0);
  });
});

describe('resources — internal://workflows', () => {
  it('returns non-empty text', async () => {
    const result = await client.readResource({ uri: 'internal://workflows' });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    assert.ok(content.text.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Session list resource
// ---------------------------------------------------------------------------

describe('resources — reasoning://sessions', () => {
  it('returns a JSON object with a sessions array', async () => {
    const result = await client.readResource({ uri: 'reasoning://sessions' });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    const parsed = JSON.parse(content.text) as unknown;
    assert.ok(
      typeof parsed === 'object' && parsed !== null && 'sessions' in parsed
    );
    const { sessions } = parsed as { sessions: unknown };
    assert.ok(
      Array.isArray(sessions),
      `Expected sessions array, got: ${typeof sessions}`
    );
  });

  it('includes the created session after a tool call', async () => {
    const sessionId = await createSession();
    const result = await client.readResource({ uri: 'reasoning://sessions' });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    const { sessions } = JSON.parse(content.text) as {
      sessions: Array<{ id: string }>;
    };
    assert.ok(
      sessions.some((s) => s.id === sessionId),
      `Session ${sessionId} not found in list`
    );
  });
});

// ---------------------------------------------------------------------------
// Dynamic session resources
// ---------------------------------------------------------------------------

describe('resources — reasoning://sessions/{sessionId}', () => {
  it('returns JSON with the session data', async () => {
    const sessionId = await createSession();
    const result = await client.readResource({
      uri: `reasoning://sessions/${sessionId}`,
    });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    const session = JSON.parse(content.text) as { id: string; level: string };
    assert.equal(session.id, sessionId);
    assert.equal(typeof session.level, 'string');
  });
});

describe('resources — reasoning://sessions/{sessionId}/trace', () => {
  it('returns markdown trace with the thought content', async () => {
    const sessionId = await createSession();
    const result = await client.readResource({
      uri: `reasoning://sessions/${sessionId}/trace`,
    });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    assert.ok(content.text.length > 0, 'Trace should not be empty');
    assert.ok(
      content.text.includes('resource test thought'),
      'Trace should contain the thought'
    );
  });
});

describe('resources — reasoning://sessions/{sessionId}/thoughts/Thought-1', () => {
  it('returns the first thought content', async () => {
    const sessionId = await createSession();
    const uri = `reasoning://sessions/${sessionId}/thoughts/Thought-1`;
    const result = await client.readResource({ uri });
    const content = result.contents[0];
    assert.ok(content && 'text' in content && typeof content.text === 'string');
    assert.ok(content.text.includes('resource test thought'));
  });

  it('throws for out-of-range thought index', async () => {
    const sessionId = await createSession();
    const uri = `reasoning://sessions/${sessionId}/thoughts/Thought-99`;
    await assert.rejects(
      () => client.readResource({ uri }),
      (err: unknown) => {
        assert.ok(err !== null && typeof err === 'object');
        return true;
      }
    );
  });
});

// Note: internal://tool-info/{toolName} is not registered as a resource template
// in this server — tool metadata is embedded in internal://tool-catalog instead.
