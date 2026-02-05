#!/usr/bin/env node
import { translate } from './index.js';
import { readFileSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: pg2sqlite <sql-string-or-file>');
    console.error('');
    console.error('Examples:');
    console.error('  pg2sqlite "CREATE TABLE users (id SERIAL PRIMARY KEY);"');
    console.error('  pg2sqlite schema.sql');
    console.error('  cat schema.sql | pg2sqlite -');
    process.exit(1);
  }

  let sql: string;

  if (args[0] === '-') {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    sql = Buffer.concat(chunks).toString('utf-8');
  } else if (args[0].endsWith('.sql') || args[0].includes('/')) {
    // Treat as file path
    try {
      sql = readFileSync(args[0], 'utf-8');
    } catch (e) {
      console.error(`Error reading file: ${args[0]}`);
      process.exit(1);
    }
  } else {
    // Treat as SQL string
    sql = args[0];
  }

  try {
    const result = await translate(sql);
    console.log(result);
  } catch (error) {
    console.error('Translation error:', (error as Error).message);
    process.exit(1);
  }
}

main();
