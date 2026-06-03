# SLO and SLA Policy

This policy defines production reliability objectives and external service commitments for FlowDB.

## Service Level Objectives (SLO)

### API Availability

- Objective: 99.5% monthly availability.
- Measurement: successful requests / total requests from edge metrics.

### API Latency

- Objective: P99 less than 500ms.
- Measurement window: rolling 5-minute intervals.

### Error Rate

- Objective: less than 0.5% non-4xx failures.
- Alert threshold: greater than 2% for 5 minutes.

### Webhook Reliability

- Objective: 99.5% successful processing.
- Alert threshold: less than 95% success over 10 minutes.

## Error Budget Policy

- Monthly error budget is derived from availability SLO.
- If consumed above 50%, feature rollout pace is reduced.
- If consumed above 75%, only reliability and security changes are allowed.

## Service Level Agreement (SLA)

### Support Response Targets

- Sev-1: first response in 15 minutes.
- Sev-2: first response in 1 hour.
- Sev-3: first response in 1 business day.

### Communication

- Incident updates posted at defined severity cadence.
- Post-incident summary shared after resolution.

## Reporting Cadence

- Weekly internal reliability review.
- Monthly SLO/SLA summary distributed to stakeholders.
- Quarterly policy review and threshold recalibration.

## Exceptions

Planned maintenance windows are excluded from SLA calculations when announced in advance.

## Ownership

- SRE owns SLO definitions and alert thresholds.
- Support owns SLA communication process.
- Engineering leadership owns escalation governance.
