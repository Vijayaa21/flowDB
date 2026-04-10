# Rollback Procedures

This document defines detailed procedures for rolling back FlowDB deployments in production.

## Rollback Authority

**Who can authorize rollback**:
- ✓ On-call engineer (emergency rollback, <1 minute approved)
- ✓ Engineering lead
- ✓ DevOps lead
- ✓ VP Engineering
- ✓ CTO

**Emergency vs Planned**:
- **Emergency** (<30 min old deployment): On-call alone
- **Planned** (>30 min): Requires engineering lead approval

## Rollback Triggers

### Automatic Rollback

**Trigger 1: Canary Failure**
- Canary error rate exceeds 2% (vs 0.5% target)
- Canary p99 latency exceeds 2000ms (vs 500ms target)
- Webhook delivery drops below 95%
- Database connectivity lost
→ Action: Auto-revert canary, alert ops team

**Trigger 2: Production Smoke Test Failure**
- Any smoke test fails post-deployment
- Health endpoint unreachable
- Database queries timing out
- Authentication broken
→ Action: Auto-rollback to previous version, page on-call

**Trigger 3: Critical Error Rate**
- Production error rate exceeds 5% continuously for 2+ minutes
- 500 errors appear in logs
- Database deadlocks detected
→ Action: Page on-call, await manual approval for rollback

### Manual Rollback

**Trigger 1: Unexpected Behavior**
- User reports broken functionality
- Unexpected API behavior discovered
- Feature not working as expected

**Trigger 2: Performance Degradation**
- API latency spike >1000ms sustained
- Database query performance worse than baseline
- Background jobs mysteriously slow

**Trigger 3: Data Integrity Issues**
- Unexpected data state detected
- Webhook delivery anomalies
- Authentication failures for users

**Trigger 4: Business Decision**
- Launch date changed, rollback prepared version
- Feature flag not working, rollback implementation

## Emergency Rollback (≤2 minutes)

**When**: Critical production issue, immediate user impact

**Authority**: On-call engineer (no approval needed for <30 min old deployment)

### Step 1: Declare Emergency (10 seconds)
```bash
# Alert team
slack @engineering-leads "EMERGENCY ROLLBACK INITIATED: [reason]"
```

### Step 2: Trigger Rollback (20 seconds)
```bash
# Get current deployed version
ssh prod-api-01 'cat /etc/flowdb/VERSION'
# Output: 1.2.3 (deployed 2 min ago)

# Find previous stable version
git log --oneline -n 5 | grep "deployed"
# Output:
# abc1234 deployed v1.2.2 (2 hours ago) ← target
# def5678 deployed v1.2.3 (2 min ago)

# Trigger rollback workflow
gh workflow run rollback-production.yml \
  --ref main \
  -f rollback_reason="EMERGENCY: 45% error rate spike" \
  -f target_version="v1.2.2"
```

### Step 3: Verify Rollback (60 seconds)
```bash
# Check that previous version is active
curl -s https://api.flowdb.dev/health | jq '.version'
# Should return: v1.2.2

# Check error rate dropping
curl -s https://api.flowdb.dev/metrics | jq '.error_rate'
# Should be returning to <0.5%

# Verify database health
curl -s https://api.flowdb.dev/health | jq '.database'
# Should be: "connected"
```

### Step 4: Notify Team (30 seconds)
```bash
# Update Slack
slack @engineering-leads "ROLLBACK COMPLETE: v1.2.3 → v1.2.2"
slack @engineering-leads "Status: Error rate normalized, no user action needed"

# Update incident ticket
echo "Rolled back due to 45% error rate spike"
echo "Time to rollback: 1:45"
echo "Impact: ~2 minutes of degraded service"
```

### Timeline
```
T+00:00 Error detected
T+00:30 Slack alert sent
T+00:45 On-call acknowledges
T+01:00 Rollback triggered
T+01:45 Rollback complete
T+02:00 Verification complete
```

## Planned Rollback (5-15 minutes)

**When**: Non-critical issue, requires approval, time available

**Authority**: Engineering Lead approval required

### Step 1: Assess Situation (2 min)

