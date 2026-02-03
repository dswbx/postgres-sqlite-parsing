import { parse } from 'pgsql-parser';

const queries = [
  'SELECT 1',
  'SELECT id, name FROM users WHERE age > 18',
  'SELECT u.id, u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE o.status = \'completed\' ORDER BY o.created_at DESC LIMIT 10',
  'INSERT INTO users (name, email, created_at) VALUES (\'John\', \'john@example.com\', NOW())',
  'UPDATE users SET last_login = NOW() WHERE id = 42',
  'CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT, user_id INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())',
  'WITH recent_orders AS (SELECT * FROM orders WHERE created_at > NOW() - INTERVAL \'7 days\') SELECT user_id, COUNT(*) as order_count FROM recent_orders GROUP BY user_id HAVING COUNT(*) > 5'
];

for (const query of queries) {
  console.log('\n' + '='.repeat(80));
  console.log('Query:', query);
  console.log('='.repeat(80));
  try {
    const result = await parse(query);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}
