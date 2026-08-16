import { describe, expect, test } from "vitest";
import { quoteForCmd } from "../../../cli/src/lib/spawn-bin.js";

describe("quoteForCmd", () => {
  test("leaves simple tokens alone", () => {
    expect(quoteForCmd("--print")).toBe("--print");
    expect(quoteForCmd("hi")).toBe("hi");
  });

  test("quotes args with spaces", () => {
    expect(quoteForCmd("Reply with exactly: hi")).toBe('"Reply with exactly: hi"');
  });

  test("quotes args containing ampersand (cmd metachar)", () => {
    expect(quoteForCmd('model_providers.x.name="ai& Relay"')).toBe(
      '"model_providers.x.name=""ai& Relay"""',
    );
  });

  test("doubles embedded quotes for cmd.exe", () => {
    expect(quoteForCmd('say "hi"')).toBe('"say ""hi"""');
  });

  test("quotes empty string", () => {
    expect(quoteForCmd("")).toBe('""');
  });
});
