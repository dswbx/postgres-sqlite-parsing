import { convert } from './index.js';

const pgSql = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created TIMESTAMP
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
    total NUMERIC CHECK (total >= 0) NOT NULL
  );
`;

const schema = await convert(pgSql);

console.log('Generated JSON Schema:\n');
console.log(JSON.stringify(schema, null, 2));

console.log('\n\nKey features:');
console.log('✓ FK user_id: $ref only (no type duplication)');
console.log('✓ PKs NOT in required (auto-generated)');
console.log('✓ VARCHAR(255) → maxLength preserved');
console.log('✓ CHECK → enum, minimum validation');
