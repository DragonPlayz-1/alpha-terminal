import { JournalClient } from "@/components/journal-client";
import { ExportLink } from "@/components/export-link";

export default function JournalPage() { return <><JournalClient /><div className="mt-5"><ExportLink dataset="journal">Export all journal entries</ExportLink></div></>; }
