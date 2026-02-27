import type { ReasoningLevel } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Guided few-shot examples for each reasoning level.
// Each template shows correct `thought` depth and step count so the LLM
// can match level-specific depth and structure.
// ---------------------------------------------------------------------------

const BASIC_TEMPLATE = `<example>
<query>Is Set or Array better for deduplicating a list of strings in JavaScript?</query>

<thought_process>
<step index="1" total="3">
<thought>
[Observation] A \`Set\` enforces uniqueness automatically; \`[...new Set(arr)]\` is an O(n) operation. An Array-based approach (filter + indexOf) is O(n²) and verbose.
</thought>
<step_summary>Set is O(n), Array unique-filter is O(n²).</step_summary>
</step>

<step index="2" total="3">
<thought>
[Evaluation] Both preserve insertion order in modern JS. \`Set\` handles all primitives correctly. Array methods require careful callback logic for edge cases (e.g., NaN).
</thought>
<step_summary>Set handles primitives and edge cases robustly.</step_summary>
</step>

<step index="3" total="3">
<thought>
[Conclusion] Use \`Set\`. It is idiomatic, faster, and clearer. \`Array.from(new Set(list))\` or spread syntax is standard practice.
</thought>
<step_summary>Set is the standard, optimized solution.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the example's depth and quality.
- Use labels: [Observation], [Hypothesis], [Evaluation], [Conclusion].
- Write concrete, self-contained thoughts. No filler.
- Include one 1-sentence \`step_summary\` per step.
- Total thoughts: 1 to 3.
</constraints>`;

const NORMAL_TEMPLATE = `<example>
<query>How do I safely handle concurrent writes to a shared in-memory counter in a Node.js service?</query>

<thought_process>
<step index="1" total="7">
<thought>
[Observation] Node.js is single-threaded. Synchronous code executes atomically within one event loop tick. \`counter++\` is safe *if* no \`await\` intervenes.
</thought>
<step_summary>Synchronous operations are atomic in Node.js event loop.</step_summary>
</step>

<step index="2" total="7">
<thought>
[Hypothesis] Risks occur in async workflows. A read-modify-write spanning an \`await\` (e.g., fetch-increment-save) allows interception by other requests, causing lost updates.
</thought>
<step_summary>Async boundaries break atomicity, risking race conditions.</step_summary>
</step>

<step index="3" total="7">
<thought>
[Evaluation] Scenario: Req A reads 5, waits. Req B reads 5, waits. Both write 6. Net result: +1 instead of +2. This is a classic race condition.
</thought>
<step_summary>Parallel async execution leads to data loss.</step_summary>
</step>

<step index="4" total="7">
<thought>
[Strategy] Option A (External): Offload atomicity to the database (SQL \`UPDATE ... RETURNING\`, Redis \`INCR\`). This is persistent and scalable.
</thought>
<step_summary>Database-level atomic operations ensure consistency.</step_summary>
</step>

<step index="5" total="7">
<thought>
[Strategy] Option B (Mutex): Use \`async-mutex\` to serialize access to the critical section. Effective for in-process state but blocks the event loop if misused.
</thought>
<step_summary>In-memory mutexes serialize local async access.</step_summary>
</step>

<step index="6" total="7">
<thought>
[Strategy] Option C (Sync-Only): Keep state purely in-memory and synchronous. Only valid for ephemeral, non-distributed counters.
</thought>
<step_summary>Pure synchronous variables avoid the problem entirely.</step_summary>
</step>

<step index="7" total="7">
<thought>
[Conclusion] Use Option A (DB) for distributed/durable systems. Use Option C (Sync) for simple stats. Avoid raw async read-modify-write loops.
</thought>
<step_summary>Prefer DB atomicity for robustness; sync vars for speed.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the example's depth and quality.
- Use labels: [Observation], [Hypothesis], [Evaluation], [Strategy], [Conclusion].
- Write concrete thoughts that move the analysis forward. Do not restate earlier thoughts.
- Include one 1-sentence \`step_summary\` per step.
- Total thoughts: 4 to 8.
</constraints>`;

