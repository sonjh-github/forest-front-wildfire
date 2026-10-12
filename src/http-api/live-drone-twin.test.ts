import {
  describe,
  it,
  expect,
  vi,
} from "vitest";

import {
  mergeDroneTwins,
  twinState,
  LiveDroneTelemetryReader,
} from "./live-drone-twin";

const time =
  "2026-09-12T01:00:00.000Z";

const now = Date.parse(time);

const assets = [
  {
    assetId: "canonical-uuid",
    assetCode: "MD1000-01",
    eventId: "flight",
    assetName: "등록 드론",
    attributes: {
      registered: true,
    },
  },
];

const row = {
  assetId: "MD1000-01",
  sourceAssetId: "MD1000-01",
  eventId: "flight",

  observedAt: time,
  receivedAt: time,

  latitude: 37.55,
  longitude: 128.4,
  altitude: 123,

  batteryPct: 78,

  packetLossPct: 1.5,

  // Core Dashboard API의 현재 응답
  positioningMethod: "RTK",

  attributes: {
    flightMode: "CUSTOM_MODE 4",
    telemetryPositionSource:
      "GLOBAL_POSITION_INT(33)",

    gpsFixType: 6,
    satellitesVisible: 18,

    hdop: 0.85,
    vdop: 1.2,

    horizontalAccuracy: 0.35,
    verticalAccuracy: 0.65,

    linkQuality: {
      mavlinkVersion: 2,
      mavlinkSystemId: 1,
      mavlinkComponentId: 1,
      mavlinkSequence: 42,
      mavlinkMessageId: 33,
      windowExpected: 100,
      windowReceived: 98,
      windowLost: 2,
      packetLossPct: 1.5,
      periodAvgMs: 64.01,
      periodP95Ms: 78,
      periodMaxMs: 82,
    },
  },
};

describe("live drone twin", () => {
  it(
    "preserves canonical identity and maps GPS quality",
    () => {
      const result =
        mergeDroneTwins(
          assets,
          [row],
          "flight",
          now,
        );

      expect(result.matched).toBe(1);

      expect(result.states).toEqual({
        LIVE: 1,
        STALE: 0,
        OFFLINE: 0,
      });

      expect(
        result.assets[0],
      ).toMatchObject({
        assetId:
          "canonical-uuid",

        assetName:
          "등록 드론",

        sourceAssetId:
          "MD1000-01",

        batteryPct: 78,

        packetLossPct: 1.5,

        positioningMethod:
          "RTK_FIXED",

        horizontalAccuracyM:
          0.35,

        geometry: {
          coordinates: [
            128.4,
            37.55,
            123,
          ],
        },

        attributes: {
          registered: true,
          flightMode:
            "CUSTOM_MODE 4",

          gpsFixType: 6,
          satellitesVisible: 18,

          hdop: 0.85,
          vdop: 1.2,

          horizontalAccuracy:
            0.35,

          verticalAccuracy:
            0.65,

          linkQuality: {
            mavlinkVersion: 2,
            mavlinkSystemId: 1,
            mavlinkComponentId: 1,
            mavlinkSequence: 42,
            mavlinkMessageId: 33,
            windowExpected: 100,
            windowReceived: 98,
            windowLost: 2,
            packetLossPct: 1.5,
            periodAvgMs: 64.01,
            periodP95Ms: 78,
            periodMaxMs: 82,
          },
        },
      });
    },
  );

  it(
    "maps RTK FLOAT separately from RTK FIXED",
    () => {
      const result =
        mergeDroneTwins(
          assets,
          [
            {
              ...row,
              attributes: {
                ...row.attributes,
                gpsFixType: 5,
              },
            },
          ],
          "flight",
          now,
        );

      expect(
        result.assets[0]
          .positioningMethod,
      ).toBe("RTK_FLOAT");
    },
  );

  it(
    "does not invent assets for unknown, cross-event, ambiguous identities or invalid coordinates",
    () => {
      expect(
        mergeDroneTwins(
          assets,
          [
            {
              ...row,
              assetId: "other",
              sourceAssetId: "other",
            },
          ],
          "flight",
          now,
        ).unmatched,
      ).toBe(1);

      expect(
        mergeDroneTwins(
          assets,
          [
            {
              ...row,
              eventId: "other",
            },
          ],
          "flight",
          now,
        ).matched,
      ).toBe(0);

      expect(
        mergeDroneTwins(
          [
            ...assets,
            {
              ...assets[0],
              assetId: "uuid2",
            },
          ],
          [row],
          "flight",
          now,
        ).matched,
      ).toBe(0);

      expect(
        mergeDroneTwins(
          assets,
          [
            {
              ...row,
              latitude: NaN,
            },
          ],
          "flight",
          now,
        ).matched,
      ).toBe(0);
    },
  );

  it(
    "supports explicit source mapping without replacing UUID",
    () => {
      expect(
        mergeDroneTwins(
          [
            {
              ...assets[0],
              assetCode: "other",

              specifications: {
                telemetrySourceAssetId:
                  "MD1000-01",
              },
            },
          ],
          [row],
          "flight",
          now,
        ).matched,
      ).toBe(1);
    },
  );

  it(
    "ages LIVE / STALE / OFFLINE using observation time",
    () => {
      expect(
        twinState(
          time,
          time,
          now + 9999,
        ),
      ).toBe("LIVE");

      expect(
        twinState(
          time,
          time,
          now + 10000,
        ),
      ).toBe("STALE");

      expect(
        twinState(
          time,
          time,
          now + 30000,
        ),
      ).toBe("OFFLINE");

      expect(
        twinState(
          time,
          new Date(
            now + 40000,
          ).toISOString(),
          now + 40000,
        ),
      ).toBe("OFFLINE");
    },
  );

  it(
    "DEMO never fetches live data",
    async () => {
      const reader =
        new LiveDroneTelemetryReader();

      const fetch =
        vi.fn(async () => [row]);

      expect(
        (
          await reader.read(
            "flight",
            true,
            fetch,
          )
        ).rows,
      ).toEqual([]);

      expect(
        fetch,
      ).not.toHaveBeenCalled();

      expect(
        (
          await reader.read(
            "flight",
            false,
            async () => {
              throw Error();
            },
          )
        ).rows,
      ).toEqual([]);

      await reader.read(
        "flight",
        false,
        fetch,
      );

      const failed =
        await reader.read(
          "flight",
          false,
          async () => {
            throw Error();
          },
        );

      expect(
        failed.status,
      ).toBe("UNAVAILABLE");

      expect(
        failed.rows[0].observedAt,
      ).toBe(time);

      expect(
        (
          await reader.read(
            "other",
            false,
            async () => {
              throw Error();
            },
          )
        ).rows,
      ).toEqual([]);
    },
  );
});
