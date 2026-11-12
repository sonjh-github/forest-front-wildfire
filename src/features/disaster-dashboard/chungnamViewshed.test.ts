import { expect, it } from "vitest";
import { fromFile } from "geotiff";
import { chungnamCellVisible } from "./chungnamViewshed";

it("both supplied Chungnam TIFFs have visible cells while NoData remains transparent", async () => {
  for (const kind of ["tvws", "term"]) {
    const tiff = await fromFile(`public/chungnam-viewshed/${kind}.tif`);
    try {
      const image = await tiff.getImage();
      const noData = image.getGDALNoData();
      const values = await image.readRasters({ interleave: true });
      const counts = { visible: 0, transparent: 0 };
      for (let index = 0; index < values.length; index++) {
        if (chungnamCellVisible(Number(values[index]), noData)) counts.visible++;
        else counts.transparent++;
      }
      expect(counts.visible).toBe(kind === "tvws" ? 63777 : 51350);
      expect(counts.transparent).toBeGreaterThan(0);
      expect(chungnamCellVisible(255, noData)).toBe(false);
      expect(chungnamCellVisible(0, noData)).toBe(false);
    } finally { await tiff.close(); }
  }
});
