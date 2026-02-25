import type { ReasoningLevel } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Guided few-shot examples for each reasoning level.
// Each template shows correct `thought` depth and step count so the LLM
// calibrates its output to the selected level requirements.
// ---------------------------------------------------------------------------

const BASIC_TEMPLATE = `<example>
<query>Is Set or Array better for deduplicating a list of strings in JavaScript?</query>

<thought_process>
<step index="1" total="3">
<thought>
[Observation] A \`Set\` enforces uniqueness automatically; \`[...new Set(arr)]\` is a single-step O(n) operation. An Array-based approach (\`filter\` + \`indexOf\`) is O(n²) and adds unnecessary complexity.
</thought>
<step_summary>Set is O(n) while Array filter is O(n²).</step_summary>
</step>

<step index="2" total="3">
<thought>
[Evaluation] Edge cases: both preserve insertion order in modern JS engines, so ordering is not a differentiator. \`Set\` converts all values to a common reference internally, which handles string equality correctly.
</thought>
<step_summary>Both preserve order, but Set handles string equality natively.</step_summary>
</step>

<step index="3" total="3">
<thought>
[Conclusion] Use \`Set\`. It is faster (O(n) vs O(n²)), shorter to write, and immediately communicates the intent of deduplication. \`[...new Set(list)]\` is the idiomatic solution.
</thought>
<step_summary>Set is the optimal and idiomatic choice.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the depth and quality of the example above.
- Structure reasoning using: [Observation], [Hypothesis], [Evaluation], [Conclusion].
- Write concrete, self-contained thoughts. No filler.
- Provide a 1-sentence \`step_summary\` per step.
- Total thoughts: 3 to 5.
</constraints>`;

const NORMAL_TEMPLATE = `<example>
<query>How do I safely handle concurrent writes to a shared in-memory counter in a Node.js service?</query>

<thought_process>
<step index="1" total="7">
<thought>
[Observation] Node.js is single-threaded: synchronous code is never interrupted mid-execution, so a plain \`counter++\` within one event-loop tick is effectively atomic from JavaScript's perspective.
</thought>
<step_summary>Synchronous increments in Node.js are atomic.</step_summary>
</step>

<step index="2" total="7">
<thought>
[Hypothesis] The risk arises in *async* code. A read-modify-write spanning an \`await\` boundary is NOT atomic. Two concurrent callers can both read the same value before either writes, causing a lost update.
</thought>
<step_summary>Async read-modify-write operations are not atomic and risk lost updates.</step_summary>
</step>

<step index="3" total="7">
<thought>
[Evaluation] Example race: \`const v = await db.get('c'); await db.set('c', v + 1);\` — if two requests interleave at the \`await\` points, both read \`v=5\` and both write \`6\`, losing one increment.
</thought>
<step_summary>Interleaved async operations lead to data races.</step_summary>
</step>

<step index="4" total="7">
<thought>
[Strategy] Solution A — atomic DB operation: \`UPDATE counter SET n = n + 1 RETURNING n\` (SQL) or Redis \`INCR\`. The DB engine serialises the read-modify-write internally with no async gap.
</thought>
<step_summary>Database-level atomic operations prevent races.</step_summary>
</step>

<step index="5" total="7">
<thought>
[Strategy] Solution B — async mutex: use a library-level lock (e.g. \`async-mutex\`) to serialise access. Works for in-process state but does not scale across multiple processes or restarts.
</thought>
<step_summary>In-process mutexes work but don't scale horizontally.</step_summary>
</step>

<step index="6" total="7">
<thought>
[Strategy] Solution C — synchronous in-memory only: keep the counter as a plain variable, increment with \`counter++\` (no \`await\` in the read-modify-write path). Valid only for single-process, ephemeral state.
</thought>
<step_summary>Synchronous in-memory counters are safe for ephemeral, single-process state.</step_summary>
</step>

<step index="7" total="7">
<thought>
[Conclusion] Prefer Solution A (atomic DB op) for correctness across restarts and multi-process deployments. Use Solution C only for in-process, non-persisted counters where an \`await\` never touches the variable. Avoid async read-modify-write without a mutex.
</thought>
<step_summary>Use DB atomic ops for persistence, or sync variables for ephemeral state.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the depth and quality of the example above.
- Structure reasoning using: [Observation], [Hypothesis], [Evaluation], [Strategy], [Conclusion].
- Write concrete thoughts that progress the analysis. Do not restate earlier thoughts.
- Provide a 1-sentence \`step_summary\` per step.
- Total thoughts: 6 to 10.
</constraints>`;

