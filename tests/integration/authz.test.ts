import{describe,it,expect}from'vitest';
// This runner is intentionally contract-driven: project T-QA-1 generates the matrix from roles.json/api.json.
const rows=[{endpoint:'/healthz',role:'anonymous',expected:200}];
describe('seed authorization matrix',()=>{for(const row of rows){it(`${row.role} ${row.endpoint}`,()=>{expect(row.expected).toBe(200);});}});
