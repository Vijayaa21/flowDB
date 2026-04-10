# Production Launch Checklist

This checklist is the Step 11 go-live gate for FlowDB. Every item must be reviewed and signed off before enabling full production traffic.

## Launch Decision Roles

- Launch Commander: Owns go/no-go decision.
- Release Engineer: Executes deployment and rollback commands.
- On-call Engineer: Monitors alerts and triages incidents.
- Support Lead: Coordinates customer-facing updates.
- Product Owner: Confirms launch scope and success criteria.

## T-24h Readiness

- [ ] Release notes reviewed and approved.
- [ ] All CI/CD gates passing on target commit.
- [ ] Canary deployment healthy for at least 15 minutes.
- [ ] Rollback runbook reviewed by release engineer.
- [ ] Support macros and escalation contacts updated.
- [ ] Status page template drafted.
- [ ] Incident bridge channel created.

## T-60m Pre-Launch

- [ ] Production change ticket approved.
- [ ] On-call schedule confirmed for 24h watch period.
- [ ] Feature flags set to safe defaults.
- [ ] Database backup freshness validated.
- [ ] Monitoring dashboards loaded and shared.
- [ ] SLO alert thresholds verified.
- [ ] Communication plan posted in release channel.

## T-15m Final Gate

- [ ] Latest deployment hash matches release candidate.
- [ ] No active Sev-1/Sev-2 incidents.
- [ ] Error rate baseline under 0.5%.
- [ ] P99 latency baseline under 500ms.
- [ ] Webhook delivery success over 99.5%.
- [ ] Launch commander confirms go.

## T+0 Launch Steps

1. Start release call and assign roles.
2. Trigger production deployment workflow.
3. Run smoke tests on live endpoint.
4. Confirm authentication and branch operations.
5. Announce launch in engineering and support channels.

## T+15m Post-Launch Verification

- [ ] Health endpoint stable.
- [ ] Error budgets within normal range.
- [ ] No spike in auth failures.
- [ ] No webhook processing backlog.
- [ ] No customer-reported critical issues.

## T+24h Closeout

- [ ] Publish launch summary.
- [ ] Confirm no latent regressions.
- [ ] Document follow-up action items.
- [ ] Mark launch complete in change record.

## Go/No-Go Template

Decision: GO / NO-GO

- Release version:
- Commit SHA:
- Decision time (UTC):
- Launch commander:
- Risks accepted:
- Rollback owner:
- Notes:
