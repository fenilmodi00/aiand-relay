import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { renderBannerArt } from "../../../cli/src/lib/cli/banner.js";

describe("install banner", () => {
  test("plain art contains ai& Relay and no markup when color is off", () => {
    const art = renderBannerArt({ color: false });
    expect(art).toContain("ai&");
    expect(art).toContain("Relay");
    expect(art).not.toMatch(/\{brand\}/);
    expect(art).not.toMatch(/\x1b\[/);
  });

  test("colored art uses ANSI when color is on", () => {
    const art = renderBannerArt({ color: true });
    expect(art).toContain("\x1b[");
    expect(art).toContain("ai&");
  });

  test("install.sh prints the banner on the finish screen", async () => {
    const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");
    const install = await readFile(path.join(repoRoot, "scripts", "install.sh"), "utf8");
    expect(install).toContain("aiandrelay banner install");
    expect((install.match(/banner install/g) ?? []).length).toBe(1);
  });
});
