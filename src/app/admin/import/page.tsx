import { Card, PageHeader } from "@/components/ui";
import { ImportTool } from "./ImportTool";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div>
      <PageHeader
        title="Import from Google Sheets / XLSX"
        description="Bring in your existing tracker. Ledger entries are recreated from shares, payments, and expenses."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ImportTool />
        </div>

        <Card className="p-4 text-sm text-slate-600">
          <h3 className="mb-2 font-semibold text-slate-700">
            Expected tabs &amp; columns
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Export your Google Sheet as <code>.xlsx</code> (File → Download →
            Microsoft Excel). The importer matches tabs by name and columns by
            common header names (case-insensitive).
          </p>
          <ul className="space-y-2 text-xs">
            <li>
              <strong>Players</strong>: name, display name, status, notes
            </li>
            <li>
              <strong>Bookings</strong>: booking code, play date, venue, courts,
              hours, rate, other fees, total
            </li>
            <li>
              <strong>Player Shares</strong>: player, booking code / date,
              units, amount owed
            </li>
            <li>
              <strong>Payments</strong>: player, date, amount, method,
              reference, booking code
            </li>
            <li>
              <strong>Team Expenses</strong>: expense code, date, description,
              paid by, total cost
            </li>
            <li>
              <strong>Expense Shares</strong>: player, expense code /
              description, amount owed
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Booking Summary and Dashboard tabs are ignored — those are
            recalculated automatically. After importing, compare the dashboard
            totals against your sheet.
          </p>
        </Card>
      </div>
    </div>
  );
}
