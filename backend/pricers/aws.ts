import { z } from "zod";
import awsYaml from "../data/price-books/aws.yaml";
import type { Range, Workload } from "../schema";

const Tiered = z.object({ small: z.number(), medium: z.number(), large: z.number() });
export const AwsPriceBook = z.object({
  destination: z.literal("aws"),
  region: z.string(),
  fetched: z.coerce.string(),
  sources: z.array(z.url()),
  rates: z.object({
    fargate_vcpu_hour: z.number(), fargate_gb_hour: z.number(), lambda_request_million: z.number(), lambda_gb_second: z.number(),
    apigw_http_request_million: z.number(), alb_hour: z.number(), alb_lcu_hour: z.number(), nat_hour: z.number(), nat_gb_processed: z.number(),
    egress_gb: z.number(), egress_free_gb: z.number(), rds_postgres_hour: Tiered, rds_storage_gb_month: z.number(), elasticache_hour: Tiered,
    dynamodb_write_million: z.number(), dynamodb_read_million: z.number(), dynamodb_storage_gb_month: z.number(), sqs_request_million: z.number(), s3_storage_gb_month: z.number(),
    opensearch_hour: Tiered, opensearch_storage_gb_month: z.number(), kinesis_shard_hour: z.number(), kinesis_put_unit_million: z.number(),
    ses_email_thousand: z.number(), sms_us_message: z.number(), cloudfront_gb: z.number(), cloudfront_https_10k: z.number(),
    apigw_websocket_message_million: z.number(), apigw_websocket_connection_minute_million: z.number(), cognito_mau: z.number(), cognito_free_mau: z.number(),
  }),
});
export const awsPriceBook = AwsPriceBook.parse(awsYaml);

export type AwsLine = { componentId?: string; label: string; uses: string; cost: Range; formula: string; alternative?: string };
export type AwsPriced = { billed: boolean; lines: AwsLine[]; overhead: AwsLine[]; total: Range };

const HOURS = 730;
const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")}`;
const one = (n: number): Range => ({ low: n, high: n });
const RDS_CLASS = { small: "db.t4g.small", medium: "db.t4g.medium", large: "db.m6g.large" } as const;
const CACHE_CLASS = { small: "cache.t4g.small", medium: "cache.t4g.medium", large: "cache.m6g.large" } as const;
const SEARCH_CLASS = { small: "t3.small.search", medium: "m6g.large.search", large: "r6g.large.search" } as const;
const SHARDS = { small: 1, medium: 4, large: 16 } as const;

/**
 * AWS column. A bill is already AWS: its lines are billed, exactly.
 * A design is priced right-sized on AWS: provisioned resources cost the same however busy they are.
 */
