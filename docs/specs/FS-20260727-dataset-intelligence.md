# Dataset Intelligence

Status: implemented; database integration validation pending

## Summary

Add a versioned Dataset Intelligence layer that understands what a Chartbrew dataset represents, how its fields should be used, how existing charts use it, and whether its profile is current and trustworthy.

The first consumer is the AI orchestrator. It will search a compact dataset catalog and retrieve one bounded profile instead of repeatedly loading broad schemas or rebuilding existing analyses. The profile also establishes monitoring candidates required by later Insight Generation and Observation Engine phases.

This spec implements Phase 1 of the workspace-level Chartbrew Intelligence Roadmap.

## Goals

- Create a durable, regenerable intelligence profile for every eligible dataset.
- Infer field semantics, dataset grain, quality signals, existing usage, and monitoring candidates.
- Preserve explicit user overrides across regeneration.
- Build profiles from existing schemas, definitions, visualizations, and already-fetched samples.
- Let agents search datasets and retrieve targeted intelligence through bounded tools.
- Reduce prompt size, wrong dataset selection, and duplicate dataset/query creation.
- Add an env-backed policy provider that Chartbrew Cloud can replace with team entitlements.

## Non-Goals

- Insight narratives, period comparisons, driver analysis, or an insight feed.
- Continuous metric storage, baselines, signal scoring, or proactive notifications.
- Monitoring every numeric field.
- Replacing `Dataset.fieldsSchema`, the canonical visualization specification, source-owned AI planning, or existing alert models.
- Adding embeddings or an external vector database in the first implementation.
- Persisting raw sample rows, source credentials, request headers, or query text in the profile.

## Relationship To Existing Specs

`FS-20251222-dataset-field-metadata.md` proposed field role inference together with an older CDC multi-series design. Dataset Intelligence retains the useful inference and override concepts, but does not introduce that spec's `fieldsMetadata` or CDC `series` structures. Current visualization semantics remain owned by `Chart.visualization`; `Dataset.fieldsSchema` remains the raw detected type map.

## Domain Model

Add `DatasetIntelligence` with one active record per dataset:

| Field | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `dataset_id` | Unique dataset relation with cascade delete |
| `team_id` | Denormalized team scope and index |
| `version` | Persisted profile schema version |
| `status` | `pending`, `ready`, `stale`, or `failed` |
| `fingerprint` | Hash of schema, definition, and usage fingerprints |
| `profile` | Encrypted generated profile JSON |
| `overrides` | Encrypted user-authored overrides JSON |
| `generated_at` | Last successful generation |
| `expires_at` | Policy-derived stale time |
| `last_error` | Sanitized bounded generation error |

Do not overload `Dataset.fieldsSchema`. It remains the raw field/type source used by filters and visualization compatibility. Intelligence is independently versioned because it has a different lifecycle and will grow across later phases.

Profile version 1:

```javascript
{
  version: 1,
  dataset: {
    summary: "Completed ecommerce orders",
    grain: "One row per completed order",
    confidence: 0.91,
  },
  fields: {
    "root[].amount": {
      type: "number",
      role: "measure",
      semanticType: "currency",
      defaultAggregation: "sum",
      confidence: 0.95,
      evidence: ["visualization_value", "numeric_type", "field_name"],
    },
    "root[].country": {
      type: "string",
      role: "dimension",
      confidence: 0.88,
      evidence: ["visualization_breakdown", "cardinality"],
    },
  },
  usage: {
    chartIds: [12],
    dashboardIds: [3],
    metrics: [],
    dimensions: [],
    filters: [],
    analyses: [],
  },
  quality: {
    rowCountSampled: 200,
    nullRates: {},
    cardinality: {},
    dateCoverage: {},
    warnings: [],
  },
  monitoring: {
    defaultTimeField: "root[].completed_at",
    candidateMetrics: [],
    candidateSegments: [],
    freshnessExpectation: null,
  },
  provenance: {
    schemaFingerprint: "...",
    definitionFingerprint: "...",
    usageFingerprint: "...",
    sampleGeneratedAt: "...",
    llmEnriched: false,
  },
}
```

