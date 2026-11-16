import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { reportRange, reportRows, type ReportFilters } from "@/lib/report";
import { safeCell, toCsv } from "@/lib/utils";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "analytics:read")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const f = Object.fromEntries(req.nextUrl.searchParams.entries()) as ReportFilters & { format?: string };
  const { from, to } = reportRange(f);
  const rows = await reportRows(f, user.role);
  await audit(user.id, "report.exported", "Report", undefined, `${rows.length} rows ${from}..${to} (${f.format ?? "csv"})`);
  const name = `aoj-engage-report-${from}-to-${to}`;

  if (f.format === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "AOJ Engage";
    const ws = wb.addWorksheet("Deliveries");
    const cols = rows[0] ? Object.keys(rows[0]) : ["campaign", "email", "status"];
    ws.columns = cols.map((k) => ({ header: k.replace(/_/g, " ").toUpperCase(), key: k, width: Math.min(40, Math.max(12, k.length + 4)) }));
    // Prefix formula-like values so spreadsheets never execute them.
    rows.forEach((r) => ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? safeCell(v) : v]))));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E2240" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
  }
  return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
