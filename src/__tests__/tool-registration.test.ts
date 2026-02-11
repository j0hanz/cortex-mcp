import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from '../server.js';

describe('registerAllTools', () => {
  it('registers reasoning.think tool on the server', async () => {
    const server = createServer();

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    assert.ok(
      toolNames.includes('reasoning.think'),
      `Expected reasoning.think in tool list, got: ${toolNames.join(', ')}`
    );

    await client.close();
    await server.close();
  });
});
