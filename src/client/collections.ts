import { api } from './api';

export interface CollectionPage<T> { items: T[]; total: number; page: number; limit: number }
export function collectionItems<T>(data: CollectionPage<T> | T[] | { items: T[] }): T[] {
  return Array.isArray(data) ? data : data.items;
}

// Client-side filters and totals must include every server page, not just the first 20 records.
export async function fetchCollection<T>(path: string): Promise<T[]> {
  const first = await api<CollectionPage<T> | T[]>(path);
  if (Array.isArray(first)) return first;
  const items = [...first.items];
  if (!first.limit || !first.total) return items;
  for (let page = (first.page || 1) + 1; items.length < first.total; page += 1) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(first.limit));
    const next = await api<CollectionPage<T>>(`${url.pathname}${url.search}`);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return items;
}
