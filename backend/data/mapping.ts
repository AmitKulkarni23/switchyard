// Hand-maintained mapping: source service (+ engine/kind) → category + per-destination target.
// kind drives the result lists: "service" → priced line, "disappears" → "what disappears", "none" → "no equivalent".

import type { Outcome } from "../schema";

export type Sizing = "instance" | "fargate" | "storage" | "object-storage" | "egress" | "none";
export type Target = { kind: Outcome; target?: string; notes: string };
export type Mapping = { category: string; label: string; sizing: Sizing; targets: Record<string, Target> };

const disappears = (notes: string): Record<string, Target> => ({ railway: { kind: "disappears", notes } });
const none = (notes: string): Record<string, Target> => ({ railway: { kind: "none", notes } });
const service = (target: string, notes: string): Record<string, Target> => ({ railway: { kind: "service", target, notes } });

export const MAPPING: Record<string, Mapping> = {
  "aws:ec2:instance": { category: "compute", label: "EC2 instances", sizing: "instance", targets: service("Railway service", "Billed on CPU and memory actually used, not instance size.") },
  "aws:fargate": { category: "compute", label: "Fargate tasks", sizing: "fargate", targets: service("Railway service", "Billed on CPU and memory actually used.") },
  "aws:ec2:ebs": { category: "volume", label: "EBS volumes", sizing: "storage", targets: service("Railway volume", "Attached to the service that uses it.") },
  "aws:rds:postgres": { category: "postgres", label: "RDS PostgreSQL", sizing: "instance", targets: service("Railway Postgres", "Runs as a Railway Postgres service with a volume.") },
  "aws:rds:mysql": { category: "mysql", label: "RDS MySQL / MariaDB", sizing: "instance", targets: service("Railway MySQL", "Runs as a Railway MySQL service with a volume.") },
  "aws:rds:other": { category: "database", label: "RDS (SQL Server / Oracle)", sizing: "none", targets: none("No managed SQL Server or Oracle on Railway.") },
  "aws:elasticache:redis": { category: "redis", label: "ElastiCache Redis / Valkey", sizing: "instance", targets: service("Railway Redis", "Runs as a Railway Redis service.") },
  "aws:elasticache:memcached": { category: "cache", label: "ElastiCache Memcached", sizing: "none", targets: none("No managed Memcached; run it as a service or switch to Redis.") },
  "aws:docdb": { category: "mongo", label: "DocumentDB", sizing: "instance", targets: service("Railway MongoDB", "MongoDB-compatible; check driver compatibility.") },
  "aws:s3:storage": { category: "object-storage", label: "S3 storage", sizing: "object-storage", targets: service("Railway bucket", "Railway buckets: free egress.") },
  "aws:s3:requests": { category: "object-storage", label: "S3 requests", sizing: "none", targets: disappears("Railway's pricing lists no request charges for buckets.") },
  "aws:data-transfer:internet": { category: "egress", label: "Data transfer out", sizing: "egress", targets: service("Railway egress", "Billed per GB of egress.") },
  "aws:data-transfer:inter-az": { category: "network-overhead", label: "Inter-AZ / regional transfer", sizing: "none", targets: disappears("No charge for traffic between Railway services.") },
  "aws:vpc:nat-gateway": { category: "network-overhead", label: "NAT gateway", sizing: "none", targets: disappears("Railway has no NAT gateway charge.") },
  "aws:vpc:public-ip": { category: "network-overhead", label: "Public IPv4 addresses", sizing: "none", targets: disappears("Railway domains carry no per-IP charge.") },
  "aws:elb": { category: "network-overhead", label: "Load balancers", sizing: "none", targets: disappears("Railway's edge proxy routes traffic at no extra charge.") },
  "aws:cloudwatch": { category: "observability", label: "CloudWatch", sizing: "none", targets: disappears("Railway includes logs and metrics.") },
  "aws:secrets": { category: "platform-overhead", label: "Secrets Manager / KMS", sizing: "none", targets: disappears("Railway has sealed variables.") },
  "aws:ecr": { category: "platform-overhead", label: "ECR", sizing: "none", targets: disappears("Railway builds and stores images; builds are free.") },
  "aws:support": { category: "platform-overhead", label: "AWS Support", sizing: "none", targets: disappears("No separate support-plan fee on Railway Hobby or Pro.") },
  "aws:sqs": { category: "queue", label: "SQS", sizing: "none", targets: none("No managed queue. Keep SQS or run a queue service.") },
  "aws:sns": { category: "pubsub", label: "SNS", sizing: "none", targets: none("No managed pub/sub. Keep SNS or run one as a service.") },
  "aws:dynamodb": { category: "nosql", label: "DynamoDB", sizing: "none", targets: none("No DynamoDB equivalent. Keep it or migrate to Postgres/Mongo.") },
  "aws:lambda": { category: "functions", label: "Lambda", sizing: "none", targets: none("Re-architect as a Railway service or function; not priced.") },
  "aws:cloudfront": { category: "cdn", label: "CloudFront", sizing: "none", targets: none("Keep CloudFront or use Railway's CDN caching; not priced.") },
  // Design-path parts: sized directly from the design, priced on Railway as services.
  "part:web-service": { category: "compute", label: "Web service", sizing: "none", targets: service("Railway service", "Billed on CPU and memory actually used.") },
  "part:background-worker": { category: "compute", label: "Background worker", sizing: "none", targets: service("Railway service", "Always-on worker, billed on use.") },
  "part:scheduled-job": { category: "compute", label: "Scheduled job", sizing: "none", targets: service("Railway cron service", "Runs on a cron schedule; billed only while it runs.") },
  "part:relational-db": { category: "postgres", label: "Relational database", sizing: "none", targets: service("Railway Postgres", "Postgres service with a volume.") },
  "part:key-value-store": { category: "redis", label: "Key-value store", sizing: "none", targets: service("Railway Redis", "Redis with persistence, or a Postgres table.") },
  "part:queue": { category: "queue", label: "Queue", sizing: "none", targets: service("Railway Redis (as a queue)", "A small Redis service backing a job queue.") },
  "part:object-storage": { category: "object-storage", label: "File storage", sizing: "none", targets: service("Railway bucket", "Free egress.") },
  "part:cache": { category: "redis", label: "Cache", sizing: "none", targets: service("Railway Redis", "Redis service.") },
  "part:search": { category: "search", label: "Search", sizing: "none", targets: service("OpenSearch or Meilisearch on Railway", "A search service from a template, with a volume for the index.") },
  "part:stream": { category: "stream", label: "Event stream", sizing: "none", targets: service("Kafka-compatible broker (Redpanda) on Railway", "A broker service with a volume for retained events.") },
  "part:messaging": { category: "messaging", label: "Email and SMS", sizing: "none", targets: none("Sent through an external provider (SES, Resend, Twilio) at the same cost.") },
  "part:cdn": { category: "cdn", label: "CDN", sizing: "none", targets: service("Railway CDN caching", "Cached responses at Railway's edge; egress is still billed on the service. CDN pricing not yet verified.") },
  "part:realtime": { category: "compute", label: "Realtime (WebSockets)", sizing: "none", targets: service("Railway service", "A service holding WebSocket connections, billed on use.") },
  "part:auth": { category: "auth", label: "User sign-in", sizing: "none", targets: service("An auth library inside your web service", "No separate charge; or use a hosted provider such as Clerk or Auth0.") },
  "aws:opensearch": { category: "search", label: "OpenSearch Service", sizing: "instance", targets: service("OpenSearch or Meilisearch on Railway", "A search service with a volume for the index.") },
  "aws:kinesis": { category: "stream", label: "Kinesis", sizing: "none", targets: none("Run a Kafka-compatible broker (Redpanda) on Railway to replace it; not priced from shards.") },
  "aws:ses": { category: "messaging", label: "SES", sizing: "none", targets: none("Keep sending through SES (or another provider) from Railway.") },
  "aws:cognito": { category: "auth", label: "Cognito", sizing: "none", targets: none("Keep Cognito, or move sign-in into your app or a hosted provider.") },
  "aws:route53": { category: "dns", label: "Route 53", sizing: "none", targets: none("Keep your DNS provider.") },
};

