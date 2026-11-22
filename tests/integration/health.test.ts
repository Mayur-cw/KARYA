import request from 'supertest';import{describe,it,expect}from'vitest';import{createApp}from'../../src/server/app';
describe('health endpoint',()=>{it('returns the verified schema',async()=>{const response=await request(createApp()).get('/healthz');expect(response.status).toBe(200);expect(response.body).toEqual({status:'ok'});});});
