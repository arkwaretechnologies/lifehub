import fs from "fs";
import path from "path";

const src = process.argv[2] || "c:/Users/PC/Downloads/lab_tests_rows.csv";
const outPath = process.argv[3] || path.join("supabase", "_gen_lab_tests_values.sql");

const raw = fs.readFileSync(src, "utf8");
const lines = raw.trim().split("\n");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const hdr = parseCsvLine(lines[0]);
const rows = lines.slice(1).map(parseCsvLine);

function esc(s) {
  if (s == null || s === "") return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

const vals = rows
  .map((cols) => {
    const o = {};
    hdr.forEach((h, i) => {
      o[h] = cols[i] === "" ? null : cols[i];
    });
    const priceNum = o.price === null ? null : Number(o.price);
    const uh = o.turnaround_hours === null ? null : parseInt(String(o.turnaround_hours), 10);
    const unit = o.unit === null || o.unit === "" ? null : o.unit;

    const priceSql =
      priceNum === null || Number.isNaN(priceNum)
        ? "NULL"
        : priceNum.toFixed(2);

    const uhSql = uh === null || Number.isNaN(uh) ? "NULL" : String(uh);

    return (
      "(" +
      [
        esc(o.id),
        String(o.category_id),
        esc(o.code),
        esc(o.name),
        esc(o.description),
        esc(o.specimen_type),
        unit === null ? "NULL" : esc(unit),
        uhSql,
        priceSql,
        o.requires_fasting === "true" ? "true" : "false",
        String(o.sort_order ?? "0"),
        o.is_active === "true" ? "true" : "false",
      ].join(", ") +
      ")"
    );
  })
  .join(",\n  ");

fs.writeFileSync(outPath, "  " + vals + "\n", "utf8");
console.log("Wrote", outPath, "(" + rows.length + " rows)");
