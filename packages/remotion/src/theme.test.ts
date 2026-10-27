import { describe, expect, it } from "vitest";
import { THEMES, resolveTheme } from "./theme.js";

describe("resolveTheme", () => {
  it("returns built-in themes by name", () => {
    expect(resolveTheme("light")).toBe(THEMES.light);
  });

  it("applies a custom theme's overrides to its base", () => {
    const theme = resolveTheme({ base: "light", colors: { packet: "#22d3ee" }, nodes: "icon" });
    expect(theme).toEqual({ ...THEMES.light, packet: "#22d3ee" });
  });
});
