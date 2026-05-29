import PosReportPage from "@/components/reports/PosReportPage";

export default function DailySalesSummaryPage() {
  return (
    <PosReportPage title="Daily Sales Summary" reportKey="daily-sales-summary" defaultDaysBack={1} />
  );
}
