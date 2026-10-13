import { OrdersClient } from "@/components/orders-client";
import { ExportLink } from "@/components/export-link";

export default function HistoryPage() { return <><OrdersClient history /><div className="mt-5"><ExportLink dataset="executions">Export all executions</ExportLink></div></>; }
