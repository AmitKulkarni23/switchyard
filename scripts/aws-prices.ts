// Checks backend/data/price-books/aws.yaml against AWS's public price list and regenerates the instance catalog.
// No credentials needed. Run by hand: `bun run prices` (downloads ~520 MB), or `bun run prices <dir>` to reuse <dir>/<Service>.json.
// Exits 1 on any mismatch and leaves the book's `fetched` date alone; on success it stamps today's date.
import { awsPriceBook } from "../backend/pricers/aws";

const BOOK = `${import.meta.dir}/../backend/data/price-books/aws.yaml`;
const CATALOG = `${import.meta.dir}/../backend/data/catalog/aws-instances.json`;
const cacheDir = process.argv[2];

// Not in the price list: checked by hand against the page or CSV named in aws.yaml.
const CHECKED_BY_HAND = new Set(["cloudfront_gb", "cloudfront_https_10k", "cloudfront_free_gb", "cloudfront_free_requests", "egress_free_gb", "sms_us_message"]);

async function offer(service: string) {
  if (cacheDir) return JSON.parse(await Bun.file(`${cacheDir}/${service}.json`).text());
  const res = await fetch(`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/us-east-1/index.json`);
  if (!res.ok) throw new Error(`${service}: HTTP ${res.status}`);
  return res.json();
}

type Row = { a: Record<string, string>; usd: number; end: string };
function rows(o: any): Row[] {
  const out: Row[] = [];
  for (const [sku, p] of Object.entries<any>(o.products))
    for (const term of Object.values<any>(o.terms.OnDemand?.[sku] ?? {}))
      for (const d of Object.values<any>(term.priceDimensions)) out.push({ a: p.attributes, usd: Number(d.pricePerUnit.USD), end: d.endRange });
  return out;
}
/** Price of a usage type: the first paid tier, which is the highest. */
const paid = (rs: Row[], f: (a: Row["a"]) => boolean) => Math.max(0, ...rs.filter((r) => f(r.a)).map((r) => r.usd));
const usage = (re: RegExp) => (a: Row["a"]) => re.test(a.usagetype ?? "");

const [ec2Offer, rdsOffer, cacheOffer, esOffer, docOffer] = await Promise.all(["AmazonEC2", "AmazonRDS", "AmazonElastiCache", "AmazonES", "AmazonDocDB"].map(offer));
const [ecs, lambda, gateway, elb, transfer, dynamo, sqs, s3, kinesis, ses, cognito] = (await Promise.all(["AmazonECS", "AWSLambda", "AmazonApiGateway", "AWSELB", "AWSDataTransfer", "AmazonDynamoDB", "AWSQueueService", "AmazonS3", "AmazonKinesis", "AmazonSES", "AmazonCognito"].map(offer))).map(rows) as Row[][];
const ec2 = rows(ec2Offer), rds = rows(rdsOffer), cache = rows(cacheOffer), es = rows(esOffer);

const rdsPg = (t: string) => paid(rds, (a) => a.instanceType === t && a.databaseEngine === "PostgreSQL" && a.deploymentOption === "Single-AZ");
const redis = (t: string) => paid(cache, (a) => a.usagetype === `NodeUsage:${t}` && a.cacheEngine === "Redis");
const search = (t: string) => paid(es, (a) => a.instanceType === t);
const alb = (re: RegExp) => paid(elb, (a) => re.test(a.usagetype ?? "") && a.operation === "LoadBalancing:Application");

