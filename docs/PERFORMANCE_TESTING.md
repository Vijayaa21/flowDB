# Performance Testing

This document outlines the performance testing strategy for FlowDB, including baseline metrics, test procedures, and success criteria.

## Performance Targets

### Production SLOs (Service Level Objectives)

```
API Latency:
  P50: < 100ms
  P99: < 500ms
  P99.9: < 1000ms

Error Rate: < 0.5%

Availability: > 99.5% (monthly)

Webhook Delivery: > 99.5% success

Database Query Performance:
  P99: < 200ms for standard queries
  P99: < 500ms for complex queries
```

### Degradation Thresholds

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| P99 Latency | < 500ms | 500-1000ms | > 1000ms |
| Error Rate | < 0.5% | 0.5-2% | > 2% |
| Webhook Success | > 99.5% | 95-99.5% | < 95% |
| Database Errors | 0-5/hr | 5-20/hr | > 20/hr |

## Test Types

### 1. Load Testing

**Purpose**: Validate performance under realistic sustained load

**Parameters**:
- Connections: 100-500 concurrent users
- Duration: 30-120 seconds
- Request rate: 100-500 RPS (requests/second)
- Endpoints: Mixed (health, metrics, branch operations, webhooks)

**Success Criteria**:
- P99 latency < 500ms
- Error rate < 0.5%
- Zero timeouts
- No memory growth > 10%

**Running Baseline Load Test**:
```bash
cd packages/load-tester
npm run load-test

# Expected output:
# ✅ Baseline Load Test
#    Throughput: 450 req/s
#    P99 Latency: 320ms ✓
#    Error Rate: 0.0% ✓
```

### 2. Spike Testing

**Purpose**: Validate system behavior under sudden 10x traffic increase

**Parameters**:
- Connections: 500-1000 concurrent
- Duration: 30 seconds
- Request rate: 1000+ RPS
- Focus: API responsiveness, graceful degradation

**Success Criteria**:
- P99 latency < 1000ms (vs 500ms baseline)
- Error rate < 2% (vs 0.5% baseline)
- Auto-scaling triggered (if applicable)
- No cascading failures

**Test Procedure**:
```bash
npm run load-test -- --spike

# Observe:
# 1. System remains responsive
# 2. Queue depths increase but flush
# 3. No 503 Service Unavailable responses
# 4. Recovery to baseline within 5 min
```

### 3. Soak Testing

**Purpose**: Detect memory leaks, connection pool exhaustion, resource degradation

**Parameters**:
- Connections: 100-200 concurrent
- Duration: 4-24 hours
- Request rate: 50-100 RPS  
- Monitoring: Memory, CPU, disk I/O trends

**Success Criteria**:
- Memory growth < 5% over test duration
- Error rate stable at < 0.5%
- No slowdown in latency percentiles
- Database connections return to baseline

**Soak Test Variants**:

#### Quick Soak (1 hour)
```bash
npm run soak-test -- quick
# Daily verification before production release
```

#### Morning Soak (4 hours)
```bash
npm run soak-test -- morning
# Run overnight, verify before business hours
```

#### Extended Soak (24 hours)
```bash
npm run soak-test -- extended
# Pre-production certification
# Run on staging environment
```

**Interpreting Results**:
```
✅ Memory stable (< 2% growth)     → System healthy
⚠️  Memory grows 5-10%               → Possible leak, observe more
❌ Memory grows > 10%                → Investigate memory leak
```

### 4. Stress Testing

**Purpose**: Determine maximum sustainable load and breaking points

**Parameters**:
- Connections: 5000+ concurrent
- Duration: 60+ seconds
- Request rate: Unbounded
- Endpoints: All critical paths

**When to Run**:
- Before major version releases
- After infrastructure changes
- After capacity increase claims
- NOT in production

**Expected Behavior**:
```
Connections → 1000    RPS ↑ to peak
Connections → 2000    RPS stable
Connections → 5000    RPS drops (saturation)
Connections → 10000   Errors appear, P99 latency spikes
```

**Interpreting Stress Test**:
```
Saturation Point: ~5000 concurrent = system max capacity
Max Throughput: ~2000 RPS at saturation
Graceful Degradation: Errors appear before crash
Recovery: Full recovery within 30 seconds of load drop
```

## Baseline Metrics

### Established Baselines (Post-Step 9)

**Health Check Endpoint**:
```
GET /health
Response Time: 5-10ms
Throughput: 10000 RPS
Error Rate: 0%
```

**Metrics Endpoint**:
```
GET /metrics
Response Time: 20-50ms
Throughput: 5000 RPS  
Size: ~2KB
```

**Branch List Endpoint**:
```
GET /branches
Response Time: 50-200ms (varies with branch count)
Throughput: 1000 RPS
DB Query Time: 40-180ms
```

**Branch Create Endpoint**:
```
POST /branches
Response Time: 2000-5000ms (fork operation)
Throughput: 100 RPS
DB Intensive: Yes
```

## Running Performance Tests

### Daily Load Test

```bash
# Quick validation before release
cd packages/load-tester
npm run load-test

# This runs:
# 1. Baseline (30s, 100 conns)
# 2. Sustained (120s, 200 conns)  
# 3. Spike (30s, 1000 conns)

# Expected: All tests PASS, P99 < 500ms
```

