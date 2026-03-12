# docs/diagrams/generate_diagrams.py
#
# Generates three architecture diagrams as PNG files using the
# Python `diagrams` library. These are version-controlled and
# can be regenerated as the architecture evolves.
#
# Usage:
#   cd docs/diagrams && python generate_diagrams.py
#
# Output:
#   1_langsmith_components.png
#   2_aws_deployment.png
#   3_agent_system.png

import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import EKS, EC2
from diagrams.aws.database import RDS, ElastiCache
from diagrams.aws.storage import S3
from diagrams.aws.network import ALB, Route53, VPC
from diagrams.aws.security import SecretsManager, ACM, IAMRole
from diagrams.aws.management import Cloudwatch
from diagrams.aws.ml import Sagemaker  # closest icon to Bedrock
from diagrams.onprem.database import ClickHouse
from diagrams.onprem.client import Users
from diagrams.onprem.queue import ActiveMQ  # stand-in for Redis queue
from diagrams.programming.language import Python
from diagrams.generic.compute import Rack
from diagrams.generic.database import SQL
from diagrams.generic.storage import Storage


# ─────────────────────────────────────────────────────────────────
# Diagram 1: LangSmith Component Architecture
# Shows the 6 application services and 4 data stores with
# internal communication flows.
# ─────────────────────────────────────────────────────────────────

with Diagram(
    "LangSmith Platform Components",
    filename="1_langsmith_components",
    show=False,
    direction="TB",
    graph_attr={"fontsize": "14", "pad": "0.5"},
):
    users = Users("Developers\n& Agents")

    with Cluster("LangSmith Platform"):

        with Cluster("Application Services"):
            frontend = Rack("langsmith-frontend\n(Nginx + React UI)")
            backend = Rack("langsmith-backend\n(CRUD API)")
            platform = Rack("langsmith-platform-backend\n(Trace Ingestion + Auth)")
            queue = Rack("langsmith-queue\n(Async Workers)")
            playground = Rack("langsmith-playground\n(LLM Proxy)")
            ace = Rack("langsmith-ace-backend\n(Code Execution)")

        with Cluster("Data Stores"):
            postgres = SQL("PostgreSQL\n(Users, Projects,\nDatasets)")
            clickhouse = SQL("ClickHouse\n(Traces, Spans,\nFeedback)")
            redis = Storage("Redis\n(Cache + Queue)")
            s3 = Storage("S3 / Blob\n(Artifacts)")

    # External traffic
    users >> Edge(label="HTTPS") >> frontend

    # Frontend routes to backends
    frontend >> Edge(label="API") >> backend
    frontend >> Edge(label="Traces") >> platform

    # Backend connections
    backend >> postgres
    backend >> s3
    platform >> clickhouse
    platform >> redis
    queue >> redis
    queue >> clickhouse
    queue >> postgres
    playground >> Edge(label="LLM APIs") >> Rack("Bedrock / OpenAI")
    ace >> Edge(label="sandboxed") >> Rack("Evaluator Code")


# ─────────────────────────────────────────────────────────────────
# Diagram 2: AWS Deployment Architecture
# Shows the VPC layout, EKS cluster, managed services, and
# network topology.
# ─────────────────────────────────────────────────────────────────

