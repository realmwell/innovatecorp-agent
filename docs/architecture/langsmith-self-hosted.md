# Self-Hosted LangSmith Platform Architecture on AWS

## 1. Overview

This document describes the architecture for deploying the LangSmith Platform in InnovateCorp's AWS environment. LangSmith is LangChain's observability and evaluation platform -- it captures traces from LLM applications, stores them for analysis, and provides a UI for debugging, evaluating, and monitoring production AI systems.

Self-hosting gives InnovateCorp full control over data residency, network isolation, and compliance with internal security policies. All trace data (which may contain PII or sensitive business context) stays within InnovateCorp's VPC.

**Deployment method**: Helm chart from [langchain-ai/helm](https://github.com/langchain-ai/helm) on Amazon EKS.
**License**: Requires an Enterprise license key from LangChain (sales@langchain.dev).

---

## 2. LangSmith Platform Components

LangSmith is a multi-service application. Each service has a distinct role and scaling profile.

### 2.1 Application Services

| Service | Role | Replicas | Scaling |
|---------|------|----------|---------|
| **langsmith-frontend** | Nginx reverse proxy: serves the React UI and routes API requests to backend services. The only service exposed externally via the load balancer. | 2 | HPA on CPU |
| **langsmith-backend** | Core API server: handles CRUD operations for projects, datasets, annotations, and user management. Serves the REST API that the UI calls. | 2+ | HPA on CPU/memory |
| **langsmith-platform-backend** | High-throughput trace ingestion service: receives trace data from instrumented applications via the LangSmith SDK. Also handles authentication and API key validation. This is the highest-traffic service. | 3+ | HPA on request rate |
| **langsmith-queue** | Async worker: processes background jobs like trace indexing, feedback aggregation, and evaluation runs. Pulls work from Redis queues. | 2+ | HPA on queue depth |
| **langsmith-playground** | Proxy service for the LLM Playground feature: forwards API requests to configured LLM providers (Bedrock, OpenAI, etc.) so users can test prompts from the UI. | 1 | Fixed (low traffic) |
| **langsmith-ace-backend** | Secure code execution engine: runs user-defined evaluator code in sandboxed environments. Isolated from other services for security. | 1-2 | Fixed, resource-limited |

### 2.2 Data Services

| Service | AWS Managed Service | Role | Sizing |
|---------|-------------------|------|--------|
| **PostgreSQL** | Amazon RDS PostgreSQL (Multi-AZ) | Stores users, organizations, projects, datasets, API keys, and evaluation metadata. Low-write, moderate-read workload. | db.r6g.large (production) |
| **ClickHouse** | Self-managed on EKS (dedicated node) | High-volume columnar store for traces, spans, and feedback records. This is where all observability data lives. Optimized for append-heavy writes and analytical reads. | r5.xlarge node, gp3 SSD EBS (500GB+) |
| **Redis** | Amazon ElastiCache Redis (cluster mode) | Caching layer and job queue broker. Caches frequently accessed metadata, manages rate limiting, and serves as the message queue for langsmith-queue workers. | cache.r6g.large |
| **Blob Storage** | Amazon S3 | Stores trace attachments, large payloads, evaluation artifacts, and dataset files. Versioned with lifecycle policies. | Standard tier, versioned |

---

## 3. AWS Infrastructure Architecture

### 3.1 Network Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  VPC: 10.0.0.0/16                                               │
│                                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │  Public Subnets (2 AZs)  │  │  Private Subnets (2 AZs)     │ │
│  │                          │  │                                │ │
│  │  ALB (internet-facing)   │  │  EKS Worker Nodes             │ │
│  │  NAT Gateways            │  │  RDS PostgreSQL (Multi-AZ)    │ │
│  │                          │  │  ElastiCache Redis             │ │
│  │                          │  │  ClickHouse (dedicated node)   │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                   │
│  S3 Bucket (blob storage) ── accessed via VPC Gateway Endpoint   │
│  Secrets Manager ── license key, DB credentials, Redis auth      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Mapping

| AWS Service | Purpose | Configuration |
|-------------|---------|---------------|
| **Amazon EKS** | Kubernetes orchestration for all LangSmith services | Managed node groups, m5.xlarge (general), r5.xlarge (ClickHouse) |
| **Application Load Balancer** | HTTPS termination, routes external traffic to langsmith-frontend | ACM certificate, WAF optional |
| **Amazon RDS PostgreSQL** | Managed PostgreSQL with automated backups and failover | Multi-AZ, db.r6g.large, encrypted at rest |
| **Amazon ElastiCache** | Managed Redis for caching and queueing | Cluster mode enabled, encryption in transit |
| **Amazon S3** | Blob storage for trace artifacts | Versioned, SSE-S3 encryption, lifecycle policies (archive after 90 days) |
| **Route 53** | DNS management | Private hosted zone for internal resolution, public for UI access |
| **ACM** | TLS certificates | Auto-renewed certificates for ALB |
| **Secrets Manager** | Secrets storage | License key, database credentials, Redis auth token |
| **CloudWatch** | Monitoring and alerting | Container Insights for EKS, custom metrics for queue depth |
| **IAM (IRSA)** | Pod-level permissions | Service accounts with least-privilege S3 access |

### 3.3 Security

- **Network isolation**: All application and data services run in private subnets. Only the ALB sits in public subnets.
- **Encryption**: TLS in transit (ALB → pods via service mesh or ALB target group HTTPS). Encryption at rest for RDS, ElastiCache, S3, and EBS volumes.
- **IRSA (IAM Roles for Service Accounts)**: Each pod gets an IAM role scoped to only the AWS resources it needs. The frontend pods get no AWS permissions. Backend pods get S3 read/write. No shared AWS credentials.
- **Secrets**: All sensitive configuration (license key, database passwords, Redis auth) stored in AWS Secrets Manager and injected as Kubernetes secrets via External Secrets Operator.
- **Network Policies**: Kubernetes NetworkPolicies restrict pod-to-pod traffic. For example, langsmith-ace-backend (code execution) cannot reach the internet or other services except its designated endpoints.

---

## 4. Scaling Strategy

LangSmith's services fall into two scaling categories:

### 4.1 Horizontal Scaling (Stateless Services)

These services store no local state and can be replicated freely:

| Service | Scale Trigger | HPA Config |
|---------|--------------|------------|
| langsmith-frontend | CPU > 70% | min: 2, max: 6 |
| langsmith-backend | CPU > 70% or p95 latency > 500ms | min: 2, max: 8 |
| langsmith-platform-backend | Request rate or CPU > 60% | min: 3, max: 12 |
| langsmith-queue | Queue depth > 1000 messages | min: 2, max: 10 |

The **platform-backend** is the most scale-sensitive service. During peak agent execution (e.g., batch evaluation runs sending thousands of traces), this service handles all inbound trace data. Auto-scaling based on request rate keeps ingestion latency low.

### 4.2 Vertical Scaling (Stateful Services)

These services require larger instances rather than more replicas:

| Service | Scale Approach | When to Scale |
|---------|---------------|---------------|
| ClickHouse | Instance resize (r5.xlarge → r5.2xlarge → r5.4xlarge) + EBS volume expansion | Query latency increases, disk usage > 70% |
| RDS PostgreSQL | Instance resize + read replicas for read-heavy queries | Connection count high, CPU sustained > 80% |
| ElastiCache Redis | Node type upgrade or add shards | Memory usage > 75%, eviction rate increases |

### 4.3 Capacity Planning

For InnovateCorp's expected workload (team of 20 developers, ~50K traces/day):

- **EKS**: 3 m5.xlarge nodes (general workloads) + 1 r5.xlarge (ClickHouse)
- **RDS**: db.r6g.large (2 vCPU, 16 GB RAM) is sufficient to start
- **ElastiCache**: cache.r6g.large single node
- **S3**: Standard tier, expect ~10 GB/month growth for trace artifacts
- **ClickHouse disk**: 500 GB gp3 with room to expand; traces compress well in columnar format

---

## 5. Deployment

### 5.1 Helm Chart

LangSmith ships as a Helm chart maintained at `langchain-ai/helm`. Deployment steps:

```bash
# 1. Add the LangChain Helm repository
helm repo add langchain https://langchain-ai.github.io/helm/
helm repo update

# 2. Create namespace
kubectl create namespace langsmith

# 3. Create secrets (license key, DB credentials)
kubectl create secret generic langsmith-secrets \
  --namespace langsmith \
  --from-literal=license-key=$LANGSMITH_LICENSE_KEY \
  --from-literal=postgres-url=$POSTGRES_CONNECTION_STRING \
  --from-literal=redis-url=$REDIS_CONNECTION_STRING

# 4. Install with custom values
helm install langsmith langchain/langsmith \
  --namespace langsmith \
  --values values-production.yaml
```

### 5.2 Key values-production.yaml Settings

```yaml
# External access
ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
  host: langsmith.innovatecorp.com

# Storage backends
postgres:
  external: true
  connectionUrl:
    secretName: langsmith-secrets
    secretKey: postgres-url

redis:
  external: true
  connectionUrl:
    secretName: langsmith-secrets
    secretKey: redis-url

clickhouse:
  persistence:
    enabled: true
    storageClass: gp3
    size: 500Gi

blobStorage:
  type: s3
  s3:
    bucketName: innovatecorp-langsmith-artifacts
    region: us-east-1
    # Uses IRSA — no access keys needed

# Scaling
platformBackend:
  replicas: 3
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "2"
      memory: "4Gi"
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 12
    targetCPUUtilizationPercentage: 60

queue:
  replicas: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
```

---

## 6. Monitoring and Alerting

### 6.1 CloudWatch Integration

- **Container Insights**: Enabled on EKS for CPU, memory, network, and disk metrics per pod
- **RDS Enhanced Monitoring**: OS-level metrics at 15-second granularity
- **ElastiCache Metrics**: Memory usage, cache hit ratio, eviction rate

### 6.2 Key Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| Trace ingestion lag | Queue depth > 5000 for 5 min | Scale queue workers, investigate platform-backend |
| ClickHouse disk | Usage > 80% | Expand EBS volume |
| RDS connections | Active connections > 80% of max | Review connection pooling, consider PgBouncer |
| Platform-backend errors | 5xx rate > 1% for 5 min | Check logs, verify Bedrock/LLM connectivity |
| Certificate expiry | < 30 days to renewal | ACM auto-renews, but alert as safety net |

### 6.3 LangSmith's Own Observability

LangSmith traces its own operations. The platform-backend service emits internal metrics on:
- Trace ingestion throughput (traces/second)
- Evaluation execution time
- Dataset operation latency

These metrics are available in the LangSmith admin UI and can be exported to CloudWatch via a sidecar Prometheus exporter.

---

## 7. Disaster Recovery

| Component | Backup Strategy | RPO | RTO |
|-----------|----------------|-----|-----|
| RDS PostgreSQL | Automated daily snapshots + continuous WAL archiving to S3 | 5 minutes (point-in-time recovery) | < 30 minutes (failover to standby) |
| ClickHouse | Daily EBS snapshots + incremental backups to S3 | 24 hours | 1-2 hours (restore from snapshot) |
| Redis | ElastiCache automatic backups | Best-effort (cache can be rebuilt) | Minutes (restore from backup or cold start) |
| S3 | Cross-region replication + versioning | Near-zero (async replication) | Minutes (switch to replica bucket) |
| EKS | Infrastructure as code (Terraform/CDK). Stateless — redeploy from Helm. | N/A (stateless) | 15-30 minutes (full redeploy) |

---

## 8. Cost Estimate (Monthly)

For InnovateCorp's initial deployment (20 developers, ~50K traces/day):

| Resource | Specification | Estimated Cost |
|----------|--------------|----------------|
| EKS Control Plane | 1 cluster | $73 |
| EC2 (3x m5.xlarge) | General workload nodes | ~$420 |
| EC2 (1x r5.xlarge) | ClickHouse dedicated | ~$180 |
| RDS PostgreSQL | db.r6g.large Multi-AZ | ~$350 |
| ElastiCache Redis | cache.r6g.large | ~$200 |
| S3 | ~50 GB + requests | ~$5 |
| ALB | 1 load balancer + LCUs | ~$30 |
| NAT Gateway | 2 (one per AZ) | ~$90 |
| CloudWatch | Container Insights + logs | ~$50 |
| **Total** | | **~$1,400/month** |

This scales roughly linearly with trace volume. Doubling to 100K traces/day would increase ClickHouse storage costs and require scaling platform-backend replicas, adding approximately $200-400/month.

---

## 9. Migration Path

For InnovateCorp, we recommend a phased approach:

1. **Phase 1 (Now)**: Use LangSmith Cloud (smith.langchain.com) for development and evaluation. Zero infrastructure overhead. This is what we're using today.

2. **Phase 2 (Production readiness)**: Deploy self-hosted LangSmith on EKS using this architecture. Migrate datasets and evaluation configurations. Point agent tracing to the internal endpoint.

3. **Phase 3 (Scale)**: Enable auto-scaling policies, add read replicas for RDS if query patterns demand it, expand ClickHouse storage as trace history grows.

The transition from Cloud to self-hosted requires changing one environment variable in the agent configuration:
```
LANGCHAIN_ENDPOINT=https://langsmith.innovatecorp.com
```

All SDK calls, datasets, and evaluator code work identically against both Cloud and self-hosted endpoints.
