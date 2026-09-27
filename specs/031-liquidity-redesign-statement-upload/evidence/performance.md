# Local resource measurements

2026-09-21, Node 22.20.0, local PostgreSQL through Docker. Entirely synthetic data. These are observations on this development host, not production latency guarantees.

| Path | Measurement |
|---|---|
| Parse + normalize + reconcile, five 2,000-row samples | Maximum sample (empirical p95): 166 ms |
| Same path, 25,000 rows / 1,339,114 input bytes | 1,621 ms; RSS 271,618,048 bytes |
| Full persistence, 2,000 rows | 1,766 ms; concurrent database read 159 ms |
| Full persistence, deployed 5,000-row default | 4,650 ms; concurrent read 389 ms; RSS 179,589,120 bytes |
| Diagnostic full persistence, 25,000 rows | 22,990 ms; concurrent read 1,697 ms; RSS 547,971,072 bytes |

Raw measurements are in `parse-benchmark.json`, `persist-benchmark.json`, `deployment-limit-persist-benchmark.json`, and `maximum-persist-benchmark.json`. The 25,000-row persistence diagnostic exceeded a 512 MiB runtime and failed the original one-second concurrent-read criterion. This is why the actual config, live descriptor and Terraform default are **5,000**, with 25,000 only an opt-in ceiling for larger measured capacity. The diagnostic must not be presented as qualifying 25,000 rows on the current production allocation.

The normal target of <=2,000 rows in <=5 seconds passed locally. Parser limits reject oversized bytes, records, fields, columns and holdings without partial publication. PostgreSQL integration exercises lease loss/cancellation and atomic admission/replay. Batched evidence inserts (250 holdings at a time) and in-place normalization reduced allocation; financial review/apply still recomputes from retained evidence and is bounded by the same file envelope.

Evidence amplification matters: the 25,000-row synthetic canonical draft alone was approximately 106.7 MB serialized; normalized fields and immutable review revisions add storage. An input-byte ceiling is not a retained-storage forecast. No automatic evidence expiry has been introduced. Monitor database/object storage and backups through existing operations before raising quotas.

The targeted 5,000-row run selected only the persistence test; its two unselected parser cases were reported skipped by Vitest. The complete resource suite separately ran all three tests in the non-skipped database acceptance group. Performance was measured locally, with no staging resources or new always-on service.
