---
description: Analyze slow SQL queries and suggest indexes, rewrites, and schema changes. Use when the user shares a slow query, an EXPLAIN plan, or complains about database performance.
---

# SQL Optimizer

Diagnose why a query is slow before proposing changes.

## Workflow

1. Get the query, the schema of the tables involved, and an `EXPLAIN ANALYZE`
   output. Do not guess from the query text alone.
2. Look for the usual suspects in the plan: sequential scans on large tables,
   nested loops over big row counts, sorts that spill to disk, and mismatched
   data types preventing index use.
3. Propose the smallest fix first — usually a single index. Show the exact
   `CREATE INDEX` statement and explain which plan node it eliminates.
4. Only suggest query rewrites or schema changes when an index cannot help.
5. Ask the user to re-run `EXPLAIN ANALYZE` after the change and compare.

## Rules

- Never recommend dropping an existing index without checking what uses it.
- Estimated costs are not milliseconds; compare actual timings only.
