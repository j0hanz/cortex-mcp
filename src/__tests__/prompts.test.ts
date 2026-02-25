import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { getTemplate } from '../prompts/templates.js';

import { createServer } from '../server.js';

function getPromptText(message: unknown): string {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('content' in message) ||
    typeof (message as { content: unknown }).content !== 'object' ||
    (message as { content: unknown }).content === null ||
    !('text' in (message as { content: { text: unknown } }).content) ||
    typeof (message as { content: { text: unknown } }).content.text !== 'string'
  ) {
    throw new Error('Expected text content in prompt message');
  }
  return (message as { content: { text: string } }).content.text;
}

describe('getTemplate', () => {
  it('returns basic template containing level marker', () => {
    const tmpl = getTemplate('basic');
    assert.ok(
      tmpl.includes('<step index="1" total="3">'),
      'basic template missing level marker'
    );
  });

  it('returns normal template containing level marker', () => {
    const tmpl = getTemplate('normal');
    assert.ok(
      tmpl.includes('<step index="1" total="7">'),
      'normal template missing level marker'
    );
  });

  it('returns high template containing level marker', () => {
    const tmpl = getTemplate('high');
    assert.ok(
      tmpl.includes('<step index="1" total="15">'),
      'high template missing level marker'
    );
  });

  it('each level returns a distinct template', () => {
    const basic = getTemplate('basic');
    const normal = getTemplate('normal');
    const high = getTemplate('high');
    assert.notEqual(basic, normal);
    assert.notEqual(normal, high);
    assert.notEqual(basic, high);
  });

  it('all templates contain a System Directive', () => {
    for (const level of ['basic', 'normal', 'high'] as const) {
      assert.ok(
        getTemplate(level).includes('<constraints>'),
        `${level} template missing System Directive`
      );
    }
  });
});

describe('prompt template injection', () => {
  it('reasoning.basic prompt includes the basic template', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.getPrompt({
      name: 'reasoning.basic',
      arguments: { query: 'Test query for basic template' },
    });

    assert.equal(result.messages.length, 1);
    const text = getPromptText(result.messages[0]);
    assert.ok(
      text.includes('<step index="1" total="3">'),
      'reasoning.basic prompt missing basic template'
    );
    assert.ok(
      !text.includes('<step index="1" total="7">'),
      'reasoning.basic prompt must not include normal template'
    );
    assert.ok(
      !text.includes('<step index="1" total="15">'),
      'reasoning.basic prompt must not include high template'
    );

    await client.close();
    await server.close();
  });

  it('reasoning.normal prompt includes the normal template', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.getPrompt({
      name: 'reasoning.normal',
      arguments: { query: 'Test query for normal template' },
    });

    assert.equal(result.messages.length, 1);
    const text = getPromptText(result.messages[0]);
    assert.ok(
      text.includes('<step index="1" total="7">'),
      'reasoning.normal prompt missing normal template'
    );
    assert.ok(
      !text.includes('<step index="1" total="3">'),
      'reasoning.normal prompt must not include basic template'
    );

    await client.close();
    await server.close();
  });

  it('reasoning.high prompt includes the high template', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.getPrompt({
      name: 'reasoning.high',
      arguments: { query: 'Test query for high template' },
    });

    assert.equal(result.messages.length, 1);
    const text = getPromptText(result.messages[0]);
    assert.ok(
      text.includes('<step index="1" total="15">'),
      'reasoning.high prompt missing high template'
    );
    assert.ok(
      !text.includes('<step index="1" total="3">'),
      'reasoning.high prompt must not include basic template'
    );

    await client.close();
    await server.close();
  });

  it('reasoning.retry prompt includes the template for the requested level', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.getPrompt({
      name: 'reasoning.retry',
      arguments: { query: 'Retry test', level: 'normal' },
    });

    assert.equal(result.messages.length, 1);
    const text = getPromptText(result.messages[0]);
    assert.ok(
      text.includes('<step index="1" total="7">'),
      'reasoning.retry prompt missing normal template'
    );

    await client.close();
    await server.close();
  });

  it('reasoning.continue prompt does not include any template (regression)', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.getPrompt({
      name: 'reasoning.continue',
      arguments: { sessionId: 'fake-session-id' },
    });

    assert.equal(result.messages.length, 1);
    const text = getPromptText(result.messages[0]);
    assert.ok(
      !text.includes('<example>'),
      'reasoning.continue prompt must not include any template'
    );

    await client.close();
    await server.close();
  });
});
