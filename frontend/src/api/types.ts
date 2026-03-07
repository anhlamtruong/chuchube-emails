// --- Paginated response ---
export interface Paginated<T> {
  items: T[];
  total: number;
}
