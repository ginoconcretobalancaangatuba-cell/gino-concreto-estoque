
export type MaterialName = 'Brita 0' | 'Brita 1' | 'Areia Média' | 'Areia de Brita';

export interface StockState {
  'Brita 0': number;
  'Brita 1': number;
  'Areia Média': number;
  'Areia de Brita': number;
}

export type TransactionType = 'INVOICE' | 'SCALE_REPORT';

export interface Transaction {
  id: string;
  timestamp: number;
  type: TransactionType;
  material?: MaterialName;
  quantity: number; // in kg
  details?: string;
}

export interface Recipe {
  'Brita 0': number;
  'Brita 1': number;
  'Areia Média': number;
  'Areia de Brita': number;
}
