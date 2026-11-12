import { CHUNGNAM_VIEWSHED_CONFIG } from "./chungnamViewshedConfig";

export type ChungnamViewshedKind = "tvws" | "term";

export type ChungnamViewshedRaster = {
  url: string;
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
};

const CNU_CRS =
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs";

const cache = new Map<
  ChungnamViewshedKind,
  Promise<ChungnamViewshedRaster>
>();

export function chungnamCellVisible(value: number, noData: number | null) {
  return value !== noData && value === 1;
}

export function loadChungnamViewshedRaster(
  kind: ChungnamViewshedKind,
): Promise<ChungnamViewshedRaster> {
  const cached = cache.get(kind);

  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const [{ fromUrl }, proj4Module] = await Promise.all([
      import("geotiff"),
      import("proj4"),
    ]);

    const project = proj4Module.default;

    const config =
      kind === "tvws"
        ? CHUNGNAM_VIEWSHED_CONFIG.tvws
        : CHUNGNAM_VIEWSHED_CONFIG.term;

    const tiff = await fromUrl(config.url);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();

    const raster = await image.readRasters({
      interleave: true,
    });

    const values = raster as unknown as ArrayLike<number>;
    const noData = image.getGDALNoData();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("CNU viewshed canvas context unavailable");
    }

    const pixels = context.createImageData(width, height);

    for (let index = 0; index < width * height; index += 1) {
      const value = Number(values[index]);
      const offset = index * 4;
      if (!chungnamCellVisible(value, noData)) continue;

      if (kind === "tvws" && value === 1) {
        pixels.data[offset] = 18;
        pixels.data[offset + 1] = 145;
        pixels.data[offset + 2] = 155;
        pixels.data[offset + 3] = 118;
      } else if (kind === "term" && value === 1) {
        pixels.data[offset] = 216;
        pixels.data[offset + 1] = 74;
        pixels.data[offset + 2] = 54;
        pixels.data[offset + 3] = 180;
      } else {
        pixels.data[offset] = 0;
        pixels.data[offset + 1] = 0;
        pixels.data[offset + 2] = 0;
        pixels.data[offset + 3] = 0;
      }
    }

    context.putImageData(pixels, 0, 0);

    const [minX, minY, maxX, maxY] =
      image.getBoundingBox();

    const transform = (
      x: number,
      y: number,
    ): [number, number] => {
      const coordinate = project(
        CNU_CRS,
        "WGS84",
        [x, y],
      );

      return [
        Number(coordinate[0]),
        Number(coordinate[1]),
      ];
    };

    const coordinates: ChungnamViewshedRaster["coordinates"] = [
      transform(minX, maxY),
      transform(maxX, maxY),
      transform(maxX, minY),
      transform(minX, minY),
    ];

    return {
      url: canvas.toDataURL("image/png"),
      coordinates,
    };
  })();

  cache.set(kind, promise);
  void promise.catch(() => { if (cache.get(kind) === promise) cache.delete(kind); });

  return promise;
}