const HIGH_TEMPLATE = `<example>
<query>Our Node.js API latency jumped from p50=20ms to p50=800ms after a dependency upgrade. How do I diagnose and fix this?</query>

<thought_process>
<step index="1" total="15">
<thought>
[Strategy] Identify the change boundary. Use \`git bisect\` to isolate the exact commit causing the regression. This confirms if the upgrade is the sole cause.
</thought>
<step_summary>Isolate the problematic commit with git bisect.</step_summary>
</step>

<step index="2" total="15">
<thought>
[Observation] Collect baseline metrics: CPU usage, Memory (GC), Event Loop Lag, and Network I/O. Differentiation: High CPU/Lag = compute; High Wait = I/O.
</thought>
<step_summary>Gather metrics to distinguish compute from I/O issues.</step_summary>
</step>

<step index="3" total="15">
<thought>
[Hypothesis] High Event Loop Lag (>50ms) suggests synchronous blocking on the main thread (e.g., regex, large JSON parse, crypto). The upgrade may have introduced slow sync validation.
</thought>
<step_summary>Lag indicates synchronous blocking on the main thread.</step_summary>
</step>

<step index="4" total="15">
<thought>
[Hypothesis] Low Lag but High P50 suggests upstream I/O latency. The new library version might differ in connection pooling, DNS resolution, or default timeouts.
</thought>
<step_summary>Latency without lag points to I/O or network bottlenecks.</step_summary>
</step>

<step index="5" total="15">
<thought>
[Action] Audit the changelog between versions. Look for "Breaking Changes", new middleware, or altered default configurations (e.g., \`poolSize\`).
</thought>
<step_summary>Review changelog for defaults or middleware shifts.</step_summary>
</step>

<step index="6" total="15">
<thought>
[Action] Profile with \`clinic.js flame\` or \`node --prof\`. Generate a flame graph to see where the CPU time is spent during the request.
</thought>
<step_summary>Profile execution to visualize CPU hotspots.</step_summary>
</step>

<step index="7" total="15">
<thought>
[Action] Create a minimal reproduction script using *only* the new library version. Benchmark this in isolation to confirm the library itself is the bottleneck, excluding app logic.
</thought>
<step_summary>Isolate the library in a minimal repro script.</step_summary>
</step>

<step index="8" total="15">
<thought>
[Evaluation] Pattern A (Compute): The new version adds schema validation (e.g., Joi/Zod) on every read. This shows up as deep stacks in the flame graph.
</thought>
<step_summary>Check for accidental compute overhead (validation).</step_summary>
</step>

<step index="9" total="15">
<thought>
[Evaluation] Pattern B (Configuration): The connection pool default dropped from 10 to 1, causing serialization of concurrent requests.
</thought>
<step_summary>Check for reduced concurrency limits in config.</step_summary>
</step>

<step index="10" total="15">
<thought>
[Evaluation] Pattern C (Middleware): The package auto-registers a global body parser that waits for the full stream before processing, delaying TTFB.
</thought>
<step_summary>Check for eager middleware blocking request flow.</step_summary>
</step>

<step index="11" total="15">
<thought>
[Mitigation] Pin the dependency to the previous working version immediately to restore SLA. Document the incident and block the upgrade in \`package.json\`.
</thought>
<step_summary>Rollback and pin version to restore service health.</step_summary>
</step>

<step index="12" total="15">
<thought>
[Action] Open a GitHub issue with the reproduction script (Thought 7). Maintainers need proof to prioritize a fix.
</thought>
<step_summary>Report bug upstream with reproduction evidence.</step_summary>
</step>

<step index="13" total="15">
<thought>
[Strategy] If the upgrade is mandatory (security), mitigate via caching (Redis) or offloading the heavy task to a worker thread.
</thought>
<step_summary>Use caching or workers if rollback isn't an option.</step_summary>
</step>

<step index="14" total="15">
<thought>
[Validation] Re-run the load test against the fix/rollback. Verify P50/P99 metrics match the original baseline. Ensure no memory leaks (stable heap).
</thought>
<step_summary>Validate metrics match baseline after fix.</step_summary>
</step>

<step index="15" total="15">
<thought>
[Conclusion] Diagnostic workflow: Bisect -> Metrics (Lag vs I/O) -> Profiling -> Isolation -> Config Audit. Action: Rollback, Report, Optimize.
</thought>
<step_summary>Systematic diagnosis confirms root cause and fix.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the example's depth and quality.
- Use labels: [Observation], [Hypothesis], [Strategy], [Action], [Evaluation], [Mitigation], [Validation], [Conclusion].
- Write specific thoughts that advance the investigation. No step recaps. No filler.
- Include one 1-sentence \`step_summary\` per step.
- Total thoughts: 10 to 15. Scale depth to complexity.
</constraints>`;

