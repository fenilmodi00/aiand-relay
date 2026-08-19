import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RegisterSessionRequest } from "../daemon/state.js";
import { aiandrelayHome } from "../paths.js";

export type PersistentAgent = "claude" | "codex";

export function persistentRegistrationPath(
  agent: PersistentAgent,
  home = aiandrelayHome(),
): string {
  return path.join(home, "persistent", `${agent}.json`);
}

export async function writePersistentRegistration(
  agent: PersistentAgent,
  registration: RegisterSessionRequest,
  home = aiandrelayHome(),
): Promise<void> {
  const file = persistentRegistrationPath(agent, home);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(registration, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const { rename } = await import("node:fs/promises");
  await rename(tmp, file);
}

export async function clearPersistentRegistration(
  agent: PersistentAgent,
  home = aiandrelayHome(),
): Promise<void> {
  await rm(persistentRegistrationPath(agent, home), { force: true });
}

export async function readPersistentRegistration(
  agent: PersistentAgent,
  home = aiandrelayHome(),
): Promise<RegisterSessionRequest | undefined> {
  let raw: string;
  try {
    raw = await readFile(persistentRegistrationPath(agent, home), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as RegisterSessionRequest;
    if (
      typeof parsed.token === "string" &&
      parsed.token !== "" &&
      typeof parsed.apiKey === "string" &&
      parsed.apiKey !== "" &&
      typeof parsed.modelLabel === "string" &&
      typeof parsed.modelDefinition === "object" &&
      parsed.modelDefinition !== null
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function findPersistentRegistrationByToken(
  token: string,
  home = aiandrelayHome(),
): Promise<RegisterSessionRequest | undefined> {
  for (const agent of ["claude", "codex"] as const) {
    const registration = await readPersistentRegistration(agent, home);
    if (!registration) {
      continue;
    }
    if (registration.token === token || registration.authToken === token) {
      return registration;
    }
  }
  return undefined;
}