const fromList: Record<string, number> = {
  fargate_vcpu_hour: paid(ecs!, usage(/^(USE1-)?Fargate-vCPU-Hours:perCPU$/)),
  fargate_gb_hour: paid(ecs!, usage(/^(USE1-)?Fargate-GB-Hours$/)),
  lambda_request_million: paid(lambda!, usage(/^(USE1-)?Request$/)) * 1e6,
  lambda_gb_second: paid(lambda!, usage(/^(USE1-)?Lambda-GB-Second$/)),
  apigw_http_request_million: paid(gateway!, usage(/ApiGatewayHttpRequest/)) * 1e6,
  apigw_websocket_message_million: paid(gateway!, usage(/ApiGatewayMessage/)) * 1e6,
  apigw_websocket_connection_minute_million: paid(gateway!, usage(/ApiGatewayMinute/)) * 1e6,
  alb_hour: alb(/^(USE1-)?LoadBalancerUsage$/),
  alb_lcu_hour: alb(/^(USE1-)?LCUUsage$/),
  nat_hour: paid(ec2, usage(/^(USE1-)?NatGateway-Hours$/)),
  nat_gb_processed: paid(ec2, usage(/^(USE1-)?NatGateway-Bytes$/)),
  egress_gb: paid(transfer!, usage(/^(USE1-)?DataTransfer-Out-Bytes$/)),
  "rds_postgres_hour.small": rdsPg("db.t4g.small"),
  "rds_postgres_hour.medium": rdsPg("db.t4g.medium"),
  "rds_postgres_hour.large": rdsPg("db.m6g.large"),
  rds_storage_gb_month: paid(rds, (a) => a.volumeType === "General Purpose-GP3" && a.databaseEngine === "PostgreSQL" && a.deploymentOption === "Single-AZ"),
  "elasticache_hour.small": redis("cache.t4g.small"),
  "elasticache_hour.medium": redis("cache.t4g.medium"),
  "elasticache_hour.large": redis("cache.m6g.large"),
  dynamodb_write_million: paid(dynamo!, usage(/^(USE1-)?WriteRequestUnits$/)) * 1e6,
  dynamodb_read_million: paid(dynamo!, usage(/^(USE1-)?ReadRequestUnits$/)) * 1e6,
  dynamodb_storage_gb_month: paid(dynamo!, usage(/^(USE1-)?TimedStorage-ByteHrs$/)),
  sqs_request_million: paid(sqs!, usage(/^(USE1-)?Requests-RBP$/)) * 1e6,
  s3_storage_gb_month: paid(s3!, usage(/^(USE1-)?TimedStorage-ByteHrs$/)),
  "opensearch_hour.small": search("t3.small.search"),
  "opensearch_hour.medium": search("m6g.large.search"),
  "opensearch_hour.large": search("r6g.large.search"),
  opensearch_storage_gb_month: paid(es, (a) => /GP3/i.test(a.usagetype ?? "") && /Storage/i.test(a.usagetype ?? "") && !/PIOPS|Throughput/i.test(a.usagetype ?? "")),
  kinesis_shard_hour: paid(kinesis!, usage(/^(USE1-)?Storage-ShardHour$/)),
  kinesis_put_unit_million: paid(kinesis!, usage(/^(USE1-)?PutRequestPayloadUnits$/)) * 1e6,
  ses_email_thousand: paid(ses!, usage(/^USE1-Recipients$/)) * 1e3,
  cognito_mau: paid(cognito!, usage(/^USE1-CognitoEssentialsMAU$/)),
  cognito_free_mau: Number(cognito!.find((r) => r.a.usagetype === "Global-CognitoFreeTierMAU")?.end),
};

const flat = Object.entries(awsPriceBook.rates).flatMap(([k, v]) => (typeof v === "number" ? [[k, v] as const] : Object.entries(v).map(([t, n]) => [`${k}.${t}`, n] as const)));
let bad = 0;
for (const [key, ours] of flat) {
  if (CHECKED_BY_HAND.has(key)) { console.log(`hand  ${key} = ${ours}`); continue; }
  const aws = fromList[key];
  const ok = aws !== undefined && Math.abs(aws - ours) <= ours * 1e-6;
  if (!ok) bad++;
  console.log(`${ok ? "ok   " : "WRONG"} ${key} = ${ours}${ok ? "" : ` (AWS: ${aws ?? "no check for this rate"})`}`);
}

// Catalog: every instance type AWS lists. RDS gives SQL Server half the vCPUs of other engines, so take the largest.
const types: Record<string, [number, number]> = {};
for (const o of [ec2Offer, rdsOffer, cacheOffer, esOffer, docOffer])
  for (const { attributes: a } of Object.values<any>(o.products)) {
    const vcpu = Number(a.vcpu), mem = parseFloat(String(a.memory ?? a.memoryGib).replace(/,/g, ""));
    if (!a.instanceType || !vcpu || !mem) continue;
    const key = a.instanceType.toLowerCase(), had = types[key];
    types[key] = [Math.max(vcpu, had?.[0] ?? 0), Math.max(mem, had?.[1] ?? 0)];
  }
const body = Object.keys(types).sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(types[k])}`).join(",\n");
await Bun.write(CATALOG, `{\n  "region": "us-east-1",\n  "types": {\n${body}\n  }\n}\n`);
console.log(`\ncatalog: ${Object.keys(types).length} instance types`);

if (bad) { console.error(`${bad} rate(s) differ from AWS's price list. Update aws.yaml and rerun.`); process.exit(1); }
const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
await Bun.write(BOOK, (await Bun.file(BOOK).text()).replace(/^fetched: .*$/m, `fetched: ${today}`));
console.log(`all list rates match; aws.yaml stamped ${today}`);