const EXPERT_TEMPLATE = `<example>
<query>
Implement a distributed, high-throughput event sourcing system using PostgreSQL and Kafka with exactly-once processing guarantees and conflict resolution.
</query>
<thought_process>
<step index="1" total="20">
<thought>
[Decomposition] Core Constraints: High Throughput (Write-heavy), Distributed (Consistency risks), Exactly-once (Duplication risks), Conflict Resolution (Concurrency). Tech Stack: Postgres (Source of Truth), Kafka (Transport).
</thought>
<step_summary>Analyze constraints: Throughput, Consistency, and Reliability are paramount.</step_summary>
</step>

<step index="2" total="20">
<thought>
[Architecture] Pattern Selection: "Transactional Outbox". Writes to PG (Business Data + Event) must be atomic. Kafka producer is async. Direct dual-write (DB + Kafka) is unsafe (dual-write problem).
</thought>
<step_summary>Select Transactional Outbox pattern to solve the dual-write problem.</step_summary>
</step>

<step index="3" total="20">
<thought>
[Strategy] Storage Schema: \`aggregates\` table (current state, version column) and \`outbox\` table (id, aggregate_id, payload, created_at). Both written in one \`BEGIN...COMMIT\` block.
</thought>
<step_summary>Define PG schema with Aggregates and Outbox tables.</step_summary>
</step>

<step index="4" total="20">
<thought>
[Strategy] Ingestion: API receives command -> Loads Aggregate -> Validates -> Applies Event -> Updates State (ver++) -> Inserts Outbox -> Commits.
</thought>
<step_summary>Define synchronous write path: Load-Validate-Apply-Commit.</step_summary>
</step>

<step index="5" total="20">
<thought>
[Reliability] Publishing: Use Debezium (CDC) or a Polling Publisher to tail the \`outbox\` table and push to Kafka. CDC is lower latency; Polling is simpler. Choose CDC for "High Throughput".
</thought>
<step_summary>Use CDC (Debezium) for low-latency, reliable event publishing.</step_summary>
</step>

<step index="6" total="20">
<thought>
[Strategy] Kafka Partitioning: Partition by \`aggregate_id\`. This guarantees strict ordering of events for a single entity. Global ordering is impossible and unnecessary.
</thought>
<step_summary>Partition Kafka by aggregate_id to ensure entity-level ordering.</step_summary>
</step>

<step index="7" total="20">
<thought>
[Implementation] Consumer Idempotency: "Exactly-Once" is effectively "At-Least-Once + Idempotency". Consumer tracks \`last_processed_offset\` or usage of a unique \`event_id\` in its local DB transaction.
</thought>
<step_summary>Implement idempotency via exactly-once semantics at the consumer.</step_summary>
</step>

<step index="8" total="20">
<thought>
[Conflict Resolution] Detect: Use Optimistic Concurrency Control (OCC) on the Write side. \`UPDATE aggregates SET ..., version = version + 1 WHERE id = $1 AND version = $2\`. If row count 0, concurrency violation.
</thought>
<step_summary>Use Optimistic Concurrency Control (OCC) to detect write conflicts.</step_summary>
</step>

<step index="9" total="20">
<thought>
[Conflict Resolution] Handle: On OCC failure, retry the command. Reload aggregate (fetching new state applied by competitor), re-validate, re-attempt.
</thought>
<step_summary>Retry commands on OCC failure after refreshing state.</step_summary>
</step>

<step index="10" total="20">
<thought>
[Optimization] Snapshotting: Replaying 1M events is slow. Create snapshots every N events. Store in \`snapshots\` table. Load = Snapshot + subsequent events.
</thought>
<step_summary>Implement snapshotting to bound strict replay times.</step_summary>
</step>

<step index="11" total="20">
<thought>
[Implementation] Dead Letter Queue (DLQ): If an event fails processing (bug, poison pill), move to DLQ after N retries to prevent partition blocking.
</thought>
<step_summary>Configure DLQ to prevent poison pills from blocking partitions.</step_summary>
</step>

<step index="12" total="20">
<thought>
[Throughput] Batching: Producer (CDC) batches records for Kafka compression. Consumer uses \`fetch.min.bytes\` to process batches. DB writes can use \`COPY\` if high volume, but usually row-by-row for OLTP.
</thought>
<step_summary>Tune batching parameters at Producer and Consumer layers.</step_summary>
</step>

<step index="13" total="20">
<thought>
[Scalability] Read Models (CQRS): The sourcing system handles Writes. Project events into separate Read Models (Elasticsearch, Redis) via separate consumers groups.
</thought>
<step_summary>Use CQRS to decouple write throughput from read complexity.</step_summary>
</step>

<step index="14" total="20">
<thought>
[Edge Case] Outbox Table Bloat: The outbox grows indefinitely. Strategy: "Delete after publish" (Debezium support) or separate vacuum process. PREFER delete-on-publish for hygiene.
</thought>
<step_summary>Prune outbox table after publication to maintain performance.</step_summary>
</step>

<step index="15" total="20">
<thought>
[Security] Auditability: The event log is the legal record. Ensure detailed metadata (user_id, ip, timestamp, reason) is in the event payload. Immutable.
</thought>
<step_summary>Enrich events with audit metadata; treat log as immutable.</step_summary>
</step>

<step index="16" total="20">
<thought>
[Failure Mode] Kafka Unavailable: Writes to PG continue (Outbox accumulates). Latency increases, but availability limits to PG uptime. Recovery: CDC catches up when Kafka returns.
</thought>
<step_summary>System remains available during Kafka outages; lag increases.</step_summary>
</step>

<step index="17" total="20">
<thought>
[Failure Mode] Consumer Lag: Validates "High Throughput". If lag grows, scale consumer groups (add partitions if needed). Autoscaler metric: \`kafka_consumergroup_lag\`.
</thought>
<step_summary>Monitor consumer lag to trigger horizontal scaling.</step_summary>
</step>

<step index="18" total="20">
<thought>
[Validation] Testing: Chaos Engineering. Kill Kafka broker, kill Consumer, kill PG leader. Verify no data loss (zero ack loss), no duplicates (idempotency), no ordering violation.
</thought>
<step_summary>Validate resilience via Chaos Engineering (broker/consumer kills).</step_summary>
</step>

<step index="19" total="20">
<thought>
[Synthesis] The solution decouples Write availability from Event Distribution. PG provides OCC + Persistence. Outbox + CDC guarantees delivery. Kafka provides ordering + backpressure.
</thought>
<step_summary>Synthesize the architecture: Decoupled, Durable, Ordered.</step_summary>
</step>

<step index="20" total="20">
<thought>
[Conclusion] Final Spec: Service (Node/Go) -> PG (OCC + Outbox) -> Debezium -> Kafka (Partition Key=AggID) -> Consumer (Idempotent). Guarantees: Strong Consistency (Write), Eventual Consistency (Read), Exactly-Once (E2E).
</thought>
<step_summary>Finalize the distributed event sourcing specification.</step_summary>
</step>
</thought_process>
</example>

<constraints>
- Match the example's depth and quality.
- Perform exhaustive analysis of edge cases, failure modes, and trade-offs.
- Use labels: [Decomposition], [Architecture], [Strategy], [Implementation], [Validation], [Optimization], [Security], [Conclusion].
- Total thoughts: 20 to 25. Scale depth to extreme complexity.
</constraints>`;

const TEMPLATES: Record<ReasoningLevel, string> = {
  basic: BASIC_TEMPLATE,
  normal: NORMAL_TEMPLATE,
  high: HIGH_TEMPLATE,
  expert: EXPERT_TEMPLATE,
};

export function getTemplate(level: ReasoningLevel): string {
  return TEMPLATES[level];
}
