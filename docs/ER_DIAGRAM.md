# Entity-Relationship Diagram

> Generated from [`database/schema.sql`](../database/schema.sql) by `docs/generate_er.py`.
> Re-run `python3 docs/generate_er.py` after changing the schema.

![ER diagram](er-diagram.png)

*(Vector version: [`er-diagram.svg`](er-diagram.svg). The same diagram is shown live inside the web app on the **Database** page.)*

## Relationships

| Parent (one) | Child (many) | Via | Meaning |
|---|---|---|---|
| `police_stations` | `officers` | `station_id` | A station has many officers |
| `users` | `officers` | `user_id` (unique) | An officer account extends exactly one user (1 : 1) |
| `owners` | `vehicles` | `owner_id` | An owner can hold many vehicles |
| `vehicle_types` | `vehicles` | `vehicle_type_id` | Classification of vehicles |
| `violation_categories` | `violation_types` | `category_id` | Rulebook grouped into categories |
| `vehicles` | `violations` | `vehicle_id` | A vehicle can be reported many times |
| `violation_types` | `violations` | `violation_type_id` | Which offence was committed |
| `locations` | `violations` | `location_id` | Where it happened |
| `users` | `violations` | `reported_by` | Who reported it (citizen / officer / admin) |
| `officers` | `violations` | `assigned_officer_id` | Officer handling the case (optional) |
| `violations` | `violation_evidence` | `violation_id` | Photos / proof attached to a case |
| `violations` | `fines` | `violation_id` (unique) | A verified violation has at most one fine (1 : 0..1) |
| `fines` | `payments` | `fine_id` | A fine can be settled in one or more payments |
| `violations` | `appeals` | `violation_id` | Owner disputes of a violation |
| `violations` | `violation_status_history` | `violation_id` | Audit trail of every status change |
| `users` | `notifications` | `user_id` | In-app notifications |

## Normalisation

* **1NF** - every column is atomic; no repeating groups (evidence, payments, appeals and history live in their own tables).
* **2NF** - every non-key attribute depends on the whole primary key (all tables use a single-column surrogate key).
* **3NF** - no transitive dependencies: vehicle details live in `vehicles`, owner details in `owners`, fine amounts in `violation_types`/`fines`, place data in `locations`, category data in `violation_categories`. `violations` stores only keys and facts about the incident itself.

## Database objects beyond tables

| Object | Purpose |
|---|---|
| `v_violation_details` | Flat, joined view used by the list / detail screens |
| `v_vehicle_offence_summary` | Per-vehicle totals: violations, penalty points, fines, outstanding amount |
| `sp_issue_fine(violation_id)` | Computes and inserts the fine (base fine + over-speed surcharge), idempotent |
| `trg_violations_bi` | Rejects violations dated in the future |
| `trg_violations_ai` / `trg_violations_au` | Write the audit trail into `violation_status_history` |
| `trg_payments_ai` | Marks the fine **Paid** and closes the violation once fully paid |
| `fines.total_due` | Generated column (`amount + late_fee`) |
| `CHECK` constraints | Non-negative fines, penalty points <= 12, valid latitude / longitude |

## Mermaid version (renders natively on GitHub)

