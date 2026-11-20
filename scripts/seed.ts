// npm run seed – load the demo seed into the configured backend (Supabase or
// the local memory store). Destroys existing data.
import { clockBase } from "@/lib/clock";
import { dataBackend, store } from "@/lib/db";
import { buildSeed } from "@/lib/db/seed";

async function main() {
  const backend = dataBackend();
  await store().reset(buildSeed(clockBase()));
  console.log(`Seed geladen (${backend}).`);
  // The memory store writes its file debounced; give it a moment.
  if (backend === "memory") await new Promise((r) => setTimeout(r, 400));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
