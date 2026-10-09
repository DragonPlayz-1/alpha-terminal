import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Decimal } from "@/lib/decimal";

const DEFAULT_INSTRUMENTS = [
  ["BTC-USD", "Bitcoin", "BTC"],
  ["ETH-USD", "Ethereum", "ETH"],
  ["SOL-USD", "Solana", "SOL"],
  ["XRP-USD", "XRP", "XRP"],
  ["DOGE-USD", "Dogecoin", "DOGE"],
  ["ADA-USD", "Cardano", "ADA"],
  ["AVAX-USD", "Avalanche", "AVAX"],
  ["LINK-USD", "Chainlink", "LINK"],
  ["LTC-USD", "Litecoin", "LTC"],
  ["DOT-USD", "Polkadot", "DOT"],
] as const;

export async function ensureDefaultInstruments(client: Prisma.TransactionClient | typeof db = db) {
  // Existing rows are the authoritative registry and are never overwritten by
  // a request. A fresh database can select Binance; its USDT quote is treated
  // as the simulator's USD reference price and is disclosed in metadata.
  const provider = process.env.MARKET_PROVIDER === "binance" ? "binance" : "coinbase";
  const providerSymbol = (baseAsset: string) => provider === "binance" ? `${baseAsset}USDT` : `${baseAsset}-USD`;
  for (const [symbol, name, baseAsset] of DEFAULT_INSTRUMENTS) {
    const mappedSymbol = providerSymbol(baseAsset);
    await client.instrument.createMany({ skipDuplicates: true,
        data: [{
          symbol,
          providerSymbol: mappedSymbol,
          name,
          baseAsset,
          quoteAsset: "USD",
          assetClass: "CRYPTO",
          instrumentType: "SPOT",
          dataProvider: provider,
          tickSize: ["DOGE", "ADA", "XRP"].includes(baseAsset) ? "0.00001" : "0.01",
          minimumQuantity: new Decimal(0.00000001).toFixed(),
        }],
      });
  }
  for (const base of ["BTC", "ETH", "SOL"]) {
    const symbol = `${base}-PERP`;
    const mappedSymbol = providerSymbol(base);
    const data = {
      providerSymbol: mappedSymbol,
      name: `${base} Simulated Perpetual`,
      baseAsset: base,
      quoteAsset: "USD",
      assetClass: "CRYPTO" as const,
      instrumentType: "PERPETUAL" as const,
      dataProvider: provider,
      maximumLeverage: 20,
      tickSize: "0.01",
      minimumQuantity: "0.00000001",
      metadata: { specification: "ALPHA linear USD simulator contract, not an exchange-listed future", contractMultiplier: "1", maintenanceRate: "0.025", liquidationFeeRate: "0.005", fundingRate: "0.0001", fundingIntervalHours: 8, mark: `${provider} public bid/ask midpoint`, providerQuoteAsset: provider === "binance" ? "USDT" : "USD", marginMode: "isolated", gapProtection: true },
    };
    await client.instrument.createMany({ skipDuplicates: true, data: [{ symbol, ...data }] });
  }
}

export async function createTradingAccount(
  userId: string,
  initialCapital: Decimal.Value,
  client: Prisma.TransactionClient,
  scope = "main",
) {
  const capital = new Decimal(initialCapital);
  if (!capital.isFinite() || capital.lessThan(100) || capital.greaterThan(1_000_000)) {
    throw new Error("Starting capital must be between $100 and $1,000,000.");
  }

  const account = await client.tradingAccount.create({
    data: {
      userId,
      scope,
      initialCapital: capital.toFixed(),
      availableCash: capital.toFixed(),
    },
  });

  await client.ledgerTransaction.create({
    data: {
      accountId: account.id,
      transactionType: "INITIAL_CAPITAL",
      description: "Initial simulated capital",
      entries: {
        create: {
          accountId: account.id,
          entryType: "CASH",
          assetCode: "USD",
          amount: capital.toFixed(),
        },
      },
    },
  });

  await client.portfolioSnapshot.create({ data: { accountId: account.id, equity: capital.toFixed(), cashBalance: capital.toFixed(), reservedCash: 0, spotValue: 0, realizedPnl: 0, unrealizedPnl: 0 } });

  return account;
}