// Invoice PDFs carry only service names; CSVs carry product codes.
const NAME_TO_CODE: [RegExp, string][] = [
  [/Elastic Compute Cloud|^EC2/i, "AmazonEC2"], [/Relational Database/i, "AmazonRDS"], [/ElastiCache/i, "AmazonElastiCache"],
  [/Simple Storage Service|^S3/i, "AmazonS3"], [/Load Balancing/i, "AWSELB"], [/Data Transfer/i, "AWSDataTransfer"],
  [/Simple Queue/i, "AWSQueueService"], [/DynamoDB/i, "AmazonDynamoDB"], [/Simple Notification/i, "AmazonSNS"],
  [/Lambda/i, "AWSLambda"], [/CloudFront/i, "AmazonCloudFront"], [/Route ?53/i, "AmazonRoute53"], [/CloudWatch/i, "AmazonCloudWatch"],
  [/Secrets Manager/i, "AWSSecretsManager"], [/Key Management/i, "awskms"], [/Container Registry|^ECR/i, "AmazonECR"],
  [/Container Service|^ECS|Fargate/i, "AmazonECS"], [/OpenSearch|Elasticsearch/i, "AmazonES"], [/Kinesis/i, "AmazonKinesis"],
  [/Simple Email|^SES/i, "AmazonSES"], [/Cognito/i, "AmazonCognito"], [/DocumentDB/i, "AmazonDocDB"], [/Virtual Private Cloud|^VPC/i, "AmazonVPC"], [/Support/i, "AWSSupport"],
];
export const serviceCode = (name: string) => NAME_TO_CODE.find(([re]) => re.test(name))?.[1];

