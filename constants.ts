
import { Recipe } from './types';

export const STOCK_MIN_THRESHOLD = 50000; // 50,000 kg

export const RECIPE: Recipe = {
  'Brita 0': 2000,
  'Brita 1': 6000,
  'Areia Média': 6000,
  'Areia de Brita': 1300
};

export const LOAD_VOLUME_M3 = 8;

export const MATERIALS_LIST = ['Brita 0', 'Brita 1', 'Areia Média', 'Areia de Brita'] as const;
