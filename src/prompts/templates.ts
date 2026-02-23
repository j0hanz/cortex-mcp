import type { ReasoningLevel } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Guided few-shot examples for each reasoning level.
// Each template shows correct `thought` depth and step count so the LLM
// calibrates its output to the selected level requirements.
// ---------------------------------------------------------------------------

const BASIC_TEMPLATE = `## Guided Example (basic — 3 thoughts)

**Query:** "Is Set or Array better for deduplicating a list of strings in JavaScript?"

**Thought 1 of 3:**
> A \`Set\` enforces uniqueness automatically; \`[...new Set(arr)]\` is a single-step O(n) operation. An Array-based approach (\`filter\` + \`indexOf\`) is O(n²) and adds unnecessary complexity.

**Thought 2 of 3:**
> Edge cases: both preserve insertion order in modern JS engines, so ordering is not a differentiator. \`Set\` converts all values to a common reference internally, which handles string equality correctly.

**Thought 3 of 3 — conclusion:**
> Use \`Set\`. It is faster (O(n) vs O(n²)), shorter to write, and immediately communicates the intent of deduplication. \`[...new Set(list)]\` is the idiomatic solution.

---
**System Directive:** Follow the pattern above. Each \`thought\` must contain self-contained, concrete analysis — no filler language or meta-commentary. Use 3 to 5 thoughts total.`;

const NORMAL_TEMPLATE = `## Guided Example (normal — 7 thoughts)

**Query:** "How do I safely handle concurrent writes to a shared in-memory counter in a Node.js service?"

**Thought 1 of 7:**
> Node.js is single-threaded: synchronous code is never interrupted mid-execution, so a plain \`counter++\` within one event-loop tick is effectively atomic from JavaScript's perspective.

**Thought 2 of 7:**
> The risk arises in *async* code. A read-modify-write spanning an \`await\` boundary is NOT atomic. Two concurrent callers can both read the same value before either writes, causing a lost update.

**Thought 3 of 7:**
> Example race: \`const v = await db.get('c'); await db.set('c', v + 1);\` — if two requests interleave at the \`await\` points, both read \`v=5\` and both write \`6\`, losing one increment.

**Thought 4 of 7:**
> Solution A — atomic DB operation: \`UPDATE counter SET n = n + 1 RETURNING n\` (SQL) or Redis \`INCR\`. The DB engine serialises the read-modify-write internally with no async gap.

**Thought 5 of 7:**
> Solution B — async mutex: use a library-level lock (e.g. \`async-mutex\`) to serialise access. Works for in-process state but does not scale across multiple processes or restarts.

**Thought 6 of 7:**
> Solution C — synchronous in-memory only: keep the counter as a plain variable, increment with \`counter++\` (no \`await\` in the read-modify-write path). Valid only for single-process, ephemeral state.

**Thought 7 of 7 — conclusion:**
> Prefer Solution A (atomic DB op) for correctness across restarts and multi-process deployments. Use Solution C only for in-process, non-persisted counters where an \`await\` never touches the variable. Avoid async read-modify-write without a mutex.

---
**System Directive:** Follow the pattern above. Each \`thought\` must be concrete and progress the analysis. Use 6 to 10 thoughts total; avoid restating earlier thoughts.`;

const HIGH_TEMPLATE = `## Guided Example (high — 15 thoughts)

**Query:** "Our Node.js API latency jumped from p50=20ms to p50=800ms after a dependency upgrade. How do I diagnose and fix this?"

**Thought 1 of 15:**
> Establish the change boundary: run \`git log --oneline\` to find the upgrade commit. Use \`git bisect\` between the last known-good tag and HEAD to confirm the exact commit that caused the regression.

**Thought 2 of 15:**
> Collect baseline metrics before touching anything: event-loop lag (\`perf_hooks.monitorEventLoopDelay\`), GC pause times (\`--expose-gc\` + \`PerformanceObserver\`), and per-route timings. This separates compute regressions from I/O regressions.

**Thought 3 of 15:**
> If event-loop lag is high (>50ms per tick), the cause is synchronous blocking inserted into the hot path — JSON serialisation of large objects, synchronous file I/O, regex backtracking, or CPU-heavy validation.

**Thought 4 of 15:**
> If event-loop lag is low but p50 is high, the bottleneck is I/O wait: slow DB queries, connection-pool exhaustion, DNS resolution delays, or increased network RTT to the upgraded service.

**Thought 5 of 15:**
> Read the dependency's changelog between the old and new version. Look for: new middleware injected at startup, serialisation format changes, default timeout changes, or connection-pool default reductions.

**Thought 6 of 15:**
> Profile with \`clinic.js flame\` (or \`node --prof\` + \`node --prof-process\`) under representative load. The flame graph will pinpoint whether wall-clock time is in JS compute vs. idle I/O await.

**Thought 7 of 15:**
> Write a minimal reproduction that calls *only* the upgraded package's API with representative input. Benchmark it against the pinned old version in isolation to confirm the package itself is the source.

**Thought 8 of 15:**
> Common 40× regression patterns: (a) added synchronous schema validation on every request, (b) HTTP/1.1 → HTTP/2 frame parsing overhead, (c) new middleware that buffers the full request body before routing.

**Thought 9 of 15:**
> Check connection-pool configuration: if the upgrade changed default pool size or idle timeout, requests may queue waiting for connections. Inspect \`pool.min\`, \`pool.max\`, and \`acquireTimeoutMillis\` in the new version's defaults.

**Thought 10 of 15:**
> Check middleware registration order: some packages inject global middleware at \`require\`-time. A slow middleware (e.g., large-payload body parser) before fast routes affects all endpoints even if the route itself is unchanged.

**Thought 11 of 15:**
> Immediate mitigation: pin the dependency to the last known-good version (\`npm install dep@x.y.z\`) and deploy to restore SLA while the full investigation continues. Add a TODO linking to the issue tracker.

**Thought 12 of 15:**
> If the regression is a bug in the dependency, open an issue with the minimal reproduction from Thought 7. Check if a patch release or a configuration flag exists to disable the slow behaviour.

**Thought 13 of 15:**
> If the slow path is unavoidable, mitigation options: (a) cache the expensive result at the request or process level, (b) offload CPU work to a \`worker_threads\` worker, (c) evaluate an alternative package.

**Thought 14 of 15:**
> After applying the fix, run the same load test that revealed the regression. Confirm p50 and p99 return to baseline and do not diverge under sustained load. Check that GC pressure did not increase.

**Thought 15 of 15 — conclusion:**
> Diagnosis path: git bisect → event-loop lag check → clinic.js flame graph → isolated package benchmark → changelog review → pool/middleware audit. Mitigation: pin version immediately. Fix: configure, cache, or replace. Prevention: add a latency benchmark target to CI.

---
**System Directive:** Follow the pattern above. Each \`thought\` must be specific, advancing the investigation — no summaries of prior steps, no filler. Use 15 to 25 thoughts total; scale depth to complexity.`;

const TEMPLATES: Record<ReasoningLevel, string> = {
  basic: BASIC_TEMPLATE,
  normal: NORMAL_TEMPLATE,
  high: HIGH_TEMPLATE,
};

export function getTemplate(level: ReasoningLevel): string {
  return TEMPLATES[level];
}
