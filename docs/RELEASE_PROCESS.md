# Release Process

This document outlines the complete release process for FlowDB from development to production.

## Overview

FlowDB uses a **staged release pipeline** with the following gates:

```
main branch
    ↓
[CI/CD Gates] ← Required: lint, typecheck, test, build, security
    ↓
[Canary Deployment] ← Required: 15-min health monitoring, <0.5% error rate
    ↓
[Production Deployment] ← Required: approval, blue-green switch, smoke tests
    ↓
[Production Live]
```

Each stage must pass all gates before progressing to the next stage.

## Release Phases

### Phase 1: Code Commit to Main (Developer)

**Responsibility**: Development team

**Steps**:

1. Create feature/fix branch from `main`
2. Implement changes with tests
3. Create pull request with:
   - Description of changes
   - Test coverage verification
   - Deployment impact assessment
4. Get 2+ code reviews
5. Ensure all CI/CD gates pass:
   - Lint (ESLint)
   - TypeScript type check
   - All test suites
   - Security audit
6. Merge to `main`

**Time**: 2-5 days

### Phase 2: CI/CD Gates (Automated)

**Responsibility**: GitHub Actions

**Triggered by**: Push to `main` or pull request

**Gates**:

#### Gate 1: Lint & Format (5 min)

- ESLint checks pass
- Prettier formatting matches
- No console.logs in production code
- No TODO comments without tracked issues

#### Gate 2: TypeScript Type Check (3 min)

- No type errors
- Strict mode enabled
- All function parameters typed
- Return types inferred or explicit

#### Gate 3: Unit & Integration Tests (15 min)

- All test suites passing
- Minimum 80% code coverage
- No flaky tests
- Database tests use isolated containers

#### Gate 4: Build Verification (10 min)

- Orchestrator builds successfully
- Dashboard builds successfully
- No build warnings promoted to errors
- Assets optimized and bundled

#### Gate 5: Security Checks (3 min)

- Dependency vulnerability audit passes
- No hardcoded secrets detected
- SAST checks pass (if integrated)
- License compliance verified

**Pass Criteria**: All 5 gates must pass. If any gate fails, merge commits are blocked.

**On Failure**:

1. Developer is notified
2. Build badge turns red in PR
3. Merge button disabled
4. Developer must fix and re-commit

### Phase 3: Canary Deployment (Ops Team)

**Responsibility**: DevOps/SRE team

**Triggered by**: Manual trigger after CI/CD gates pass

**Duration**: 15 minutes

**Steps**:

1. **Pre-canary Checks** (2 min)
   - Verify last commit passed all CI gates
   - Check production database connection
   - Verify secret rotation completed

2. **Deploy to Canary Slot** (3 min)
   - Build Docker image from current commit
   - Push to container registry
   - Deploy to canary cluster
   - Expose on `canary-api.flowdb.dev`

3. **Traffic Routing** (1 min)
   - Route 10% of production traffic to canary
   - Keep 90% on stable version
   - Monitor traffic split in real-time

4. **Health Monitoring** (15 min)
   - Continuous monitoring dashboard active
   - Key metrics watched:
     - Error rate (target: <0.5%)
     - Response latency p99 (target: <500ms)
     - Database query performance
     - Webhook delivery success rate (target: >99.5%)
     - Memory/CPU usage
   - Automatic alerts if thresholds exceeded

5. **Decision Point**:
   - **PASS**: All metrics healthy → proceed to production
   - **FAIL**: Any metric exceeds threshold → automatic rollback to stable

**Monitoring Dashboard Metrics**:

```
Canary Health Dashboard
=====================================
Error Rate:           0.2% ✓ (target: <0.5%)
Response P99:         310ms ✓ (target: <500ms)
Webhook Success:      99.8% ✓ (target: >99.5%)
Database Errors:      0 ✓
Memory Usage:         480MB (max: 1GB)
CPU Usage:            25% (max: 80%)
Active Connections:   342
=====================================
Status: HEALTHY ✓
```

### Phase 4: Production Deployment (Ops Team)

**Responsibility**: DevOps/SRE and Engineering Lead

**Prerequisites**:

- Canary phase passed all health checks
- Change management ticket approved (if required)
- Deployment window open (business hours)
- On-call team available

**Triggering**:

- Manual workflow dispatch OR
- Automatic after canary passes (optional)

**Approval Required**:

- Engineering Lead: Sign-off on readiness
- DevOps Engineer: Deployment execution
- Optional: Change Advisory Board (for large changes)

**Steps**:

1. **Pre-Deployment Validation** (5 min)
   - Verify deploying from `main` branch
   - Confirm all CI/CD gates passed
   - Verify canary deployment healthy
   - Check change management ticket (if applicable)
   - Verify on-call escalation configured