### Pre-Deployment Certification

```bash
# Required before production release
# Run on staging environment

# 1. Start orchestrator and dashboard
npm start

# 2. Wait 2 minutes for warmup
sleep 120

# 3. Run full test suite
cd packages/load-tester
npm run soak-test -- morning  # 4 hours
npm run load-test -- with-stress  # Add stress variant

# 4. Verify all tests pass
# 5. Review metrics dashboard
```

### Post-Deployment Validation

```bash
# Run within 30 minutes of production deployment
# Verify characteristics match pre-deployment baseline

npm run load-test --environment production

# Compare:
# - P99 latency (should match ±10%)
# - Throughput (should match ±5%)
# - Error rate (should be < 0.5%)
```

## Monitoring During Performance Tests

### Key Metrics to Watch

**Real-time Dashboard**:
```
URL: http://localhost:3000/metrics

Refresh: Every 5 seconds during test

Watch for:
- Error rate spike
- Latency percentile climb
- Connection pool saturation
- Memory growth
- Garbage collection pauses
```

**System-level Monitoring**:
```bash
# In separate terminal
watch -n 1 'ps aux | grep orchestrator | head -1'
# Watch: CPU %, Memory %

top -p <orchestrator-pid>
# Watch: Thread count, memory growth
```

**Database Monitoring**:
```bash
# Check active connections
psql $DATABASE_URL -c "
  SELECT count(*) as active_connections
  FROM pg_stat_activity;"

# Watch for: Connection pool max-out
```

## Performance Tuning

### What to Optimize

**If P99 Latency High (> 500ms)**:
1. Check database query performance (slow query log)
2. Review application code for sync operations
3. Check for N+1 queries
4. Verify connection pool is sizing correctly
5. Consider caching frequently accessed data

**If Error Rate High (> 0.5%)**:
1. Check application logs for error patterns
2. Review database connection exhaustion
3. Check rate limiting (too aggressive?)
4. Verify webhook retry logic
5. Monitor third-party service availability

**If Memory Growing (> 5%)**:
1. Heap profiling to find leaks
2. Review cache invalidation logic
3. Check for growing data structures
4. Verify event listeners are cleaned up
5. Monitor Node.js garbage collection

### Tools & Commands

**Heap Profile (Node.js)**:
```bash
# Enable inspection
node --inspect app.js

# In browser, navigate to chrome://inspect
# Take heap snapshots at:
# 1. Start of soak test
# 2. After 1 hour
# 3. End of test
# Compare for growth
```

**Database Query Analysis**:
```bash
# Find slow queries
psql $DATABASE_URL -c "
  SELECT query, calls, mean_time
  FROM pg_stat_statements
  WHERE mean_time > 100
  ORDER BY mean_time DESC
  LIMIT 10;"

# Enable EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT * FROM branches WHERE user_id = $1;
```

**Application Profiling**:
```bash
# Using autocannon to identify slow endpoints
npm run load-test -- --output-format json > results.json

# Analyze by path
jq '.requests | group_by(.path) | map({
  path: .[0].path,
  avgTime: (map(.latency) | add / length)
})' results.json
```

## Release Gates

### Pre-Canary Gate
- [ ] Baseline load test passes (P99 < 500ms)
- [ ] Spike test passes (P99 < 1000ms)
- [ ] Error rate < 0.5%

### Pre-Production Gate
- [ ] Morning soak test (4 hours) passes
- [ ] All performance targets met
- [ ] Memory growth < 5%
- [ ] No new slow queries introduced

### Post-Deployment Gate
- [ ] Production metrics match staging baseline ±10%
- [ ] Error rate normal (< 0.5%)
- [ ] No performance regression detected

## Benchmarking Against Previous Releases

**Tracking Performance Trends**:
```
Version | P99 Latency | Throughput | Error Rate | Memory (avg)
--------|-------------|------------|------------|-------------
1.0.0   | 250ms       | 1200 RPS   | 0.1%       | 45MB
1.1.0   | 320ms       | 1100 RPS   | 0.2%       | 52MB  ← 15% slower
1.2.0   | 280ms       | 1250 RPS   | 0.1%       | 48MB  ← Optimized
```

**Regression Definition**:
- P99 latency increase > 20%
- Throughput decrease > 10%
- Error rate increase > 50%
- Memory growth > 15%

If regression detected, investigate before release.

## Performance Budget

**API Response Budget** (Time available per request):
```
User perceives action: 100ms
Browser RTT (network): 30ms
Server processing budget: 70ms
  ├─ Middleware: 5ms
  ├─ Route handler: 40ms
  ├─ Database query: 20ms
  ├─ Response assembly: 5ms
```

**Exceeding budget**:
- P99 latency > 500ms = violates SLO
- Requires investigation and optimization

## Emergency Performance Response

**If P99 Latency > 1000ms in Production**:
1. Check current error rate
2. Review recent deployments
3. Check database connection status
4. If critical: Execute rollback
5. Investigate root cause post-incident

---

**Last Updated**: April 2024  
**Owner**: Performance Team  
**Test Plan Review**: Quarterly
