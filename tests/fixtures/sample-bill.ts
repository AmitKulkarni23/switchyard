// Synthetic AWS bill for September 2026 (720 hours). Not a real customer bill.
// One source of truth for focus.csv, aws-cur.csv and aws-invoice.pdf (see make-fixtures.ts).

export type SampleLine = {
  service: string; // invoice / FOCUS ServiceName
  code: string; // CUR lineItem/ProductCode
  usageType: string;
  description: string;
  qty?: number;
  unit?: string;
  cost: number;
  type?: "Usage" | "Tax";
  resourceIds?: string[];
  engine?: string;
  instanceType?: string;
};

export const PERIOD = { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" };

export const SAMPLE_LINES: SampleLine[] = [
  { service: "Amazon Elastic Compute Cloud", code: "AmazonEC2", usageType: "USE1-BoxUsage:m5.xlarge", description: "$0.192 per On Demand Linux m5.xlarge Instance Hour", qty: 2160, unit: "Hrs", cost: 414.72, resourceIds: ["i-0a1", "i-0a2", "i-0a3"], instanceType: "m5.xlarge" },
  { service: "Amazon Elastic Compute Cloud", code: "AmazonEC2", usageType: "USE1-BoxUsage:t3.medium", description: "$0.0416 per On Demand Linux t3.medium Instance Hour", qty: 720, unit: "Hrs", cost: 29.95, resourceIds: ["i-0b1"], instanceType: "t3.medium" },
  { service: "Amazon Elastic Compute Cloud", code: "AmazonEC2", usageType: "USE1-EBS:VolumeUsage.gp3", description: "$0.08 per GB-month of General Purpose (gp3) provisioned storage", qty: 300, unit: "GB-Mo", cost: 24.0 },
  { service: "Amazon Elastic Compute Cloud", code: "AmazonEC2", usageType: "USE1-NatGateway-Hours", description: "$0.045 per NAT Gateway Hour", qty: 1440, unit: "Hrs", cost: 64.8 },
  { service: "Amazon Elastic Compute Cloud", code: "AmazonEC2", usageType: "USE1-NatGateway-Bytes", description: "$0.045 per GB Data Processed by NAT Gateways", qty: 500, unit: "GB", cost: 22.5 },
  { service: "Elastic Load Balancing", code: "AWSELB", usageType: "USE1-LoadBalancerUsage", description: "$0.0225 per Application LoadBalancer-hour (or partial hour)", qty: 720, unit: "Hrs", cost: 16.2 },
  { service: "Elastic Load Balancing", code: "AWSELB", usageType: "USE1-LCUUsage", description: "$0.008 per used Application load balancer capacity unit-hour", qty: 720, unit: "LCU-Hrs", cost: 5.76 },
  { service: "AWS Data Transfer", code: "AWSDataTransfer", usageType: "USE1-DataTransfer-Out-Bytes", description: "$0.09 per GB - first 10 TB / month data transfer out beyond the global free tier", qty: 1200, unit: "GB", cost: 108.0 },
  { service: "AWS Data Transfer", code: "AWSDataTransfer", usageType: "USE1-DataTransfer-Regional-Bytes", description: "$0.01 per GB - regional data transfer between EC2 AZs", qty: 800, unit: "GB", cost: 8.0 },
  { service: "Amazon Relational Database Service", code: "AmazonRDS", usageType: "USE1-InstanceUsage:db.r6g.large", description: "$0.225 per RDS db.r6g.large Single-AZ instance hour running PostgreSQL", qty: 720, unit: "Hrs", cost: 162.0, engine: "PostgreSQL", instanceType: "db.r6g.large", resourceIds: ["orders-db"] },
  { service: "Amazon Relational Database Service", code: "AmazonRDS", usageType: "USE1-RDS:GP3-Storage", description: "$0.115 per GB-month of provisioned gp3 storage running PostgreSQL", qty: 200, unit: "GB-Mo", cost: 23.0, engine: "PostgreSQL", resourceIds: ["orders-db"] },
  { service: "Amazon ElastiCache", code: "AmazonElastiCache", usageType: "USE1-NodeUsage:cache.t4g.medium", description: "$0.065 per cache.t4g.medium Node Hour running Redis", qty: 720, unit: "Hrs", cost: 46.8, engine: "Redis", instanceType: "cache.t4g.medium" },
  { service: "Amazon Simple Storage Service", code: "AmazonS3", usageType: "USE1-TimedStorage-ByteHrs", description: "$0.023 per GB - first 50 TB / month of storage used", qty: 600, unit: "GB-Mo", cost: 13.8 },
  { service: "Amazon Simple Storage Service", code: "AmazonS3", usageType: "USE1-Requests-Tier1", description: "$0.005 per 1,000 PUT, COPY, POST, or LIST requests", qty: 1000000, unit: "Requests", cost: 5.0 },
  { service: "Amazon Simple Queue Service", code: "AWSQueueService", usageType: "USE1-Requests-RBP", description: "$0.40 per 1,000,000 Amazon SQS Requests per month thereafter", qty: 29000000, unit: "Requests", cost: 11.6 },
  { service: "Amazon DynamoDB", code: "AmazonDynamoDB", usageType: "USE1-WriteRequestUnits", description: "$1.25 per million write request units", qty: 50000000, unit: "WriteRequestUnits", cost: 62.5 },
  { service: "AmazonCloudWatch", code: "AmazonCloudWatch", usageType: "USE1-DataProcessing-Bytes", description: "$0.50 per GB - data ingested", qty: 100, unit: "GB", cost: 50.0 },
  { service: "AWS Support (Business)", code: "AWSSupportBusiness", usageType: "Dollar", description: "AWS Support (Business)", cost: 100.0 },
  { service: "Amazon Kinesis", code: "AmazonKinesis", usageType: "USE1-ShardHourStorage", description: "$0.015 per shard hour", qty: 720, unit: "Hrs", cost: 10.8 },
  { service: "Tax", code: "", usageType: "", description: "Sales tax", cost: 82.4, type: "Tax" },
];

const round = (n: number) => Math.round(n * 100) / 100;
export const USAGE_TOTAL = round(SAMPLE_LINES.filter((l) => l.type !== "Tax").reduce((s, l) => s + l.cost, 0));
export const TAX_TOTAL = 82.4;
