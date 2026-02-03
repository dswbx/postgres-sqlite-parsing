import { convert } from './index.js';

const pgSql = `
  -- Custom ENUM type
  CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered');

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    tags TEXT[],
    created TIMESTAMP
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status order_status DEFAULT 'pending',
    items JSONB,
    total NUMERIC(10,2) CHECK (total >= 0) NOT NULL,
    matrix INTEGER[][]
  );
`;

const schema = await convert(pgSql);

console.log('Generated JSON Schema:\n');
console.log(JSON.stringify(schema, null, 2));

console.log('\n\nKey features:');
console.log('- FK user_id: $ref only (no type duplication)');
console.log('- PKs NOT in required (auto-generated)');
console.log('- VARCHAR(255) -> maxLength preserved');
console.log('- CHECK -> enum, minimum validation');
console.log('- TEXT[] -> { type: "array", items: { type: "string" } }');
console.log('- INTEGER[][] -> nested arrays');
console.log('- CREATE TYPE ENUM -> $defs + $ref');
console.log('- NUMERIC(10,2) -> multipleOf: 0.01');
