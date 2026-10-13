import { PortfolioClient } from "@/components/portfolio-client";
import { ExportLink } from "@/components/export-link";

export default function PortfolioPage() { return <><PortfolioClient /><div className="mt-5"><ExportLink dataset="snapshots">Export all account snapshots</ExportLink></div></>; }
