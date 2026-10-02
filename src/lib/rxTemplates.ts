import { readdir, readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { constants as fsConstants } from "fs";

export const RX_TEMPLATES_DIR = path.join(process.cwd(), "templates", "RX");
export const RX_TEMPLATE_DEFAULT_FILENAME = "RX Template.pdf";

/** Local fallback when `users.rx_template_filename` is not migrated yet. */
const RX_SELECTIONS_FILE = path.join(RX_TEMPLATES_DIR, ".user-selections.json");

/** True for Admin / Physician (case-insensitive). */
export function userRoleCanSelectRxTemplate(roleName: string): boolean {
  const r = roleName.trim().toUpperCase();
  return r === "PHYSICIAN" || r === "ADMIN" || r === "ADMINISTRATOR";
}

/** Reject path traversal; allow only a PDF basename. */
export function sanitizeRxTemplateBasename(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.includes("/") || s.includes("\\") || s.includes("\0") || s === "." || s === "..") return null;
  if (path.basename(s) !== s) return null;
  if (!/\.pdf$/i.test(s)) return null;
  return s;
}

export function rxTemplateAbsolutePath(basename: string): string {
  return path.join(RX_TEMPLATES_DIR, basename);
}

export async function listRxTemplateFilenames(): Promise<string[]> {
  try {
    const entries = await readdir(RX_TEMPLATES_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.pdf$/i.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  } catch {
    return [];
  }
}

export async function rxTemplateFileExists(basename: string): Promise<boolean> {
  const safe = sanitizeRxTemplateBasename(basename);
  if (!safe) return false;
  try {
    await access(rxTemplateAbsolutePath(safe), fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readRxTemplateBytes(basename: string): Promise<Buffer | null> {
  const safe = sanitizeRxTemplateBasename(basename);
  if (!safe) return null;
  try {
    return await readFile(rxTemplateAbsolutePath(safe));
  } catch {
    return null;
  }
}

/**
 * Prefer the user's selection when the file exists; else default `RX Template.pdf`;
 * else the first PDF in the folder.
 */
export async function resolveRxTemplateBasenameForUser(
  preferred: string | null | undefined,
): Promise<string | null> {
  const preferredSafe = sanitizeRxTemplateBasename(preferred);
  if (preferredSafe && (await rxTemplateFileExists(preferredSafe))) return preferredSafe;
  if (await rxTemplateFileExists(RX_TEMPLATE_DEFAULT_FILENAME)) return RX_TEMPLATE_DEFAULT_FILENAME;
  const files = await listRxTemplateFilenames();
  return files[0] ?? null;
}

function isMissingRxColumnError(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("rx_template_filename") && (m.includes("does not exist") || m.includes("42703"));
}

async function readFilesystemSelections(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(RX_SELECTIONS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const safe = sanitizeRxTemplateBasename(typeof v === "string" ? v : null);
      if (safe) out[k] = safe;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeFilesystemSelection(userId: number, filename: string | null): Promise<void> {
  await mkdir(RX_TEMPLATES_DIR, { recursive: true });
  const map = await readFilesystemSelections();
  const key = String(userId);
  if (filename) map[key] = filename;
  else delete map[key];
  await writeFile(RX_SELECTIONS_FILE, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

async function filesystemSelectionForUser(userId: number): Promise<string | null> {
  const map = await readFilesystemSelections();
  return sanitizeRxTemplateBasename(map[String(userId)] ?? null);
}

export async function fetchUserRxTemplateFilename(
  db: SupabaseClient,
  userId: number,
): Promise<{ filename: string | null; role: string | null; error: string | null }> {
  const { data: roleRow, error: roleErr } = await db
    .from("users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleErr) return { filename: null, role: null, error: roleErr.message };
  if (!roleRow) return { filename: null, role: null, error: "User not found." };
  const role = String((roleRow as { role?: string }).role ?? "").trim() || null;

  const { data, error } = await db
    .from("users")
    .select("rx_template_filename")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRxColumnError(error.message)) {
      const filename = await filesystemSelectionForUser(userId);
      return { filename, role, error: null };
    }
    return { filename: null, role, error: error.message };
  }

  const raw = (data as { rx_template_filename?: string | null } | null)?.rx_template_filename;
  const filename = sanitizeRxTemplateBasename(raw);
  if (filename) return { filename, role, error: null };

  // Prefer DB null; fall back to filesystem only when DB value is empty (migration/transition).
  const fsFilename = await filesystemSelectionForUser(userId);
  return { filename: fsFilename, role, error: null };
}

export async function setUserRxTemplateFilename(
  db: SupabaseClient,
  userId: number,
  filename: string | null,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("users")
    .update({
      rx_template_filename: filename,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    if (isMissingRxColumnError(error.message)) {
      try {
        await writeFilesystemSelection(userId, filename);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to save RX template preference." };
      }
    }
    return { error: error.message };
  }

  // Keep filesystem in sync so prefs survive if column is rolled back.
  try {
    await writeFilesystemSelection(userId, filename);
  } catch {
    // DB write succeeded; ignore secondary sync errors.
  }
  return { error: null };
}
