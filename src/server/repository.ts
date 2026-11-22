export interface Repository<T extends { id: string }> {
 get(id: string): Promise<T | null>;
 list(limit: number, cursor?: string): Promise<{items: T[]; nextCursor: string | null}>;
 save(value: T): Promise<void>;
 delete(id: string): Promise<boolean>;
}
export class MemoryRepository<T extends {id: string}> implements Repository<T> {
 private data = new Map<string,T>();
 async get(id: string) { return this.data.get(id) ?? null; }
 async list(limit: number, cursor?: string) { const all=[...this.data.values()].sort((a,b)=>a.id.localeCompare(b.id)); const start=cursor?all.findIndex(x=>x.id===cursor)+1:0;const slice=all.slice(start,start+limit);return {items:slice,nextCursor:slice.length===limit?slice[slice.length-1]?.id ?? null:null}; }
 async save(value:T) { this.data.set(value.id, value); }
 async delete(id:string) {return this.data.delete(id);}
}
// A project must implement the production Firestore adapter behind Repository<T> in its entity slice.
