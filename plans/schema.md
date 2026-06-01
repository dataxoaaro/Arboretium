# Arboretum Mapper — Database Schema

D1 (SQLite). Reflects migrations 0001–0007. See [`arboretum_prd.md`](./arboretum_prd.md) §8.4 for the high-level spec.

## ER diagram

```mermaid
erDiagram
    users ||--o{ properties : "owns"
    users ||--o{ property_members : "memberships"
    users ||--o{ password_reset_tokens : "issued / target"
    users ||--o{ plants : "created_by / last_edited_by"
    users ||--o{ photos : "uploaded_by"
    properties ||--o{ property_members : ""
    properties ||--o{ plants : "audit attribution"
    properties ||--o{ cells : "audit attribution"
    properties ||--o{ photos : "cell-photos via cell_property_id"
    plants ||--o{ photos : "plant-photos"

    users {
        TEXT id PK
        TEXT email "UNIQUE, lowercased"
        TEXT password_hash "PBKDF2-SHA256"
        TEXT display_name
        INTEGER created_at "unix ms"
    }

    properties {
        TEXT id PK
        TEXT owner_id FK
        TEXT name
        TEXT boundary_geojson "nullable"
        TEXT included_hexes "JSON array of H3 res-15"
        REAL center_lat
        REAL center_lng
        INTEGER archived_at "NULL=active"
        INTEGER created_at
        INTEGER updated_at
    }

    property_members {
        TEXT property_id PK,FK
        TEXT user_id PK,FK
        TEXT added_by FK
        INTEGER added_at
    }

    plants {
        TEXT id PK
        TEXT property_id FK "audit only — lookups go via h3_res15"
        TEXT h3_res15 "indexed; spatial-first lookup driver"
        REAL lat
        REAL lng
        TEXT common_name
        TEXT latin_name
        TEXT plant_type
        TEXT planted_date
        TEXT source
        TEXT notes
        INTEGER archived "0/1"
        TEXT created_by FK
        INTEGER created_at
        TEXT last_edited_by FK
        INTEGER updated_at
    }

    cells {
        TEXT property_id PK,FK
        TEXT h3_res15 PK
        TEXT notes
        INTEGER created_at
        INTEGER updated_at
    }

    photos {
        TEXT id PK
        TEXT plant_id FK "nullable, XOR with cell"
        TEXT cell_property_id FK "nullable"
        TEXT cell_h3_res15 "nullable"
        TEXT r2_key
        TEXT caption
        INTEGER taken_at
        INTEGER uploaded_at
        TEXT uploaded_by FK
    }

    password_reset_tokens {
        TEXT token_hash PK "sha256(cleartext)"
        TEXT user_id FK
        TEXT issued_by FK
        INTEGER created_at
        INTEGER expires_at
        INTEGER consumed_at "NULL=unused"
    }
```

## Key invariants

- **Spatial-first lookup**: `plants` and `photos` are queried by `h3_res15 IN (property.included_hexes)`, not by `property_id`. The `property_id` column on plants/cells/photos is audit-only; archived-property data resurfaces under any new property covering the same hex set (see PRD §6.1).
- **Photo XOR**: a `photos` row has either `plant_id` or both `cell_property_id`+`cell_h3_res15`, never both, never neither — enforced by two `CHECK` constraints in migration 0006.
- **Reset tokens**: stored as `sha256(token)`; the cleartext lives only in the URL emitted once by the admin tool. A DB read leak does not yield working reset links.
- **Email casing**: stored as-typed but uniqueness enforced via a unique index on `lower(email)` (see migration 0001).
- **All timestamps**: `INTEGER` storing Unix epoch in milliseconds (`Date.now()`), except `plants.planted_date` which is a free-text human date.

## Indexes

| Index                          | Table                 | Purpose                                 |
| ------------------------------ | --------------------- | --------------------------------------- |
| `idx_users_email_lower`        | users                 | Case-insensitive email lookup at login  |
| `idx_properties_owner`         | properties            | "Properties I own"                      |
| `idx_properties_archived_at`   | properties            | Filter active vs archived               |
| `idx_property_members_user`    | property_members      | "Properties I'm a member of"            |
| `idx_plants_h3`                | plants                | Spatial-first lookup                    |
| `idx_plants_property_archived` | plants                | "All plants in property X" backup query |
| `idx_cells_h3`                 | cells                 | Cell lookup                             |
| `idx_photos_plant`             | photos                | Plant timeline                          |
| `idx_photos_cell`              | photos                | Cell photo gallery                      |
| `idx_reset_tokens_user`        | password_reset_tokens | Cleanup of a user's tokens              |
