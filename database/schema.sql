-- =====================================================================
--  Smart Traffic Violation Reporting System  -  Relational Schema
--  Target : MySQL 8.x  (also verified on MariaDB 10.11)
--  Engine : InnoDB, utf8mb4
--
--  Normalisation (3NF) overview
--    police_stations 1--N officers            officers 1--1 users
--    owners          1--N vehicles            vehicle_types 1--N vehicles
--    violation_categories 1--N violation_types
--    vehicles / violation_types / locations / users / officers
--                    1--N violations
--    violations      1--N violation_evidence
--    violations      1--0..1 fines            fines 1--N payments
--    violations      1--N appeals
--    violations      1--N violation_status_history
--    users           1--N notifications
--
--  Re-runnable: drops and recreates every object. Use `npm run db:setup`
--  (it refuses to wipe a database that already has data unless --force).
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS smart_traffic_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_traffic_db;

SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS v_violation_details;
DROP VIEW IF EXISTS v_vehicle_offence_summary;
DROP PROCEDURE IF EXISTS sp_issue_fine;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS violation_status_history;
DROP TABLE IF EXISTS appeals;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS fines;
DROP TABLE IF EXISTS violation_evidence;
DROP TABLE IF EXISTS violations;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS violation_types;
DROP TABLE IF EXISTS violation_categories;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS vehicle_types;
DROP TABLE IF EXISTS owners;
DROP TABLE IF EXISTS officers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS police_stations;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. police_stations
-- ---------------------------------------------------------------------
CREATE TABLE police_stations (
  station_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  station_name  VARCHAR(120) NOT NULL,
  city          VARCHAR(80)  NOT NULL,
  district      VARCHAR(80)  NOT NULL,
  address       VARCHAR(255) NULL,
  phone         VARCHAR(20)  NULL,
  PRIMARY KEY (station_id),
  UNIQUE KEY uq_station_name (station_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. users  (login accounts: citizens, traffic officers, administrators)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(150) NOT NULL,
  phone          VARCHAR(20)  NULL,
  password_hash  VARCHAR(100) NOT NULL,
  role           ENUM('citizen','officer','admin') NOT NULL DEFAULT 'citizen',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  DATETIME     NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. officers  (1:1 extension of users with role = officer)
-- ---------------------------------------------------------------------
CREATE TABLE officers (
  officer_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  station_id    INT UNSIGNED NOT NULL,
  badge_number  VARCHAR(20)  NOT NULL,
  rank_title    VARCHAR(60)  NOT NULL,
  joined_on     DATE         NULL,
  PRIMARY KEY (officer_id),
  UNIQUE KEY uq_officers_user (user_id),
  UNIQUE KEY uq_officers_badge (badge_number),
  KEY idx_officers_station (station_id),
  CONSTRAINT fk_officers_user    FOREIGN KEY (user_id)    REFERENCES users (user_id)                 ON DELETE CASCADE,
  CONSTRAINT fk_officers_station FOREIGN KEY (station_id) REFERENCES police_stations (station_id)    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. owners  (registered vehicle owners / licence holders)
-- ---------------------------------------------------------------------
CREATE TABLE owners (
  owner_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name           VARCHAR(120) NOT NULL,
  phone               VARCHAR(20)  NULL,
  email               VARCHAR(150) NULL,
  license_number      VARCHAR(25)  NULL,
  license_valid_till  DATE         NULL,
  address             VARCHAR(255) NULL,
  PRIMARY KEY (owner_id),
  UNIQUE KEY uq_owners_license (license_number),
  KEY idx_owners_name (full_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. vehicle_types
-- ---------------------------------------------------------------------
CREATE TABLE vehicle_types (
  vehicle_type_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type_name        VARCHAR(50)  NOT NULL,
  PRIMARY KEY (vehicle_type_id),
  UNIQUE KEY uq_vehicle_type_name (type_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. vehicles
-- ---------------------------------------------------------------------
CREATE TABLE vehicles (
  vehicle_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plate_number          VARCHAR(15)  NOT NULL,
  vehicle_type_id       INT UNSIGNED NOT NULL,
  owner_id              INT UNSIGNED NULL,
  make                  VARCHAR(60)  NULL,
  model                 VARCHAR(60)  NULL,
  color                 VARCHAR(30)  NULL,
  registered_state      VARCHAR(40)  NULL,
  insurance_valid_till  DATE         NULL,
  puc_valid_till        DATE         NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vehicle_id),
  UNIQUE KEY uq_vehicles_plate (plate_number),
  KEY idx_vehicles_type (vehicle_type_id),
  KEY idx_vehicles_owner (owner_id),
  CONSTRAINT fk_vehicles_type  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types (vehicle_type_id) ON DELETE RESTRICT,
  CONSTRAINT fk_vehicles_owner FOREIGN KEY (owner_id)        REFERENCES owners (owner_id)               ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. violation_categories
-- ---------------------------------------------------------------------
CREATE TABLE violation_categories (
  category_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name  VARCHAR(60)  NOT NULL,
  icon           VARCHAR(10)  NULL,
  color_hex      CHAR(7)      NOT NULL DEFAULT '#00e5ff',
  PRIMARY KEY (category_id),
  UNIQUE KEY uq_category_name (category_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. violation_types  (rulebook: what can be reported, fine and points)
-- ---------------------------------------------------------------------
CREATE TABLE violation_types (
  violation_type_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id        INT UNSIGNED NOT NULL,
  code               VARCHAR(12)  NOT NULL,
  violation_name     VARCHAR(100) NOT NULL,
  description        VARCHAR(255) NULL,
  base_fine          DECIMAL(10,2) NOT NULL,
  penalty_points     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  severity           ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  law_reference      VARCHAR(60)  NULL,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (violation_type_id),
  UNIQUE KEY uq_violation_code (code),
  KEY idx_vtype_category (category_id),
  CONSTRAINT fk_vtype_category FOREIGN KEY (category_id) REFERENCES violation_categories (category_id) ON DELETE RESTRICT,
  CONSTRAINT chk_vtype_fine   CHECK (base_fine >= 0),
  CONSTRAINT chk_vtype_points CHECK (penalty_points <= 12)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. locations  (junctions, roads and camera sites)
-- ---------------------------------------------------------------------
CREATE TABLE locations (
  location_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  location_name     VARCHAR(120) NOT NULL,
  area              VARCHAR(80)  NOT NULL,
  city              VARCHAR(80)  NOT NULL,
  zone              ENUM('North','South','East','West','Central') NOT NULL DEFAULT 'Central',
  latitude          DECIMAL(9,6) NULL,
  longitude         DECIMAL(9,6) NULL,
  speed_limit_kmph  SMALLINT UNSIGNED NULL,
  has_camera        TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (location_id),
  UNIQUE KEY uq_location_name (location_name),
  KEY idx_locations_zone (zone),
  CONSTRAINT chk_loc_lat CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
  CONSTRAINT chk_loc_lng CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. violations  (the central fact table)
-- ---------------------------------------------------------------------
CREATE TABLE violations (
  violation_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference_no         VARCHAR(20)  NULL,
  vehicle_id           INT UNSIGNED NOT NULL,
  violation_type_id    INT UNSIGNED NOT NULL,
  location_id          INT UNSIGNED NOT NULL,
  reported_by          INT UNSIGNED NOT NULL,
  assigned_officer_id  INT UNSIGNED NULL,
  occurred_at          DATETIME     NOT NULL,
  recorded_speed       SMALLINT UNSIGNED NULL,
  description          TEXT         NULL,
  status               ENUM('Pending','Under Review','Verified','Rejected','Appealed','Closed') NOT NULL DEFAULT 'Pending',
  priority             ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  source               ENUM('Citizen Report','Officer Patrol','Camera') NOT NULL DEFAULT 'Citizen Report',
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (violation_id),
  UNIQUE KEY uq_violations_reference (reference_no),
  KEY idx_viol_vehicle (vehicle_id),
  KEY idx_viol_type (violation_type_id),
  KEY idx_viol_location (location_id),
  KEY idx_viol_reporter (reported_by),
  KEY idx_viol_officer (assigned_officer_id),
  KEY idx_viol_status (status),
  KEY idx_viol_occurred (occurred_at),
  KEY idx_viol_status_date (status, occurred_at),
  CONSTRAINT fk_viol_vehicle  FOREIGN KEY (vehicle_id)          REFERENCES vehicles (vehicle_id)                 ON DELETE RESTRICT,
  CONSTRAINT fk_viol_type     FOREIGN KEY (violation_type_id)   REFERENCES violation_types (violation_type_id)   ON DELETE RESTRICT,
  CONSTRAINT fk_viol_location FOREIGN KEY (location_id)         REFERENCES locations (location_id)               ON DELETE RESTRICT,
  CONSTRAINT fk_viol_reporter FOREIGN KEY (reported_by)         REFERENCES users (user_id)                       ON DELETE RESTRICT,
  CONSTRAINT fk_viol_officer  FOREIGN KEY (assigned_officer_id) REFERENCES officers (officer_id)                 ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. violation_evidence  (photos / video proof)
-- ---------------------------------------------------------------------
CREATE TABLE violation_evidence (
  evidence_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  violation_id  INT UNSIGNED NOT NULL,
  uploaded_by   INT UNSIGNED NOT NULL,
  file_name     VARCHAR(200) NOT NULL,
  file_path     VARCHAR(300) NOT NULL,
  mime_type     VARCHAR(80)  NULL,
  file_size     INT UNSIGNED NULL,
  uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evidence_id),
  KEY idx_evidence_violation (violation_id),
  KEY idx_evidence_uploader (uploaded_by),
  CONSTRAINT fk_evidence_violation FOREIGN KEY (violation_id) REFERENCES violations (violation_id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_uploader  FOREIGN KEY (uploaded_by)  REFERENCES users (user_id)           ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. fines  (at most one fine per verified violation)
-- ---------------------------------------------------------------------
CREATE TABLE fines (
  fine_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  violation_id  INT UNSIGNED NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  late_fee      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_due     DECIMAL(10,2) GENERATED ALWAYS AS (amount + late_fee) STORED,
  issued_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date      DATE         NOT NULL,
  status        ENUM('Unpaid','Paid','Overdue','Waived') NOT NULL DEFAULT 'Unpaid',
  paid_at       DATETIME     NULL,
  PRIMARY KEY (fine_id),
  UNIQUE KEY uq_fines_violation (violation_id),
  KEY idx_fines_status_due (status, due_date),
  CONSTRAINT fk_fines_violation FOREIGN KEY (violation_id) REFERENCES violations (violation_id) ON DELETE CASCADE,
  CONSTRAINT chk_fines_amount CHECK (amount >= 0 AND late_fee >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. payments
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  payment_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fine_id          INT UNSIGNED NOT NULL,
  paid_by          INT UNSIGNED NULL,
  amount           DECIMAL(10,2) NOT NULL,
  method           ENUM('UPI','Card','NetBanking','Cash') NOT NULL DEFAULT 'UPI',
  transaction_ref  VARCHAR(40)  NOT NULL,
  paid_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payments_txn (transaction_ref),
  KEY idx_payments_fine (fine_id),
  KEY idx_payments_user (paid_by),
  CONSTRAINT fk_payments_fine FOREIGN KEY (fine_id) REFERENCES fines (fine_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_user FOREIGN KEY (paid_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 14. appeals  (owner disputes a violation)
-- ---------------------------------------------------------------------
CREATE TABLE appeals (
  appeal_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  violation_id   INT UNSIGNED NOT NULL,
  filed_by       INT UNSIGNED NOT NULL,
  reviewed_by    INT UNSIGNED NULL,
  reason         TEXT         NOT NULL,
  status         ENUM('Submitted','Under Review','Accepted','Rejected') NOT NULL DEFAULT 'Submitted',
  review_notes   VARCHAR(500) NULL,
  filed_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at    DATETIME     NULL,
  PRIMARY KEY (appeal_id),
  KEY idx_appeals_violation (violation_id),
  KEY idx_appeals_filer (filed_by),
  KEY idx_appeals_reviewer (reviewed_by),
  KEY idx_appeals_status (status),
  CONSTRAINT fk_appeals_violation FOREIGN KEY (violation_id) REFERENCES violations (violation_id) ON DELETE CASCADE,
  CONSTRAINT fk_appeals_filer     FOREIGN KEY (filed_by)     REFERENCES users (user_id)           ON DELETE RESTRICT,
  CONSTRAINT fk_appeals_reviewer  FOREIGN KEY (reviewed_by)  REFERENCES users (user_id)           ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 15. violation_status_history  (audit trail, filled by triggers)
-- ---------------------------------------------------------------------
CREATE TABLE violation_status_history (
  history_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  violation_id  INT UNSIGNED NOT NULL,
  old_status    VARCHAR(20)  NULL,
  new_status    VARCHAR(20)  NOT NULL,
  changed_by    INT UNSIGNED NULL,
  remarks       VARCHAR(255) NULL,
  changed_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (history_id),
  KEY idx_history_violation (violation_id, changed_at),
  KEY idx_history_user (changed_by),
  CONSTRAINT fk_history_violation FOREIGN KEY (violation_id) REFERENCES violations (violation_id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user      FOREIGN KEY (changed_by)   REFERENCES users (user_id)           ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 16. notifications
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  violation_id     INT UNSIGNED NULL,
  title            VARCHAR(120) NOT NULL,
  message          VARCHAR(400) NOT NULL,
  is_read          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_notif_user (user_id, is_read, created_at),
  KEY idx_notif_violation (violation_id),
  CONSTRAINT fk_notif_user      FOREIGN KEY (user_id)      REFERENCES users (user_id)           ON DELETE CASCADE,
  CONSTRAINT fk_notif_violation FOREIGN KEY (violation_id) REFERENCES violations (violation_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  VIEWS
-- =====================================================================

CREATE VIEW v_violation_details AS
SELECT
  v.violation_id, v.reference_no, v.occurred_at, v.status, v.priority, v.source,
  v.recorded_speed, v.description, v.created_at, v.updated_at,
  vh.vehicle_id, vh.plate_number, vty.type_name AS vehicle_type, vh.make, vh.model, vh.color,
  o.owner_id, o.full_name AS owner_name, o.phone AS owner_phone,
  t.violation_type_id, t.code AS violation_code, t.violation_name, t.base_fine,
  t.penalty_points, t.severity, c.category_id, c.category_name, c.color_hex AS category_color,
  l.location_id, l.location_name, l.area, l.city, l.zone, l.latitude, l.longitude, l.speed_limit_kmph,
  v.reported_by, ru.full_name AS reported_by_name,
  v.assigned_officer_id, ou.full_name AS officer_name, ofc.badge_number,
  f.fine_id, f.amount AS fine_amount, f.late_fee, f.total_due, f.status AS fine_status,
  f.due_date AS fine_due_date, f.paid_at AS fine_paid_at
FROM violations v
JOIN vehicles vh              ON vh.vehicle_id = v.vehicle_id
JOIN vehicle_types vty        ON vty.vehicle_type_id = vh.vehicle_type_id
LEFT JOIN owners o            ON o.owner_id = vh.owner_id
JOIN violation_types t        ON t.violation_type_id = v.violation_type_id
JOIN violation_categories c   ON c.category_id = t.category_id
JOIN locations l              ON l.location_id = v.location_id
JOIN users ru                 ON ru.user_id = v.reported_by
LEFT JOIN officers ofc        ON ofc.officer_id = v.assigned_officer_id
LEFT JOIN users ou            ON ou.user_id = ofc.user_id
LEFT JOIN fines f             ON f.violation_id = v.violation_id;

CREATE VIEW v_vehicle_offence_summary AS
SELECT
  vh.vehicle_id, vh.plate_number, o.full_name AS owner_name,
  COUNT(v.violation_id) AS total_violations,
  COALESCE(SUM(CASE WHEN v.status IN ('Verified','Appealed','Closed') THEN t.penalty_points ELSE 0 END), 0) AS penalty_points,
  COALESCE(SUM(f.total_due), 0) AS total_fined,
  COALESCE(SUM(CASE WHEN f.status IN ('Unpaid','Overdue') THEN f.total_due ELSE 0 END), 0) AS outstanding,
  MAX(v.occurred_at) AS last_violation_at
FROM vehicles vh
LEFT JOIN owners o           ON o.owner_id = vh.owner_id
LEFT JOIN violations v       ON v.vehicle_id = vh.vehicle_id
LEFT JOIN violation_types t  ON t.violation_type_id = v.violation_type_id
LEFT JOIN fines f            ON f.violation_id = v.violation_id
GROUP BY vh.vehicle_id, vh.plate_number, o.full_name;

-- =====================================================================
--  STORED PROCEDURE + TRIGGERS  (statements below use DELIMITER $$)
-- =====================================================================

DELIMITER $$

-- Issues the fine for a verified violation:
--   fine = base fine of the violation type
--        + Rs.200 for every full 10 km/h above the posted limit (max Rs.2000)
-- Idempotent: does nothing if the violation already has a fine.
CREATE PROCEDURE sp_issue_fine(IN p_violation_id INT UNSIGNED)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_base   DECIMAL(10,2);
  DECLARE v_speed  SMALLINT UNSIGNED;
  DECLARE v_limit  SMALLINT UNSIGNED;
  DECLARE v_amount DECIMAL(10,2);

  SELECT COUNT(*) INTO v_exists FROM fines WHERE violation_id = p_violation_id;

  IF v_exists = 0 THEN
    SELECT t.base_fine, v.recorded_speed, l.speed_limit_kmph
      INTO v_base, v_speed, v_limit
      FROM violations v
      JOIN violation_types t ON t.violation_type_id = v.violation_type_id
      JOIN locations l       ON l.location_id = v.location_id
     WHERE v.violation_id = p_violation_id;

    SET v_amount = v_base;
    IF v_speed IS NOT NULL AND v_limit IS NOT NULL AND v_speed > v_limit THEN
      SET v_amount = v_amount + LEAST(FLOOR((v_speed - v_limit) / 10) * 200, 2000);
    END IF;

    INSERT INTO fines (violation_id, amount, issued_at, due_date, status)
    VALUES (p_violation_id, v_amount, NOW(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'Unpaid');
  END IF;
END$$

-- Data-integrity guard: a violation cannot be dated in the future.
CREATE TRIGGER trg_violations_bi BEFORE INSERT ON violations
FOR EACH ROW
BEGIN
  IF NEW.occurred_at > DATE_ADD(NOW(), INTERVAL 1 DAY) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Violation date/time cannot be in the future';
  END IF;
END$$

-- Audit trail: first entry when a violation is reported.
CREATE TRIGGER trg_violations_ai AFTER INSERT ON violations
FOR EACH ROW
BEGIN
  IF @skip_history IS NULL OR @skip_history = 0 THEN
    INSERT INTO violation_status_history (violation_id, old_status, new_status, changed_by, remarks)
    VALUES (NEW.violation_id, NULL, NEW.status, NEW.reported_by, 'Violation reported');
  END IF;
END$$

-- Audit trail: every status change (the API sets @actor_user_id / @status_remarks).
CREATE TRIGGER trg_violations_au AFTER UPDATE ON violations
FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status AND (@skip_history IS NULL OR @skip_history = 0) THEN
    INSERT INTO violation_status_history (violation_id, old_status, new_status, changed_by, remarks)
    VALUES (NEW.violation_id, OLD.status, NEW.status, @actor_user_id, @status_remarks);
  END IF;
END$$

-- Payment settles the fine and closes the violation once fully paid.
CREATE TRIGGER trg_payments_ai AFTER INSERT ON payments
FOR EACH ROW
BEGIN
  DECLARE v_due       DECIMAL(10,2);
  DECLARE v_paid      DECIMAL(10,2);
  DECLARE v_violation INT UNSIGNED;

  SELECT total_due, violation_id INTO v_due, v_violation
    FROM fines WHERE fine_id = NEW.fine_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments WHERE fine_id = NEW.fine_id;

  IF v_paid >= v_due THEN
    UPDATE fines SET status = 'Paid', paid_at = NEW.paid_at WHERE fine_id = NEW.fine_id;
    UPDATE violations SET status = 'Closed'
     WHERE violation_id = v_violation AND status = 'Verified';
  END IF;
END$$

DELIMITER ;
