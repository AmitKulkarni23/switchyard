# UI Brief: upload → results

Confirmed via `/impeccable shape` on 2026-11-01. Visual direction chosen: **Ratings Chart** (sketch: `.impeccable/mocks/decision/assigned-r1.html`). Mode: Operate.

1. **Job and audience**: engineer/founder on AWS checking a move privately; Railway sales staff use the same screen on calls.
2. **Outcome**: first five seconds read "AWS today $X → Railway $A–$B depending on how busy you are"; savings derive from that. Proof is the bill's own lines, the dated price book and visible assumptions. Demo data is labelled "sample bill (synthetic)".
3. **Direction**: independent tester's ratings chart. Red masthead, black rules, rating marks for outcomes (Moves, Disappears, No equivalent, Not priced), condensed grotesk headers, tabular figures. Verdict box ("9 move, 3 disappear $202, 2 stay on AWS $222, 2 not priced $146") then the ratings table. Colour only where it means something; expanded row dims the others; stable component numbers reused in share link and export; strict type scale; visible column grid. No Railway logo or brand colours.
4. **Scope**: upload, parsing, unsupported/parse-error states, results with slider, must-keep toggles, expandable math rows, Share link, Export PDF. Anti-goals: Railway marketing look, buried gaps, generic SaaS cards/donuts/KPI tiles, fake precision.
5. **States and ranges**: 3 to 100+ components, grouped and collapsible. Upload: empty, drag-over, uploading, parsing, unsupported, failed. Results: partly priced, all no-equivalent, Railway costs more (shown as honestly as savings). Privacy line at the upload point: "Deleted right after parsing. Never sent to an LLM."
6. **Interaction**: masthead (file, slider, export, share) → verdict box → ratings table. Slider recomputes every figure live with a readout. Must-keep checkbox per row holds that component at its AWS cost. Expanded row shows bill lines → component → rate × quantity × utilization. Mobile: verdict stacks, table becomes one row per component.
7. **Constraints**: MUI re-themed, standard controls, WCAG AA. Share link needs Postgres. Export via browser print. Destination label is a variable.
