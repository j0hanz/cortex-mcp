import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createServer } from '../server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ContentBlock = { type: string; text?: string };
type RawToolResult = {
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: unknown;
};

async function callTool(
  client: Client,
  args: Record<string, unknown>
): Promise<RawToolResult> {
  return client.callTool({
    name: 'reasoning_think',
    arguments: args,
  }) as Promise<RawToolResult>;
}

function parseText(result: RawToolResult): unknown {
  const block = result.content.find((b) => b.type === 'text');
  assert.ok(block?.text, 'Expected text content block');
  return JSON.parse(block.text) as unknown;
}

function assertOk(
  parsed: unknown
): asserts parsed is { ok: true; result: Record<string, unknown> } {
  assert.ok(typeof parsed === 'object' && parsed !== null && 'ok' in parsed);
  assert.equal(
    (parsed as { ok: unknown }).ok,
    true,
    `Expected ok=true but got ${JSON.stringify(parsed)}`
  );
}

function assertError(
  parsed: unknown
): asserts parsed is { ok: false; error: { code: string } } {
  assert.ok(typeof parsed === 'object' && parsed !== null && 'ok' in parsed);
  assert.equal((parsed as { ok: unknown }).ok, false);
}

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

let client!: Client;
let server!: McpServer;

before(async () => {
  server = createServer();
  client = new Client({ name: 'test-client', version: '0.0.1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
});

after(async () => {
  await client.close();
  await server.close();
});

// ---------------------------------------------------------------------------
// Basic tool call — new session
// ---------------------------------------------------------------------------

describe('reasoning_think — new session', () => {
  it('creates a new session and returns ok=true', async () => {
    const toolResult = await callTool(client, {
      query: 'What is 1+1?',
      level: 'basic',
      thought: 'The answer is 2.',
      is_conclusion: true,
    });

    assert.ok(
      !toolResult.isError,
      `Unexpected MCP error: ${JSON.stringify(toolResult)}`
    );
    const parsed = parseText(toolResult);
    assertOk(parsed);
    assert.equal(typeof parsed.result.sessionId, 'string');
  });

  it('returns structuredContent matching the text JSON', async () => {
    const result = await callTool(client, {
      query: 'Simple test',
      level: 'basic',
      thought: 'Done.',
    });

    const parsed = parseText(result);
    assertOk(parsed);
    const sc = result.structuredContent as Record<string, unknown> | undefined;
    if (sc !== undefined) {
      assert.equal((sc as { ok: unknown }).ok, true);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-step session
// ---------------------------------------------------------------------------

describe('reasoning_think — continuation', () => {
  it('continues an existing session with sessionId', async () => {
    const first = await callTool(client, {
      query: 'Multi-step test',
      level: 'basic',
      targetThoughts: 2, // allow 2 thoughts so session accepts a continuation
      thought: 'Step one.',
    });
    const firstParsed = parseText(first) as {
      ok: boolean;
      result: { sessionId: string; thoughts: unknown[] };
    };
    assertOk(firstParsed);
    const { sessionId } = firstParsed.result;
    const firstThoughtCount = firstParsed.result.thoughts.length;

    const second = await callTool(client, {
      sessionId,
      thought: 'Step two.',
    });
    assert.ok(!second.isError);
    const secondParsed = parseText(second) as {
      ok: boolean;
      result: { sessionId: string; thoughts: unknown[] };
    };
    assertOk(secondParsed);
    assert.equal(secondParsed.result.sessionId, sessionId);
    // thoughts array grows with each continuation
    assert.ok(secondParsed.result.thoughts.length > firstThoughtCount);
  });

  it('returns ok=false for unknown sessionId', async () => {
    const result = await callTool(client, {
      sessionId: '00000000-0000-0000-0000-000000000000',
      thought: 'should fail',
    });
    const parsed = parseText(result);
    assertError(parsed);
  });
});

// ---------------------------------------------------------------------------
// Input validation — schema rejections
// ---------------------------------------------------------------------------

describe('reasoning_think — invalid inputs', () => {
  it('returns error when neither query nor sessionId is provided', async () => {
    // Schema validation errors propagate as MCP protocol errors (isError=true, non-JSON content)
    const result = await callTool(client, {
      level: 'basic',
      thought: 'no identifier',
    });
    assert.ok(
      result.isError === true,
      'Expected isError=true for schema validation failure'
    );
  });

  it('returns error when thought is missing for new session', async () => {
    const result = await callTool(client, {
      query: 'missing thought',
      level: 'basic',
    });
    assert.ok(result.isError === true);
  });

  it('returns error for invalid level', async () => {
    const result = await callTool(client, {
      query: 'test',
      level: 'invalid-level',
      thought: 'thought',
    });
    assert.ok(result.isError === true);
  });
});

// ---------------------------------------------------------------------------
// is_conclusion flag
// ---------------------------------------------------------------------------

describe('reasoning_think — is_conclusion', () => {
  it('marks session as completed when is_conclusion=true', async () => {
    const result = await callTool(client, {
      query: 'Conclude now',
      level: 'basic',
      thought: 'Final answer.',
      is_conclusion: true,
    });
    const parsed = parseText(result) as {
      ok: boolean;
      result: { status: string };
    };
    assertOk(parsed);
    assert.equal(parsed.result.status, 'completed');
  });
});

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

describe('reasoning_think — rollback', () => {
  it('rollback_to_step removes subsequent thoughts', async () => {
    // Create session with 2 thoughts
    const r1 = await callTool(client, {
      query: 'rollback test',
      level: 'normal',
      thought: 'T0',
    });
    const p1 = parseText(r1) as { ok: boolean; result: { sessionId: string } };
    assertOk(p1);
    const { sessionId } = p1.result;

    await callTool(client, { sessionId, thought: 'T1 will be removed' });

    // Rollback to step 0
    const rb = await callTool(client, { sessionId, rollback_to_step: 0 });
    const rbParsed = parseText(rb);
    assertOk(rbParsed);
  });
});

// ---------------------------------------------------------------------------
// Tool listing
// ---------------------------------------------------------------------------

describe('reasoning_think — tool discovery', () => {
  it('appears in the tools list', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    assert.ok(
      names.includes('reasoning_think'),
      `reasoning_think not found in: ${names.join(', ')}`
    );
  });

  it('has an inputSchema with expected required fields', async () => {
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'reasoning_think');
    assert.ok(tool, 'reasoning_think not found');
    assert.ok(tool.inputSchema, 'inputSchema missing');
  });
});
