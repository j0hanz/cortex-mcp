import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

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

    const resources = await client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    assert.ok(resourceUris.includes('reasoning://sessions'));

    const templates = await client.listResourceTemplates();
    const templateUris = templates.resourceTemplates.map((t) => t.uriTemplate);
    assert.ok(templateUris.includes('reasoning://sessions/{sessionId}'));

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
      },
    });

    const structured = toolResult.structuredContent as {
      ok?: boolean;
      result?: { sessionId?: string };
    };
    assert.equal(structured.ok, true);
    const sessionId = structured.result?.sessionId;
    assert.equal(typeof sessionId, 'string');

    const sessionsIndex = await client.readResource({
      uri: 'reasoning://sessions',
    });
    assert.equal(sessionsIndex.contents.length, 1);

    const sessionDetail = await client.readResource({
      uri: `reasoning://sessions/${sessionId}`,
    });
    assert.equal(sessionDetail.contents.length, 1);

    await client.close();
    await server.close();
  });
});
