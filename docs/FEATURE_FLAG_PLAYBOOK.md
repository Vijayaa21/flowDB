# Feature Flag Playbook

This playbook defines how FlowDB uses feature flags for safe production launch and controlled rollout.

## Flag Types

- Release flags: Hide unfinished features until ready.
- Ops kill-switch flags: Disable risky paths immediately.
- Experiment flags: Split traffic for phased rollout.

## Standard Flag Metadata

Every new flag must include:

- Name
- Owner
- Default value
- Scope (org/project/global)
- Rollout strategy
- Sunset date
- Rollback impact

## Launch Defaults

Before Step 11 go-live, enforce:

- All new release flags default to OFF.
- Any migration-sensitive flag has rollback notes.
- Kill-switch flags are documented and tested.

## Rollout Pattern

1. 1% internal traffic
2. 5% early adopters
3. 25% general traffic
4. 50% broad traffic
5. 100% complete rollout

Advance only when health metrics remain stable for one monitoring window.

## Rollback Pattern

If any SLO breaches during rollout:

1. Disable latest changed flag immediately.
2. Confirm metric recovery within 5 minutes.
3. Keep traffic at prior stable percentage.
4. File incident note and owner follow-up.

## Naming Convention

Use lowercase kebab-case with category prefix.

Examples:

- release.new-dashboard-layout
- ops.disable-github-webhook-sync
- experiment.branch-list-paginated

## Ownership Rules

- Product + Engineering co-own release flags.
- SRE owns ops kill-switch flags.
- Flags without owner are not allowed.

## Sunset Policy

- Remove temporary flags within 30 days of 100% rollout.
- Track stale flags in weekly operations review.
- Treat stale flags as technical debt with owner assignment.
