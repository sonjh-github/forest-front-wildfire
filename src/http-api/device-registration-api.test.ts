import { describe, expect, it } from "vitest";
import {
  extractRegisteredAssetId,
  extractVendorMapping,
} from "./device-registration-api";

describe("device registration helpers", () => {
  it("extracts a direct asset_id", () => {
    expect(
      extractRegisteredAssetId({
        asset_id:
          "10000000-0000-4000-8000-000000000001",
      }),
    ).toBe(
      "10000000-0000-4000-8000-000000000001",
    );
  });

  it("extracts a nested asset id", () => {
    expect(
      extractRegisteredAssetId({
        asset: {
          asset_id:
            "20000000-0000-4000-8000-000000000002",
        },
      }),
    ).toBe(
      "20000000-0000-4000-8000-000000000002",
    );
  });

  it("extracts vendor mapping when present", () => {
    expect(
      extractVendorMapping({
        vendor_mapping: {
          vendor_code: "NDPS",
          status: "ACTIVE",
        },
      }),
    ).toMatchObject({
      vendor_code: "NDPS",
      status: "ACTIVE",
    });
  });
});
