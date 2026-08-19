import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { backupPaths } from "../../../cli/src/lib/enablement/snapshot.js";
import { runUninstall } from "../../../cli/src/lib/enablement/uninstall.js";
import { relayHomeFor } from "../../../cli/src/lib/enablement/relay-home.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("uninstall", () => {
  test("offs every snapshotted harness then removes the relay home", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-uninst-"));
    homes.push(home);
    const configPath = path.join(home, ".config", "opencode", "opencode.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    const original = "{\n  // keep me\n}\n";
    await writeFile(configPath, original, "utf8");

    const previous = process.env.AIANDRELAY_HOME;
    process.env.AIANDRELAY_HOME = path.join(home, ".aiandrelay");
    try {
      await backupPaths(relayHomeFor(home), "opencode", [configPath]);
      await writeFile(configPath, '{"provider":{"aiand":{}}}\n', "utf8");

      const result = await runUninstall({ home });
      expect(result.offErrors).toEqual([]);
      expect(await readFile(configPath, "utf8")).toBe(original);
      expect(existsSync(relayHomeFor(home))).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.AIANDRELAY_HOME;
      } else {
        process.env.AIANDRELAY_HOME = previous;
      }
    }
  });

  test("does not delete an unrelated binary named api", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-uninst-api-"));
    homes.push(home);
    const binDir = path.join(home, "bin");
    await mkdir(binDir, { recursive: true });
    const stray = path.join(binDir, "api");
    await writeFile(stray, "#!/bin/sh\necho unrelated\n", "utf8");

    const previousHome = process.env.AIANDRELAY_HOME;
    const previousPath = process.env.PATH;
    process.env.AIANDRELAY_HOME = path.join(home, ".aiandrelay");
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await runUninstall({ home });
      expect(result.removalFailures).toEqual([]);
      expect(await readFile(stray, "utf8")).toContain("unrelated");
    } finally {
      if (previousHome === undefined) {
        delete process.env.AIANDRELAY_HOME;
      } else {
        process.env.AIANDRELAY_HOME = previousHome;
      }
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
    }
  });
});
