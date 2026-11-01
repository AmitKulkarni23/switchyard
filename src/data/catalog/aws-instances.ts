// AWS instance type → vCPU / memory (GiB). EC2, RDS (`db.`) and ElastiCache (`cache.`) share family shapes.
// ponytail: family ratios cover the common Nitro families; add explicit rows when a type prices wrong.

export type InstanceSpec = { vcpu: number; memoryGb: number };

const SIZE_VCPU: Record<string, number> = { large: 2, xlarge: 4, "2xlarge": 8, "4xlarge": 16, "8xlarge": 32, "12xlarge": 48, "16xlarge": 64, "24xlarge": 96 };
// GiB of memory per vCPU by family letter: general, compute, memory optimized.
const RATIO: Record<string, number> = { m: 4, c: 2, r: 8 };
const FAMILY = /^(m|c|r)(5|5a|5n|6i|6a|6g|6gd|7i|7a|7g|7gd|8g)$/;

// Burstable and cache types whose memory doesn't follow the family ratio.
const EXPLICIT: Record<string, InstanceSpec> = {
  "t3.nano": { vcpu: 2, memoryGb: 0.5 }, "t3.micro": { vcpu: 2, memoryGb: 1 }, "t3.small": { vcpu: 2, memoryGb: 2 },
  "t3.medium": { vcpu: 2, memoryGb: 4 }, "t3.large": { vcpu: 2, memoryGb: 8 }, "t3.xlarge": { vcpu: 4, memoryGb: 16 }, "t3.2xlarge": { vcpu: 8, memoryGb: 32 },
  "cache.t3.micro": { vcpu: 2, memoryGb: 0.5 }, "cache.t3.small": { vcpu: 2, memoryGb: 1.37 }, "cache.t3.medium": { vcpu: 2, memoryGb: 3.09 },
  "cache.t4g.micro": { vcpu: 2, memoryGb: 0.5 }, "cache.t4g.small": { vcpu: 2, memoryGb: 1.37 }, "cache.t4g.medium": { vcpu: 2, memoryGb: 3.09 },
  "cache.m6g.large": { vcpu: 2, memoryGb: 6.38 }, "cache.m6g.xlarge": { vcpu: 4, memoryGb: 12.93 },
  "cache.r6g.large": { vcpu: 2, memoryGb: 13.07 }, "cache.r6g.xlarge": { vcpu: 4, memoryGb: 26.32 },
};

export function lookupInstance(type: string): InstanceSpec | undefined {
  const t = type.trim().toLowerCase();
  if (EXPLICIT[t]) return EXPLICIT[t];
  const bare = t.replace(/^(db|cache)\./, "");
  // t3a/t4g share t3 shapes
  const burst = bare.match(/^t(3a|4g)\.(.+)$/);
  if (burst) return EXPLICIT[`t3.${burst[2]}`];
  const [family, size] = bare.split(".");
  const fm = family?.match(FAMILY);
  const vcpu = size ? SIZE_VCPU[size] : undefined;
  return fm && vcpu ? { vcpu, memoryGb: vcpu * RATIO[fm[1]!]! } : undefined;
}

/** Pull an instance type out of a usage type or charge description ("BoxUsage:m5.xlarge", "per RDS db.r6g.large ..."). */
export const findInstanceType = (s: string) => s.match(/\b((?:db\.|cache\.)?[a-z]\d[a-z]{0,3}\.(?:nano|micro|small|medium|large|\d*xlarge))\b/i)?.[1]?.toLowerCase();
