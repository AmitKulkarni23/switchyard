import { price as railway, type Priced } from "./railway";
import type { Assumptions, Workload } from "../schema";

export type Pricer = (workload: Workload, assumptions: Assumptions) => Priced;

/** Destinations by id. Add AWS, GCP, Azure, Supabase here as new pricer modules. */
export const pricers: Record<string, Pricer> = { railway: (w, a) => railway(w, a) };
