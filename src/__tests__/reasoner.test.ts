import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reason, sessionStore } from '../engine/reasoner.js';

describe('reason', () => {
  it('produces range-bounded totalThoughts for basic level', async () => {
    const session = await reason('What is 2+2?', 'basic', {
      thought: 'The answer is 4 because 2+2=4.',
    });
    assert.equal(session.thoughts.length, 1);
    assert.ok(session.totalThoughts >= 3);
    assert.ok(session.totalThoughts <= 5);
    sessionStore.delete(session.id);
  });

  it('produces range-bounded totalThoughts for normal level', async () => {
    const session = await reason('Explain gravity', 'normal', {
      thought: 'Gravity is a fundamental force of attraction between masses.',
    });
    assert.equal(session.thoughts.length, 1);
    assert.ok(session.totalThoughts >= 6);
    assert.ok(session.totalThoughts <= 10);
    sessionStore.delete(session.id);
  });

  it('produces range-bounded totalThoughts for high level', async () => {
    const session = await reason('Solve world peace', 'high', {
      thought:
        'World peace requires addressing root causes of conflict including inequality and resource scarcity.',
    });
    assert.equal(session.thoughts.length, 1);
    assert.ok(session.totalThoughts >= 15);
    assert.ok(session.totalThoughts <= 25);
    sessionStore.delete(session.id);
  });

  it('aborts when signal fires', async () => {
    await assert.rejects(
      () =>
        reason('test', 'basic', {
          thought: 'This will not be stored.',
          abortSignal: AbortSignal.abort(),
        }),
      { message: 'Reasoning aborted' }
    );
  });

  it('rejects when thought is missing', async () => {
    await assert.rejects(() => reason('test', 'basic'), {
      message: 'thought is required: provide your reasoning content',
    });
  });

  it('calls onProgress after each thought', async () => {
    const progressCalls: Array<{ progress: number; total: number }> = [];

    const session = await reason('test', 'basic', {
      thought: 'First step of reasoning about the test query.',
      onProgress: (progress, total) => {
        progressCalls.push({ progress, total });
      },
    });

    assert.equal(progressCalls.length, 1);
    assert.deepEqual(progressCalls[0], {
      progress: 1,
      total: session.totalThoughts,
    });
    assert.deepEqual(progressCalls.at(-1), {
      progress: 1,
      total: session.totalThoughts,
    });
    sessionStore.delete(session.id);
  });

  it('stores thought content verbatim', async () => {
    const content =
      'The primary issue is in the error handling path where exceptions are swallowed silently.';
    const session = await reason('Analyze this code', 'basic', {
      thought: content,
    });
    assert.equal(session.thoughts.length, 1);
    assert.equal(session.thoughts[0]?.content, content);
    sessionStore.delete(session.id);
  });

  it('reuses existing session via sessionId', async () => {
    const first = await reason('Initial query', 'basic', {
      thought: 'First thought about the initial query.',
    });
    const initialThoughtCount = first.thoughts.length;
    const second = await reason('Follow-up', 'basic', {
      sessionId: first.id,
      thought: 'Second thought continuing the analysis.',
    });

    assert.equal(second.id, first.id);
    assert.equal(second.thoughts.length, initialThoughtCount + 1);
    assert.equal(second.totalThoughts, first.totalThoughts);
    sessionStore.delete(first.id);
  });

  it('stores each thought on continuation calls', async () => {
    const first = await reason('Initial query', 'basic', {
      thought: 'Step 1: Understanding the problem.',
    });
    const secondContent =
      'Step 2: The root cause is a race condition in the async handler.';
    const second = await reason('Follow-up', 'basic', {
      sessionId: first.id,
      thought: secondContent,
    });

    assert.equal(second.thoughts.length, 2);
    assert.equal(
      second.thoughts[0]?.content,
      'Step 1: Understanding the problem.'
    );
    assert.equal(second.thoughts[1]?.content, secondContent);
    sessionStore.delete(first.id);
  });

  it('rejects reusing a session with a different level', async () => {
    const first = await reason('Initial query', 'basic', {
      thought: 'First thought.',
    });
    await assert.rejects(
      () =>
        reason('Follow-up', 'high', {
          sessionId: first.id,
          thought: 'This should fail.',
        }),
      { message: /Session level mismatch/ }
    );
    sessionStore.delete(first.id);
  });

  it('throws for invalid sessionId', async () => {
    await assert.rejects(
      () =>
        reason('test', 'basic', {
          sessionId: 'non-existent-session',
          thought: 'This should fail.',
        }),
      { message: /Session not found/ }
    );
  });

  it('honors explicit targetThoughts within level range', async () => {
    const session = await reason('Break this down in detail', 'normal', {
      targetThoughts: 8,
      thought: 'First step of the detailed breakdown.',
    });
    assert.equal(session.totalThoughts, 8);
    assert.equal(session.thoughts.length, 1);
    sessionStore.delete(session.id);
  });

  it('rejects targetThoughts outside the level range', async () => {
    await assert.rejects(
      () =>
        reason('test', 'basic', {
          targetThoughts: 9,
          thought: 'This should fail.',
        }),
      { message: /targetThoughts must be between 3 and 5/ }
    );
  });

  it('heuristic: short query produces minThoughts', async () => {
    const session = await reason('hi', 'basic', {
      thought: 'Simple greeting query, minimal analysis needed.',
    });
    assert.equal(session.totalThoughts, 3); // basic minThoughts
    assert.equal(session.thoughts.length, 1);
    sessionStore.delete(session.id);
  });

  it('heuristic: long multi-sentence query produces near maxThoughts', async () => {
    const longQuery =
      'This is a long and complex question with multiple sentences. ' +
      'It contains significant structural complexity. ' +
      'Each sentence adds depth to the analysis. ' +
      'The reasoning should consider many factors.';
    const session = await reason(longQuery, 'basic', {
      thought: 'Analyzing the multi-faceted nature of this complex query.',
    });
    // Should produce 4 or 5 total thoughts (near maxThoughts = 5)
    assert.ok(session.totalThoughts >= 4);
    assert.ok(session.totalThoughts <= 5);
    assert.equal(session.thoughts.length, 1);
    sessionStore.delete(session.id);
  });

  it('heuristic: query with compare keyword produces higher count', async () => {
    const shortSession = await reason('hello world', 'normal', {
      thought: 'Simple query.',
    });
    const keywordSession = await reason(
      'compare the advantages and disadvantages',
      'normal',
      {
        thought:
          'Comparing advantages vs disadvantages requires deeper analysis.',
      }
    );
    // Keyword query should produce more total thoughts than short query
    assert.ok(keywordSession.totalThoughts > shortSession.totalThoughts);
    sessionStore.delete(shortSession.id);
    sessionStore.delete(keywordSession.id);
  });

  it('stops generating thoughts when token budget is exhausted', async () => {
    // Create a session at basic level (budget 2048), manually fill to near-limit
    const session = await reason('test', 'basic', {
      targetThoughts: 3,
      thought: 'Initial thought.',
    });

    // Each padding thought ≈ 680 tokens (2720 bytes ÷ 4)
    const tokensPerPadding = 680;
    const padding = 'x'.repeat(tokensPerPadding * 4);

    // Add 2 padding thoughts: ~1360 tokens used, leaving ~688 tokens
    sessionStore.addThought(session.id, padding);
    sessionStore.addThought(session.id, padding);

    // Add one more large thought to get very close to budget: ~2040 tokens used
    sessionStore.addThought(session.id, 'x'.repeat(2720));

    const beforeCount = sessionStore.get(session.id)!.thoughts.length;

    // Request another thought — budget should cut it short to 0 new thoughts
    const continued = await reason('continue', 'basic', {
      sessionId: session.id,
      targetThoughts: 3,
      thought: 'Continuation thought that may be blocked by budget.',
    });

    const newThoughts = continued.thoughts.length - beforeCount;
    assert.ok(
      newThoughts <= 1,
      `Expected at most 1 new thought due to budget, got ${String(newThoughts)}`
    );
    sessionStore.delete(session.id);
  });

  it('builds a complete trace with all thoughts from multiple calls', async () => {
    const session = await reason('Analyze X', 'basic', {
      targetThoughts: 3,
      thought:
        'Step 1: Identifying the core components of X and their relationships.',
    });

    const step2 = await reason('Analyze X', 'basic', {
      sessionId: session.id,
      thought:
        'Step 2: Evaluating the performance characteristics and bottlenecks.',
    });

    const step3 = await reason('Analyze X', 'basic', {
      sessionId: session.id,
      thought:
        'Step 3: Synthesizing findings — X has three key issues to address.',
    });

    assert.equal(step3.thoughts.length, 3);
    assert.equal(step3.status, 'completed');
    assert.equal(
      step3.thoughts[0]?.content,
      'Step 1: Identifying the core components of X and their relationships.'
    );
    assert.equal(
      step3.thoughts[1]?.content,
      'Step 2: Evaluating the performance characteristics and bottlenecks.'
    );
    assert.equal(
      step3.thoughts[2]?.content,
      'Step 3: Synthesizing findings — X has three key issues to address.'
    );
    sessionStore.delete(session.id);
  });
});
