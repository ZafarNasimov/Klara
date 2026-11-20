// Reset the data backend to the SPEC §9 seed. Usage: npm run seed
import { dataBackend } from "@/lib/db/store";
import { resetDemo } from "@/lib/db/repo";

async function main() {
  await resetDemo();
  console.log(`Seed geladen (${dataBackend()}).`);
}

main().then(
  () => setTimeout(() => process.exit(0), 200),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
