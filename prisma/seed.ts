import { db } from "@/lib/db";
import { ensureDefaultInstruments } from "@/server/auth/account";

async function main() {
  await ensureDefaultInstruments();
  const achievements = [
    ["First Trade", "Complete your first simulated execution.", { type: "trade_count", value: 1 }],
    ["First Profitable Trade", "Close a position with a positive realized result.", { type: "profitable_trade", value: 1 }],
    ["Portfolio Diversifier", "Hold three supported instruments at once.", { type: "open_positions", value: 3 }],
    ["Risk Manager", "Complete a trade with a documented conditional exit.", { type: "conditional_order", value: 1 }],
    ["One Hundred Trades", "Complete one hundred simulated executions.", { type: "trade_count", value: 100 }],
  ] as const;
  for (const [name, description, criteria] of achievements) await db.achievement.upsert({ where: { name }, create: { name, description, criteria }, update: { description, criteria } });
  await db.challenge.upsert({
    where: { id: "weekly-discipline-challenge" },
    create: { id: "weekly-discipline-challenge", name: "The 7-Day Discipline", description: "Build positive simulated performance while keeping your decisions measured.", startingCapital: "10000", startTime: new Date(), endTime: new Date(Date.now() + 7 * 86_400_000), configuration: { eligibleMarkets: ["CRYPTO"], maxLeverage: 1, ranking: "return_percentage", minimumTrades: 1 }, status: "ACTIVE" },
    update: {},
  });
  console.log("Seeded instruments, achievements, and the default challenge.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
