import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeJsonAtomic, writeTextAtomic } from "../../../cli/src/lib/aiand-core.js";

describe("writeTextAtomic / writeJsonAtomic", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "aiandrelay-atomic-write-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("writeTextAtomic creates parent dirs and replaces the target", async () => {
    const filePath = path.join(tmpDir, "nested", "dir", "notes.jsonc");
    await writeTextAtomic(filePath, "{ /* patched */ }\n");
    await expect(readFile(filePath, "utf8")).resolves.toBe("{ /* patched */ }\n");
  });

  test("writeTextAtomic uses mode 0o600 on unix", async () => {
    if (process.platform === "win32") {
      return;
    }
    const filePath = path.join(tmpDir, "secret.txt");
    await writeTextAtomic(filePath, "plain\n");
    const info = await stat(filePath);
    expect(info.mode & 0o777).toBe(0o600);
  });

  test("writeJsonAtomic still pretty-prints with a trailing newline via writeTextAtomic", async () => {
    const filePath = path.join(tmpDir, "deep", "config.json");
    await mkdir(path.join(tmpDir, "deep"), { recursive: true });
    await writeJsonAtomic(filePath, { apiKey: "not-logged" });
    await expect(readFile(filePath, "utf8")).resolves.toBe('{\n  "apiKey": "not-logged"\n}\n');
  });
});
