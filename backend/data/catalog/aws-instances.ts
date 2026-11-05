// AWS instance type → vCPU / memory (GiB). aws-instances.json is generated from AWS's price list by `bun run prices`.
// ponytail: us-east-1 types only; a type sold only elsewhere shows as "not in catalog" instead of a guess.
import catalog from "./aws-instances.json";

export type InstanceSpec = { vcpu: number; memoryGb: number };

const TYPES: Record<string, number[]> = catalog.types;

export function lookupInstance(type: string): InstanceSpec | undefined {
  const spec = TYPES[type.trim().toLowerCase()];
  return spec && { vcpu: spec[0]!, memoryGb: spec[1]! };
}

/** Pull an instance type out of a usage type or charge description ("BoxUsage:m5.xlarge", "per RDS db.r6g.large ..."). */
export const findInstanceType = (s: string) => s.match(/\b((?:db\.|cache\.)?[a-z]+-?\d[a-z0-9-]*\.(?:nano|micro|small|medium|large|\d*xlarge|metal(?:-\d+xl)?)(?:\.search)?)\b/i)?.[1]?.toLowerCase();