**Gather Information**:
- What is the exact issue?
- How many users affected?
- Is it a data loss risk? (abort rollback if yes)
- Has issue been isolated to this deployment?

**Decision Tree**:
```
Issue detected
├─ Affecting users? 
│  ├─ Yes + Data at risk? → **ABORT** (get DBA)
│  ├─ Yes + No data risk? → Emergency rollback (1 min)
│  └─ No → Planned rollback (5 min)
└─ Likely from this deployment?
   ├─ Yes → Proceed with rollback
   └─ No → Investigate, don't rollback (avoid masking root cause)
```

### Step 2: Request Approval (1 min)

```bash
# Notify engineering lead
slack @engineering-lead-on-call \
  "Requesting approval for rollback:
   Issue: Search feature returning wrong results
   Impact: 150 active users affected
   Target: Revert to v1.2.2 (deployed 1 hour ago)
   Reason: Elasticsearch mapping issue in v1.2.3"
```

**Approval Response**: Engineering lead must respond within 2 minutes

```
Engineering Lead: ✅ Approved
Reasoning: Issue confirmed in new search code, 
user context preserved in database, safe to rollback
```

### Step 3: Execute Rollback (2 min)

```bash
# Create change ticket (if required)
gh issue create \
  --title "Planned Rollback: v1.2.3 → v1.2.2" \
  --body "See Slack thread for context" \
  --label rollback

# Trigger rollback
gh workflow run rollback-production.yml \
  --ref main \
  -f rollback_reason="Search regression: wrong results returned" \
  -f target_version="v1.2.2"

# Monitor logs
tail -f /var/log/flowdb/orchestrator.log | grep -E "version|switched|load"
```

### Step 4: Verify & Monitor (5 min)

```bash
# Verify version switched
curl https://api.flowdb.dev/health | jq '.version'
# Should show: v1.2.2

# Run quick tests
curl -X POST https://api.flowdb.dev/search \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"q": "test query"}' | jq '.results | length'
# Should return correct count

# Monitor metrics for next 5 minutes
watch -n 1 'curl -s https://api.flowdb.dev/metrics | \
  jq "{errors: .error_count, latency: .p99_latency}"'
```

### Step 5: Notify Stakeholders (2 min)

```bash
# Slack notification
slack #engineering-releases \
  "✅ Rollback complete: v1.2.3 → v1.2.2
   Reason: Search results regression
   Time to rollback: 5 min
   Status: Normal operations resumed"

# Notify support
slack #support "Rollback complete. Search should work normally now."

# Create post-mortem ticket
gh issue create \
  --title "Post-mortem: Search regression in v1.2.3" \
  --body "See incident analysis for root cause"
  --label incident
```

## Data-Aware Rollback

**Critical**: If data changes made, rollback must preserve data integrity.

### When Data was Changed

**Example**: v1.2.3 enabled webhook auto-queue feature

**Process**:
1. DO NOT rollback code if webhooks were processed
2. Instead:
   - Roll back to previous code version
   - Verify webhook state in database
   - Manually reconcile if needed
   - Document data state

**Check for Data Changes**:
```bash
# Query recent data modifications
psql $PROD_DATABASE_URL -c "
  SELECT table_name, 
         COUNT(*) as rows_modified,
         MAX(updated_at) as last_modified
  FROM audit_log
  WHERE updated_at > now() - interval '5 minutes'
  GROUP BY table_name
  ORDER BY rows_modified DESC;"
```

**Result**:
```
      table_name       | rows_modified |       last_modified        
-----------------------+---------------+----------------------------
 webhook_events        |        1,245  | 2024-04-10 15:32:10+00:00
 branch_metadata       |           43  | 2024-04-10 15:31:45+00:00
 api_requests          |       15,623  | 2024-04-10 15:32:50+00:00
```

**Action**:
- If only metrics/logs modified: Safe to rollback
- If core data modified: Consult DBA before rollback
- If data loss possible: ABORT rollback, fix in code

## Rollback Limitations

⚠️ **Cannot rollback**:
- Database schema changes (migrations are one-way)
- Data deletions (no way to restore)
- Breaking API changes to external clients