/** Classify one bill line by product code and usage text. Order matters: data transfer can appear under any service. */
export function classify(code: string, usage: string, engine = ""): string | undefined {
  const t = `${usage} ${engine}`;
  if (/DataTransfer-Regional|Regional-Bytes|between .*AZs|inter-?AZ/i.test(t)) return "aws:data-transfer:inter-az";
  if (/DataTransfer-Out|data transfer out/i.test(t)) return "aws:data-transfer:internet";
  if (/NatGateway|NAT Gateway/i.test(t)) return "aws:vpc:nat-gateway";
  if (/PublicIPv4|ElasticIP|IdleAddress|public IPv4/i.test(t)) return "aws:vpc:public-ip";
  switch (code) {
    case "AmazonEC2":
      if (/BoxUsage|Instance Hour|SpotUsage|DedicatedUsage/i.test(t)) return "aws:ec2:instance";
      if (/EBS:Volume|provisioned storage/i.test(t)) return "aws:ec2:ebs";
      return undefined; // snapshots, IOPS etc.: shown as not priced
    case "AmazonECS":
      return /Fargate|vCPU|GB-Hours/i.test(t) ? "aws:fargate" : undefined;
    case "AmazonRDS":
      if (/postgres/i.test(t)) return "aws:rds:postgres";
      if (/mysql|mariadb/i.test(t)) return "aws:rds:mysql";
      if (/sql ?server|oracle/i.test(t)) return "aws:rds:other";
      return undefined;
    case "AmazonElastiCache":
      return /memcached/i.test(t) ? "aws:elasticache:memcached" : "aws:elasticache:redis";
    case "AmazonDocDB":
      return "aws:docdb";
    case "AmazonS3":
      if (/TimedStorage|storage used/i.test(t)) return "aws:s3:storage";
      if (/Requests|requests/.test(t)) return "aws:s3:requests";
      return undefined;
    case "AWSELB": return "aws:elb";
    case "AmazonCloudWatch": return "aws:cloudwatch";
    case "AWSSecretsManager": case "awskms": return "aws:secrets";
    case "AmazonECR": return "aws:ecr";
    case "AWSQueueService": return "aws:sqs";
    case "AmazonSNS": return "aws:sns";
    case "AmazonDynamoDB": return "aws:dynamodb";
    case "AWSLambda": return "aws:lambda";
    case "AmazonCloudFront": return "aws:cloudfront";
    case "AmazonRoute53": return "aws:route53";
    case "AmazonES": return /ESInstance|Instance Hour|instance hour|\.search/i.test(t) || /storage|GB-?Mo/i.test(t) ? "aws:opensearch" : undefined;
    case "AmazonKinesis": return "aws:kinesis";
    case "AmazonSES": return "aws:ses";
    case "AmazonCognito": return "aws:cognito";
  }
  return code.startsWith("AWSSupport") ? "aws:support" : undefined;
}