```mermaid
erDiagram
  police_stations {
    int station_id PK
    varchar station_name UK
    varchar city
    varchar district
    varchar address
    varchar phone
  }
  users {
    int user_id PK
    varchar full_name
    varchar email UK
    varchar phone
    varchar password_hash
    enum role
    int is_active
    timestamp created_at
    datetime last_login_at
  }
  officers {
    int officer_id PK
    int user_id FK
    int station_id FK
    varchar badge_number UK
    varchar rank_title
    date joined_on
  }
  owners {
    int owner_id PK
    varchar full_name
    varchar phone
    varchar email
    varchar license_number UK
    date license_valid_till
    varchar address
  }
  vehicle_types {
    int vehicle_type_id PK
    varchar type_name UK
  }
  vehicles {
    int vehicle_id PK
    varchar plate_number UK
    int vehicle_type_id FK
    int owner_id FK
    varchar make
    varchar model
    varchar color
    varchar registered_state
    date insurance_valid_till
    date puc_valid_till
    timestamp created_at
  }
  violation_categories {
    int category_id PK
    varchar category_name UK
    varchar icon
    varchar color_hex
  }
  violation_types {
    int violation_type_id PK
    int category_id FK
    varchar code UK
    varchar violation_name
    varchar description
    decimal base_fine
    int penalty_points
    enum severity
    varchar law_reference
    int is_active
  }
  locations {
    int location_id PK
    varchar location_name UK
    varchar area
    varchar city
    enum zone
    decimal latitude
    decimal longitude
    int speed_limit_kmph
    int has_camera
  }
  violations {
    int violation_id PK
    varchar reference_no UK
    int vehicle_id FK
    int violation_type_id FK
    int location_id FK
    int reported_by FK
    int assigned_officer_id FK
    datetime occurred_at
    int recorded_speed
    text description
    enum status
    enum priority
    enum source
    timestamp created_at
    timestamp updated_at
  }
  violation_evidence {
    int evidence_id PK
    int violation_id FK
    int uploaded_by FK
    varchar file_name
    varchar file_path
    varchar mime_type
    int file_size
    timestamp uploaded_at
  }
  fines {
    int fine_id PK
    int violation_id FK
    decimal amount
    decimal late_fee
    decimal total_due
    datetime issued_at
    date due_date
    enum status
    datetime paid_at
  }
  payments {
    int payment_id PK
    int fine_id FK
    int paid_by FK
    decimal amount
    enum method
    varchar transaction_ref UK
    datetime paid_at
  }
  appeals {
    int appeal_id PK
    int violation_id FK
    int filed_by FK
    int reviewed_by FK
    text reason
    enum status
    varchar review_notes
    timestamp filed_at
    datetime resolved_at
  }
  violation_status_history {
    int history_id PK
    int violation_id FK
    varchar old_status
    varchar new_status
    int changed_by FK
    varchar remarks
    timestamp changed_at
  }
  notifications {
    int notification_id PK
    int user_id FK
    int violation_id FK
    varchar title
    varchar message
    int is_read
    timestamp created_at
  }
  users ||--o| officers : "user_id"
  police_stations ||--o{ officers : "station_id"
  vehicle_types ||--o{ vehicles : "vehicle_type_id"
  owners |o--o{ vehicles : "owner_id"
  violation_categories ||--o{ violation_types : "category_id"
  vehicles ||--o{ violations : "vehicle_id"
  violation_types ||--o{ violations : "violation_type_id"
  locations ||--o{ violations : "location_id"
  users ||--o{ violations : "reported_by"
  officers |o--o{ violations : "assigned_officer_id"
  violations ||--o{ violation_evidence : "violation_id"
  users ||--o{ violation_evidence : "uploaded_by"
  violations ||--o| fines : "violation_id"
  fines ||--o{ payments : "fine_id"
  users |o--o{ payments : "paid_by"
  violations ||--o{ appeals : "violation_id"
  users ||--o{ appeals : "filed_by"
  users |o--o{ appeals : "reviewed_by"
  violations ||--o{ violation_status_history : "violation_id"
  users |o--o{ violation_status_history : "changed_by"
  users ||--o{ notifications : "user_id"
  violations |o--o{ notifications : "violation_id"
```

## Data dictionary

### `police_stations`

| Column | Type | Key | Null |
|---|---|---|---|
| `station_id` | INT | PK | no |
| `station_name` | VARCHAR(120) | UNIQUE | no |
| `city` | VARCHAR(80) |  | no |
| `district` | VARCHAR(80) |  | no |
| `address` | VARCHAR(255) |  | yes |
| `phone` | VARCHAR(20) |  | yes |

### `users`

