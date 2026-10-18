export type DisplayProfile =
  | "COMMAND_CENTER"
  | "FIELD_VEHICLE";

export type DisplayProfileConfig = {
  profile: DisplayProfile;
  label: string;
  compact: boolean;
  mapPriority: boolean;
  showExtendedInspector: boolean;
  showVideoDeck: boolean;
  showEventTimeline: boolean;
  showDetailedKpi: boolean;
};

export const DISPLAY_PROFILES: Record<DisplayProfile, DisplayProfileConfig> = {
  COMMAND_CENTER: {
    profile: "COMMAND_CENTER",
    label: "통합 관제",
    compact: false,
    mapPriority: false,
    showExtendedInspector: true,
    showVideoDeck: true,
    showEventTimeline: true,
    showDetailedKpi: true,
  },

  FIELD_VEHICLE: {
    profile: "FIELD_VEHICLE",
    label: "차량 관제",
    compact: true,
    mapPriority: true,
    showExtendedInspector: false,
    showVideoDeck: false,
    showEventTimeline: false,
    showDetailedKpi: false,
  },
};

export function parseDisplayProfile(
  search: string,
): DisplayProfile {
  const params = new URLSearchParams(search);
  const value = params.get("display")?.trim().toLowerCase();

  if (
    value === "vehicle" ||
    value === "field-vehicle" ||
    value === "field_vehicle"
  ) {
    return "FIELD_VEHICLE";
  }

  return "COMMAND_CENTER";
}

export function getDisplayProfileConfig(
  profile: DisplayProfile,
): DisplayProfileConfig {
  return DISPLAY_PROFILES[profile];
}

export function displayProfileClassName(
  profile: DisplayProfile,
): string {
  return profile === "FIELD_VEHICLE"
    ? "display-profile-field-vehicle"
    : "display-profile-command-center";
}

export function isHybridExhibitionMode(search: string): boolean {
  return new URLSearchParams(search).get("demo") === "1";
}
