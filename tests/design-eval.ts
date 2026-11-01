// Measures how often the cheap pair agrees. Needs OPENROUTER_API_KEY. Costs roughly $0.01 per idea.
// bun run tests/design-eval.ts
import { compareDrafts } from "../backend/design/consensus";
import { openRouterCaller } from "../backend/design/openrouter";
import { PANEL } from "../backend/design/panel";

const IDEAS = [
  "A booking app for dental clinics. About 500 clinics. Patients book appointments online, we text them a reminder the day before, and clinic staff have an admin dashboard.",
  "Internal tool for our 20-person ops team to track vendor contracts and upload signed PDFs.",
  "A video course platform. Creators upload lectures, we transcode them, and students stream them. Expecting 50k students.",
  "A URL shortener with click analytics, around 2 million redirects a day.",
  "A newsletter tool: writers compose posts and we email them to subscribers every Friday.",
  "A multiplayer trivia game night app that spikes on Friday evenings.",
  "A B2B invoicing SaaS for small agencies with PDF export and monthly payment reminders.",
  "A recipe site with user photos and comments.",
  "A Slack bot that summarises channels every morning.",
  "An e-commerce store for handmade jewelry, about 300 orders a month.",
  "A REST API that serves product prices to partners, very read-heavy, low latency required.",
  "A habit tracker mobile app backend with daily streak notifications.",
];

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("Set OPENROUTER_API_KEY (e.g. in .env) to run the eval.");
const call = openRouterCaller(key);
let agreed = 0;
for (const idea of IDEAS) {
  const [a, b] = await Promise.allSettled(PANEL.primary.map((m) => call(m, { idea })));
  if (a.status !== "fulfilled" || b.status !== "fulfilled") {
    console.log(`FAIL   ${idea.slice(0, 60)}… ${[a, b].map((r) => (r.status === "rejected" ? String(r.reason).slice(0, 80) : "ok")).join(" | ")}`);
    continue;
  }
  const { agree, disputes } = compareDrafts(a.value, b.value);
  agreed += +agree;
  console.log(`${agree ? "AGREE " : "SPLIT "} ${idea.slice(0, 60)}…${agree ? "" : `  → ${disputes.join(", ")}`}`);
}
console.log(`\n${agreed}/${IDEAS.length} agreed (${Math.round((agreed / IDEAS.length) * 100)}%). The rest would escalate to ${PANEL.tiebreak}.`);
