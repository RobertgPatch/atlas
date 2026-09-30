# Performance evidence

Measured locally on 2026-09-28 with Node 22, the loopback PostgreSQL acceptance database, synthetic statements, the bounded worker, and the production-default 32 MiB worker-output cap. This is deployment-shape evidence, not an ECS capacity claim.

| Case | Result |
|---|---:|
| Five 2,000-position worker runs | 697, 708, 716, 745, 768 ms |
| 2,000-position worker p95 | 768 ms (target <5,000 ms) |
| Concurrent event-loop timer maximum | 4 ms |
| 2,000-row upload capability | 16 ms |
| 2,000-row parse and DB persistence | 2,645 ms |
| Concurrent DB read during persistence | 11 ms |
| 5,000-row configured deployment limit: parse and persistence | 5,667 ms |
| 5,000-row upload capability | 17 ms |
| 25,000-row explicit diagnostic parse/reconcile | 1,896 ms |
| 25,000-row diagnostic input | 1,339,114 bytes |

For the final 2,000-position worker run set, parent RSS moved from 68,870,144 to 180,707,328 bytes; external memory moved from 2,639,949 to 2,627,715 bytes and array buffers from 202,635 to 192,169 bytes. The 25,000-row in-process diagnostic reported 263,827,456-byte RSS and 105,439,232-byte growth. The 2,000-row persistence process reported 398,516,224-byte RSS; the 5,000-row persistence process reported 394,407,936 bytes. These process totals include test runner, serialized copies, and database client allocations; they are not isolated child-worker peak RSS.

The first 5,000-row persistence run exposed duplicate worker payloads exceeding the 32 MiB boundary. The worker boundary was reduced to the required records, canonical result, detection metadata, and only identity-bearing source records. The unchanged 32 MiB cap then passed the 5,000-row test. No limit was raised to hide the failure.

Commands:

```powershell
$env:ATLAS_TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:15432/atlas_statement_test'
$env:ATLAS_REQUIRE_LIQUIDITY_DB_TESTS='true'
$env:ATLAS_STATEMENT_BENCHMARK_DIR=(Resolve-Path 'specs/032-statement-adapter-normalization/evidence/benchmarks').Path
$env:ATLAS_CSV_BENCHMARK_DIR=$env:ATLAS_STATEMENT_BENCHMARK_DIR
npm test --workspace apps/api -- --run tests/liquidity-statements/statement-benchmark.test.ts tests/liquidity-statements/resource-bounds.integration.test.ts
```

XLSX remains default-disabled. Before production activation, repeat these checks with the deployed ECS CPU/memory allocation and capture OS-level combined API/worker peak RSS, live database duration, and concurrent HTTP latency. Local measurements do not establish a production SLO.