with Diagram(
    "AWS Deployment Architecture",
    filename="2_aws_deployment",
    show=False,
    direction="TB",
    graph_attr={"fontsize": "14", "pad": "0.5"},
):
    dns = Route53("Route 53\nlangsmith.innovatecorp.com")
    cert = ACM("ACM\nTLS Certificate")

    with Cluster("VPC (10.0.0.0/16)"):

        with Cluster("Public Subnets (2 AZs)"):
            alb = ALB("Application\nLoad Balancer")

        with Cluster("Private Subnets (2 AZs)"):

            with Cluster("EKS Cluster"):
                with Cluster("General Nodes (m5.xlarge x3)"):
                    frontend_pod = EKS("Frontend")
                    backend_pod = EKS("Backend")
                    platform_pod = EKS("Platform\nBackend")
                    queue_pod = EKS("Queue\nWorkers")

                with Cluster("Dedicated Node (r5.xlarge)"):
                    ch_pod = EKS("ClickHouse")

            with Cluster("Managed Data Services"):
                rds = RDS("RDS PostgreSQL\nMulti-AZ")
                elasticache = ElastiCache("ElastiCache\nRedis")

        s3_bucket = S3("S3 Bucket\nTrace Artifacts")

    secrets = SecretsManager("Secrets Manager")
    iam = IAMRole("IRSA\n(Pod IAM Roles)")
    cw = Cloudwatch("CloudWatch\nContainer Insights")
    bedrock = Sagemaker("Amazon Bedrock\n(LLM Provider)")

    # Network flow
    dns >> alb
    cert - alb
    alb >> frontend_pod
    frontend_pod >> backend_pod
    frontend_pod >> platform_pod

    # Data connections
    backend_pod >> rds
    platform_pod >> ch_pod
    queue_pod >> elasticache
    backend_pod >> s3_bucket

    # Supporting services
    iam >> Edge(style="dashed") >> backend_pod
    secrets >> Edge(style="dashed") >> backend_pod
    cw >> Edge(style="dashed") >> platform_pod

    # Bedrock for playground
    platform_pod >> Edge(label="Traces from agents", style="bold") >> ch_pod


# ─────────────────────────────────────────────────────────────────
# Diagram 3: Agent System Architecture
# Shows the multi-agent LangGraph pipeline, external APIs,
# LangSmith tracing, and the deployment topology.
# ─────────────────────────────────────────────────────────────────

with Diagram(
    "InnovateCorp Agent System",
    filename="3_agent_system",
    show=False,
    direction="LR",
    graph_attr={"fontsize": "14", "pad": "0.5"},
):
    user = Users("User\n(Frontend)")

    with Cluster("LangGraph API Server (Docker)"):
        with Cluster("Agent Graph"):
            supervisor = Python("Supervisor\n(Deterministic Router)")
            research = Python("Research Agent")
            compliance = Python("Compliance Agent")
            human = Rack("Human Review\n(interrupt())")
            report = Python("Report Agent")

        with Cluster("Synthesizers"):
            r_synth = Python("Research\nSynthesizer")
            c_synth = Python("Compliance\nSynthesizer")

    with Cluster("External APIs"):
        grants_gov = Rack("grants.gov\n(Grant Search)")
        sam_gov = Rack("SAM.gov\n(Entity Check)")

    bedrock = Sagemaker("Amazon Bedrock\nClaude 3.5 Haiku")
    langsmith = Rack("LangSmith\n(Tracing + Eval)")

    with Cluster("State (Checkpointer)"):
        db = SQL("PostgreSQL\n(Production)\nor MemorySaver\n(Dev)")

    # User interaction
    user >> Edge(label="Request") >> supervisor
    human >> Edge(label="Approve/Revise") >> user

    # Supervisor routing
    supervisor >> Edge(label="route") >> research
    supervisor >> Edge(label="route") >> compliance
    supervisor >> Edge(label="route") >> human
    supervisor >> Edge(label="route") >> report

    # Research flow
    research >> Edge(label="search_grants") >> grants_gov
    research >> r_synth
    r_synth >> supervisor

    # Compliance flow
    compliance >> Edge(label="check_eligibility") >> sam_gov
    compliance >> c_synth
    c_synth >> supervisor

    # LLM calls
    research >> Edge(style="dashed", label="LLM") >> bedrock
    compliance >> Edge(style="dashed", label="LLM") >> bedrock
    report >> Edge(style="dashed", label="LLM") >> bedrock

    # Tracing
    bedrock >> Edge(style="dotted", label="traces") >> langsmith

    # State persistence
    supervisor >> Edge(style="dashed") >> db

    # Report back
    report >> Edge(label="Final Report") >> user


print("Generated 3 diagrams:")
print("  1_langsmith_components.png")
print("  2_aws_deployment.png")
print("  3_agent_system.png")
