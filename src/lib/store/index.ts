import { getDemoStore, isDemoMode } from '@/lib/demo';
import { SupabaseStore } from '@/lib/store/supabase-store';
import type { Store } from '@/lib/store/store';

export type { Store } from '@/lib/store/store';

let store: Store | null = null;

export function getStore(): Store {
  if (!store) store = isDemoMode() ? getDemoStore() : new SupabaseStore();
  return store;
}

/** Test seam. */
export function setStore(next: Store): void {
  store = next;
}
