import { spawnSync } from "node:child_process";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertCommandExists(command: string): void {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    encoding: "utf8",
  });
  assert(probe.status === 0, `${command} executable is not on PATH`);
}

export function looksLikeContextError(text: string): boolean {
  return /context length|maximum context|context_length_exceeded|too many tokens|input tokens/i.test(
    text,
  );
}

/** True if `target` path appears in output, including Git-Bash `/d/foo` forms on Windows. */
export function outputIncludesPath(haystack: string, target: string): boolean {
  if (haystack.includes(target)) {
    return true;
  }
  // JSON stream payloads escape backslashes (`D:\\foo`).
  const jsonEscaped = target.replaceAll("\\", "\\\\");
  if (jsonEscaped !== target && haystack.includes(jsonEscaped)) {
    return true;
  }
  const lower = haystack.toLowerCase();
  const normalized = target.replaceAll("\\", "/");
  if (lower.includes(normalized.toLowerCase())) {
    return true;
  }
  const drive = target.match(/^([A-Za-z]):[\\/](.*)$/);
  if (drive) {
    const gitBash = `/${drive[1].toLowerCase()}/${drive[2].replaceAll("\\", "/")}`;
    if (lower.includes(gitBash.toLowerCase())) {
      return true;
    }
  }
  return lower.includes(target.toLowerCase());
}
