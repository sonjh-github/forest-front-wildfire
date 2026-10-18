import { describe, expect, it } from "vitest";
import {
  EXHIBITION_TOUR_STEPS,
  isExhibitionTourStepAvailable,
} from "./exhibitionTour";

describe("exhibition tour", () => {
  it("keeps the five manual presentation stages in a stable order", () => {
    expect(EXHIBITION_TOUR_STEPS.map((step) => step.id)).toEqual([
      "overview",
      "incident",
      "positioning",
      "communication",
      "response",
    ]);
  });

  it("marks stages without received data as unavailable", () => {
    const availability = {
      hasIncident: true,
      positioningCount: 0,
      communicationCount: 0,
      responseCount: 4,
    };

    expect(isExhibitionTourStepAvailable("incident", availability)).toBe(true);
    expect(isExhibitionTourStepAvailable("positioning", availability)).toBe(false);
    expect(isExhibitionTourStepAvailable("communication", availability)).toBe(false);
    expect(isExhibitionTourStepAvailable("response", availability)).toBe(true);
  });
});