`profile` never contains raw sample values. Field names, summaries, and usage metadata are treated as sensitive tenant metadata and use the repository's existing encryption helpers.

## Intelligence Policy

Add a single policy resolver under `server/modules/intelligence`:

```javascript
async function getIntelligencePolicy({ teamId }) {
  return {
    datasetIntelligence: {
      enabled: true,
      autoProfile: true,
      profileTtlHours: 168,
      maxSampleRows: 200,
      maxFields: 200,
      llmEnrichment: false,
    },
  };
}
```

The default provider reads:

- `CB_DATASET_INTELLIGENCE_ENABLED`
- `CB_DATASET_INTELLIGENCE_AUTO_PROFILE`
- `CB_DATASET_INTELLIGENCE_PROFILE_TTL_HOURS`
- `CB_DATASET_INTELLIGENCE_MAX_SAMPLE_ROWS`
- `CB_DATASET_INTELLIGENCE_MAX_FIELDS`
- `CB_DATASET_INTELLIGENCE_LLM_ENRICHMENT`
- `CB_DATASET_INTELLIGENCE_BACKFILL_BATCH_SIZE`

Only the default provider reads environment variables. Profilers, workers, routes, and tools receive the resolved policy. Expose provider registration so Chartbrew Cloud can resolve the same object from team entitlements while preserving instance-wide ceilings.

Deterministic profiling is enabled by default. LLM enrichment is disabled unless explicitly enabled and a configured AI client is available. Policy denial returns a stable disabled result rather than throwing from normal dataset execution.

## Profile Generation

### Evidence assembly

Build evidence from:

- `Dataset.fieldsSchema`, `joinSettings`, and `main_dr_id`.
- DataRequest source type, configuration shape, transform, conditions, and variable names.
- Canonical `Chart.visualization` layers and their semantic encodings.
- ChartDatasetConfig filters, date compatibility, labels, and chart-local variables.
- Chart and dashboard names, types, intervals, refresh settings, and active alerts.
- A bounded dataset result already available during preview, manual execution, or scheduled refresh.
- Optional compact source-owned semantic hints when a source already exposes them.

Inspect query/configuration data in memory when necessary, but persist only semantic output and definition fingerprints. Never copy query text, headers, bodies, tokens, or sample values into the intelligence profile.

### Deterministic inference

Implement source-agnostic inference before LLM enrichment:

- Stable traversal field path and detected type.
- Roles: `measure`, `dimension`, `time`, `identifier`, or `unknown`.
- Suggested aggregation: `sum`, `avg`, `min`, `max`, `count`, or `none`.
- Candidate semantic types such as currency, percentage, duration, count, email, URL, and geography.
- Null rate, approximate cardinality, numeric range, and date coverage from the bounded sample.
- Likely grain from identifier uniqueness and repeated-value patterns.
- Usage evidence from value/category/time/breakdown encodings, filters, and alerts.
- Monitoring candidates ranked from existing chart usage before uncharted numeric fields.

Rules return confidence and evidence codes. They must not silently turn low-confidence guesses into overrides.

### Optional LLM enrichment

When enabled, send a bounded redacted evidence object, not raw rows or full queries. The model may propose:

- Dataset summary and grain wording.
- Semantic types for ambiguous fields.
- Business labels and ambiguity warnings.

Validate output against the profile schema and allowed field paths. Deterministic evidence wins when model output conflicts with explicit visualization usage or user overrides. Profiling still succeeds if enrichment fails.

### Overrides

Keep overrides separate from generated data:

```javascript
{
  dataset: {
    summary: "Recognised revenue after refunds",
    grain: "One row per settled invoice",
  },
  fields: {
    "root[].net_amount": {
      role: "measure",
      semanticType: "currency",
      defaultAggregation: "sum",
    },
  },
  monitoring: {
    defaultTimeField: "root[].settled_at",
  },
}
```

