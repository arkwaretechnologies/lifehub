import type { LabRequestHeaderView, LabRequestItemView } from "@/app/api/laboratory/lab-request/route";
import { formatDateMMDDYYYY, formatLabTime } from "@/lib/dateDisplay";

export type LabTestChecklistSection = {
  categoryName: string;
  items: LabRequestItemView[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLabRequestDateTime(requestDate: string, requestTime: string | null): string {
  const d = formatDateMMDDYYYY(requestDate);
  const t = formatLabTime(requestTime);
  if (!d) return t === "—" ? "—" : t;
  return t === "—" ? d : `${d} · ${t}`;
}

function formatPatientAgeSex(header: LabRequestHeaderView): string {
  const parts: string[] = [];
  const sex = (header.patient_sex ?? "").trim();
  if (sex) parts.push(sex.toUpperCase());
  const age = header.patient_age_years;
  if (age != null && Number.isFinite(age)) parts.push(`${age} y/o`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function headerField(label: string, value: string): string {
  return `<div class="hdr-field">
  <div class="hdr-label">${escapeHtml(label)}</div>
  <div class="hdr-value">${escapeHtml(value)}</div>
</div>`;
}

function formatTestHints(it: LabRequestItemView): string {
  const parts: string[] = [];
  const unit = (it.result_unit ?? "").trim();
  const ref = (it.reference_range ?? "").trim();
  if (unit) parts.push(`Unit: ${unit}`);
  if (ref) parts.push(`Ref: ${ref}`);
  return parts.join(" · ");
}

function renderTestRow(it: LabRequestItemView): string {
  const name = (it.test_name ?? it.lab_test_id ?? "—").trim() || "—";
  const code = (it.test_code ?? "").trim();
  const label = code ? `${name} (${code})` : name;
  const hints = formatTestHints(it);
  const hintsHtml = hints
    ? `<div class="test-hints">${escapeHtml(hints)}</div>`
    : "";

  return `<div class="test-row">
  <div class="test-info">
    <div class="test-name">${escapeHtml(label)}</div>
    ${hintsHtml}
  </div>
  <span class="result-line" aria-hidden="true"></span>
</div>`;
}

function renderCategorySection(section: LabTestChecklistSection): string {
  const rows = section.items.map((it) => renderTestRow(it)).join("");

  return `<section class="category-block">
  <h2 class="category-title">${escapeHtml(section.categoryName)}</h2>
  <div class="test-list">${rows}</div>
</section>`;
}

function openChecklistPrintHtml(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Lab test checklist print");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (win != null) {
      win.focus();
      win.print();
    }
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 120_000);
  };
}

export function openLabTestChecklistPrintWindow(args: {
  header: LabRequestHeaderView;
  sections: LabTestChecklistSection[];
}): void {
  const { header, sections } = args;
  const nonEmpty = sections.filter((s) => s.items.length > 0);
  if (nonEmpty.length === 0) return;

  const when = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const patientName = (header.patient_name ?? "—").trim() || "—";
  const patientId = header.patient_id != null ? String(header.patient_id) : "—";
  const queueNo = (header.queue_display ?? "—").trim() || "—";
  const requestWhen = formatLabRequestDateTime(header.request_date, header.request_time);
  const physician = (header.requesting_physician ?? "—").trim() || "—";
  const labRequestId = (header.id ?? "—").trim() || "—";

  const headerLeft = [
    headerField("Patient", patientName),
    headerField("Queue No.", queueNo),
    headerField("Sex / Age", formatPatientAgeSex(header)),
    headerField("Lab Request ID", labRequestId),
  ].join("");

  const headerRight = [
    headerField("Patient ID", patientId),
    headerField("Request Date / Time", requestWhen),
    headerField("Requesting Physician", physician),
  ].join("");

  const categoriesHtml = nonEmpty.map((s) => renderCategorySection(s)).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LifeHub — Laboratory test checklist</title>
  <style>
    @page { size: letter; margin: 10mm 12mm; }
    html, body { padding: 0; margin: 0; }
    body {
      font-family: "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.25;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc { width: 100%; }
    .doc-title {
      text-align: center;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #1f4e79;
      margin: 0 0 3px;
    }
    .printed-at {
      font-size: 8.5pt;
      color: #555;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 24px;
      margin-bottom: 10px;
      padding: 8px 10px;
      border: 1px solid #ccc;
      border-radius: 3px;
      background: #f8fafc;
    }
    .hdr-label {
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
      margin-bottom: 1px;
    }
    .hdr-value {
      font-size: 9pt;
      font-weight: 700;
      word-break: break-word;
      line-height: 1.2;
    }
    .header-col { display: flex; flex-direction: column; gap: 5px; }
    .categories-wrap {
      column-count: 3;
      column-gap: 14px;
    }
    .category-block {
      break-inside: avoid;
      margin-bottom: 10px;
    }
    .category-title {
      font-size: 9pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin: 0 0 4px;
      padding-bottom: 3px;
      border-bottom: 2px solid #1f4e79;
      color: #1f4e79;
      line-height: 1.2;
    }
    .test-list { display: flex; flex-direction: column; gap: 5px; }
    .test-row {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }
    .test-info {
      flex: 0 1 58%;
      min-width: 0;
    }
    .test-name {
      font-weight: 700;
      font-size: 8pt;
      line-height: 1.2;
      color: #111;
    }
    .test-hints {
      font-size: 7pt;
      color: #666;
      margin-top: 1px;
      line-height: 1.15;
    }
    .result-line {
      flex: 1 1 auto;
      min-width: 36px;
      border-bottom: 1px solid #000;
      height: 1.1em;
      margin-bottom: 2px;
    }
    @media print {
      .category-block { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <div class="doc-title">
      <h1>LifeHub — Laboratory Test Checklist</h1>
      <div class="printed-at">Printed ${escapeHtml(when)}</div>
    </div>
    <div class="header-grid">
      <div class="header-col">${headerLeft}</div>
      <div class="header-col">${headerRight}</div>
    </div>
    <div class="categories-wrap">${categoriesHtml}</div>
  </div>
</body>
</html>`;

  openChecklistPrintHtml(html);
}
