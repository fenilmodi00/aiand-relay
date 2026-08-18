import path from "node:path";
import { getDefaultModel } from "@aiandrelay/models";
import { parse as parseToml } from "smol-toml";
import { tomlString } from "../codex-app/toml.js";
import { AIAND_API_KEY_ENV_NAME } from "../aiand-core.js";
import {
  isPresentByBinaryOrDirectory,
  type NativeInjectResult,
  readTextIfExists,
  updatedOrCreatedStatus,
} from "../shared/native-user-config.js";
import { writeTextAtomic } from "../aiand-core.js";
import { AIAND_BASE_URL } from "../aiand-core.js";

const GROK_MODEL_SECTION = "model.aiand";
type ManagedGrokSectionKey = "model" | "base_url" | "name" | "env_key";

export type GrokConfigResult = NativeInjectResult<"invalid-toml">;

export function grokConfigDir(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return opts.env.GROK_HOME || path.join(opts.home, ".grok");
}

export function grokConfigPath(opts: { home: string; env: NodeJS.ProcessEnv }): string {
  return path.join(grokConfigDir(opts), "config.toml");
}

export function isGrokPresent(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
  binaryPresent: boolean;
}): boolean {
  return isPresentByBinaryOrDirectory(opts.binaryPresent, grokConfigDir(opts));
}

export async function injectGrokUserConfig(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): Promise<GrokConfigResult> {
  const filePath = grokConfigPath(opts);
  const existing = await readTextIfExists(filePath);
  const managedBlock = buildManagedGrokModelBlock();

  if (existing === undefined || existing.trim() === "") {
    await writeTextAtomic(filePath, managedBlock);
    return { status: "created", path: filePath };
  }

  try {
    parseToml(existing);
  } catch {
    return { status: "aborted", path: filePath, reason: "invalid-toml" };
  }

  const hadExistingManaged = /^\s*\[model\.aiand\]\s*$/m.test(existing);
  const nextText = hadExistingManaged
    ? upsertManagedGrokSection(existing, managedBlock)
    : `${existing.trimEnd()}\n\n${managedBlock}`;
  await writeTextAtomic(filePath, nextText);
  return { status: updatedOrCreatedStatus(hadExistingManaged), path: filePath };
}

function buildManagedGrokModelBlock(): string {
  const defaultModel = getDefaultModel();
  return [
    "[model.aiand]",
    `model = ${tomlString(defaultModel.id)}`,
    `base_url = ${tomlString(AIAND_BASE_URL)}`,
    `name = ${tomlString("ai& Default")}`,
    `env_key = ${tomlString(AIAND_API_KEY_ENV_NAME)}`,
    "",
  ].join("\n");
}

function upsertManagedGrokSection(raw: string, managedBlock: string): string {
  const lines = raw.split("\n");
  const sectionStart = lines.findIndex((line) => /^\s*\[model\.aiand\]\s*$/.test(line));
  if (sectionStart < 0) {
    return `${raw.trimEnd()}\n\n${managedBlock}`;
  }

  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index] ?? "")) {
      sectionEnd = index;
      break;
    }
  }

  const nextSection = mergeManagedGrokSection(lines.slice(sectionStart, sectionEnd));
  const prefix = lines.slice(0, sectionStart);
  const suffix = lines.slice(sectionEnd);
  return [...prefix, ...nextSection, ...suffix].join("\n").trimEnd() + "\n";
}

function mergeManagedGrokSection(sectionLines: string[]): string[] {
  const managedValues = managedGrokSectionValues();
  const seen = new Set<ManagedGrokSectionKey>();
  const nextLines = sectionLines.map((line, index) => {
    if (index === 0) {
      return line;
    }
    const match = /^(\s*)(model|base_url|name|env_key)(\s*=\s*)([^#\n]*?)(\s+#.*)?$/.exec(line);
    if (!match) {
      return line;
    }
    const key = match[2] as ManagedGrokSectionKey | undefined;
    if (!key || !(key in managedValues) || seen.has(key)) {
      return line;
    }
    seen.add(key);
    return `${match[1] ?? ""}${key}${match[3] ?? " = "}${managedValues[key]}${match[5] ?? ""}`;
  });

  for (const key of Object.keys(managedValues) as ManagedGrokSectionKey[]) {
    const value = managedValues[key];
    if (!seen.has(key)) {
      nextLines.push(`${key} = ${value}`);
    }
  }

  return nextLines;
}

function managedGrokSectionValues(): Record<ManagedGrokSectionKey, string> {
  const defaultModel = getDefaultModel();
  return {
    model: tomlString(defaultModel.id),
    base_url: tomlString(AIAND_BASE_URL),
    name: tomlString("ai& Default"),
    env_key: tomlString(AIAND_API_KEY_ENV_NAME),
  };
}
