import { z } from "zod";
import railwayYaml from "./railway.yaml";

const Plan = z.object({
  name: z.string(),
  monthly_fee: z.number().nonnegative(),
  included_usage: z.number().nonnegative(),
  limits: z.object({ vcpu: z.number(), memory_gb: z.number(), volume_gb: z.number() }),
});

export const PriceBook = z.object({
  destination: z.string(),
  fetched: z.coerce.string(),
  sources: z.array(z.url()).min(1),
  rates: z.object({
    vcpu_month: z.number().positive(),
    memory_gb_month: z.number().positive(),
    egress_gb: z.number().nonnegative(),
    volume_gb_month: z.number().nonnegative(),
    object_storage_gb_month: z.number().nonnegative(),
  }),
  plans: z.array(Plan).min(1),
});
export type PriceBook = z.infer<typeof PriceBook>;

export const railwayPriceBook = PriceBook.parse(railwayYaml);
