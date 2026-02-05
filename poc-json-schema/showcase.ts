import { convert } from "./src/index.js";
import { writeFileSync } from "fs";

// Medium complexity e-commerce schema showcasing all features
const pgSql = `
  -- Users table with various constraints
  -- Note: id is PRIMARY KEY (auto-generated, not in required array)
  -- Note: created_at uses computed default ($default)
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL CHECK (email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'),
    age INTEGER CHECK (age >= 18 AND age <= 120),
    account_status TEXT CHECK (account_status IN ('active', 'suspended', 'deleted')) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT now(),
    metadata JSONB
  );

  -- Products table
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price NUMERIC CHECK (price > 0) NOT NULL,
    stock INTEGER CHECK (stock >= 0) DEFAULT 0,
    category TEXT CHECK (category IN ('electronics', 'clothing', 'books', 'home', 'toys')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Orders table with foreign key
  -- Note: user_id uses $ref without type duplication
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    order_number VARCHAR(20) UNIQUE NOT NULL,
    status TEXT CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
    total_amount NUMERIC CHECK (total_amount >= 0) NOT NULL,
    shipping_address TEXT NOT NULL,
    order_date TIMESTAMP NOT NULL,
    shipped_date TIMESTAMP
  );

  -- Order items with multiple FKs (CASCADE and RESTRICT)
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER CHECK (quantity > 0) NOT NULL,
    unit_price NUMERIC CHECK (unit_price >= 0) NOT NULL,
    discount_percent INTEGER CHECK (discount_percent >= 0 AND discount_percent <= 100) DEFAULT 0
  );

  -- Reviews with SET NULL action
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    title VARCHAR(100),
    comment TEXT,
    verified_purchase BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL
  );

  -- Payment methods with NO ACTION (default, won't show in output)
  CREATE TABLE payment_methods (
    id INTEGER PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    method_type TEXT CHECK (method_type IN ('credit_card', 'debit_card', 'paypal', 'bank_transfer')),
    last_four VARCHAR(4),
    is_default BOOLEAN DEFAULT false,
    expires_at DATE
  );
`;

console.log("Converting PostgreSQL DDL to JSON Schema...\n");

const schema = await convert(pgSql);

// Write to file
const outputPath = "./schema.json";
writeFileSync(outputPath, JSON.stringify(schema, null, 2));

console.log(`✓ Conversion complete!`);
console.log(`✓ Output written to: ${outputPath}`);
console.log(`\nSchema summary:`);
console.log(`  - Tables: ${Object.keys(schema.properties).length}`);

let totalColumns = 0;
let constraintsCount = { pk: 0, fk: 0, index: 0, check: 0, default: 0 };

for (const [tableName, table] of Object.entries(schema.properties)) {
   const cols = Object.keys(table.properties).length;
   totalColumns += cols;

   for (const prop of Object.values(table.properties) as any[]) {
      if (prop.$primaryKey) constraintsCount.pk++;
      if (prop.$ref) constraintsCount.fk++;
      if (prop.$index) constraintsCount.index++;
      if (
         prop.minimum !== undefined ||
         prop.maximum !== undefined ||
         prop.enum ||
         prop.pattern
      ) {
         constraintsCount.check++;
      }
      if (prop.default !== undefined) constraintsCount.default++;
   }
}

console.log(`  - Columns: ${totalColumns}`);
console.log(`  - Primary keys: ${constraintsCount.pk}`);
console.log(`  - Foreign keys: ${constraintsCount.fk}`);
console.log(`  - Indexes: ${constraintsCount.index}`);
console.log(
   `  - CHECK constraints (validation rules): ${constraintsCount.check}`
);
console.log(`  - DEFAULT values: ${constraintsCount.default}`);

console.log(`\nKey features demonstrated:`);
console.log(`  - FK $ref without type duplication (DRY principle)`);
console.log(`  - Proper $ref paths: #/properties/table/properties/column`);
console.log(`  - $onDelete/$onUpdate only when not "no action" (default)`);
console.log(`  - Primary keys NOT in required (auto-generated)`);
console.log(
   `  - Computed defaults: $default for now(), CURRENT_TIMESTAMP, uuid_generate_v4()`
);
console.log(`\nValidation rules preserved:`);
console.log(`  - email pattern validation`);
console.log(`  - age range: 18-120`);
console.log(`  - rating enum: 1-5`);
console.log(`  - price > 0`);
console.log(`  - discount: 0-100%`);
console.log(`  - VARCHAR lengths (50, 100, 200, 255)`);

console.dir(
   JSON.stringify(
      await convert(`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('member', 'admin')) DEFAULT 'member'
);`),
      null,
      2
   ),
   { depth: null }
);
