# Infrastructure & Deployment Configuration

This document defines the infrastructure strategy for FlowDB deployments.

## Architecture Overview

```
Production Infrastructure
========================

                     ┌─────────────────────┐
                     │   CDN/CloudFlare    │
                     │   - DNS routing     │
                     │   - Cache           │
                     └──────────┬──────────┘
                                │
                     ┌──────────┴──────────┐
                     │   Load Balancer    │
                     │   (L7 routing)     │
                     └──────────┬──────────┘
         
         ┌───────────────────┬───────────────────┐
         │                   │                   │
    ┌────▼────┐         ┌────▼────┐        ┌────▼────┐
    │ BLUE    │         │ GREEN   │        │ CANARY  │
    │ Cluster │         │ Cluster │        │ Cluster │
    └────┬────┘         └────┬────┘        └────┬────┘
         │                   │                   │
    ┌────▼────┬────┐    ┌────▼────┬────┐   │
    │ API Pod │    │    │ API Pod │    │   │
    │ x3      │ WRK│    │ x3      │ WRK│   │
    └─────────┴────┘    └─────────┴────┘   │
         │                   │               │
         │    ┌──────────────┬───────────────┘
         │    │              │
         └────┼──────────────┼──────────────┐
              │              │              │
         ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
         │ PostgreSQL │  │ Monitoring  │ Secrets |
         │ Primary    │  │ & Logging   │ Manager │
         └───────────┘  └────────────┘ └─────────┘
```

## Infrastructure Components

### 1. Orchestrator (API)

**Deployment**:
- Container: Docker image (`ghcr.io/flowdb/orchestrator:latest`)
- Runtime: Bun 1.2.5
- Memory: 512MB min, 1GB max
- CPU: 500m min, 1000m max
- Instances: 3 per cluster (HA)

**Environment**:
```dockerfile
# Production secrets (injected at runtime)
SOURCE_DATABASE_URL=postgresql://...
AUTH_SECRET=<base64>
GITHUB_WEBHOOK_SECRET=<secret>
GITHUB_TOKEN=<token>
VERCEL_API_TOKEN=<token>
```

**Health Check**:
```
Endpoint: /health
Interval: 10 seconds
Timeout: 5 seconds
```

### 2. Dashboard (Frontend)

**Deployment**:
- Framework: Next.js 15.2.2
- Runtime: Node.js
- Build: Static + Server Components
- Memory: 256MB min, 512MB max
- CPU: 250m min, 500m max
- Instances: 2 (minimum)

**Build Process**:
```bash
# Requirements for production build
NEXT_PUBLIC_API_URL=https://api.flowdb.dev
NODE_ENV=production
GITHUB_CLIENT_ID=<configured>
GITHUB_CLIENT_SECRET=<injected>
AUTH_SECRET=<injected>
```

### 3. PostgreSQL Database

**Configuration**:
- Version: 16+
- Instance Class: db.r6i.xlarge (16GB RAM)
- Storage: 500GB SSD, auto-scaling
- Backups: Hourly (7-day retention)
- Read Replicas: 1 (for analytics/reporting)

**Performance Tuning**:
```sql
-- Connection pooling
max_connections = 500
idle_in_transaction_session_timeout = 15min

-- Query optimization
work_mem = 64MB
shared_buffers = 4GB
effective_cache_size = 12GB

-- Replication
wal_level = logical
max_wal_senders = 10
```

### 4. Load Balancer

**Type**: Kubernetes Service (if K8s) or AWS ALB

**Routing**:
- HTTPS termination (TLS 1.3)
- Path-based routing:
  - `/api/*` → Orchestrator
  - `/*` → Dashboard
- Health-based traffic steering

### 5. Secret Management

**Approach**: 
- Kubernetes Secrets for development
- AWS Secrets Manager for production
- Automatic rotation every 90 days

**Critical Secrets**:
```yaml
secrets:
  - name: SOURCE_DATABASE_URL
    type: database_connection
    required: true
  - name: AUTH_SECRET
    type: encryption_key
    required: true
    rotation: 90 days
  - name: GITHUB_WEBHOOK_SECRET
    type: api_token
    required: true
  - name: GITHUB_TOKEN
    type: api_token
    required: true
  - name: VERCEL_API_TOKEN
    type: api_token
    required: true
```

## Deployment Strategies

### Blue-Green Deployment

**Strategy**: Two identical production environments, switch traffic between them

**Benefits**:
- Zero-downtime deployments
- Easy rollback (just switch back)
- Time for validation before cutover

**Process**:
```
1. BLUE is active, handling all traffic
2. Deploy new version to GREEN
3. Run smoke tests on GREEN
4. Switch load balancer: BLUE → GREEN
5. Monitor for 5 minutes
6. Keep BLUE warm for 1 hour (rollback target)
7. Tear down BLUE after 1 hour
```

