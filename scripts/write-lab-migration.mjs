import fs from "fs";
import path from "path";

const root = process.cwd();

const preamble = `-- Laboratory request form support + reproducible catalog seed (LifeHub LH lab template parity).
--
-- Applies:
-- - lab_requests.clinical_diagnosis — free text lined up with consultation lab request modal.
-- - Upsert lab_categories (fixed ids 1–8) matching supabase/seeds/lab_categories_rows.csv.
-- - Upsert lab_tests from generated VALUES (same UUIDs/specimens as seeds/lab_tests_rows.csv).

alter table public.lab_requests add column if not exists clinical_diagnosis text;

comment on column public.lab_requests.clinical_diagnosis is 'Clinical data / provisional diagnosis on the laboratory request form.';

-- Categories (bigint identity ids must match seeded lab_tests.category_id FK targets).
insert into public.lab_categories (id, code, name, description, sort_order, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'HEMA', 'Hematology', null, 1, true),
  (2, 'SERO', 'Serology', null, 2, true),
  (3, 'MICRO', 'Microbiology', null, 3, true),
  (4, 'MISC', 'Miscellaneous', null, 4, true),
  (5, 'CHEM', 'Clinical Chemistry', null, 5, true),
  (6, 'UA_FECAL', 'URINALYSIS & FECALYSIS', null, 6, true),
  (7, 'CARD', 'Cardiac Markers', null, 7, true),
  (8, 'IMAG', 'Imaging', null, 8, true)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

do $$
declare
  vseq text := pg_get_serial_sequence('public.lab_categories', 'id');
begin
  if vseq is not null then
    execute format(
      'select setval(%L, coalesce((select max(id) from public.lab_categories), 1))',
      vseq
    );
  end if;
end $$;

`;

const genPath = path.join(root, "supabase", "_gen_lab_tests_values.sql");
const valsRaw = fs.readFileSync(genPath, "utf8");
const vals = valsRaw
  .trim()
  .split("\n")
  .map((l) => l.replace(/^\s+/, ""))
  .join("\n");

const insertTests = `
insert into public.lab_tests (
  id,
  category_id,
  code,
  name,
  description,
  specimen_type,
  unit,
  turnaround_hours,
  price,
  requires_fasting,
  sort_order,
  is_active
) values
${vals}
on conflict (id) do update set
  category_id = excluded.category_id,
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  specimen_type = excluded.specimen_type,
  unit = excluded.unit,
  turnaround_hours = excluded.turnaround_hours,
  price = excluded.price,
  requires_fasting = excluded.requires_fasting,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now ();

`;

const full = preamble + insertTests;

const migrationPath = path.join(root, "supabase", "migrations", "20260209130000_lab_request_and_catalog_seed.sql");

fs.mkdirSync(path.dirname(migrationPath), { recursive: true });

fs.writeFileSync(migrationPath, full.trim() + "\n", "utf8");
console.log("Wrote", migrationPath);