Regeneration computes a fresh generated profile and applies valid overrides last. Removed fields retain no active override but may be reported as orphaned for review.

## Lifecycle And Triggers

Calculate separate stable fingerprints for:

- Schema: sorted field paths and detected types.
- Definition: source identity plus normalized DataRequest, join, transform, condition, and variable shape.
- Usage: charts, canonical encodings, CDC filters, alerts, and dashboard placement.

The combined fingerprint and policy TTL determine freshness.

Generation triggers:

1. Lazy generation when an agent requests a missing profile.
2. Debounced background generation after a successful dataset result is already available.
3. Mark stale after relevant Dataset, DataRequest, CDC, visualization, or alert changes.
4. Manual refresh through the API.
5. Bounded admin/backfill batches.

Profiling runs asynchronously and must never change the success result of a dataset/chart refresh. Concurrent requests for the same dataset deduplicate to one job. Failures set `status="failed"`, retain the previous ready profile when one exists, and record only a sanitized error.

## Agent Integration

Add generic orchestrator tools:

### `search_datasets`

Input:

```javascript
{
  team_id: 1,
  query: "weekly completed revenue by country",
  project_id: 3,
  limit: 5,
}
```

Return only bounded catalog entries:

- Dataset id and name.
- Summary and grain.
- Top candidate metrics, dimensions, and time field.
- Relevant chart/dashboard names.
- Profile status and confidence.
- Deterministic relevance reasons.

Use weighted lexical matching over dataset names, summaries, field paths, semantic types, metrics, dimensions, and chart/dashboard names. Do not add embeddings in version 1.

### `get_dataset_intelligence`

Returns one team-scoped profile with:

- Generated and effective values.
- Relevant usage references.
- Warnings and provenance.
- Profile freshness.

Exclude internal errors, encrypted storage values, sample data, raw queries, and secrets. Cap fields and usage references according to policy and include truncation metadata.

Update orchestration guidance:

- Search existing datasets before generating a new query when the user refers to an existing business concept.
- Retrieve the selected profile before choosing fields, aggregation, time interval, or filters.
- Reuse an existing dataset when it satisfies the request.
- Fall back to the current connection/schema/source-planning path when no suitable dataset exists.

The current semantic-layer loader fetches datasets but the system prompt does not use them. Remove that unused broad dataset load once the search tool is available; do not replace it with a full profile dump.

## API And Minimal UI

Add team-scoped routes:

- `GET /team/:team_id/datasets/intelligence/search`
- `GET /team/:team_id/datasets/:dataset_id/intelligence`
- `POST /team/:team_id/datasets/:dataset_id/intelligence/refresh`
- `PUT /team/:team_id/datasets/:dataset_id/intelligence/overrides`

Use existing dataset permissions. Refresh and override writes require dataset edit permission.

Add a compact Dataset Settings section that shows:

- Profile status and last generation time.
- Summary, grain, default time field, and inferred field roles.
- Confidence/warning indicators.
- Refresh action.
- Explicit overrides for summary, grain, role, aggregation, and default time field.

This is an inspection and correction surface, not a new primary dataset workflow.

## Proposed Module Layout

```text
server/modules/intelligence/
  policy.js
  envPolicyProvider.js
server/modules/datasetIntelligence/
  profileSchema.js
  profileFingerprint.js
  buildProfileEvidence.js
  inferFieldSemantics.js
  enrichProfile.js
  mergeOverrides.js
  profileDataset.js
  searchDatasetProfiles.js
```

Add the model, migration, controller/routes, queue worker, orchestrator tools, and client settings section using existing repository conventions. Source-specific semantic contributions are optional follow-ups and must use `source-plugin-guide.md`.

## Security And Limits

- Enforce team scope before every read, refresh, search, or override.
- Never expose profiles through public chart/dashboard routes.
- Encrypt profile and override JSON at rest.
- Never persist raw rows, query text, request bodies, headers, credentials, or source tokens.
- Bound sample rows, field count, catalog results, usage references, prompt characters, and tool-output characters.
- Redact email-like or secret-like sample values before optional model calls; normally send statistics only.
- Use read-only samples already produced by Chartbrew. Do not issue new source queries during automatic profiling.

