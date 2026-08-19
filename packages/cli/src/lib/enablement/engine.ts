import { resolveAiandApiKey } from "../aiand-core.js";
import { HARNESS_LABEL, type HarnessId } from "../harness.js";
import type { HarnessContext } from "../harness-types.js";
import {
  printDetail,
  printHarnessConnected,
  printHarnessRestored,
  printHarnessUnchanged,
  printNote,
  printRestartHint,
} from "../cli/messages.js";
import { backupPaths, restoreSnapshot } from "./snapshot.js";
import { persistProfiles } from "./persist-profiles.js";
import { proxiedProfiles } from "./proxied-profiles.js";
import { relayHomeFor } from "./relay-home.js";
import { clearPersistentRegistration } from "./persistent-session.js";
import type { EnablementProfile } from "./types.js";
import { HARNESS } from "../harness.js";

const PROFILES: EnablementProfile[] = [...persistProfiles(), ...proxiedProfiles()];

export function getEnablementProfile(id: HarnessId): EnablementProfile {
  const profile = PROFILES.find((entry) => entry.id === id);
  if (!profile) {
    throw new Error(`No enablement profile for ${id}.`);
  }
  return profile;
}

export async function engineOn(id: HarnessId, ctx: HarnessContext): Promise<void> {
  const profile = getEnablementProfile(id);
  const apiKey = await resolveAiandApiKey({ apiKey: ctx.apiKey, home: ctx.home });
  if (!apiKey) {
    throw new Error("No ai& API key found. Run `aiandrelay configure` or set AIAND_API_KEY.");
  }
  const home = relayHomeFor(ctx.home);
  await backupPaths(home, id, profile.paths(ctx));
  const result = await profile.enable(ctx, apiKey);
  printHarnessConnected(result.label, result.model);
  if (result.auth) {
    printDetail("Auth", result.auth);
  }
  if (result.endpoint) {
    printDetail("Endpoint", result.endpoint);
  }
  for (const file of result.wrote ?? []) {
    printDetail("Wrote", file);
  }
  printRestartHint(result.restartHint);
}

export async function engineOff(id: HarnessId, ctx: HarnessContext): Promise<void> {
  const profile = getEnablementProfile(id);
  const outcome = await restoreSnapshot(relayHomeFor(ctx.home), id);
  if (id === HARNESS.CLAUDE || id === HARNESS.CODEX) {
    await clearPersistentRegistration(id, relayHomeFor(ctx.home));
  }
  if (outcome === "restored") {
    printHarnessRestored(profile.label);
    printRestartHint(profile.label);
    return;
  }
  printHarnessUnchanged(profile.label);
}

export async function engineStatus(id: HarnessId, ctx: HarnessContext): Promise<void> {
  const profile = getEnablementProfile(id);
  const status = await profile.status(ctx);
  console.log(profile.label);
  printDetail("Connection", status.connection);
  if (status.provider) {
    printDetail("Provider", status.provider);
  }
  if (status.auth) {
    printDetail("Auth", status.auth);
  }
  if (status.model) {
    printDetail("Model", status.model);
  }
  if (status.detail) {
    printNote(status.detail);
  }
}

export function printHarnessHelp(id: HarnessId): void {
  const profile = getEnablementProfile(id);
  const label = HARNESS_LABEL[id];
  const persistNote =
    profile.family === "persist"
      ? `Writes this tool's own config with an ai& provider. After on, run stock \`${id}\`.`
      : `Writes native config to the local daemon (not api.aiand.com). After on, run stock \`${id}\`. Keep the daemon running.`;
  console.log(`${label}

${persistNote}

Usage:
  aiandrelay ${id}              same as on
  aiandrelay ${id} on           route ${label} through ai&
  aiandrelay ${id} off          restore the pre-connect snapshot
  aiandrelay ${id} status       connection, provider, auth
  aiandrelay ${id} run [...]    optional wrapper session
  aiandrelay ${id} help

Key: paste via \`aiandrelay configure\` or AIAND_API_KEY / --api-key (no browser login).
Leave: \`aiandrelay uninstall\` runs off on every harness, then removes the CLI.
`);
}

export async function printGlobalStatus(ctx: HarnessContext): Promise<void> {
  const key = await resolveAiandApiKey({ apiKey: ctx.apiKey, home: ctx.home });
  console.log("aiandrelay");
  printDetail("Auth", key ? "stored (key hidden)" : "missing — run aiandrelay configure");
  console.log("");
  for (const profile of PROFILES) {
    const status = await profile.status(ctx);
    console.log(`${profile.label}: ${status.connection}`);
  }
}
