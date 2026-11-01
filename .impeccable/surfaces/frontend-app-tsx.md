---
version: 1
slug: "frontend-app-tsx"
primary_target: "frontend/app.tsx"
related_targets: []
---

# Surface: upload → results

Mode: Operate. Audience, job, states and constraints: see docs/system-specs/ui-brief.md. Chosen sketch: .impeccable/mocks/decision/assigned-r1.html.

## Direction contract

THESIS: An independent tester's ratings chart for your cloud bill: one verdict, then every component rated by where it goes and what it costs. Refuses the cost-dashboard default of KPI cards, donut charts and soft rounded tiles.

OWN-WORLD: White paper, ink #111 rules, one tester red #C8102E for the masthead, disappears marks and focus. Archivo at condensed widths for headers, regular width for text, tabular figures everywhere. Filled, half and empty circular rating marks carry outcome. Square corners, 1px and 4px rules, no shadows, no cards.

STORY: The visitor drops a bill, reads "AWS today $X → Railway $A–$B" in one line, sees what moves, what disappears and what stays on AWS, drags the busy range, opens a row to check the math, and shares or prints the result.

FIRST VIEWPORT: Red masthead with name, file, busy-range slider, Export and Share. Below it a 4px-ruled verdict band of four cells: AWS today, On Railway, Difference, The verdict sentence. Then the ratings table starts above the fold with outcome filter.

FORM: Ratings chart, position 6 on the grounded list. seed:65e935b6e6f992b0

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
