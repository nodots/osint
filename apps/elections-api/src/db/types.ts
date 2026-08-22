import { customType } from "drizzle-orm/pg-core";

// PostGIS geography columns. Drizzle treats these as opaque; we read/write the
// geometry via ST_AsGeoJSON / ST_GeomFromGeoJSON in raw SQL where needed.

export const geographyPoint = customType<{
  data: { lat: number; lon: number };
  driverData: string;
}>({
  dataType() {
    return "geography(Point, 4326)";
  },
});

// Congressional district boundaries (imported from Census TIGER/Line shapes,
// versioned by cycle/map).
export const geographyMultiPolygon = customType<{
  data: unknown;
  driverData: string;
}>({
  dataType() {
    return "geography(MultiPolygon, 4326)";
  },
});
