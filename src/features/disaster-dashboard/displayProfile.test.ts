import { describe, expect, it } from "vitest";
import {
  displayProfileClassName,
  getDisplayProfileConfig,
  isHybridExhibitionMode,
  parseDisplayProfile,
} from "./displayProfile";

describe("displayProfile", () => {
  it("defaults to command center", () => {
    expect(parseDisplayProfile("")).toBe("COMMAND_CENTER");
    expect(parseDisplayProfile("?demo=1")).toBe("COMMAND_CENTER");
  });

  it("selects field vehicle independently from data mode", () => {
    expect(parseDisplayProfile("?display=vehicle")).toBe("FIELD_VEHICLE");
    expect(parseDisplayProfile("?demo=1&display=vehicle")).toBe(
      "FIELD_VEHICLE",
    );
    expect(parseDisplayProfile("?field=1&display=vehicle")).toBe(
      "FIELD_VEHICLE",
    );
  });

  it("keeps unknown display values on the safe command-center default", () => {
    expect(parseDisplayProfile("?display=unknown")).toBe(
      "COMMAND_CENTER",
    );
  });

  it("defines a map-priority compact vehicle profile", () => {
    const profile = getDisplayProfileConfig("FIELD_VEHICLE");

    expect(profile.compact).toBe(true);
    expect(profile.mapPriority).toBe(true);
    expect(profile.showExtendedInspector).toBe(false);
    expect(profile.showDetailedKpi).toBe(false);
  });

  it("keeps full operational information in command-center profile", () => {
    const profile = getDisplayProfileConfig("COMMAND_CENTER");

    expect(profile.compact).toBe(false);
    expect(profile.showExtendedInspector).toBe(true);
    expect(profile.showVideoDeck).toBe(true);
    expect(profile.showEventTimeline).toBe(true);
    expect(profile.showDetailedKpi).toBe(true);
  });

  it("provides deterministic root CSS classes", () => {
    expect(displayProfileClassName("COMMAND_CENTER")).toBe(
      "display-profile-command-center",
    );
    expect(displayProfileClassName("FIELD_VEHICLE")).toBe(
      "display-profile-field-vehicle",
    );
  });

  it("enables the hybrid exhibition layout only for demo=1", () => {
    expect(isHybridExhibitionMode("?demo=1")).toBe(true);
    expect(isHybridExhibitionMode("?display=vehicle&demo=1")).toBe(true);
    expect(isHybridExhibitionMode("")).toBe(false);
    expect(isHybridExhibitionMode("?demo=0")).toBe(false);
    expect(isHybridExhibitionMode("?demo=true")).toBe(false);
  });
});
