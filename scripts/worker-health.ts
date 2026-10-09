import { db } from "@/lib/db";
import { workerHealth } from "@/server/worker-health";
workerHealth().then(health => { process.exitCode = health.healthy ? 0 : 1; }).catch(() => { process.exitCode = 1; }).finally(() => db.$disconnect());
