import{describe,it,expect}from'vitest';import{render}from'@testing-library/react';import{axe}from'vitest-axe';import React from'react';
// T-QA-2 replaces the starter fixture with all pages from page inventory, including error/empty states.
describe('baseline accessibility',()=>{it('has no axe violations in the semantic seed',async()=>{const view=render(<main><h1>Starter</h1><button type="button">Continue</button></main>);const results=await axe(view.container);expect(results.violations).toHaveLength(0);});});