export function priceAws(w: Workload, r = awsPriceBook.rates): AwsPriced {
  if (w.format !== "design") {
    const lines = w.components.map((c) => ({ componentId: c.id, label: c.label, uses: `${c.sourceService}${c.detail ? ` · ${c.detail}` : ""}`, cost: one(c.currentMonthlyCost), formula: "As billed" }));
    const total = lines.reduce((s, l) => s + l.cost.low, 0);
    return { billed: true, lines, overhead: [], total: one(total) };
  }

  const lines: AwsLine[] = [];
  let inVpc = false; // a database or cache puts compute in private subnets → NAT gateway
  let compute = false;
  for (const c of w.components) {
    const d = c.drivers;
    const tier = (d.tier as "small" | "medium" | "large") ?? "small";
    const base = { componentId: c.id, label: c.label };
    switch (c.key) {
      case "part:web-service": {
        compute = true;
        const reqMonth = Number(d.requestsPerDay ?? 0) * 30;
        const egress = d.behindCdn ? 0 : Math.max(0, c.size.egressGb - r.egress_free_gb) * r.egress_gb; // behind CloudFront, origin egress is free
        const perReq = r.lambda_request_million / 1e6 + 0.1 * 0.5 * r.lambda_gb_second + r.apigw_http_request_million / 1e6; // 100 ms at 512 MB
        const lambda = reqMonth * perReq;
        const fargate = (c.size.vcpu * r.fargate_vcpu_hour + c.size.memoryGb * r.fargate_gb_hour) * HOURS + (r.alb_hour + r.alb_lcu_hour) * HOURS;
        const crossover = Math.round(fargate / perReq / 30);
        const useLambda = lambda <= fargate;
        lines.push({
          ...base,
          uses: useLambda ? "Lambda + API Gateway" : `ECS Fargate (${c.size.vcpu} vCPU / ${c.size.memoryGb} GB) + ALB`,
          cost: one((useLambda ? lambda : fargate) + egress),
          formula: `${(reqMonth / 1e6).toFixed(1)}M requests/mo: Lambda + API Gateway ${usd(lambda)} vs Fargate + ALB ${usd(fargate)}` + (egress ? ` + ${Math.round(c.size.egressGb)} GB egress ${usd(egress)}` : ""),
          alternative: `Containers get cheaper above ~${crossover.toLocaleString("en-US")} requests/day.`,
        });
        break;
      }
      case "part:background-worker":
        compute = true;
        lines.push({ ...base, uses: `ECS Fargate (${c.size.vcpu} vCPU / ${c.size.memoryGb} GB)`, cost: one((c.size.vcpu * r.fargate_vcpu_hour + c.size.memoryGb * r.fargate_gb_hour) * HOURS), formula: `one always-on task × ${HOURS} h` });
        break;
      case "part:scheduled-job": {
        const gbs = Number(d.runsPerDay ?? 1) * 30 * Number(d.minutesPerRun ?? 5) * 60 * 1;
        lines.push({ ...base, uses: "EventBridge Scheduler + Lambda", cost: one(gbs * r.lambda_gb_second), formula: `${gbs.toLocaleString("en-US")} GB-seconds/mo` });
        break;
      }
      case "part:relational-db": {
        inVpc = true;
        const inst = r.rds_postgres_hour[tier] * HOURS, storage = Math.max(20, c.size.storageGb) * r.rds_storage_gb_month;
        lines.push({ ...base, uses: `RDS PostgreSQL ${RDS_CLASS[tier]}`, cost: one(inst + storage), formula: `${RDS_CLASS[tier]} ${usd(inst)} + ${Math.max(20, c.size.storageGb)} GB storage ${usd(storage)} (20 GB minimum)` });
        break;
      }
      case "part:cache":
        inVpc = true;
        lines.push({ ...base, uses: `ElastiCache ${CACHE_CLASS[tier]}`, cost: one(r.elasticache_hour[tier] * HOURS), formula: `${CACHE_CLASS[tier]} × ${HOURS} h` });
        break;
      case "part:key-value-store": {
        const writes = (Number(d.writesPerDay ?? 0) * 30) / 1e6, reads = (Number(d.readsPerDay ?? 0) * 30) / 1e6;
        const cost = writes * r.dynamodb_write_million + reads * r.dynamodb_read_million + Number(d.dataGb ?? 0) * r.dynamodb_storage_gb_month;
        lines.push({ ...base, uses: "DynamoDB on-demand", cost: one(cost), formula: `${writes.toFixed(1)}M writes + ${reads.toFixed(1)}M reads + ${d.dataGb} GB` });
        break;
      }
      case "part:queue": {
        const reqs = (Number(d.messagesPerDay ?? 0) * 30 * 3) / 1e6; // send, receive, delete
        lines.push({ ...base, uses: "SQS", cost: one(reqs * r.sqs_request_million), formula: `${reqs.toFixed(1)}M requests (send, receive, delete)` });
        break;
      }
      case "part:search": {
        inVpc = true;
        const inst = r.opensearch_hour[tier] * HOURS, gb = Math.max(10, c.size.storageGb), storage = gb * r.opensearch_storage_gb_month;
        lines.push({ ...base, uses: `OpenSearch Service ${SEARCH_CLASS[tier]}`, cost: one(inst + storage), formula: `${SEARCH_CLASS[tier]} ${usd(inst)} + ${gb} GB storage ${usd(storage)}` });
        break;
      }
      case "part:stream": {
        const shards = SHARDS[tier], puts = (Number(d.eventsPerDay ?? 0) * 30) / 1e6;
        const cost = shards * r.kinesis_shard_hour * HOURS + puts * r.kinesis_put_unit_million;
        lines.push({ ...base, uses: `Kinesis Data Streams (${shards} shard${shards > 1 ? "s" : ""})`, cost: one(cost), formula: `${shards} shard × ${HOURS} h + ${puts.toFixed(1)}M PUT units` });
        break;
      }
      case "part:messaging": {
        lines.push({ ...base, uses: "SES (email) + SNS (SMS)", cost: one(c.currentMonthlyCost), formula: `${Number(d.emailsPerDay).toLocaleString("en-US")} emails/day + ${Number(d.smsPerDay).toLocaleString("en-US")} US texts/day` });
        break;
      }
      case "part:cdn": {
        const gb = Number(d.servedGb ?? 0), reqs = Number(d.requestsPerDay ?? 0) * 30;
        const cost = gb * r.cloudfront_gb + (reqs / 10_000) * r.cloudfront_https_10k;
        lines.push({ ...base, uses: "CloudFront", cost: one(cost), formula: `${Math.round(gb)} GB served + ${(reqs / 1e6).toFixed(1)}M HTTPS requests (replaces direct egress)` });
        break;
      }
      case "part:realtime": {
        compute = true;
        const msgs = (Number(d.messagesPerDay ?? 0) * 30) / 1e6, connMin = (Number(d.concurrentConnections ?? 0) * HOURS * 60) / 1e6;
        const cost = msgs * r.apigw_websocket_message_million + connMin * r.apigw_websocket_connection_minute_million;
        lines.push({ ...base, uses: "API Gateway WebSockets", cost: one(cost), formula: `${msgs.toFixed(1)}M messages + ${connMin.toFixed(1)}M connection-minutes (${d.concurrentConnections} always connected)` });
        break;
      }
      case "part:auth": {
        const mau = Number(d.monthlyActiveUsers ?? 0), billable = Math.max(0, mau - r.cognito_free_mau);
        lines.push({ ...base, uses: "Cognito (Essentials)", cost: one(billable * r.cognito_mau), formula: `${mau.toLocaleString("en-US")} monthly active users, first ${r.cognito_free_mau.toLocaleString("en-US")} free` });
        break;
      }
      case "part:object-storage":
        lines.push({ ...base, uses: "S3 Standard", cost: one(c.size.objectStorageGb * r.s3_storage_gb_month), formula: `${c.size.objectStorageGb} GB × ${usd(r.s3_storage_gb_month)}` });
        break;
    }
  }
  const overhead: AwsLine[] = [];
  if (inVpc && compute) overhead.push({ label: "NAT gateway", uses: "VPC NAT gateway", cost: one(r.nat_hour * HOURS), formula: `${HOURS} h × ${usd(r.nat_hour)}: private subnets need it to reach the internet` });
  const total = [...lines, ...overhead].reduce((s, l) => s + l.cost.low, 0);
  return { billed: false, lines, overhead, total: one(total) };
}
