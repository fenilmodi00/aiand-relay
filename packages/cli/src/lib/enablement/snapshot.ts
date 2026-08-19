import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeTextAtomic } from "../aiand-core.js";
import type { HarnessId } from "../harness.js";

export type SnapshotEntry = {
  absPath: string;
  /** Relative name under the snapshot dir. */
  storeAs: string;
  missing: boolean;
};

export type SnapshotManifest = {
  harnessId: HarnessId;
  createdAt: string;
  entries: SnapshotEntry[];
};

export function snapshotDir(relayHome: string, harnessId: HarnessId): string {
  return path.join(relayHome, "snapshots", harnessId);
}

function manifestPath(relayHome: string, harnessId: HarnessId): string {
  return path.join(snapshotDir(relayHome, harnessId), "manifest.json");
}

export async function readSnapshotManifest(
  relayHome: string,
  harnessId: HarnessId,
): Promise<SnapshotManifest | undefined> {
  try {
    const raw = await readFile(manifestPath(relayHome, harnessId), "utf8");
    return JSON.parse(raw) as SnapshotManifest;
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

export async function hasSnapshot(relayHome: string, harnessId: HarnessId): Promise<boolean> {
  return (await readSnapshotManifest(relayHome, harnessId)) !== undefined;
}

/**
 * Copy live files once. A second call is a no-op so later `on` runs cannot
 * overwrite the pre-connect original.
 */
export async function backupPaths(
  relayHome: string,
  harnessId: HarnessId,
  absPaths: string[],
): Promise<SnapshotManifest> {
  const existing = await readSnapshotManifest(relayHome, harnessId);
  if (existing) {
    const recorded = new Set(existing.entries.map((entry) => path.normalize(entry.absPath)));
    for (const absPath of absPaths) {
      if (!recorded.has(path.normalize(absPath))) {
        throw new Error(
          `Snapshot for ${harnessId} already exists at a different path set. Run \`${harnessId} off\` first.`,
        );
      }
    }
    return existing;
  }

  const dir = snapshotDir(relayHome, harnessId);
  await mkdir(dir, { recursive: true });
  const entries: SnapshotEntry[] = [];
  for (const [index, absPath] of absPaths.entries()) {
    const storeAs = `file-${index}`;
    let missing = false;
    try {
      const bytes = await readFile(absPath);
      await writeFile(path.join(dir, storeAs), bytes, { mode: 0o600 });
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") {
        missing = true;
      } else if (isNodeError(err) && err.code === "EISDIR") {
        // A directory occupying the path is not a prior file we can restore.
        continue;
      } else {
        throw err;
      }
    }
    entries.push({ absPath, storeAs, missing });
  }
  const manifest: SnapshotManifest = {
    harnessId,
    createdAt: new Date().toISOString(),
    entries,
  };
  await writeTextAtomic(
    manifestPath(relayHome, harnessId),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

export async function restoreSnapshot(
  relayHome: string,
  harnessId: HarnessId,
): Promise<"restored" | "missing"> {
  const manifest = await readSnapshotManifest(relayHome, harnessId);
  if (!manifest) {
    return "missing";
  }
  const dir = snapshotDir(relayHome, harnessId);
  for (const entry of manifest.entries) {
    if (entry.missing) {
      await unlink(entry.absPath).catch((err: unknown) => {
        if (!(isNodeError(err) && err.code === "ENOENT")) {
          throw err;
        }
      });
      continue;
    }
    const bytes = await readFile(path.join(dir, entry.storeAs));
    await mkdir(path.dirname(entry.absPath), { recursive: true });
    const tmp = `${entry.absPath}.tmp-${process.pid}`;
    await writeFile(tmp, bytes, { mode: 0o600 });
    const { rename } = await import("node:fs/promises");
    await rename(tmp, entry.absPath);
  }
  await rm(dir, { recursive: true, force: true });
  return "restored";
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
