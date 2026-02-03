# Changes Made

## 1. No Type Duplication on Foreign Keys

**Before:**
```json
"user_id": {
  "type": "string",
  "format": "uuid",
  "$ref": "#/users/id",
  "$onDelete": "cascade"
}
```

**After:**
```json
"user_id": {
  "$ref": "#/properties/users/properties/id",
  "$onDelete": "cascade"
}
```

Type information is derived from the `$ref` target (DRY principle).

## 2. Proper JSON Schema $ref Paths

**Before:** `"$ref": "#/users/id"`
**After:** `"$ref": "#/properties/users/properties/id"`

Uses standard JSON Schema path format.

## 3. Omit Default ON DELETE/UPDATE Actions

**Before:**
```json
"user_id": {
  "$ref": "#/properties/users/properties/id",
  "$onDelete": "no action",
  "$onUpdate": "no action"
}
```

**After:**
```json
"user_id": {
  "$ref": "#/properties/users/properties/id"
}
```

Only includes `$onDelete`/`$onUpdate` when not "no action" (PostgreSQL default).

## 4. Auto-Generated PKs Not Required

**Before:**
```json
{
  "properties": {
    "id": { "type": "integer", "$primaryKey": true }
  },
  "required": ["id"]
}
```

**After:**
```json
{
  "properties": {
    "id": { "type": "integer", "$primaryKey": true }
  },
  "required": []
}
```

Primary keys are auto-generated and shouldn't be required for inserts.

## Summary

- **DRY principle**: No duplicate type info on FKs
- **Standards compliant**: Proper JSON Schema `$ref` paths
- **Cleaner output**: Omit default behaviors
- **Practical**: PKs optional (auto-generated)