**Time to Deploy**: ~10 minutes
**Rollback Time**: <30 seconds

### Canary Deployment

**Strategy**: Route small % of traffic to new version, gradually increase

**Benefits**:
- Detect issues with real traffic
- Limited blast radius if problems
- Natural performance testing

**Traffic Schedule**:
```
T+00min: 5% canary traffic
T+05min: 10% canary traffic
T+10min: 25% canary traffic
T+15min: 50% canary traffic
T+20min: 100% canary traffic
```

**Automatic Rollback Triggers**:
- Error rate > 2% (vs 0.5% baseline)
- P99 latency > 1000ms (vs 500ms baseline)
- Webhook delivery < 95%

**Time to Deploy**: ~20 minutes total
**Time to Rollback**: <5 minutes

## Production Checklist

### Pre-Deployment (1 hour before)

- [ ] All CI/CD gates passing
- [ ] Canary deployment healthy
- [ ] Database backups current
- [ ] On-call team standing by
- [ ] Monitoring dashboards active
- [ ] Rollback plan documented
- [ ] Customer communication ready

### During Deployment (30 minutes window)

- [ ] Execute deployment
  - [ ] Blue-green traffic switch
  - [ ] Smoke tests on new environment
  - [ ] Verify health endpoints
  - [ ] Check error logs
- [ ] Monitor metrics
  - [ ] Error rate trending
  - [ ] Latency percentiles normal
  - [ ] Database performance baseline
- [ ] Validate business metrics
  - [ ] User signups working
  - [ ] Webhooks delivering
  - [ ] CLI operations functioning

### Post-Deployment (1 hour after)

- [ ] Production metrics normal
- [ ] No error spike detected
- [ ] Database queries performing well
- [ ] Support team confirms no issues
- [ ] Update status page
- [ ] Close deployment ticket

## Scaling Configuration

### Horizontal Scaling (Adding Instances)

**Trigger**:
- CPU > 70% for 5 minutes
- Memory > 80% for 5 minutes
- P99 latency > 700ms

**Scale Action**:
- Add 1 instance per trigger
- Max 10 instances per cluster
- Scale down after 30 minutes of normal metrics

### Vertical Scaling (Larger Instances)

**Trigger**:
- Consistent need for > 8 instances
- Single instance cannot handle peak load

**Action**:
- Increase instance size (double memory/CPU)
- Requires deployment of new cluster
- Keep previous cluster as fallback for 1 week

## Disaster Recovery

### Daily Backup

```bash
# Automated hourly
pg_dump $PROD_DB | gzip > s3://backups/db-$(date +%Y%m%d-%H%M%S).sql.gz

# Retention: 30 days
# RTO: < 4 hours
# RPO: < 1 hour
```

### Backup Verification

```bash
# Weekly test restore
restore_from_backup://latest
run_smoke_tests()
verify_data_integrity()
```

### Regional Failover

**If primary region fails**:
1. Trigger automated failover to secondary region
2. DNS updated (< 5 min propagation)
3. Secondary region becomes primary
4. RTO: ~10 minutes
5. Full regional recovery: ~24 hours

## Monitoring & Observability

### Key Metrics (Real-time Dashboard)

```yaml
Application Metrics:
  - Request rate (RPS)
  - Error rate (%)
  - Latency percentiles (p50, p99, p99.9)
  - Active connections
  - Webhook delivery rate

Infrastructure Metrics:
  - CPU utilization (%)
  - Memory utilization (%)
  - Disk I/O
  - Network throughput
  - Container restart count

Database Metrics:
  - Connection pool size
  - Query performance
  - Replication lag
  - Backup status
  - Disk usage
```

### Alert Rules

```yaml
Critical (Page On-Call):
  - Error rate > 5% for 2+ minutes
  - API response time p99 > 2 seconds
  - Database unavailable
  - Authentication failing for 10+ users

High Priority (Slack + Email):
  - Error rate > 2% for 5+ minutes
  - API response time p99 > 1 second
  - Memory usage > 90%
  - Disk usage > 80%

Medium Priority (Slack):
  - Certificate expiring in 7 days
  - Backup job failed
  - Database sync lag > 10 seconds
```

## Cost Optimization

**Target Monthly Cost Breakdown**:
- Compute (orchestrator): $1,200/month (3x servers)
- Compute (dashboard): $400/month (2x servers)
- Database (managed PostgreSQL): $1,500/month
- Storage (backups, logs): $300/month
- Networking: $200/month
- **Total**: ~$3,600/month

**Cost Reduction Opportunities**:
- Reserved instances (33% discount): Save $1,000/month
- Spot instances for staging: Save $300/month
- Log retention optimization: Save $100/month
- Unused resource cleanup: Save $200/month

---

**Last Updated**: April 2024  
**Owner**: DevOps Team  
**Review Cycle**: Quarterly