## Testing Strategy

### Unit

- Env parsing, defaults, invalid values, unlimited limits, and provider override behavior.
- Profile schema validation and version rejection.
- Fingerprint stability and changes for schema/definition/usage updates.
- Role, semantic type, aggregation, grain, cardinality, null-rate, and date-coverage inference.
- Override precedence and orphan handling.
- Redaction, encryption round-trip, and bounded serialization.
- Lexical search ranking and deterministic relevance reasons.

### Integration

- Model relations, cascade delete, encryption, and unique dataset constraint.
- Team isolation for every route and agent tool.
- Lazy generation, refresh deduplication, stale transitions, and failure retention.
- Successful dataset execution remains successful when profiling fails.
- Existing dataset reuse through orchestrator tool routing.
- Large-team and wide-dataset output caps.
- Disabled-policy behavior.

### Regression

- Dataset creation, execution, joins, filters, variables, caching, chart refreshes, alerts, snapshots, and source-owned planning retain current behavior.
- No profile appears in public/embed payloads.

## Rollout And Observability

1. Land policy, schema, model, deterministic profiler, and tests.
2. Enable lazy/manual profiling.
3. Add background profiling from successful dataset results.
4. Backfill in bounded batches.
5. Enable agent search/retrieval and remove unused broad dataset loading.
6. Add optional LLM enrichment.
7. Add the compact correction UI.

Record:

- Generation reason, duration, status, field count, sample count, and enrichment usage.
- Search latency, selected profile id, deterministic relevance score, and whether the agent reused a dataset.
- Profile age, stale count, failure count, and tool-output truncation.

Do not log profile contents, field names, query text, or sample values.

## Acceptance Gates

- An agent can find and reuse a relevant existing dataset without loading every dataset definition.
- Field, aggregation, time, filter, and chart choices use the selected profile.
- Regeneration is deterministic for identical evidence and preserves valid overrides.
- Automatic profiling does not issue extra source queries.
- Profile/tool payloads contain no raw rows, query text, headers, bodies, or credentials.
- Team isolation and output caps are covered by integration tests.
- Profiling or enrichment failure never blocks dataset or chart refresh.
- Existing visualization, filter, alert, snapshot, export, and source-plugin behavior is unchanged.

## Setup And Verification

Dataset Intelligence is enabled by default. Instance owners can change its limits in
`.env` using the variables documented in `.env-template`. LLM enrichment also requires
the existing OpenAI configuration and remains off by default.

Apply the database migration:

```bash
cd server
npm run db:migrate
```

Profile one bounded batch of eligible datasets:

```bash
npm run intelligence:backfill -- --limit=10
```

Optionally restrict the batch to one team:

```bash
npm run intelligence:backfill -- --team-id=1 --limit=10
```

For a single dataset, run it successfully and open **Dataset meaning** from its header.
Automatic profiling reuses that result and does not make another source request.

## Implementation Checklist

- [x] Add the intelligence policy interface and env-backed provider.
- [x] Add `DatasetIntelligence`, migration, encryption, and associations.
- [x] Add profile schema, fingerprints, evidence builder, inference, and override merge.
- [x] Add optional validated LLM enrichment.
- [x] Add async generation, deduplication, triggers, and backfill command.
- [x] Add search, retrieval, refresh, and override APIs.
- [x] Add `search_datasets` and `get_dataset_intelligence` orchestrator tools.
- [x] Update orchestration guidance and remove the unused broad dataset load.
- [x] Add the Dataset Settings inspection/correction section.
- [ ] Add unit, integration, regression, security, and limit tests.
- [x] Document environment variables and a quick enable/backfill verification guide.

The focused unit, security, limit, deduplication, lifecycle, lint, and client build checks pass.
Database-backed integration and regression suites remain to be run with the repository test
database available.
