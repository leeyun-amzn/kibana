/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { uniq, mapValues } from 'lodash';
import { PaletteOutput } from 'src/plugins/charts/public';
import { Datatable } from 'src/plugins/expressions';
import { FormatFactory } from '../types';

const isPrimitive = (value: unknown): boolean => value != null && typeof value !== 'object';

interface LayerColorConfig {
  palette?: PaletteOutput;
  splitAccessor?: string;
  accessors: string[];
  layerId: string;
}

export type ColorAssignments = Record<
  string,
  {
    totalSeriesCount: number;
    getRank(layer: LayerColorConfig, seriesKey: string, yAccessor: string): number;
  }
>;

export function getColorAssignments(
  layers: LayerColorConfig[],
  data: { tables: Record<string, Datatable> },
  formatFactory: FormatFactory
): ColorAssignments {
  const layersPerPalette: Record<string, LayerColorConfig[]> = {};

  layers.forEach((layer) => {
    const palette = layer.palette?.name || 'default';
    if (!layersPerPalette[palette]) {
      layersPerPalette[palette] = [];
    }
    layersPerPalette[palette].push(layer);
  });

  return mapValues(layersPerPalette, (paletteLayers) => {
    const seriesPerLayer = paletteLayers.map((layer, layerIndex) => {
      if (!layer.splitAccessor) {
        return { numberOfSeries: layer.accessors.length, splits: [] };
      }
      const splitAccessor = layer.splitAccessor;
      const column = data.tables[layer.layerId]?.columns.find(({ id }) => id === splitAccessor);
      const splits =
        !column || !data.tables[layer.layerId]
          ? []
          : uniq(
              data.tables[layer.layerId].rows.map((row) => {
                let value = row[splitAccessor];
                if (value && !isPrimitive(value)) {
                  value = formatFactory(column.meta.params).convert(value);
                } else {
                  value = String(value);
                }
                return value;
              })
            );
      return { numberOfSeries: (splits.length || 1) * layer.accessors.length, splits };
    });
    const totalSeriesCount = seriesPerLayer.reduce(
      (sum, perLayer) => sum + perLayer.numberOfSeries,
      0
    );
    return {
      totalSeriesCount,
      getRank(layer: LayerColorConfig, seriesKey: string, yAccessor: string) {
        const layerIndex = paletteLayers.indexOf(layer);
        const currentSeriesPerLayer = seriesPerLayer[layerIndex];
        const splitRank = currentSeriesPerLayer.splits.indexOf(seriesKey);
        return (
          (layerIndex === 0
            ? 0
            : seriesPerLayer
                .slice(0, layerIndex)
                .reduce((sum, perLayer) => sum + perLayer.numberOfSeries, 0)) +
          (layer.splitAccessor && splitRank !== -1 ? splitRank * layer.accessors.length : 0) +
          layer.accessors.indexOf(yAccessor)
        );
      },
    };
  });
}
