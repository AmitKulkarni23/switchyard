# 18 Railway JSON parsers

Accept `railway config pull --json` (structure: services, databases with engine, volumes, buckets) and `railway usage projects --json` (spend per service by CPU, memory, egress, volume), one or both in one drop. Usage dollars ÷ Railway rates = measured usage, so the Railway side is billed and AWS is priced from real usage. Drop every variable value; keep names only.

**Acceptance**: fixtures from a synthetic project; secrets never stored or logged.