⚠️ **Be careful with**:
- Background jobs (may be partially complete)
- Cache state (may be stale after rollback)
- User sessions (may need to re-authenticate)

## Post-Rollback Steps

### Immediate (Within 1 hour)

1. **Notify Stakeholders**
   - Engineering team
   - Product team
   - Customer success
   - Support team

2. **Create Incident Ticket**
   - What went wrong
   - How it was detected
   - Recovery steps taken
   - Severity assessment

3. **Start Investigation**
   - Root cause analysis
   - Identify whether issue is preventable
   - Plan fix for next release

### Follow-up (Within 24 hours)

1. **Schedule Post-Mortem**
   - Invite on-call team, developers, ops
   - Review what happened
   - Identify action items
   - Assign owners

2. **Fix & Re-test**
   - Create fix branch from main
   - Add specific test for issue
   - Re-run full CI/CD gates
   - Submit for review

3. **Update Documentation**
   - Document failure pattern
   - Update monitoring thresholds if needed
   - Update runbooks if applicable

## Rollback Success Criteria

After rollback, verify these criteria are met:

```
✓ Service Health
  - API health endpoint returns 200
  - Database connectivity confirmed
  - All critical services responding
  
✓ Error Rates
  - Error rate < 0.5% (normal baseline)
  - No 500 errors in access logs
  - No critical alerts firing
  
✓ User Experience
  - API latency < 500ms p99
  - Webhooks delivering normally
  - No blocked user operations
  
✓ Data Integrity
  - Database consistent state
  - No data loss detected
  - Audit logs intact
  
✓ Communication
  - Status page updated
  - Team slack notified
  - Incident ticket created
```

## Common Rollback Scenarios

### Scenario 1: Memory Leak

**Detection**: OOM killer terminating processes every 30 min

**Rollback decision**: YES
- Previous version was stable for 8 hours
- No data modified
- Safe to rollback code

**Timeline**: 3 minutes

### Scenario 2: Webhook Processing Broken

**Detection**: Webhooks piling up, not being processed

**Rollback decision**: MAYBE
- Check: Were webhooks processed before rollback?
- If YES: Cannot rollback without manual reconciliation
- If NO: Safe to rollback, reprocess webhooks after

**Timeline**: 5-10 minutes + manual verification

### Scenario 3: Breaking API Change

**Detection**: Mobile app unable to authenticate

**Rollback decision**: YES (if live users affected)
- API change broke mobile app
- Can't ask all users to upgrade immediately  
- Rollback while new version in app stores

**Timeline**: 2-5 minutes

**Follow-up**: 
- Plan graceful API deprecation
- Provide migration path to new API
- Coordinate with mobile team

### Scenario 4: Database Schema Corruption

**Detection**: Database corruption errors in logs

**Rollback decision**: NO
- Cannot undo schema migrations
- Rollback code won't fix DDL changes
- Must maintain current schema, fix application logic

**Action**:
- DO NOT rollback
- Contact DBA immediately
- Prepare to repair database or restore from backup
- Create urgent fix for application

## Rollback Monitoring

After rollback, monitor these metrics for 24 hours:

```yaml
Critical Metrics:
  - Error Rate: < 0.5% (alarm: > 2%)
  - p99 Latency: < 500ms (alarm: > 1000ms)
  - Database Errors: baseline levels
  - Webhook Delivery: > 99.5%

Secondary Metrics:
  - CPU Usage: < 70%
  - Memory Usage: < 80%
  - Disk I/O: < 70%
  - Active Connections: normal range

Alarms:
  - Slack notifications every 5 minutes
  - PagerDuty escalation if critical
  - Status page updated
```

## Escalation Path

If rollback doesn't resolve issue:

```
1. On-call Engineer
   └─ Issue persists after rollback?
      └─ Escalate to Engineering Lead (5 min)

2. Engineering Lead  
   └─ Problem is pre-existing or environmental?
      └─ Escalate to VP Engineering (10 min)

3. VP Engineering
   └─ Major incident, may need all-hands?
      └─ Mobilize incident response team
```

---

**Last Updated**: April 2024  
**Owner**: DevOps Team  
**Review Cycle**: Quarterly  
**Last Tested**: [To be filled]
