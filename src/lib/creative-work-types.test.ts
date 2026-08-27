import { describe, expect, it } from "vitest";
import {
  parseCreativeWorkType,
  workTypeFromProductionEntry,
} from "./creative-work-types";

describe("creative work types", () => {
  it("defines the actual stages for each production job", () => {
    expect(
      parseCreativeWorkType("full-chain").stages,
    ).toEqual([
      "plan",
      "analysis",
      "arcs",
      "highlights",
      "scripts",
      "prerolls",
      "outputs",
    ]);
    expect(
      parseCreativeWorkType("highlight-preroll").stages,
    ).toEqual([
      "plan",
      "analysis",
      "arcs",
      "scripts",
      "prerolls",
      "outputs",
    ]);
    expect(
      parseCreativeWorkType("batch-highlights").stages,
    ).toEqual(["plan", "highlights"]);
  });

  it("maps persisted entries and invalid routes safely", () => {
    expect(
      workTypeFromProductionEntry("uploaded_highlights")
        .id,
    ).toBe("highlight-preroll");
    expect(parseCreativeWorkType("unknown").id).toBe(
      "full-chain",
    );
  });
});
