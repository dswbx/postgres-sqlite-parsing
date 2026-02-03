# PostgreSQL DDL Test Schemas

Test schemas at varying complexity levels for pg-to-json-schema conversion.

## Simple (Currently Supported)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  age INTEGER CHECK (age >= 18),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  status TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  view_count INTEGER DEFAULT 0 CHECK (view_count >= 0)
);
```

**Features:**
- Basic types: INTEGER, VARCHAR(n), TEXT, BOOLEAN, TIMESTAMP
- PRIMARY KEY (single column)
- NOT NULL
- UNIQUE
- CHECK: range (`>= n`), enum (`IN (...)`)
- DEFAULT: constants, CURRENT_TIMESTAMP, NOW()
- REFERENCES with ON DELETE

---

## Medium (Partially Supported)

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  cost NUMERIC(10,2) CHECK (cost >= 0),
  weight_kg DECIMAL(8,3),
  tags TEXT[],                           -- ✅ ARRAY supported
  metadata JSONB DEFAULT '{}',
  rating NUMERIC(2,1) CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,  -- self-ref
  path LTREE,                            -- LTREE: unsupported
  description TEXT
);

CREATE TABLE product_categories (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)  -- composite PK: unsupported
);

CREATE INDEX idx_products_name ON products(name);           -- CREATE INDEX: unsupported
CREATE INDEX idx_products_tags ON products USING GIN(tags); -- GIN index: unsupported
```

**Supported:**
- UUID with gen_random_uuid()
- NUMERIC(p,s), DECIMAL → `multipleOf`
- ARRAY types (`TEXT[]`, `INTEGER[][]`)
- TIMESTAMPTZ
- JSONB with default
- Self-referential FK
- Compound CHECK (AND)

**Unsupported:**
- LTREE, TSVECTOR, other extensions
- Composite PRIMARY KEY
- CREATE INDEX statements
- GIN/GiST/BRIN indexes

---

## Advanced (Mostly Unsupported)

```sql
-- ENUM type (✅ supported → $defs + $ref)
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(20) GENERATED ALWAYS AS (
    'ORD-' || LPAD(id::TEXT, 10, '0')
  ) STORED,                                    -- generated column: unsupported
  user_id UUID NOT NULL REFERENCES users(id),
  status order_status DEFAULT 'pending',       -- ✅ custom ENUM → $ref: "#/$defs/order_status"
  items JSONB NOT NULL,
  subtotal NUMERIC(12,2) GENERATED ALWAYS AS ( -- generated from JSONB: unsupported
    (SELECT SUM((item->>'price')::NUMERIC * (item->>'qty')::INTEGER)
     FROM jsonb_array_elements(items) AS item)
  ) STORED,
  tax_rate NUMERIC(5,4) DEFAULT 0.0825,
  total NUMERIC(12,2) GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED,
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_items CHECK (jsonb_typeof(items) = 'array'),  -- JSONB check: unsupported
  CONSTRAINT positive_total CHECK (total > 0)
);

-- Partitioned table
CREATE TABLE events (
  id BIGSERIAL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);             -- PARTITION: unsupported

CREATE TABLE events_2024_q1 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

-- Table with exclusion constraint
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL,
  during TSTZRANGE NOT NULL,
  EXCLUDE USING GIST (room_id WITH =, during WITH &&)  -- EXCLUDE: unsupported
);

-- Materialized view
CREATE MATERIALIZED VIEW product_stats AS    -- MAT VIEW: unsupported
  SELECT
    p.id,
    p.name,
    COUNT(oi.id) as order_count,
    AVG(oi.quantity) as avg_qty
  FROM products p
  LEFT JOIN order_items oi ON oi.product_id = p.id
  GROUP BY p.id;

-- Table with row-level security
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  is_public BOOLEAN DEFAULT false
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;  -- RLS: unsupported
CREATE POLICY docs_owner ON documents
  USING (owner_id = current_user_id());

-- Trigger (for updated_at)
CREATE OR REPLACE FUNCTION update_timestamp()   -- FUNCTION: unsupported
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at                    -- TRIGGER: unsupported
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Foreign table (postgres_fdw)
CREATE FOREIGN TABLE external_users (           -- FOREIGN TABLE: unsupported
  id INTEGER,
  name TEXT
) SERVER remote_server OPTIONS (table_name 'users');
```