| Column | Type | Key | Null |
|---|---|---|---|
| `user_id` | INT | PK | no |
| `full_name` | VARCHAR(120) |  | no |
| `email` | VARCHAR(150) | UNIQUE | no |
| `phone` | VARCHAR(20) |  | yes |
| `password_hash` | VARCHAR(100) |  | no |
| `role` | ENUM |  | no |
| `is_active` | TINYINT(1) |  | no |
| `created_at` | TIMESTAMP |  | no |
| `last_login_at` | DATETIME |  | yes |

### `officers`

| Column | Type | Key | Null |
|---|---|---|---|
| `officer_id` | INT | PK | no |
| `user_id` | INT | FK -> users.user_id, UNIQUE | no |
| `station_id` | INT | FK -> police_stations.station_id | no |
| `badge_number` | VARCHAR(20) | UNIQUE | no |
| `rank_title` | VARCHAR(60) |  | no |
| `joined_on` | DATE |  | yes |

### `owners`

| Column | Type | Key | Null |
|---|---|---|---|
| `owner_id` | INT | PK | no |
| `full_name` | VARCHAR(120) |  | no |
| `phone` | VARCHAR(20) |  | yes |
| `email` | VARCHAR(150) |  | yes |
| `license_number` | VARCHAR(25) | UNIQUE | yes |
| `license_valid_till` | DATE |  | yes |
| `address` | VARCHAR(255) |  | yes |

### `vehicle_types`

| Column | Type | Key | Null |
|---|---|---|---|
| `vehicle_type_id` | INT | PK | no |
| `type_name` | VARCHAR(50) | UNIQUE | no |

### `vehicles`

| Column | Type | Key | Null |
|---|---|---|---|
| `vehicle_id` | INT | PK | no |
| `plate_number` | VARCHAR(15) | UNIQUE | no |
| `vehicle_type_id` | INT | FK -> vehicle_types.vehicle_type_id | no |
| `owner_id` | INT | FK -> owners.owner_id | yes |
| `make` | VARCHAR(60) |  | yes |
| `model` | VARCHAR(60) |  | yes |
| `color` | VARCHAR(30) |  | yes |
| `registered_state` | VARCHAR(40) |  | yes |
| `insurance_valid_till` | DATE |  | yes |
| `puc_valid_till` | DATE |  | yes |
| `created_at` | TIMESTAMP |  | no |

### `violation_categories`

| Column | Type | Key | Null |
|---|---|---|---|
| `category_id` | INT | PK | no |
| `category_name` | VARCHAR(60) | UNIQUE | no |
| `icon` | VARCHAR(10) |  | yes |
| `color_hex` | CHAR(7) |  | no |

### `violation_types`

| Column | Type | Key | Null |
|---|---|---|---|
| `violation_type_id` | INT | PK | no |
| `category_id` | INT | FK -> violation_categories.category_id | no |
| `code` | VARCHAR(12) | UNIQUE | no |
| `violation_name` | VARCHAR(100) |  | no |
| `description` | VARCHAR(255) |  | yes |
| `base_fine` | DECIMAL(10,2) |  | no |
| `penalty_points` | TINYINT |  | no |
| `severity` | ENUM |  | no |
| `law_reference` | VARCHAR(60) |  | yes |
| `is_active` | TINYINT(1) |  | no |

### `locations`

| Column | Type | Key | Null |
|---|---|---|---|
| `location_id` | INT | PK | no |
| `location_name` | VARCHAR(120) | UNIQUE | no |
| `area` | VARCHAR(80) |  | no |
| `city` | VARCHAR(80) |  | no |
| `zone` | ENUM |  | no |
| `latitude` | DECIMAL(9,6) |  | yes |
| `longitude` | DECIMAL(9,6) |  | yes |
| `speed_limit_kmph` | SMALLINT |  | yes |
| `has_camera` | TINYINT(1) |  | no |

### `violations`

