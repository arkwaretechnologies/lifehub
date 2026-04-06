import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

/**
 * bcryptjs v3 may emit `$2b$…`; Postgres `crypt()` / many SQL auth routines only accept `$2a$…`.
 * The ciphertext is the same — only the version prefix differs — so we normalize for DB compatibility.
 */
export function normalizeBcryptPrefixForPostgres(hash: string): string {
  if (hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return `$2a$${hash.slice(4)}`;
  }
  return hash;
}

export async function hashPasswordForUsersTable(plain: string): Promise<string> {
  const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  return normalizeBcryptPrefixForPostgres(hash);
}
