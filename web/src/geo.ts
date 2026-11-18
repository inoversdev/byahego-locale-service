import { feature } from 'topojson-client';
import { geoArea, geoBounds, geoCentroid, geoDistance } from 'd3-geo';
import * as isoCountries from 'i18n-iso-countries';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import topologyUrl from 'world-atlas/countries-50m.json?url';

export interface CountryShape {
  /** Stable position in the list; the id-map colour encodes `index + 1`. */
  index: number;
  /** ISO 3166-1 alpha-2, or null for territories the dataset has no code for. */
  code: string | null;
  name: string;
  feature: Feature<Geometry>;
  /** [longitude, latitude] of the largest landmass. */
  centroid: [number, number];
  /** Angular radius (radians) of the largest landmass. */
  radius: number;
}

// world-atlas leaves these without an ISO numeric id.
const NAME_OVERRIDES: Record<string, string> = { Kosovo: 'XK' };

const polygonsOf = (geometry: Geometry): Polygon[] => {
  if (geometry.type === 'Polygon') return [geometry];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
  }
  return [];
};

const measure = (geometry: Geometry): Pick<CountryShape, 'centroid' | 'radius'> => {
  const polygons = polygonsOf(geometry);

  if (polygons.length === 0) return { centroid: [0, 0], radius: 0.05 };

  const largest = polygons.reduce((best, polygon) =>
    geoArea({ type: 'Feature', properties: {}, geometry: polygon }) >
    geoArea({ type: 'Feature', properties: {}, geometry: best })
      ? polygon
      : best
  );

  const centroid = geoCentroid({ type: 'Feature', properties: {}, geometry: largest });
  const [[west, south], [east, north]] = geoBounds({
    type: 'Feature',
    properties: {},
    geometry: largest
  });
  const radius = Math.max(
    ...[
      [west, south],
      [west, north],
      [east, south],
      [east, north]
    ].map((corner) => geoDistance(centroid, corner as [number, number]))
  );

  return { centroid: [centroid[0], centroid[1]], radius };
};

export const loadShapes = async (): Promise<CountryShape[]> => {
  const response = await fetch(topologyUrl);

  if (!response.ok) throw new Error('Could not load the world map.');

  const topology = (await response.json()) as Topology;
  const collection = feature(
    topology,
    topology.objects.countries as GeometryCollection
  ) as FeatureCollection<Geometry, { name?: string }>;

  return collection.features.map((item, index): CountryShape => {
    const name = item.properties?.name ?? 'Unknown';
    const numeric = item.id === undefined ? undefined : String(item.id).padStart(3, '0');
    const code = (numeric && isoCountries.numericToAlpha2(numeric)) || NAME_OVERRIDES[name] || null;

    return { index, code, name, feature: item, ...measure(item.geometry) };
  });
};
