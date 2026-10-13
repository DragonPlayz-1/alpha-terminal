import { db } from "@/lib/db";
import { z } from "zod";

export const journalContentSchema = z.object({
  title: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).transform(tags => [...new Set(tags)]).optional(),
  emotionalState: z.enum(["CALM", "FOCUSED", "CONFIDENT", "ANXIOUS", "FOMO", "UNCERTAIN"]).nullable().optional(),
  outcome: z.enum(["OPEN", "WIN", "LOSS", "BREAKEVEN"]).nullable().optional(),
}).strict();

export async function journalAccount(userId: string, scope: string) {
  const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId, scope } } });
  if (!account) throw new Error("Trading account unavailable.");
  return account;
}
