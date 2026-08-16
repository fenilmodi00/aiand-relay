/**
 * Resolve + spawn PATH binaries so npm global shims work on Windows.
 *
 * On Unix, `spawn(bin, args)` is enough.
 * On Windows, `where` often returns an extensionless npm shim or a `.cmd`
 * wrapper that Node cannot exec without a shell. Prefer:
 *   1. a real `.exe` from `where`
 *   2. unwrap `.cmd` → nested `.exe` or `node script.js`
 *   3. only then `cmd.exe /c` with cmd-safe quoting (needed for leftover
 *      shims; avoided when possible because `&` in args like `name="ai& Relay"`
 *      is fragile under cmd)
 */
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function resolveBinPath(bin: string): string | null {
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? "where" : "which", [bin], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  if (!isWindows) {
    return lines[0] ?? null;
  }
  return (
    lines.find((line) => /\.exe$/i.test(line)) ??
    lines.find((line) => /\.cmd$/i.test(line)) ??
    lines.find((line) => /\.bat$/i.test(line)) ??
    lines[0] ??
    null
  );
}

/** Quote one argv token for `cmd.exe /c` (doubled quotes, not `\\"`). */
export function quoteForCmd(arg: string): string {
  if (arg.length === 0) {
    return '""';
  }
  if (!/[\s"&<>|^!]/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '""')}"`;
}

/** Unwrap an npm `.cmd` shim to `node script.js` or a nested `.exe`. */
export function resolveWindowsShimTarget(
  cmdPath: string,
): { command: string; prefixArgs: string[] } | null {
  if (!/\.cmd$/i.test(cmdPath) || !existsSync(cmdPath)) {
    return null;
  }
  let text: string;
  try {
    text = readFileSync(cmdPath, "utf8");
  } catch {
    return null;
  }
  const exe = text.match(/"(%~dp0%|%dp0%)\\([^"\r\n]+\.exe)"/i);
  if (exe?.[2]) {
    const absolute = join(dirname(cmdPath), exe[2].replace(/\//g, "\\"));
    if (existsSync(absolute)) {
      return { command: absolute, prefixArgs: [] };
    }
  }
  const js = text.match(/"%_prog%"\s+"(%~dp0%|%dp0%)\\([^"\r\n]+\.(?:js|mjs|cjs))"/i);
  if (js?.[2]) {
    const absolute = join(dirname(cmdPath), js[2].replace(/\//g, "\\"));
    if (existsSync(absolute)) {
      return { command: process.execPath, prefixArgs: [absolute] };
    }
  }
  return null;
}

export function spawnBinary(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  if (process.platform !== "win32") {
    return spawn(command, args, options);
  }

  const resolved = resolveBinPath(command) ?? command;
  if (/\.exe$/i.test(resolved)) {
    return spawn(resolved, args, options);
  }

  const unwrapped = resolveWindowsShimTarget(resolved);
  if (unwrapped) {
    return spawn(unwrapped.command, [...unwrapped.prefixArgs, ...args], options);
  }

  const cmdline = [resolved, ...args].map(quoteForCmd).join(" ");
  return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", cmdline], {
    ...options,
    windowsVerbatimArguments: true,
  });
}
