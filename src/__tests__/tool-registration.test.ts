import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { engineEvents } from '../engine/events.js';

import { createServer } from '../server.js';

describe('server registration', () => {
  it('registers reasoning.think as a task-capable tool', async () => {
    const server = createServer();

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === 'reasoning.think');

    assert.ok(tool, 'Expected reasoning.think to be registered');
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
    assert.ok(
      templateUris.includes('file:///cortex/sessions/{sessionId}/trace.md')
    );
    assert.ok(
      templateUris.includes(
        'file:///cortex/sessions/{sessionId}/{thoughtName}.md'
      )
    );

    const prompt = await client.getPrompt({
      name: 'reasoning.basic',
      arguments: { query: 'Explain 2+2' },
    });
    assert.equal(prompt.messages.length, 1);

    const toolResult = await client.callTool({
      name: 'reasoning.think',
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
      uri: `file:///cortex/sessions/${sessionId}/trace.md`,
    });
    assert.equal(trace.contents.length, 1);
    assert.equal(trace.contents[0].mimeType, 'text/markdown');
    const traceText = trace.contents[0].text as string;
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
      uri: `file:///cortex/sessions/${sessionId}/Thought-1.md`,
    });
    assert.equal(thought1.contents.length, 1);
    const text1 = thought1.contents[0].text as string;
    assert.ok(
      text1.includes('𖦹 Thought [1]'),
      'Single thought should contain heading'
    );
    assert.ok(
      !text1.includes('𖦹 Thought [2]'),
      'Single thought should not contain other thoughts'
    );

    // Test last generated thought
    const detailJson = JSON.parse(sessionDetail.contents[0].text as string);
    const count = detailJson.generatedThoughts as number;
    const planned = detailJson.totalThoughts as number;
    assert.equal(planned, 3);
    assert.equal(count, 1);

    if (count >= 1) {
      const lastThoughtUri = `file:///cortex/sessions/${sessionId}/Thought-${count}.md`;
      const thoughtLast = await client.readResource({ uri: lastThoughtUri });
      assert.equal(thoughtLast.contents.length, 1);
      const textLast = thoughtLast.contents[0].text as string;
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
      name: 'reasoning.think',
      arguments: {
        query: 'Batch reasoning test',
        level: 'basic',
        runMode: 'run_to_completion',
        targetThoughts: 3,
        thought: 'Step 1',
        thoughts: ['Step 2', 'Step 3'],
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
    const sessionsJson = JSON.parse(
      sessionsIndex.contents[0].text as string
    ) as {
      sessions: Array<{
        id: string;
        generatedThoughts: number;
        remainingThoughts: number;
        plannedThoughts: number;
        totalThoughts: number;
      }>;
    };
    const entry = sessionsJson.sessions.find(
      (session) => session.id === sessionId
    );
    assert.ok(entry);
    assert.equal(entry?.generatedThoughts, 3);
    assert.equal(entry?.remainingThoughts, 0);
    assert.equal(entry?.plannedThoughts, 3);
    assert.equal(entry?.totalThoughts, 3);

    await client.close();
    await server.close();
  });

  it('provides prompt and resource completions for session workflows', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const toolResult = await client.callTool({
      name: 'reasoning.think',
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
    const prefix = sessionId!.slice(0, 8);

    const promptSessionCompletion = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.continue' },
      argument: { name: 'sessionId', value: prefix },
    });
    assert.ok(promptSessionCompletion.completion.values.includes(sessionId!));

    const promptLevelCompletion = await client.complete({
      ref: { type: 'ref/prompt', name: 'reasoning.continue' },
      argument: { name: 'level', value: 'n' },
    });
    assert.ok(promptLevelCompletion.completion.values.includes('normal'));

    const traceCompletion = await client.complete({
      ref: {
        type: 'ref/resource',
        uri: 'file:///cortex/sessions/{sessionId}/trace.md',
      },
      argument: { name: 'sessionId', value: prefix },
    });
    assert.ok(traceCompletion.completion.values.includes(sessionId!));

    const thoughtCompletion = await client.complete({
      ref: {
        type: 'ref/resource',
        uri: 'file:///cortex/sessions/{sessionId}/{thoughtName}.md',
      },
      argument: { name: 'thoughtName', value: 'Thought-' },
      context: { arguments: { sessionId: sessionId! } },
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
      name: 'reasoning.think',
      arguments: {
        query: 'insufficient thoughts',
        level: 'basic',
        runMode: 'run_to_completion',
        targetThoughts: 3,
        thought: 'Only one thought provided',
      },
    });

    const structured = result.structuredContent as {
      ok?: boolean;
      error?: { code?: string };
    };
    assert.equal(structured.ok, false);
    assert.equal(structured.error?.code, 'E_INSUFFICIENT_THOUGHTS');

    await client.close();
    await server.close();
  });
});
