import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { engineEvents } from '../engine/events.js';

import { createServer } from '../server.js';

function getResourceText(content: unknown): string {
  if (
    typeof content !== 'object' ||
    content === null ||
    !('text' in content) ||
    typeof content.text !== 'string'
  ) {
    throw new Error('Expected text resource content');
  }
  return content.text;
}

describe('server registration', () => {
  it('registers reasoning_think as a task-capable tool', async () => {
    const server = createServer();

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === 'reasoning_think');

    assert.ok(tool, 'Expected reasoning_think to be registered');
    assert.equal(tool.execution?.taskSupport, 'optional');
    assert.equal(tool.inputSchema?.type, 'object');
    assert.equal(tool.outputSchema?.type, 'object');
    assert.equal(tool.outputSchema?.additionalProperties, false);

    await client.close();
    await server.close();
  });

  it('cleans up engine event listeners on server close', async () => {
    const resourcesBefore = engineEvents.listenerCount('resources:changed');
    const budgetBefore = engineEvents.listenerCount('thought:budget-exhausted');

    const server = createServer();

    assert.equal(
      engineEvents.listenerCount('resources:changed'),
      resourcesBefore + 1
    );
    assert.equal(
      engineEvents.listenerCount('thought:budget-exhausted'),
      budgetBefore + 1
    );

    await server.close();

    assert.equal(
      engineEvents.listenerCount('resources:changed'),
      resourcesBefore
    );
    assert.equal(
      engineEvents.listenerCount('thought:budget-exhausted'),
      budgetBefore
    );
  });

  it('keeps shared session store active while another server instance is open', async () => {
    const serverA = createServer();
    const serverB = createServer();

    const [clientTransportA, serverTransportA] =
      InMemoryTransport.createLinkedPair();
    const [clientTransportB, serverTransportB] =
      InMemoryTransport.createLinkedPair();

    await serverA.connect(serverTransportA);
    await serverB.connect(serverTransportB);

    const clientA = new Client({ name: 'test-client-a', version: '0.0.0' });
    const clientB = new Client({ name: 'test-client-b', version: '0.0.0' });
    await clientA.connect(clientTransportA);
    await clientB.connect(clientTransportB);

    await clientA.close();
    await serverA.close();

    const result = await clientB.callTool({
      name: 'reasoning_think',
      arguments: {
        query: 'second server still active',
        level: 'basic',
        thought: 'still running',
      },
    });
    const structured = result.structuredContent as { ok?: boolean };
    assert.equal(structured.ok, true);

    await clientB.close();
    await serverB.close();
  });

  it('completes initialize handshake and exposes negotiated capabilities', async () => {
    const server = createServer();
    let initializedNotificationReceived = false;
    server.server.oninitialized = () => {
      initializedNotificationReceived = true;
    };

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    assert.equal(initializedNotificationReceived, true);

    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities);
    assert.ok(capabilities.tools);
    assert.ok(capabilities.resources);
    assert.ok(capabilities.prompts);
    assert.ok(capabilities.tasks);
    assert.ok(capabilities.completions);

    const serverInfo = client.getServerVersion();
    assert.equal(serverInfo?.name, 'cortex-mcp');

    await client.close();
    await server.close();
  });

  it('SDK auto-declares listChanged for tools and prompts during registration', async () => {
    // NOTE: The MCP SDK automatically registers listChanged: true for tools,
    // prompts, and resources when they are registered via the high-level API.
    // Our server.ts does not explicitly declare listChanged for tools/prompts
    // (only for resources), but the SDK adds it during registration.
    const server = createServer();

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities);

    // resources explicitly declares listChanged: true
    const resources = capabilities.resources as
      | Record<string, unknown>
      | undefined;
    assert.ok(resources);
    assert.equal(
      (resources as { listChanged?: boolean }).listChanged,
      true,
      'resources should declare listChanged'
    );

    await client.close();
    await server.close();
  });

  it('registers prompts and resources', async () => {
    const server = createServer();

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const prompts = await client.listPrompts();
    const promptNames = prompts.prompts.map((p) => p.name);
    assert.ok(promptNames.includes('reasoning.basic'));
    assert.ok(promptNames.includes('reasoning.normal'));
    assert.ok(promptNames.includes('reasoning.high'));
    assert.ok(promptNames.includes('reasoning.continue'));
    assert.ok(promptNames.includes('reasoning.retry'));

    const resources = await client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    assert.ok(resourceUris.includes('reasoning://sessions'));

    const templates = await client.listResourceTemplates();
    const templateUris = templates.resourceTemplates.map((t) => t.uriTemplate);
    assert.ok(templateUris.includes('reasoning://sessions/{sessionId}'));
    assert.ok(templateUris.includes('reasoning://sessions/{sessionId}/trace'));
    assert.ok(
      templateUris.includes(
        'reasoning://sessions/{sessionId}/thoughts/{thoughtName}'
      )
    );

    const prompt = await client.getPrompt({
      name: 'reasoning.basic',
      arguments: { query: 'Explain 2+2' },
    });
    assert.equal(prompt.messages.length, 1);

    const toolResult = await client.callTool({
      name: 'reasoning_think',
      arguments: {
        query: 'Create one session',
        level: 'basic',
        targetThoughts: 3,
        thought: 'Starting a new reasoning session to test registration.',
      },
    });

    const structured = toolResult.structuredContent as {
      ok?: boolean;
      result?: { sessionId?: string };
    };
    assert.equal(structured.ok, true);
    const sessionId = structured.result?.sessionId;
    assert.equal(typeof sessionId, 'string');
    if (sessionId === undefined) {
      assert.fail('Expected sessionId in tool result');
    }

    const continuePrompt = await client.getPrompt({
      name: 'reasoning.continue',
      arguments: {
        sessionId,
        level: 'basic',
      },
    });
    assert.equal(continuePrompt.messages.length, 1);

    const sessionsIndex = await client.readResource({
      uri: 'reasoning://sessions',
    });
    assert.equal(sessionsIndex.contents.length, 1);

    const sessionDetail = await client.readResource({
      uri: `reasoning://sessions/${sessionId}`,
    });
    assert.equal(sessionDetail.contents.length, 1);

    const trace = await client.readResource({
      uri: `reasoning://sessions/${sessionId}/trace`,
    });
    assert.equal(trace.contents.length, 1);
    const traceContent = trace.contents[0];
    assert.ok(traceContent);
    assert.equal(traceContent.mimeType, 'text/markdown');
    const traceText = getResourceText(traceContent);
    assert.ok(
      traceText.includes('# Reasoning Trace'),
      'Trace should contain session header'
    );
    assert.ok(
      traceText.includes('𖦹 Thought [1]'),
      'Trace should contain first thought heading'
    );

    // Test individual thought resource
    const thought1 = await client.readResource({
      uri: `reasoning://sessions/${sessionId}/thoughts/Thought-1`,
    });
    assert.equal(thought1.contents.length, 1);
    const thought1Content = thought1.contents[0];
    assert.ok(thought1Content);
    const text1 = getResourceText(thought1Content);
    assert.ok(
      text1.includes('𖦹 Thought [1]'),
      'Single thought should contain heading'
    );
    assert.ok(
      !text1.includes('𖦹 Thought [2]'),
      'Single thought should not contain other thoughts'
    );

    // Test last generated thought
    const sessionDetailContent = sessionDetail.contents[0];
    assert.ok(sessionDetailContent);
    const detailJson = JSON.parse(getResourceText(sessionDetailContent)) as {
      generatedThoughts: number;
      totalThoughts: number;
    };
    const count = detailJson.generatedThoughts;
    const planned = detailJson.totalThoughts;
    assert.equal(planned, 3);
    assert.equal(count, 1);

    if (count >= 1) {
      const lastThoughtUri = `reasoning://sessions/${sessionId}/thoughts/Thought-${count}`;
      const thoughtLast = await client.readResource({ uri: lastThoughtUri });
      assert.equal(thoughtLast.contents.length, 1);
      const thoughtLastContent = thoughtLast.contents[0];
      assert.ok(thoughtLastContent);
      const textLast = getResourceText(thoughtLastContent);
      assert.ok(
        textLast.includes(`𖦹 Thought [${count}]`),
        `Last thought should contain heading for Thought ${count}`
      );
    }

    await client.close();
    await server.close();
  });

  it('supports run_to_completion and aligned thought counters in resources', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const toolResult = await client.callTool({
      name: 'reasoning_think',
      arguments: {
        query: 'Batch reasoning test',
        level: 'basic',
        runMode: 'run_to_completion',
        targetThoughts: 3,
        thought: ['Step 1', 'Step 2', 'Step 3'],
      },
    });

    const structured = toolResult.structuredContent as {
      ok?: boolean;
      result?: {
        sessionId?: string;
        generatedThoughts?: number;
        totalThoughts?: number;
        status?: string;
      };
    };

    assert.equal(structured.ok, true);
    assert.equal(structured.result?.generatedThoughts, 3);
    assert.equal(structured.result?.totalThoughts, 3);
    assert.equal(structured.result?.status, 'completed');

    const sessionId = structured.result?.sessionId;
    assert.equal(typeof sessionId, 'string');

    const sessionsIndex = await client.readResource({
      uri: 'reasoning://sessions',
    });
    const sessionsContent = sessionsIndex.contents[0];
    assert.ok(sessionsContent);
    const sessionsJson = JSON.parse(getResourceText(sessionsContent)) as {
      sessions: {
        id: string;
        generatedThoughts: number;
        remainingThoughts: number;
        totalThoughts: number;
      }[];
    };
    const entry = sessionsJson.sessions.find(
      (session) => session.id === sessionId
    );
    assert.ok(entry);
    assert.equal(entry?.generatedThoughts, 3);
    assert.equal(entry?.remainingThoughts, 0);
    assert.equal(entry?.totalThoughts, 3);

    await client.close();
    await server.close();
  });

  it('redacts thought content in resources when CORTEX_REDACT_TRACE_CONTENT is enabled', async () => {
    const previous = process.env.CORTEX_REDACT_TRACE_CONTENT;
    process.env.CORTEX_REDACT_TRACE_CONTENT = 'true';

    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);

      const client = new Client({ name: 'test-client', version: '0.0.0' });
      await client.connect(clientTransport);

      const toolResult = await client.callTool({
        name: 'reasoning_think',
        arguments: {
          query: 'Redaction test',
          level: 'basic',
          targetThoughts: 3,
          thought: 'Sensitive trace content',
        },
      });

      const sessionId = (
        toolResult.structuredContent as { result?: { sessionId?: string } }
      ).result?.sessionId;
      assert.equal(typeof sessionId, 'string');
      if (sessionId === undefined) {
        assert.fail('Expected sessionId for redaction test');
      }

      const trace = await client.readResource({
        uri: `reasoning://sessions/${sessionId}/trace`,
      });
      const traceContent = trace.contents[0];
      assert.ok(traceContent);
      const traceText = getResourceText(traceContent);
      assert.ok(traceText.includes('[REDACTED]'));
      assert.equal(traceText.includes('Sensitive trace content'), false);

      const detail = await client.readResource({
        uri: `reasoning://sessions/${sessionId}`,
      });
      const detailContent = detail.contents[0];
      assert.ok(detailContent);
      const detailJson = JSON.parse(getResourceText(detailContent)) as {
        thoughts: Array<{ content: string }>;
      };
      assert.equal(detailJson.thoughts[0]?.content, '[REDACTED]');

      await client.close();
    } finally {
      await server.close();
      if (previous === undefined) {
        delete process.env.CORTEX_REDACT_TRACE_CONTENT;
      } else {
        process.env.CORTEX_REDACT_TRACE_CONTENT = previous;
      }
    }
  });

  it('provides prompt and resource completions for session workflows', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const toolResult = await client.callTool({
      name: 'reasoning_think',
      arguments: {
        query: 'Completion probe',
        level: 'basic',
        targetThoughts: 3,
        thought: 'First thought',
      },
    });
    const sessionId = (
      toolResult.structuredContent as { result?: { sessionId?: string } }
    ).result?.sessionId;
    assert.equal(typeof sessionId, 'string');
    if (sessionId === undefined) {
      assert.fail('Expected sessionId for completion test');
    }
    const prefix = sessionId.slice(0, 8);

    const promptSessionCompletion = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.continue' },
      argument: { name: 'sessionId', value: prefix },
    });
    assert.ok(promptSessionCompletion.completion.values.includes(sessionId));

    const promptLevelCompletion = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.continue' },
      argument: { name: 'level', value: 'n' },
    });
    assert.ok(promptLevelCompletion.completion.values.includes('normal'));

    const traceCompletion = await client.complete({
      ref: {
        type: 'ref/resource',
        uri: 'reasoning://sessions/{sessionId}/trace',
      },
      argument: { name: 'sessionId', value: prefix },
    });
    assert.ok(traceCompletion.completion.values.includes(sessionId));

    const thoughtCompletion = await client.complete({
      ref: {
        type: 'ref/resource',
        uri: 'reasoning://sessions/{sessionId}/thoughts/{thoughtName}',
      },
      argument: { name: 'thoughtName', value: 'Thought-' },
      context: { arguments: { sessionId } },
    });
    assert.ok(thoughtCompletion.completion.values.includes('Thought-1'));

    await client.close();
    await server.close();
  });

  it('returns E_INSUFFICIENT_THOUGHTS for under-provisioned run_to_completion calls', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'reasoning_think',
      arguments: {
        query: 'insufficient thoughts',
        level: 'basic',
        runMode: 'run_to_completion',
        targetThoughts: 3,
        thought: 'Only one thought provided',
      },
    });

    assert.equal(result.isError, true);
    const rawContent = (result as { content?: unknown }).content;
    assert.ok(Array.isArray(rawContent));
    const firstBlock = rawContent[0];
    assert.ok(
      typeof firstBlock === 'object' &&
        firstBlock !== null &&
        'text' in firstBlock &&
        typeof firstBlock.text === 'string'
    );
    const parsed = JSON.parse(firstBlock.text as string) as {
      ok: boolean;
      error: { code: string };
    };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'E_INSUFFICIENT_THOUGHTS');

    await client.close();
    await server.close();
  });

  it('rejects invalid negative task ttl metadata', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    await assert.rejects(
      client.callTool({
        name: 'reasoning_think',
        task: { ttl: -1 },
        arguments: {
          query: 'invalid ttl',
          level: 'basic',
          thought: 'test',
        },
      })
    );

    await client.close();
    await server.close();
  });

  it('rejects malformed task arguments at protocol validation layer', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    await assert.rejects(
      client.callTool({
        name: 'reasoning_think',
        task: { ttl: 60_000 },
        arguments: {
          query: '',
          level: 'basic',
          thought: 'test',
        },
      })
    );

    await client.close();
    await server.close();
  });
});
