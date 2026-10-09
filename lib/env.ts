import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).refine(value => value.startsWith("postgresql://") || value.startsWith("postgres://"), "DATABASE_URL must be a PostgreSQL connection string."),
  NEXT_PUBLIC_APP_NAME: z.string().default("ALPHA TERMINAL"),
  NEXT_PUBLIC_APP_URL: z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol), "NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.").default("http://localhost:3000"),
  APP_URL: z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol), "APP_URL must use HTTP or HTTPS.").optional(),
  MARKET_PROVIDER: z.enum(["coinbase", "binance"]).default("coinbase"),
  BINANCE_REST_URL: z.string().url().default("https://data-api.binance.vision"),
  QUOTE_MAX_AGE_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  TRADING_FEE_RATE: z.coerce.number().nonnegative().max(0.1).default(0.001),
  SESSION_SECRET: z.string().min(32).optional(),
  SMTP_URL: z.string().url().refine(value => ["smtp:", "smtps:"].includes(new URL(value).protocol), "SMTP_URL must use smtp or smtps.").optional(),
  MAIL_FROM: z.string().trim().max(320).optional(),
  TRUSTED_ORIGINS: z.string().max(2000).default(""),
  TRUSTED_CLIENT_IP_HEADER: z.string().regex(/^[A-Za-z0-9-]{1,80}$/).or(z.literal("")).default(""),
});

const parsedEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  APP_URL: process.env.APP_URL,
  MARKET_PROVIDER: process.env.MARKET_PROVIDER,
  BINANCE_REST_URL: process.env.BINANCE_REST_URL,
  QUOTE_MAX_AGE_MS: process.env.QUOTE_MAX_AGE_MS,
  TRADING_FEE_RATE: process.env.TRADING_FEE_RATE,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SMTP_URL: process.env.SMTP_URL,
  MAIL_FROM: process.env.MAIL_FROM,
  TRUSTED_ORIGINS: process.env.TRUSTED_ORIGINS,
  TRUSTED_CLIENT_IP_HEADER: process.env.TRUSTED_CLIENT_IP_HEADER,
});

if (process.env.NODE_ENV === "production" && !parsedEnv.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production.");
}

export const env = parsedEnv;
