CREATE TABLE "WorkerLease" (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "lastSuccessAt" TIMESTAMP(3)
);