2. **Blue-Green Deployment** (8 min)

   **Strategy**: Zero-downtime deployment

   ```
   BEFORE:
   Users → Load Balancer → BLUE (v1.2.0) [Active]
                        → GREEN (idle)

   STEP 1: Deploy new version to GREEN
   Users → LB → BLUE (v1.2.0) [Active]
              → GREEN (v1.2.1) [Warming up]

   STEP 2: Health check GREEN cluster

   STEP 3: Switch load balancer to GREEN
   Users → LB → BLUE (v1.2.0) [Idle - Rollback target]
              → GREEN (v1.2.1) [Active]

   STEP 4: Keep BLUE warm for 1 hour
   STEP 5: After 1 hour, tear down BLUE
   ```

3. **Smoke Tests** (5 min)
   - Health endpoints respond
   - Database connectivity confirmed
   - Authentication flows working
   - Webhook delivery verified
   - API latency acceptable (<500ms)
   - No critical errors in logs

4. **Monitoring Activation** (2 min)
   - Datadog dashboards active
   - CloudWatch alarms enabled
   - PagerDuty alerts activated
   - On-call team notified

5. **Post-Deployment Check** (3 min)
   - Verify all metrics normal
   - Check user-facing features working
   - Confirm background jobs progressing
   - Monitor error logs for anomalies

**Deployment Timeline**:

```
T+0:00  Start pre-deployment validation
T+0:05  Pre-checks complete, start deployment
T+0:13  New version deployed to GREEN
T+0:15  Health checks pass
T+0:21  Traffic switched to GREEN
T+0:26  Smoke tests pass
T+0:30  Monitoring active, release complete
```

### Phase 5: Production Monitoring (24/7)

**Responsibility**: On-call team

**Ongoing Checks**:

- Error rates remain <0.5%
- Latency remains <500ms p99
- Database health nominal
- No critical alerts triggered
- User reports monitored

**Duration**: 24 hours post-deployment (critical watch period)

**On Issues**:

1. Alert triggered
2. On-call engineer notified
3. If critical: execute rollback (see Rollback section)
4. Create incident ticket
5. Schedule post-mortem

## Rollback Procedures

See [ROLLBACK_PROCEDURES.md](./ROLLBACK_PROCEDURES.md) for detailed rollback steps.

## Step 11 Operational Runbooks

Use these runbooks to execute production launch and operations handoff:

- [PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md)
- [FEATURE_FLAG_PLAYBOOK.md](./FEATURE_FLAG_PLAYBOOK.md)
- [SUPPORT_READINESS.md](./SUPPORT_READINESS.md)
- [SLO_SLA_POLICY.md](./SLO_SLA_POLICY.md)

### Quick Rollback (Emergency)

**When**: Critical issue in production immediately after deployment

**Who**: On-call engineer (no approval needed)

**Time**: <2 minutes

```bash
# Trigger rollback workflow
gh workflow run rollback-production.yml \
  --ref main \
  -f rollback_reason="Critical: 50% error rate detected"
```

### Planned Rollback (Planned)

**When**: Non-critical issue requiring reverting multiple commits

**Who**: Engineering Lead approval required

**Time**: 5-10 minutes

1. Identify target version to revert to
2. Request approval from engineering lead
3. Trigger rollback workflow with version
4. Post-mortem scheduled within 24 hours

## Version Numbering

FlowDB uses **semantic versioning**: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking API changes, major features
- **MINOR**: New features, enhancements
- **PATCH**: Bug fixes, security patches

Example releases:

- `1.0.0` - Initial production release
- `1.1.0` - Add webhook retries
- `1.1.1` - Fix auth token expiry edge case
- `1.2.0` - Add request ID tracing
- `2.0.0` - New database model (breaking)

## Release Window

**Preferred Release Windows**:

- Tuesday - Thursday, 9am - 4pm (PT)
- Avoid Friday deployments (no coverage next day)
- Avoid 11:30am - 1:30pm (lunch coverage gap)
- Avoid holiday weeks

**Emergency Deployments**:

- Available 24/7 for critical security patches
- On-call team approval sufficient
- Post-mortem scheduled next business day

## Release Checklist

Before triggering production deployment:

- [ ] All CI/CD gates passed on main
- [ ] Canary deployment healthy for 15+ minutes
- [ ] Change ticket approved (if required)
- [ ] On-call team standing by
- [ ] Rollback plan documented
- [ ] Release notes prepared
- [ ] Customer communication drafted
- [ ] Database migrations tested (if applicable)
- [ ] Feature flags configured (if applicable)
- [ ] Monitoring dashboards ready

## Release Communication

### Before Release

- Notify customers (if impactful)
- Update status page
- Brief support team on changes

### During Release

- Live in #engineering-releases channel
- Post status updates every 5 minutes
- 30-second window before cutover

### After Release

- Release notes published
- Team sync on any issues
- Customer announcement (if applicable)
- Post-mortem if issues occurred

## Deployment Frequency

**Target**: 1-2 releases per week

**Metrics Tracked**:

- Lead time from commit to production
- Deployment frequency
- Change failure rate
- Mean time to recovery (MTTR)

## Emergency Procedures

See [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) for emergency procedures.

---

**Last Updated**: April 2024  
**Owner**: DevOps Team  
**Review Cycle**: Quarterly
