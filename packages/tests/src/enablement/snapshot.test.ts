import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  backupPaths,
  hasSnapshot,
  restoreSnapshot,
} from "../../../cli/src/lib/enablement/snapshot.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function tempRelayHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-snap-"));
  homes.push(home);
  return home;
}

describe("enablement snapshot", () => {
  test("round-trips existing bytes including comments", async () => {
    const relayHome = await tempRelayHome();
    const file = path.join(relayHome, "user", "opencode.jsonc");
    await mkdir(path.dirname(file), { recursive: true });
    const original = '{\n  // keep me\n  "provider": {}\n}\n';
    await writeFile(file, original, "utf8");

    await backupPaths(relayHome, "opencode", [file]);
    await writeFile(file, '{"provider":{"aiand":{}}}\n', "utf8");
    expect(await restoreSnapshot(relayHome, "opencode")).toBe("restored");
    expect(await readFile(file, "utf8")).toBe(original);
    expect(await hasSnapshot(relayHome, "opencode")).toBe(false);
  });

  test("second on does not overwrite the original backup", async () => {
    const relayHome = await tempRelayHome();
    const file = path.join(relayHome, "settings.json");
    await writeFile(file, "first\n", "utf8");
    await backupPaths(relayHome, "claude", [file]);
    await writeFile(file, "second\n", "utf8");
    await backupPaths(relayHome, "claude", [file]);
    await restoreSnapshot(relayHome, "claude");
    expect(await readFile(file, "utf8")).toBe("first\n");
  });

  test("missing files are recorded and deleted on restore", async () => {
    const relayHome = await tempRelayHome();
    const file = path.join(relayHome, "created-by-on.json");
    await backupPaths(relayHome, "pi", [file]);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{"aiand":true}\n', "utf8");
    await restoreSnapshot(relayHome, "pi");
    await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("restore without a snapshot is missing", async () => {
    const relayHome = await tempRelayHome();
    expect(await restoreSnapshot(relayHome, "hermes")).toBe("missing");
  });

  test("skips a directory occupying a file path", async () => {
    const relayHome = await tempRelayHome();
    const blocker = path.join(relayHome, "auth.json");
    await mkdir(blocker, { recursive: true });
    const other = path.join(relayHome, "models.json");
    await writeFile(other, "ok\n", "utf8");
    const manifest = await backupPaths(relayHome, "pi", [blocker, other]);
    expect(manifest.entries.map((entry) => entry.absPath)).toEqual([other]);
  });
});
