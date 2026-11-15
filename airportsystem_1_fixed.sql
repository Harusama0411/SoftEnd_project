-- airline =====================================================================
-- airportsystem (MySQL 8.0+)
-- ฉบับแก้ไข: เรียงลำดับตารางตาม FOREIGN KEY, เพิ่ม gate_id / terminal_id ใน flight,
-- insert department ก่อน users
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `airportsystem_fixed`
  /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */
  /*!80016 DEFAULT ENCRYPTION='N' */;
USE airportsystem_fixed;


-- =====================================================================
-- 1) ตารางพื้นฐาน (ไม่อ้างตารางอื่น)
-- =====================================================================

CREATE TABLE IF NOT EXISTS `terminal` (
  terminal_id   INT PRIMARY KEY,
  terminal_name VARCHAR(255) NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `department` (
  department_id varchar(20) PRIMARY KEY,
  department    VARCHAR(255) NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `airline` (
  airline_id   varchar(3) PRIMARY KEY,
  airline_name VARCHAR(255) NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parking_stand` (
  stand_id   INT PRIMARY KEY,
  stand_type ENUM('Contact Stand', 'Remote Stand', 'Cargo Stand', 'Maintenance Stand')
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ground_equipment` (
  id             VARCHAR(20) PRIMARY KEY,
  equipment_name VARCHAR(100) NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shift` (
  shift_id   INT PRIMARY KEY,
  start_time TIME NOT NULL,          -- เวลาเริ่ม
  end_time   TIME NOT NULL,          -- เวลาเลิก
  workday    DATE NOT NULL,
  worktitle  VARCHAR(255)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- 2) ตารางที่อ้าง terminal / airline
-- =====================================================================

CREATE TABLE IF NOT EXISTS `gate` (
  gate_id     INT PRIMARY KEY,
  terminal_id INT NOT NULL,
  FOREIGN KEY (terminal_id) REFERENCES terminal(terminal_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `belt` (
  belt_id     INT PRIMARY KEY,
  terminal_id INT NOT NULL,
  FOREIGN KEY (terminal_id) REFERENCES terminal(terminal_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `airplane` (
  airplane_id VARCHAR(10) PRIMARY KEY,
  airline_id  varchar(3) NOT NULL,
  model       VARCHAR(255) NOT NULL,
  FOREIGN KEY (airline_id) REFERENCES airline(airline_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- 3) flight (อ้าง airline, airplane, terminal, gate, belt)
-- =====================================================================

CREATE TABLE IF NOT EXISTS `flight` (
  flight_no       INT PRIMARY KEY,
  origin          CHAR(3) NOT NULL,
  destination     CHAR(3) NOT NULL,
  flight_type     ENUM('Domestic', 'International') NOT NULL,
  airline_id      varchar(3) NOT NULL,
  airplane_id     VARCHAR(10) NOT NULL,
  terminal_id     INT NOT NULL,
  gate_id         INT NULL,
  belt_id         INT NULL,
  passenger_count INT NOT NULL DEFAULT 0 CHECK (passenger_count >= 0),
  flight_status   ENUM('Scheduled', 'Boarding', 'Departed', 'Arrived',
                       'Delayed', 'Cancelled'),
  departure_time  DATETIME NULL,
  estimated_time  DATETIME NULL,
  FOREIGN KEY (airline_id)  REFERENCES airline(airline_id),
  FOREIGN KEY (airplane_id) REFERENCES airplane(airplane_id),
  FOREIGN KEY (terminal_id) REFERENCES terminal(terminal_id),
  FOREIGN KEY (gate_id)     REFERENCES gate(gate_id),
  FOREIGN KEY (belt_id)     REFERENCES belt(belt_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- 4) ตารางที่อ้าง flight / gate / belt / airplane
-- =====================================================================

CREATE TABLE IF NOT EXISTS `baggage` (
  baggage_id INT(10) PRIMARY KEY,
  flight_no  INT NOT NULL,
  status     ENUM('Checked In', 'Screened', 'Loaded', 'In Transit',
                  'Arrived', 'Claimed', 'Lost'),
  FOREIGN KEY (flight_no) REFERENCES flight(flight_no)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `belt_assignment` (
  belt_assignment_id INT PRIMARY KEY,
  belt_id            INT NOT NULL,
  baggage_id         INT(10) NOT NULL,
  flight_no          INT NOT NULL,
  start_time DATETIME NOT NULL ,
  end_time DATETIME NULL,
  FOREIGN KEY (belt_id)    REFERENCES belt(belt_id),
  FOREIGN KEY (baggage_id) REFERENCES baggage(baggage_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gate_assignment` (
  gate_assignment_id INT PRIMARY KEY,
  gate_id            INT NOT NULL,
  flight_no          INT NOT NULL,
  start_time       DATETIME NOT NULL,   -- เวลาเริ่มจอด
  end_time         DATETIME NULL,       -- เวลาออกจากหลุมจอด
  FOREIGN KEY (gate_id)   REFERENCES gate(gate_id),
  FOREIGN KEY (flight_no) REFERENCES flight(flight_no)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parking_stand_assignment` (
  assignment_id    INT PRIMARY KEY,
  stand_id         INT NOT NULL,        -- รหัสหลุมจอดอากาศ
  airplane_id      VARCHAR(10) NOT NULL,        -- เครื่องบินที่จอด
  start_time       DATETIME NOT NULL,   -- เวลาเริ่มจอด
  end_time         DATETIME NULL,       -- เวลาออกจากหลุมจอด
  duration_minutes INT GENERATED ALWAYS AS
                   (TIMESTAMPDIFF(MINUTE, start_time, end_time)) STORED,
  CHECK (end_time IS NULL OR end_time > start_time),
  FOREIGN KEY (stand_id)    REFERENCES parking_stand(stand_id),
  FOREIGN KEY (airplane_id) REFERENCES airplane(airplane_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- 5) ระบบอุปกรณ์ภาคพื้น และผู้ใช้งาน (อ้าง department)
-- =====================================================================

CREATE TABLE IF NOT EXISTS `equipment_units` (
  unit_id       VARCHAR(20) PRIMARY KEY,
  equipment_id  VARCHAR(20) NOT NULL,
  status        ENUM('Available', 'In Use', 'Maintenance', 'Damage', 'ปลดระวาง')
                NOT NULL DEFAULT 'Available',
  FOREIGN KEY (equipment_id)  REFERENCES ground_equipment(id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `equipment_borrow_log` (
  borrow_id   INT AUTO_INCREMENT PRIMARY KEY,
  unit_id     VARCHAR(20) NOT NULL,     -- อุปกรณ์ชิ้นที่เบิก
  users_id    INT NOT NULL,             -- ผู้เบิก
  borrow_date DATE NOT NULL,            -- วันที่เริ่มเบิก
  department_id varchar(20),
  return_date DATE NULL,                -- วันที่คืน (NULL = ยังไม่คืน)
  CHECK (return_date IS NULL OR return_date >= borrow_date),
  FOREIGN KEY (unit_id)  REFERENCES equipment_units(unit_id),
  FOREIGN KEY (department_id) REFERENCES department(department_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `users` (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  fullname VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'manager', 'user') NOT NULL DEFAULT 'user',
  age           INT,
  department_id varchar(20) NOT NULL,
  position      VARCHAR(255),
  email         VARCHAR(100),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES department(department_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shift_assignment` (
  shift_assignment_id INT PRIMARY KEY,
  shift_id            INT NOT NULL,
  users_id            INT NOT NULL,
  FOREIGN KEY (shift_id)  REFERENCES shift(shift_id),
  FOREIGN KEY (users_id)  REFERENCES users(id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- 6) ข้อมูลตัวอย่าง (เรียงตามลำดับ FOREIGN KEY)
-- =====================================================================
INSERT INTO department (department_id, department) VALUES
('1', 'ฝ่ายปฏิบัติการสนามบิน'),
('2', 'ฝ่ายบริการภาคพื้น');

INSERT INTO terminal (terminal_id, terminal_name) VALUES
(1, 'อาคารผู้โดยสาร 1'),
(2, 'อาคารผู้โดยสาร 2');

INSERT INTO airline (airline_id, airline_name) VALUES
('TG', 'Thai Airways'),
('PG', 'Bangkok Airways');

INSERT INTO parking_stand (stand_id, stand_type) VALUES
(1, 'Contact Stand'),
(2, 'Remote Stand');

INSERT INTO ground_equipment (id, equipment_name) VALUES
('EQ001', 'รถลากจูงเครื่องบิน'),
('EQ002', 'รถขนสัมภาระ');

INSERT INTO shift (shift_id, start_time, end_time, workday, worktitle) VALUES
(1, '06:00:00', '14:00:00', '2026-11-11', 'กะเช้า'),
(2, '14:00:00', '22:00:00', '2026-11-11', 'กะบ่าย');

INSERT INTO gate (gate_id, terminal_id) VALUES
(1, 1),
(2, 2);

INSERT INTO belt (belt_id, terminal_id) VALUES
(1, 1),
(2, 2);

-- airplane_id เก็บเป็นทะเบียนเครื่องบิน (ค่าทดสอบ ไม่ใช่เครื่องจริง)
INSERT INTO airplane (airplane_id, airline_id, model) VALUES
('HS-T01', 'TG', 'Airbus A350-900'),
('HS-T02', 'PG', 'ATR 72-600');

INSERT INTO flight (
    flight_no, origin, destination, flight_type, airline_id,
    airplane_id, terminal_id, gate_id, belt_id, passenger_count,
    flight_status, departure_time, estimated_time
) VALUES
(1001, 'BKK', 'HKT', 'Domestic', 'TG', 'HS-T01', 1, 1, 1, 180, 'Scheduled',
 '2026-11-11 09:00:00', '2026-11-11 10:30:00'),
(1002, 'BKK', 'SIN', 'International', 'PG', 'HS-T02', 2, 2, 2, 65, 'Boarding',
 '2026-11-11 11:00:00', '2026-11-11 14:30:00');

INSERT INTO baggage (baggage_id, flight_no, status) VALUES
(1, 1001, 'Checked In'),
(2, 1002, 'Loaded');

INSERT INTO belt_assignment (belt_assignment_id, belt_id, baggage_id,flight_no, start_time, end_time) VALUES
(1, 1, 1,1001, '2026-11-11 10:45:00', '2026-11-11 11:15:00'),
(2, 2, 2,1002, '2026-11-11 14:45:00', NULL);

INSERT INTO gate_assignment (gate_assignment_id, gate_id, flight_no, start_time, end_time) VALUES
(1, 1, 1001, '2026-11-11 08:00:00', '2026-11-11 09:00:00'),
(2, 2, 1002, '2026-11-11 10:00:00', NULL);

-- duration_minutes เป็นคอลัมน์คำนวณอัตโนมัติ ไม่ต้อง insert
INSERT INTO parking_stand_assignment (
    assignment_id, stand_id, airplane_id, start_time, end_time
) VALUES
(1, 1, 'HS-T01', '2026-11-11 05:00:00', '2026-11-11 08:00:00'),
(2, 2, 'HS-T02', '2026-11-11 08:00:00', NULL);

INSERT INTO equipment_units (unit_id, equipment_id, status) VALUES
('UNIT001', 'EQ001', 'Available'),
('UNIT002', 'EQ002', 'In Use');

INSERT INTO users (
    username, password_hash, fullname, role, age, department_id, position, email
) VALUES
('admin_demo', 'DEMO_ONLY_change_before_use', 'ผู้ดูแลระบบตัวอย่าง',
 'admin', 30, '1', 'ผู้ดูแลระบบ', 'admin@example.com'),
('staff_demo', 'DEMO_ONLY_change_before_use', 'พนักงานตัวอย่าง',
 'user', 25, '2', 'เจ้าหน้าที่ภาคพื้น', 'staff@example.com');

INSERT INTO shift_assignment (shift_assignment_id, shift_id, users_id) VALUES
(1, 1, (SELECT id FROM users WHERE username = 'admin_demo')),
(2, 2, (SELECT id FROM users WHERE username = 'staff_demo'));

INSERT INTO equipment_borrow_log (unit_id, users_id, borrow_date, department_id, return_date) VALUES
('UNIT001', (SELECT id FROM users WHERE username = 'admin_demo'), '2026-11-08', '1', '2026-11-09'),
('UNIT002', (SELECT id FROM users WHERE username = 'staff_demo'), '2026-11-10', '2', NULL);


-- =====================================================================
-- 7) ตรวจสอบ
-- =====================================================================

SHOW TABLES;

SELECT * FROM users;
SELECT * FROM department;
SELECT * FROM ground_equipment;
SELECT * FROM equipment_units;
SELECT * FROM terminal;
SELECT * FROM gate;
SELECT * FROM belt;
SELECT * FROM airline;
SELECT * FROM airplane;
SELECT * FROM flight;
SELECT * FROM baggage;
SELECT * FROM belt_assignment;
SELECT * FROM gate_assignment;
SELECT * FROM parking_stand;
SELECT * FROM parking_stand_assignment;
SELECT * FROM shift;
SELECT * FROM shift_assignment;




