import { expect, it } from "vitest";
import { markerReceptionState } from "./markerReception";

it("expires at 30 seconds without reception and recovers on a new receipt", () => {
  const at = "2026-11-12T07:00:00Z";
  const now = Date.parse(at);
  expect(markerReceptionState(at, at, now + 29_999)).toBe("LIVE");
  expect(markerReceptionState(at, at, now + 30_000)).toBe("OFFLINE");
  expect(markerReceptionState(new Date(now + 31_000).toISOString(), at, now + 31_000)).toBe("LIVE");
  expect(markerReceptionState(undefined, at, now + 30_000)).toBe("OFFLINE");
  expect(markerReceptionState(undefined, "", now)).toBe("OFFLINE");
});