const HIGH_TEMPLATE = `<example>
<query>Our Node.js API latency jumped from p50=20ms to p50=800ms after a dependency upgrade. How do I diagnose and fix this?</query>

<thought_process>
<step index="1" total="15">
<thought>
[Strategy] Establish the change boundary: run \`git log --oneline\` to find the upgrade commit. Use \`git bisect\` between the last known-good tag and HEAD to confirm the exact commit that caused the regression.
</thought>
<step_summary>Isolate the exact commit causing the regression using git bisect.</step_summary>
</step>

<step index="2" total="15">
<thought>
[Observation] Collect baseline metrics before touching anything: event-loop lag (\`perf_hooks.monitorEventLoopDelay\`), GC pause times (\`--expose-gc\` + \`PerformanceObserver\`), and per-route timings. This separates compute regressions from I/O regressions.
</thought>
<step_summary>Collect baseline metrics to distinguish compute vs I/O regressions.</step_summary>
</step>

<step index="3" total="15">
<thought>
[Hypothesis] If event-loop lag is high (>50ms per tick), the cause is synchronous blocking inserted into the hot path — JSON serialisation of large objects, synchronous file I/O, regex backtracking, or CPU-heavy validation.
</thought>
<step_summary>High event-loop lag indicates synchronous blocking.</step_summary>
</step>

<step index="4" total="15">
<thought>
[Hypothesis] If event-loop lag is low but p50 is high, the bottleneck is I/O wait: slow DB queries, connection-pool exhaustion, DNS resolution delays, or increased network RTT to the upgraded service.
</thought>
<step_summary>Low event-loop lag with high p50 indicates I/O bottlenecks.</step_summary>
</step>

<step index="5" total="15">
<thought>
[Action] Read the dependency's changelog between the old and new version. Look for: new middleware injected at startup, serialisation format changes, default timeout changes, or connection-pool default reductions.
</thought>
<step_summary>Review the dependency changelog for breaking changes or new defaults.</step_summary>
</step>

<step index="6" total="15">
<thought>
[Action] Profile with \`clinic.js flame\` (or \`node --prof\` + \`node --prof-process\`) under representative load. The flame graph will pinpoint whether wall-clock time is in JS compute vs. idle I/O await.
</thought>
<step_summary>Use flame graphs to pinpoint the exact bottleneck.</step_summary>
</step>

<step index="7" total="15">
<thought>
[Action] Write a minimal reproduction that calls *only* the upgraded package's API with representative input. Benchmark it against the pinned old version in isolation to confirm the package itself is the source.
</thought>
<step_summary>Create a minimal reproduction to isolate the package's performance.</step_summary>
</step>

<step index="8" total="15">
<thought>
[Evaluation] Common 40× regression patterns: (a) added synchronous schema validation on every request, (b) HTTP/1.1 → HTTP/2 frame parsing overhead, (c) new middleware that buffers the full request body before routing.
</thought>
<step_summary>Evaluate common regression patterns like added validation or middleware.</step_summary>
</step>

<step index="9" total="15">
<thought>
[Evaluation] Check connection-pool configuration: if the upgrade changed default pool size or idle timeout, requests may queue waiting for connections. Inspect \`pool.min\`, \`pool.max\`, and \`acquireTimeoutMillis\` in the new version's defaults.
</thought>
<step_summary>Verify connection-pool configurations for reduced defaults.</step_summary>
</step>

<step index="10" total="15">
<thought>
[Evaluation] Check middleware registration order: some packages inject global middleware at \`require\`-time. A slow middleware (e.g., large-payload body parser) before fast routes affects all endpoints even if the route itself is unchanged.
</thought>
<step_summary>Check for slow global middleware affecting all routes.</step_summary>
</step>

<step index="11" total="15">
<thought>
[Mitigation] Immediate mitigation: pin the dependency to the last known-good version (\`npm install dep@x.y.z\`) and deploy to restore SLA while the full investigation continues. Add a TODO linking to the issue tracker.
</thought>
<step_summary>Pin the dependency to the last known-good version to restore SLA.</step_summary>
</step>

<step index="12" total="15">
<thought>
[Action] If the regression is a bug in the dependency, open an issue with the minimal reproduction from Thought 7. Check if a patch release or a configuration flag exists to disable the slow behaviour.
</thought>
<step_summary>Report the bug upstream with the minimal reproduction.</step_summary>
</step>

<step index="13" total="15">
<thought>
[Strategy] If the slow path is unavoidable, mitigation options: (a) cache the expensive result at the request or process level, (b) offload CPU work to a \`worker_threads\` worker, (c) evaluate an alternative package.
</thought>
<step_summary>Consider caching, worker threads, or alternative packages if unavoidable.</step_summary>
</step>

<step index="14" total="15">
<thought>
[Validation] After applying the fix, run the same load test that revealed the regression. Confirm p50 and p99 return to baseline and do not diverge under sustained load. Check that GC pressure did not increase.
</thought>
<step_summary>Validate the fix under load to ensure metrics return to baseline.</step_summary>
</step>

<step index="15" total="15">
<thought>
[Conclusion] Diagnosis path: git bisect → event-loop lag check → clinic.js flame graph → isolated package benchmark → changelog review → pool/middleware audit. Mitigation: pin version immediately. Fix: configure, cache, or replace. Prevention: add a latency benchmark target to CI.
</thought>
<step_summary>Summarize the diagnosis, mitigation, fix, and prevention strategy.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the depth and quality of the example above.
- Structure reasoning using: [Observation], [Hypothesis], [Strategy], [Action], [Evaluation], [Mitigation], [Validation], [Conclusion].
- Write specific thoughts that advance the investigation. No summaries of prior steps, no filler.
- Provide a 1-sentence \`step_summary\` per step.
- Total thoughts: 15 to 25. Scale depth to complexity.
</constraints>`;

const TEMPLATES: Record<ReasoningLevel, string> = {
  basic: BASIC_TEMPLATE,
  normal: NORMAL_TEMPLATE,
  high: HIGH_TEMPLATE,
};

export function getTemplate(level: ReasoningLevel): string {
  return TEMPLATES[level];
}
