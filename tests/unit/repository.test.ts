import{describe,it,expect}from'vitest';import{MemoryRepository}from'../../src/server/repository';
describe('memory repository',()=>{it('stores and retrieves unique records',async()=>{const r=new MemoryRepository<{id:string;value:string}>();await r.save({id:'one',value:'first'});expect(await r.get('one')).toEqual({id:'one',value:'first'});expect(await r.get('missing')).toBeNull();});});
