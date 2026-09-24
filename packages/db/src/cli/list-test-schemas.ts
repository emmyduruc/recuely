import { listRunSchemas, loadRepoEnv, resolveTestDatabase } from '../testing/index.ts';

// Evidence for SPEC.md §C1.1: after `pnpm test:int` the test database should hold no `it_*` schemas.
loadRepoEnv();
const schemas = await listRunSchemas(resolveTestDatabase(process.env));
console.log(schemas.length === 0 ? 'No it_* schemas in the test database.' : `Left over: ${schemas.join(', ')}`);
