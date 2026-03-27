# FlowDB Orchestrator Migrations

This directory stores SQL migrations for orchestrator control-plane metadata.

## Naming Convention

Use a 3-digit, strictly increasing numeric prefix:

- `001_init.sql`
- `002_add_foo.sql`
- `003_alter_bar.sql`

Format: `NNN_short_description.sql`

## Ordering Rules

1. Migrations are applied in filename order.
2. Do not rename or reorder existing migration files after merge.
3. Every migration should be idempotent-safe where feasible.

## Early-Stage Policy (First 3 Revisions)

1. Keep migrations additive and non-destructive.
2. Avoid dropping columns/tables in early revisions.
3. Backfills should be explicit and versioned if introduced.

## Authoring Guidance

1. Prefer explicit constraints and indexes in the same migration that introduces a table.
2. Use `TIMESTAMPTZ` for all auditable timestamps.
3. Include comments for non-obvious constraints (partial unique indexes, status checks).
