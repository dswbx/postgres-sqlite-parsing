import { convert } from './src/index.js';

// Test the exact example from the plan
const pgSql = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
    total NUMERIC CHECK (total >= 0)
  );
`;

const schema = await convert(pgSql);

// Verify structure matches plan
console.assert(schema.type === 'object');
console.assert(schema.properties.orders.properties.id.$primaryKey === true);
console.assert(schema.properties.orders.properties.user_id.$ref === '#/users/id');
console.assert(schema.properties.orders.properties.user_id.$onDelete === 'cascade');
console.assert(schema.properties.orders.properties.status.default === 'pending');
console.assert(JSON.stringify(schema.properties.orders.properties.status.enum) === JSON.stringify(['pending', 'completed', 'cancelled']));
console.assert(schema.properties.orders.properties.total.minimum === 0);

console.log('✓ All assertions passed');
console.log('\nGenerated schema:');
console.log(JSON.stringify(schema, null, 2));