| Column | Type | Key | Null |
|---|---|---|---|
| `violation_id` | INT | PK | no |
| `reference_no` | VARCHAR(20) | UNIQUE | yes |
| `vehicle_id` | INT | FK -> vehicles.vehicle_id | no |
| `violation_type_id` | INT | FK -> violation_types.violation_type_id | no |
| `location_id` | INT | FK -> locations.location_id | no |
| `reported_by` | INT | FK -> users.user_id | no |
| `assigned_officer_id` | INT | FK -> officers.officer_id | yes |
| `occurred_at` | DATETIME |  | no |
| `recorded_speed` | SMALLINT |  | yes |
| `description` | TEXT |  | yes |
| `status` | ENUM |  | no |
| `priority` | ENUM |  | no |
| `source` | ENUM |  | no |
| `created_at` | TIMESTAMP |  | no |
| `updated_at` | TIMESTAMP |  | no |

### `violation_evidence`

| Column | Type | Key | Null |
|---|---|---|---|
| `evidence_id` | INT | PK | no |
| `violation_id` | INT | FK -> violations.violation_id | no |
| `uploaded_by` | INT | FK -> users.user_id | no |
| `file_name` | VARCHAR(200) |  | no |
| `file_path` | VARCHAR(300) |  | no |
| `mime_type` | VARCHAR(80) |  | yes |
| `file_size` | INT |  | yes |
| `uploaded_at` | TIMESTAMP |  | no |

### `fines`

| Column | Type | Key | Null |
|---|---|---|---|
| `fine_id` | INT | PK | no |
| `violation_id` | INT | FK -> violations.violation_id, UNIQUE | no |
| `amount` | DECIMAL(10,2) |  | no |
| `late_fee` | DECIMAL(10,2) |  | no |
| `total_due` | DECIMAL(10,2) |  | no |
| `issued_at` | DATETIME |  | no |
| `due_date` | DATE |  | no |
| `status` | ENUM |  | no |
| `paid_at` | DATETIME |  | yes |

### `payments`

| Column | Type | Key | Null |
|---|---|---|---|
| `payment_id` | INT | PK | no |
| `fine_id` | INT | FK -> fines.fine_id | no |
| `paid_by` | INT | FK -> users.user_id | yes |
| `amount` | DECIMAL(10,2) |  | no |
| `method` | ENUM |  | no |
| `transaction_ref` | VARCHAR(40) | UNIQUE | no |
| `paid_at` | DATETIME |  | no |

### `appeals`

| Column | Type | Key | Null |
|---|---|---|---|
| `appeal_id` | INT | PK | no |
| `violation_id` | INT | FK -> violations.violation_id | no |
| `filed_by` | INT | FK -> users.user_id | no |
| `reviewed_by` | INT | FK -> users.user_id | yes |
| `reason` | TEXT |  | no |
| `status` | ENUM |  | no |
| `review_notes` | VARCHAR(500) |  | yes |
| `filed_at` | TIMESTAMP |  | no |
| `resolved_at` | DATETIME |  | yes |

### `violation_status_history`

| Column | Type | Key | Null |
|---|---|---|---|
| `history_id` | INT | PK | no |
| `violation_id` | INT | FK -> violations.violation_id | no |
| `old_status` | VARCHAR(20) |  | yes |
| `new_status` | VARCHAR(20) |  | no |
| `changed_by` | INT | FK -> users.user_id | yes |
| `remarks` | VARCHAR(255) |  | yes |
| `changed_at` | TIMESTAMP |  | no |

### `notifications`

| Column | Type | Key | Null |
|---|---|---|---|
| `notification_id` | INT | PK | no |
| `user_id` | INT | FK -> users.user_id | no |
| `violation_id` | INT | FK -> violations.violation_id | yes |
| `title` | VARCHAR(120) |  | no |
| `message` | VARCHAR(400) |  | no |
| `is_read` | TINYINT(1) |  | no |
| `created_at` | TIMESTAMP |  | no |