**Supported Features:**
- CREATE TYPE AS ENUM → `$defs` + `$ref`
- Custom ENUM type references

**Unsupported Features:**
- CREATE TYPE (composite, domain) - only ENUM supported
- GENERATED columns (STORED/VIRTUAL)
- JSONB function calls in CHECK
- PARTITION BY
- EXCLUDE constraints
- MATERIALIZED VIEW
- ROW LEVEL SECURITY
- FUNCTION/TRIGGER
- FOREIGN TABLE
- ALTER TABLE statements

---

## Support Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| **Types** | | |
| INTEGER, BIGINT, SMALLINT | ✅ | → `integer` |
| SERIAL, BIGSERIAL | ✅ | → `integer` |
| NUMERIC, DECIMAL | ✅ | → `number` |
| NUMERIC(p,s), DECIMAL(p,s) | ✅ | → `number` + `multipleOf` |
| VARCHAR(n), CHAR(n) | ✅ | → `string` + `maxLength` |
| TEXT | ✅ | → `string` |
| BOOLEAN | ✅ | → `boolean` |
| TIMESTAMP, TIMESTAMPTZ | ✅ | → `string` + `date-time` |
| DATE | ✅ | → `string` + `date` |
| TIME, TIMETZ | ✅ | → `string` + `time` |
| UUID | ✅ | → `string` + `uuid` |
| BYTEA | ✅ | → `string` + `binary` |
| JSON, JSONB | ✅ | → `object` |
| ARRAY types | ✅ | → `array` + `items` (multi-dim supported) |
| Custom ENUM | ✅ | → `$defs` + `$ref` |
| LTREE, HSTORE | ❌ | extensions |
| TSTZRANGE, etc | ❌ | range types |
| **Constraints** | | |
| PRIMARY KEY (single) | ✅ | → `$primaryKey` |
| PRIMARY KEY (composite) | ❌ | table-level, complex |
| NOT NULL | ✅ | → `required[]` |
| UNIQUE (column) | ✅ | → `$index: "unique"` |
| UNIQUE (composite) | ❌ | table-level |
| CHECK `>= n` | ✅ | → `minimum` |
| CHECK `<= n` | ✅ | → `maximum` |
| CHECK `IN (...)` | ✅ | → `enum` |
| CHECK `~ 'pattern'` | ✅ | → `pattern` |
| CHECK (multi-column) | ❌ | cross-column logic |
| CHECK (function call) | ❌ | runtime evaluation |
| FOREIGN KEY | ✅ | → `$ref` |
| ON DELETE/UPDATE | ✅ | → `$onDelete/$onUpdate` |
| EXCLUDE | ❌ | complex |
| **Defaults** | | |
| Literal values | ✅ | → `default` |
| NOW(), CURRENT_TIMESTAMP | ✅ | → `$default` |
| uuid_generate_v4(), gen_random_uuid() | ✅ | → `$default` |
| Complex expressions | ⚠️ | → `$default: "EXPRESSION"` |
| GENERATED columns | ❌ | not parsed |
| **DDL Statements** | | |
| CREATE TABLE | ✅ | main entry point |
| CREATE TYPE AS ENUM | ✅ | → `$defs` |
| CREATE INDEX | ❌ | ignored |
| CREATE TYPE (composite) | ❌ | ignored |
| CREATE VIEW | ❌ | ignored |
| CREATE FUNCTION | ❌ | ignored |
| ALTER TABLE | ❌ | ignored |
| CREATE TRIGGER | ❌ | ignored |
| PARTITION BY | ❌ | ignored |

---

## Unresolved Questions

1. ~~Arrays → use `type: "array"` + `items`?~~ ✅ Yes, multi-dim supported
2. Composite PK → `$primaryKey: ["col1", "col2"]` at table level?
3. ~~Custom ENUMs → inline expand or separate `$defs`?~~ ✅ `$defs` + `$ref`
4. Multi-column UNIQUE → table-level `$uniqueConstraints`?
5. Partial indexes → just ignore, or `$comment`?
6. Generated columns → mark as `readOnly: true`?
