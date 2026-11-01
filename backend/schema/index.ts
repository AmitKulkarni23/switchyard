import { z } from "zod";

/** One billing line in FOCUS columns (https://focus.finops.org), plus the `x_` extensions AWS exports. */
export const FocusRow = z.object({
  BilledCost: z.number(),
  ChargeCategory: z.enum(["Usage", "Purchase", "Tax", "Credit", "Adjustment"]),
  ProviderName: z.string(),
  ServiceName: z.string(),
  ChargeDescription: z.string().default(""),
  ResourceId: z.string().optional(),
  ConsumedQuantity: z.number().optional(),
  ConsumedUnit: z.string().optional(),
  ChargePeriodStart: z.string().optional(),
  ChargePeriodEnd: z.string().optional(),
  x_ServiceCode: z.string().optional(),
  x_UsageType: z.string().optional(),
  x_InstanceType: z.string().optional(),
  x_DatabaseEngine: z.string().optional(),
});
export type FocusRow = z.infer<typeof FocusRow>;

export const FileFormat = z.enum(["aws-invoice-pdf", "aws-cur-csv", "focus-csv"]);
export type FileFormat = z.infer<typeof FileFormat>;
/** "design": a workload sketched from an idea, not read from a file. */
export const Format = z.enum([...FileFormat.options, "design"]);
export type Format = z.infer<typeof Format>;

export const Outcome = z.enum(["service", "disappears", "none"]);
export type Outcome = z.infer<typeof Outcome>;

export const Size = z.object({
  vcpu: z.number().nonnegative().default(0),
  memoryGb: z.number().nonnegative().default(0),
  storageGb: z.number().nonnegative().default(0),
  objectStorageGb: z.number().nonnegative().default(0),
  egressGb: z.number().nonnegative().default(0),
});
export type Size = z.infer<typeof Size>;

/** One workload piece: several bill lines for the same resource collapse into one component. */
export const Component = z.object({
  id: z.string(), // stable "01".."NN", cited in share links and exports
  key: z.string(), // mapping key, e.g. "aws:rds:postgres"
  category: z.string(),
  label: z.string(),
  sourceService: z.string(),
  detail: z.string().default(""), // e.g. "3 × m5.xlarge"
  size: Size,
  currentMonthlyCost: z.number(),
  rowCount: z.number().int().positive(),
  warnings: z.array(z.string()).default([]),
  drivers: z.record(z.string(), z.union([z.number(), z.string()])).default({}), // usage that drives cost (design parts)
});
export type Component = z.infer<typeof Component>;

/** A bill line we could not price: shown to the user, never dropped. */
export const UnpricedLine = z.object({
  description: z.string(),
  service: z.string().default(""),
  cost: z.number(),
  reason: z.string(),
});
export type UnpricedLine = z.infer<typeof UnpricedLine>;

export const Workload = z.object({
  provider: z.string(),
  format: Format,
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  components: z.array(Component),
  unparsed: z.array(UnpricedLine), // bill lines we could not map to a component
  excluded: z.array(UnpricedLine), // tax, credits: not part of the workload
});
export type Workload = z.infer<typeof Workload>;

const Fraction = z.number().min(0).max(1);

export const Assumptions = z
  .object({
    destination: z.string().default("railway"),
    utilization: z.object({ low: Fraction, high: Fraction }).default({ low: 0.1, high: 0.5 }),
    mustKeep: z.array(z.string()).default([]), // component ids kept on the source cloud
  })
  .refine((a) => a.utilization.low <= a.utilization.high, "utilization.low must be <= utilization.high");
export type Assumptions = z.infer<typeof Assumptions>;

const Range = z.object({ low: z.number(), high: z.number() });
export type Range = z.infer<typeof Range>;

export const EstimateLine = z.object({
  componentId: z.string(),
  label: z.string(),
  category: z.string(),
  outcome: z.enum(["moves", "disappears", "no-equivalent", "kept"]),
  current: z.number(),
  destination: Range,
  formula: z.string(),
  notes: z.string().default(""),
});
export type EstimateLine = z.infer<typeof EstimateLine>;

export const Estimate = z.object({
  destination: z.string(),
  plan: z.object({ name: z.string(), monthlyFee: z.number(), includedUsage: z.number() }),
  assumptions: Assumptions,
  current: z.number(), // priced workload cost on the source today, per month
  destinationTotal: Range,
  difference: Range, // current − destination; negative means the destination costs more
  lines: z.array(EstimateLine),
  disappears: z.array(EstimateLine),
  noEquivalent: z.array(EstimateLine),
  notPriced: z.array(UnpricedLine),
  excluded: z.array(UnpricedLine),
});
export type Estimate = z.infer<typeof Estimate>;
