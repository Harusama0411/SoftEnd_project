require('dotenv').config();
const express = require('express'), mysql = require('mysql2/promise'), bcrypt = require('bcryptjs'),
  crypto = require('crypto'), path = require('path');
const E = process.env;

// ตารางตาม airportsystem_fixed.sql
// l=ชื่อแท็บ pk=คีย์หลัก auto=auto_increment n=คอลัมน์ที่ใช้เป็นชื่อแสดง g=กลุ่มสิทธิ์
// c=[คอลัมน์, ชนิด, ป้ายชื่อ, ตัวเลือก(enum)/ตารางอ้างอิง(fk)]
const BAG = ['Checked In', 'Screened', 'Loaded', 'In Transit', 'Arrived', 'Claimed', 'Lost'];
const FL = ['Scheduled', 'Boarding', 'Departed', 'Arrived', 'Delayed', 'Cancelled'];
const T = {
  users: { l: 'บัญชีผู้ใช้ (P2)', pk: 'id', auto: 1, n: 'username', g: 'admin', c: [['username','text','Username'],['password_hash','password','Password'],['fullname','text','ชื่อ-นามสกุล'],['role','enum','สิทธิ์',['admin','manager','user']],['age','number','อายุ'],['department_id','fk','ฝ่าย','department'],['position','text','ตำแหน่ง'],['email','email','อีเมล']] },
  department: { l: 'ฝ่าย (P2)', pk: 'department_id', n: 'department', g: 'admin', c: [['department_id','text','รหัสฝ่าย'],['department','text','ชื่อฝ่าย']] },
  ground_equipment: { l: 'อุปกรณ์ภาคพื้น (P1)', pk: 'id', n: 'equipment_name', nf: 1, g: 'ground', c: [['id','text','รหัสอุปกรณ์'],['equipment_name','text','ชื่ออุปกรณ์']] },
  equipment_units: { l: 'ชิ้นอุปกรณ์ (P1)', pk: 'unit_id', view: 1, ed: 1, g: 'ground', c: [['equipment_id','fk','รหัสอุปกรณ์','ground_equipment'],['unit_id','text','รหัสชิ้น'],['equipment_name','ro','อุปกรณ์'],['status','enum','สถานะ',['Available','In Use','Maintenance','Damage','ปลดระวาง']]] },
  equipment_borrow_log: { l: 'การเบิกอุปกรณ์ (P1)', pk: 'borrow_id', auto: 1, g: 'ground', borrow: 1,
    tc: [['borrow_id','ro','รหัสการเบิกอุปกรณ์'],['equipment_id','ro','รหัสอุปกรณ์'],['unit_id','ro','รหัสอุปกรณ์แต่ละยูนิต'],['borrower','ro','ผู้เบิก'],['dept_name','ro','แผนก'],['borrow_date','ro','วันเดือนปีที่เบิก'],['return_date','ro','วันเดือนปีที่ส่งคืน']],
    search: [['borrow_id','รหัสการเบิกอุปกรณ์'],['equipment_id','รหัสอุปกรณ์'],['borrower','ผู้เบิก'],['dept_name','แผนก'],['borrow_date','วันเดือนปีที่เบิก','date'],['return_date','วันเดือนปีที่ส่งคืน','date']],
    cnt: ['อุปกรณ์ทั้งหมดที่ค้นหาเจอ','ชิ้น'],
    c: [['unit_id','fk','รหัสอุปกรณ์แต่ละยูนิต','equipment_units'],['users_id','fk','ผู้เบิก','users'],['department_id','fk','แผนก','department'],['borrow_date','date','วันเดือนปีที่เบิก'],['return_date','date','วันเดือนปีที่ส่งคืน']] },
  baggage: { l: 'สัมภาระ (P3)', pk: 'baggage_id', search: ['baggage_id','flight_no'], g: 'ground', c: [['baggage_id','number','รหัสสัมภาระ'],['flight_no','fk','หมายเลขเที่ยวบิน','flight'],['status','enum','สถานะสัมภาระ',BAG],['belt_no','ro','หมายเลขสายพานรับกระเป๋า'],['airline_name','ro','ชื่อสายการบิน'],['origin','ro','ต้นทาง']] },
  belt: { l: 'สายพาน (P3)', pk: 'belt_id', g: 'mgr', c: [['belt_id','number','รหัสสายพาน'],['terminal_id','fk','อาคาร','terminal']] },
  belt_assignment: { l: 'การใช้สายพาน (P3)', pk: 'belt_assignment_id', g: 'ground', c: [['belt_assignment_id','number','รหัส'],['belt_id','fk','สายพาน','belt'],['baggage_id','fk','สัมภาระ','baggage'],['flight_no','fk','เที่ยวบิน','flight'],['start_time','datetime','เริ่ม'],['end_time','datetime','สิ้นสุด']] },
  airline: { l: 'สายการบิน (P4)', pk: 'airline_id', n: 'airline_name', g: 'flight', c: [['airline_id','text','รหัสสายการบิน'],['airline_name','text','ชื่อสายการบิน']] },
  airplane: { l: 'เครื่องบิน (P4)', pk: 'airplane_id', n: 'model', g: 'flight', c: [['airplane_id','text','ทะเบียนเครื่องบิน'],['airline_id','fk','สายการบิน','airline'],['model','text','รุ่น']] },
  flight: { l: 'เที่ยวบิน (P4)', pk: 'flight_no', g: 'flight', ed: 1,
    search: [['flight_no','รหัสเที่ยวบิน'],'origin','destination','flight_type',['airline_name','สายการบิน'],['airplane_id','เครื่องบิน'],'belt_id','flight_status',['dep_date','วันที่ออก','date','departure_time'],['dep_time','เวลาออก','time','departure_time']], cnt: ['พบ','เที่ยวบิน'], c: [['flight_no','number','เที่ยวบิน'],['origin','text','ต้นทาง'],['destination','text','ปลายทาง'],['flight_type','enum','ประเภท',['Domestic','International']],['airline_id','fk','สายการบิน','airline'],['airplane_id','fk','เครื่องบิน','airplane'],['terminal_id','fk','อาคาร (Terminal)','terminal',1],['gate_id','ro','ประตู (กำหนดที่การใช้ประตู)'],['belt_id','fk','สายพาน','belt'],['passenger_count','number','ผู้โดยสาร'],['flight_status','enum','สถานะ',FL],['departure_time','datetime','เวลาออก'],['estimated_time','datetime','เวลาโดยประมาณ']] },
  parking_stand: { l: 'หลุมจอด (P4)', pk: 'stand_id', g: 'flight', c: [['stand_id','number','รหัสหลุมจอด'],['stand_type','enum','ประเภท',['Contact Stand','Remote Stand','Cargo Stand','Maintenance Stand']]] },
  parking_stand_assignment: { l: 'การใช้หลุมจอด (P4)', pk: 'assignment_id', g: 'flight', ed: 1, c: [['assignment_id','number','รหัส'],['stand_id','fk','หลุมจอด','parking_stand'],['airplane_id','fk','เครื่องบิน','airplane'],['start_time','datetime','เริ่มจอด'],['end_time','datetime','ออกจากหลุม'],['duration_minutes','ro','ระยะเวลา (นาที)']] },
  terminal: { l: 'อาคารผู้โดยสาร (P5)', pk: 'terminal_id', n: 'terminal_name', g: 'mgr', c: [['terminal_id','number','รหัสอาคาร'],['terminal_name','text','ชื่ออาคาร']] },
  gate: { l: 'ประตูขึ้นเครื่อง (P5)', pk: 'gate_id', grp: 'terminal_id', g: 'mgr', c: [['gate_id','number','รหัสประตู'],['terminal_id','fk','อาคาร','terminal']] },
  gate_assignment: { l: 'การใช้ประตู (P5)', pk: 'gate_assignment_id', g: 'mgr', ed: 1, c: [['gate_assignment_id','number','รหัส'],['terminal_id','ro','อาคาร'],['gate_id','tgate','ประตู','gate'],['flight_no','fk','เที่ยวบิน','flight'],['start_time','datetime','เริ่ม'],['end_time','datetime','สิ้นสุด']] },
  shift: { l: 'กะงาน (P7)', pk: 'shift_id', n: 'worktitle', g: 'mgr', c: [['shift_id','number','รหัสกะ'],['start_time','time','เวลาเริ่ม'],['end_time','time','เวลาเลิก'],['workday','date','วันทำงาน'],['worktitle','text','ชื่อกะ']] },
  shift_assignment: { l: 'ตารางปฏิบัติงาน (P7)', pk: 'shift_assignment_id', g: 'mgr', c: [['shift_assignment_id','number','รหัส'],['shift_id','fk','กะ','shift'],['users_id','fk','เจ้าหน้าที่','users']] },
  alerts: { l: 'ประกาศแจ้งเตือน (P7)', pk: 'alert_id', auto: 1, n: 'title', g: 'mgr', c: [['severity','enum','ระดับ',['info','warning','critical']],['title','text','หัวข้อ'],['detail','text','รายละเอียด'],['status','enum','สถานะ',['active','closed']],['created_at','ro','เวลา']] },
};

// หน้า (P) ของแต่ละตาราง และสิทธิ์เข้าหน้าตามบทบาท (ทุกคนเข้า Home ได้)
// admin=P2 | user ฝ่าย 1=P1,P3 | user ฝ่าย 2=P4,P5 | manager=P6,P7
const PAGE = { users: 'P2', department: 'P2', ground_equipment: 'P1', equipment_units: 'P1', equipment_borrow_log: 'P1',
  baggage: 'P3', belt: 'P3', belt_assignment: 'P3', airline: 'P4', airplane: 'P4', flight: 'P4', parking_stand: 'P4', parking_stand_assignment: 'P4',
  terminal: 'P5', gate: 'P5', gate_assignment: 'P5', shift: 'P7', shift_assignment: 'P7', alerts: 'P7' };
for (const k in T) { T[k].p = PAGE[k]; T[k].ed = 1; } // ทุกหน้าที่เข้าได้: เพิ่ม/แก้ไข/ลบ
const pages = u => u.role === 'admin' ? ['P2'] : u.role === 'manager' ? ['P6', 'P7']
  : u.role === 'user' ? (u.department_id === '1' ? ['P1', 'P3'] : u.department_id === '2' ? ['P4', 'P5'] : []) : [];
const can = (u, t) => pages(u).includes(t.p); // เข้าหน้าได้ = ดู/เพิ่ม/ลบได้ (แก้ไขเฉพาะ admin)

const MSG = { ER_DUP_ENTRY: 'รหัสหรือข้อมูลซ้ำกับที่มีอยู่แล้ว', ER_NO_REFERENCED_ROW_2: 'ข้อมูลอ้างอิงไม่ถูกต้อง ตรวจสอบรหัสที่เลือก', ER_ROW_IS_REFERENCED_2: 'ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงอยู่' };
const h = f => (q, s) => f(q, s).catch(e => s.status(MSG[e.code] ? 400 : 500).json({ error: MSG[e.code] || e.sqlMessage || e.message }));
const auth = (q, s, n) => { const u = sessions.get((q.headers.authorization || '').slice(7)); if (!u) return s.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); q.user = u; n(); };
const tbl = (q, s, n) => !Object.hasOwn(T, q.params.t) ? s.status(404).json({ error: 'ไม่พบตาราง' })
  : !can(q.user, T[q.params.t]) ? s.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' }) : n();

let db; const sessions = new Map();
let mailer; // transporter ใช้ซ้ำ ไม่สร้างใหม่ทุกครั้ง
async function notify(to, subject, text) { // ข้อความแจ้งเตือนผ่าน Gmail (ถ้าตั้งค่าใน .env) — to เป็นอีเมลเดียวหรือ array ก็ได้
  const list = [].concat(to || []).filter(Boolean);
  if (!E.GMAIL_USER || !E.GMAIL_APP_PASSWORD || !list.length) return;
  try {
    mailer ||= require('nodemailer').createTransport({ service: 'gmail', auth: { user: E.GMAIL_USER, pass: E.GMAIL_APP_PASSWORD } });
    // ส่งเป็น BCC ให้ทุกคน เพื่อไม่เปิดเผยอีเมลของผู้ใช้คนอื่น
    await mailer.sendMail({ from: E.GMAIL_USER, to: E.GMAIL_USER, bcc: list, subject, text });
  } catch (e) { console.error('ส่งอีเมลไม่สำเร็จ:', e.message); }
}
const SEV_TH = { info: 'ข้อมูลทั่วไป', warning: 'เตือน', critical: 'ฉุกเฉิน' };
async function notifyAlert(b) { // ส่งประกาศแจ้งเตือน (P7) ไปที่อีเมลของผู้ใช้ทุกคนที่มีอีเมล
  const [r] = await db.query("SELECT DISTINCT email FROM users WHERE email IS NOT NULL AND email<>''");
  await notify(r.map(x => x.email), `[${SEV_TH[b.severity] || 'ประกาศ'}] ${b.title}`,
    `ประกาศแจ้งเตือนใหม่จากระบบ Airport Operations\n\nระดับ: ${SEV_TH[b.severity] || b.severity || '-'}\nหัวข้อ: ${b.title}\nรายละเอียด: ${b.detail || '-'}`);
}

async function pairs(t, b, upd) {
  const out = [];
  for (const [k, ty] of t.c) {
    if (ty === 'ro' || (upd && k === t.pk)) continue;
    let v = b[k]; v = v === '' || v === undefined ? null : v;
    if (ty === 'password' && v === null && upd) continue; // เว้นว่าง = ไม่เปลี่ยนรหัสผ่าน
    if (v !== null && ty === 'password') v = await bcrypt.hash(String(v), 10);
    if (v !== null && ty === 'datetime') v = String(v).replace('T', ' ');
    out.push([k, v]);
  }
  return out;
}
// การใช้ประตู (P5) เป็นตัวกำหนด terminal/gate ของเที่ยวบิน -> sync ไปที่ตาราง flight
async function gateSync(flightNo, gateId) {
  if (flightNo == null || gateId == null) return;
  await db.query('UPDATE flight f JOIN gate g ON g.gate_id=? SET f.gate_id=g.gate_id, f.terminal_id=g.terminal_id WHERE f.flight_no=?', [gateId, flightNo]);
}
async function gateClear(row) {
  if (row && row.flight_no != null && row.gate_id != null)
    await db.query('UPDATE flight SET gate_id=NULL, terminal_id=NULL WHERE flight_no=? AND gate_id=?', [row.flight_no, row.gate_id]);
}
const GA_SQL = 'SELECT ga.*, g.terminal_id FROM gate_assignment ga LEFT JOIN gate g ON g.gate_id=ga.gate_id';
const app = express();
app.use(express.json(), express.static(path.join(__dirname, 'public')));

app.post('/api/login', h(async (q, s) => {
  const [[u]] = await db.query('SELECT * FROM users WHERE username=?', [q.body.username]);
  if (!u || !(await bcrypt.compare(q.body.password || '', u.password_hash))) return s.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
  delete u.password_hash; const token = crypto.randomUUID(); sessions.set(token, u);
  s.json({ token, user: u });
}));
app.get('/api/meta', auth, (q, s) => s.json({ user: q.user, pages: pages(q.user), tables: Object.fromEntries(Object.entries(T).filter(([, v]) => can(q.user, v)).map(([k, v]) => [k, { ...v, can: true }])) }));

app.get('/api/t/:t', auth, tbl, h(async (q, s) => {
  const t = T[q.params.t], cols = [...new Set([t.pk, ...t.c.filter(c => c[1] !== 'password').map(c => c[0])])];
  if (q.params.t === 'gate_assignment') return s.json((await db.query(GA_SQL + ' ORDER BY ga.gate_assignment_id DESC'))[0]);
  if (q.params.t === 'baggage') return s.json((await db.query(`SELECT b.*, f.origin, al.airline_name,
    COALESCE((SELECT ba.belt_id FROM belt_assignment ba WHERE ba.baggage_id=b.baggage_id ORDER BY ba.start_time DESC LIMIT 1), f.belt_id) belt_no
    FROM baggage b LEFT JOIN flight f ON f.flight_no=b.flight_no LEFT JOIN airline al ON al.airline_id=f.airline_id ORDER BY b.baggage_id DESC`))[0]);
  if (q.params.t === 'equipment_borrow_log') return s.json((await db.query(`SELECT bl.*, u.equipment_id, us.fullname borrower, d.department dept_name
    FROM equipment_borrow_log bl LEFT JOIN equipment_units u ON u.unit_id=bl.unit_id LEFT JOIN users us ON us.id=bl.users_id
    LEFT JOIN department d ON d.department_id=bl.department_id ORDER BY bl.borrow_id DESC`))[0]);
  if (q.params.t === 'flight') return s.json((await db.query('SELECT f.*, al.airline_name FROM flight f LEFT JOIN airline al ON al.airline_id=f.airline_id ORDER BY f.flight_no DESC'))[0]);
  if (q.params.t === 'equipment_units') return s.json((await db.query('SELECT u.*, e.equipment_name FROM equipment_units u LEFT JOIN ground_equipment e ON e.id=u.equipment_id ORDER BY u.unit_id DESC'))[0]);
  const [r] = await db.query(`SELECT ${cols.map(c => `\`${c}\``)} FROM \`${q.params.t}\` ORDER BY \`${t.pk}\` DESC`);
  s.json(r);
}));
app.post('/api/t/:t', auth, tbl, h(async (q, s) => {
  const t = T[q.params.t];
  if (!can(q.user, t)) return s.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลนี้' });
  const p = (await pairs(t, q.body)).filter(x => x[1] !== null);
  if (!p.length) return s.status(400).json({ error: 'กรุณากรอกข้อมูล' });
  await db.query(`INSERT INTO \`${q.params.t}\` (${p.map(x => `\`${x[0]}\``)}) VALUES (?)`, [p.map(x => x[1])]);
  if (q.params.t === 'gate_assignment') await gateSync(q.body.flight_no, q.body.gate_id);
  if (q.params.t === 'alerts') notifyAlert(q.body).catch(e => console.error('ส่งแจ้งเตือนไม่สำเร็จ:', e.message)); // ไม่รอ เพื่อไม่ให้ตอบช้า
  if (q.params.t === 'users') notify(q.body.email, 'บัญชีผู้ใช้ของคุณถูกสร้างแล้ว', `สวัสดี ${q.body.fullname}\nUsername: ${q.body.username}`);
  s.json({ ok: true });
}));
app.delete('/api/t/:t/:id', auth, tbl, h(async (q, s) => {
  const t = T[q.params.t];
  if (!can(q.user, t)) return s.status(403).json({ error: 'ไม่มีสิทธิ์ลบข้อมูลนี้' });
  const old = q.params.t === 'gate_assignment' ? (await db.query('SELECT flight_no,gate_id FROM gate_assignment WHERE gate_assignment_id=?', [q.params.id]))[0][0] : null;
  await db.query(`DELETE FROM \`${q.params.t}\` WHERE \`${t.pk}\`=?`, [q.params.id]);
  await gateClear(old);
  s.json({ ok: true });
}));

app.get('/api/report', auth, h(async (q, s) => { // P6 รายงานภาพรวม (เที่ยวบิน / กะ / อุปกรณ์)
  if (!pages(q.user).includes('P6')) return s.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' });
  const [fl] = await db.query(`SELECT f.flight_no,f.origin,f.destination,f.flight_type,f.flight_status,f.departure_time,f.estimated_time,f.passenger_count,f.gate_id,
      al.airline_name,ap.model,tm.terminal_name,
      (SELECT COUNT(*) FROM baggage b WHERE b.flight_no=f.flight_no) bag_total,
      (SELECT COUNT(*) FROM baggage b WHERE b.flight_no=f.flight_no AND b.status IN ('Loaded','In Transit','Arrived','Claimed')) bag_loaded,
      (SELECT COUNT(*) FROM baggage b WHERE b.flight_no=f.flight_no AND b.status='Lost') bag_lost
    FROM flight f LEFT JOIN airline al ON al.airline_id=f.airline_id LEFT JOIN airplane ap ON ap.airplane_id=f.airplane_id
    LEFT JOIN terminal tm ON tm.terminal_id=f.terminal_id
    WHERE IFNULL(f.flight_status,'Scheduled') NOT IN ('Departed','Arrived')
    ORDER BY f.departure_time IS NULL, f.departure_time`);
  const [gc] = await db.query(`SELECT a.flight_no f1,b.flight_no f2 FROM gate_assignment a JOIN gate_assignment b
    ON a.gate_id=b.gate_id AND a.gate_assignment_id<b.gate_assignment_id
    AND a.start_time<IFNULL(b.end_time,'9999-12-31') AND b.start_time<IFNULL(a.end_time,'9999-12-31')`);
  const cf = new Set(gc.flatMap(x => [x.f1, x.f2]));
  fl.forEach(f => {
    f.bag_total = +f.bag_total; f.bag_loaded = +f.bag_loaded; f.bag_lost = +f.bag_lost;
    f.conflict = cf.has(f.flight_no);
    f.risk = ['Delayed', 'Cancelled'].includes(f.flight_status) || f.conflict || f.bag_lost > 0;
  });
  const keep = new Set([...fl.filter(f => f.risk).slice(0, 12), ...fl.filter(f => !f.risk).slice(0, 12)]);
  const [[b]] = await db.query("SELECT COUNT(*) total, IFNULL(SUM(status IN ('Arrived','Claimed')),0) done, IFNULL(SUM(status='Lost'),0) lost FROM baggage");
  const [[st]] = await db.query(`SELECT (SELECT COUNT(*) FROM users) total,
    (SELECT COUNT(DISTINCT sa.users_id) FROM shift_assignment sa JOIN shift sh ON sh.shift_id=sa.shift_id WHERE sh.workday=CURDATE()) today,
    (SELECT COUNT(*) FROM shift WHERE workday=CURDATE()) shifts`);
  const [[eq]] = await db.query(`SELECT COUNT(*) total, IFNULL(SUM(status='In Use'),0) inuse, IFNULL(SUM(status='Available'),0) avail,
    IFNULL(SUM(status='Maintenance'),0) maint, IFNULL(SUM(status='Damage'),0) damage FROM equipment_units WHERE status IS NULL OR status<>'ปลดระวาง'`);
  const [shifts] = await db.query(`SELECT sh.shift_id,sh.workday,sh.start_time,sh.end_time,sh.worktitle,COUNT(u.id) staff_n,
      GROUP_CONCAT(u.fullname ORDER BY u.fullname SEPARATOR '|') names
    FROM shift sh LEFT JOIN shift_assignment sa ON sa.shift_id=sh.shift_id LEFT JOIN users u ON u.id=sa.users_id
    WHERE sh.workday>=CURDATE() GROUP BY sh.shift_id,sh.workday,sh.start_time,sh.end_time,sh.worktitle
    ORDER BY sh.workday,sh.start_time LIMIT 8`);
  const [damaged] = await db.query(`SELECT u.unit_id,u.equipment_id,e.equipment_name FROM equipment_units u
    LEFT JOIN ground_equipment e ON e.id=u.equipment_id WHERE u.status='Damage' ORDER BY u.unit_id LIMIT 3`);
  for (const x of damaged) {
    const [[r]] = await db.query("SELECT unit_id FROM equipment_units WHERE equipment_id=? AND status='Available' ORDER BY unit_id LIMIT 1", [x.equipment_id]);
    x.reserve = r ? r.unit_id : null;
  }
  const [ready] = await db.query(`SELECT e.equipment_name name,COUNT(*) n FROM equipment_units u JOIN ground_equipment e ON e.id=u.equipment_id
    WHERE u.status='Available' GROUP BY e.id,e.equipment_name ORDER BY n DESC,e.equipment_name LIMIT 3`);
  s.json({
    kpi: { active: fl.length, atRisk: fl.filter(f => f.risk).length,
      bagTotal: +b.total, bagDone: +b.done, bagLost: +b.lost,
      staffTotal: +st.total, staffToday: +st.today, shiftsToday: +st.shifts,
      unitsTotal: +eq.total, unitsInUse: +eq.inuse, unitsAvail: +eq.avail, unitsMaint: +eq.maint, unitsDamage: +eq.damage },
    flights: fl.filter(f => keep.has(f)), shifts, equipment: { damaged, ready }
  });
}));

// การจัดสรรอุปกรณ์: ตรวจจำนวนที่ว่าง ถ้าพอจึงเบิกตามจำนวน (1 ชิ้น = 1 แถวใน equipment_borrow_log) ไม่พอแจ้งข้อความ
app.get('/api/borrow/avail', auth, h(async (q, s) => {
  if (!pages(q.user).includes('P1')) return s.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' });
  const [r] = await db.query("SELECT equipment_id, COUNT(*) n FROM equipment_units WHERE status='Available' GROUP BY equipment_id");
  s.json(Object.fromEntries(r.map(x => [x.equipment_id, +x.n])));
}));
app.post('/api/borrow', auth, h(async (q, s) => {
  if (!pages(q.user).includes('P1')) return s.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' });
  const b = q.body, qty = Number(b.qty);
  if (!b.equipment_id || !b.users_id || !b.department_id || !b.borrow_date) return s.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  if (!Number.isInteger(qty) || qty < 1) return s.status(400).json({ error: 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป' });
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [units] = await c.query("SELECT unit_id FROM equipment_units WHERE equipment_id=? AND status='Available' ORDER BY unit_id LIMIT ? FOR UPDATE", [b.equipment_id, qty]);
    if (units.length < qty) {
      await c.rollback();
      const [[a]] = await db.query("SELECT COUNT(*) n FROM equipment_units WHERE equipment_id=? AND status='Available'", [b.equipment_id]);
      return s.status(400).json({ error: `อุปกรณ์ไม่เพียงพอ: ต้องการ ${qty} ชิ้น แต่ปัจจุบันว่างอยู่ ${a.n} ชิ้น` });
    }
    const ids = [];
    for (let i = 0; i < units.length; i++) {
      const cols = ['unit_id', 'users_id', 'borrow_date', 'department_id'], vals = [units[i].unit_id, b.users_id, b.borrow_date, b.department_id];
      if (i === 0 && b.borrow_id !== undefined && b.borrow_id !== '') { cols.unshift('borrow_id'); vals.unshift(b.borrow_id); } // กรอกรหัสเอง: ใช้กับชิ้นแรก
      const [r] = await c.query(`INSERT INTO equipment_borrow_log (${cols.map(x => `\`${x}\``)}) VALUES (?)`, [vals]);
      ids.push(r.insertId);
      await c.query("UPDATE equipment_units SET status='In Use' WHERE unit_id=?", [units[i].unit_id]);
    }
    await c.commit();
    s.json({ ok: true, units: units.map(u => u.unit_id), ids });
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}));
// P6: รายงานสรุปตามวันที่/ประเภท — ops = 6.1 ประสิทธิภาพการดำเนินงาน, res = 6.2 การใช้ทรัพยากร
app.get('/api/report/summary', auth, h(async (q, s) => {
  if (!pages(q.user).includes('P6')) return s.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' });
  const type = q.query.type;
  if (!['ops', 'res'].includes(type)) return s.status(400).json({ error: 'ประเภทรายงานไม่ถูกต้อง' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.query.date) ? q.query.date : (await db.query("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') d"))[0][0].d;
  if (type === 'ops') {
    const [[f]] = await db.query("SELECT IFNULL(SUM(passenger_count),0) pax, COUNT(DISTINCT airline_id) airlines, IFNULL(SUM(flight_status='Cancelled'),0) cancelled FROM flight WHERE DATE(departure_time)=?", [date]);
    const [[st]] = await db.query('SELECT COUNT(DISTINCT sa.users_id) n FROM shift_assignment sa JOIN shift sh ON sh.shift_id=sa.shift_id WHERE sh.workday=?', [date]);
    const [bg] = await db.query('SELECT b.status, COUNT(*) n FROM baggage b JOIN flight f ON f.flight_no=b.flight_no WHERE DATE(f.departure_time)=? GROUP BY b.status', [date]);
    const bag = BAG.map(k => ({ status: k, n: +((bg.find(x => x.status === k) || {}).n || 0) }));
    return s.json({ type, date, staff: +st.n, pax: +f.pax, airlines: +f.airlines, cancelled: +f.cancelled, bagTotal: bag.reduce((a, x) => a + x.n, 0), bag });
  }
  const [eq] = await db.query(`SELECT e.id, e.equipment_name name, COUNT(u.unit_id) total, IFNULL(SUM(u.status='In Use'),0) inuse, IFNULL(SUM(u.status='Available'),0) avail,
      IFNULL(SUM(u.status='Damage'),0) damage, IFNULL(SUM(u.status='Maintenance'),0) maint
    FROM ground_equipment e LEFT JOIN equipment_units u ON u.equipment_id=e.id AND (u.status IS NULL OR u.status<>'ปลดระวาง')
    GROUP BY e.id, e.equipment_name ORDER BY e.id`);
  const use = async (tb, col, all) => { // นับที่ถูกใช้งานในวันที่เลือก (ช่วงเวลาคาบเกี่ยววันนั้น)
    const [[u]] = await db.query(`SELECT COUNT(DISTINCT \`${col}\`) n FROM \`${tb}\` WHERE DATE(start_time)<=? AND IFNULL(DATE(end_time),'9999-12-31')>=?`, [date, date]);
    const [[a]] = await db.query(`SELECT COUNT(*) n FROM \`${all}\``);
    return { used: +u.n, total: +a.n };
  };
  s.json({ type, date, stands: await use('parking_stand_assignment', 'stand_id', 'parking_stand'), gates: await use('gate_assignment', 'gate_id', 'gate'),
    belts: await use('belt_assignment', 'belt_id', 'belt'),
    equipment: eq.map(x => ({ id: x.id, name: x.name, total: +x.total, inuse: +x.inuse, avail: +x.avail, damage: +x.damage, maint: +x.maint })) });
}));
app.get('/api/opts/:t', auth, (q, s, n) => Object.hasOwn(T, q.params.t) ? n() : s.status(404).json({ error: 'ไม่พบตาราง' }), h(async (q, s) => {
  const t = T[q.params.t], cols = [...new Set([t.pk, t.n, t.grp].filter(Boolean))];
  const [r] = await db.query(`SELECT ${cols.map(c => `\`${c}\``)} FROM \`${q.params.t}\` ORDER BY \`${t.pk}\``);
  s.json(r.map(x => [x[t.pk], t.nf && t.n ? `${x[t.n]} (${x[t.pk]})` : x[t.pk] + (t.n ? ' – ' + x[t.n] : ''), t.grp ? x[t.grp] : null]));
}));

app.put('/api/t/:t/:id', auth, tbl, h(async (q, s) => {
  const t = T[q.params.t];
  if (q.user.role !== 'admin' && !t.ed) return s.status(403).json({ error: 'เฉพาะผู้ดูแลระบบที่แก้ไขข้อมูลได้' });
  const p = await pairs(t, q.body, true);
  if (!p.length) return s.status(400).json({ error: 'ไม่มีข้อมูลที่จะแก้ไข' });
  const ga = q.params.t === 'gate_assignment';
  const old = ga ? (await db.query('SELECT flight_no,gate_id FROM gate_assignment WHERE gate_assignment_id=?', [q.params.id]))[0][0] : null;
  await db.query(`UPDATE \`${q.params.t}\` SET ${p.map(x => `\`${x[0]}\`=?`)} WHERE \`${t.pk}\`=?`, [...p.map(x => x[1]), q.params.id]);
  if (ga) { await gateClear(old); const [[n]] = await db.query('SELECT flight_no,gate_id FROM gate_assignment WHERE gate_assignment_id=?', [q.params.id]); if (n) await gateSync(n.flight_no, n.gate_id); }
  s.json({ ok: true });
}));

app.get('/api/calendar', auth, h(async (q, s) => { // ปฏิทินกะ: ช่วงเวลา + หน้าที่ + ผู้รับผิดชอบ
  const m = /^\d{4}-\d{2}$/.test(q.query.month) ? q.query.month : new Date().toISOString().slice(0, 7);
  const [r] = await db.query(`SELECT sh.shift_id,sh.workday,sh.start_time,sh.end_time,sh.worktitle,u.id users_id,u.fullname,u.position,d.department
    FROM shift sh LEFT JOIN shift_assignment sa ON sa.shift_id=sh.shift_id LEFT JOIN users u ON u.id=sa.users_id
    LEFT JOIN department d ON d.department_id=u.department_id WHERE DATE_FORMAT(sh.workday,'%Y-%m')=? ORDER BY sh.workday,sh.start_time`, [m]);
  s.json(r);
}));

app.get('/api/alerts', auth, h(async (q, s) => { // ประกาศจากผู้จัดการ + แจ้งเตือนอัตโนมัติจากข้อมูลจริง
  const out = [], rank = { critical: 0, warning: 1, info: 2 };
  const [man] = await db.query("SELECT * FROM alerts WHERE status='active' ORDER BY created_at DESC");
  man.forEach(a => out.push({ sev: a.severity, title: a.title, detail: a.detail, time: a.created_at, tab: 'alerts' }));
  const [gc] = await db.query(`SELECT a.gate_id,a.flight_no f1,b.flight_no f2 FROM gate_assignment a JOIN gate_assignment b
    ON a.gate_id=b.gate_id AND a.gate_assignment_id<b.gate_assignment_id
    AND a.start_time<IFNULL(b.end_time,'9999-12-31') AND b.start_time<IFNULL(a.end_time,'9999-12-31')`);
  gc.forEach(x => out.push({ sev: 'warning', title: `Gate ${x.gate_id} · ใช้ซ้อนกัน`, detail: `เที่ยวบิน ${x.f1} ซ้อนเวลากับ ${x.f2} ต้องจัดสรรประตูใหม่`, tab: 'gate_assignment' }));
  const [fl] = await db.query("SELECT flight_no,flight_status,origin,destination,departure_time FROM flight WHERE flight_status IN ('Delayed','Cancelled')");
  fl.forEach(x => out.push({ sev: x.flight_status === 'Cancelled' ? 'critical' : 'warning', title: `เที่ยวบิน ${x.flight_no} · ${x.flight_status === 'Cancelled' ? 'ถูกยกเลิก' : 'ล่าช้า'}`, detail: `${x.origin} → ${x.destination}`, time: x.departure_time, tab: 'flight' }));
  const [[lost]] = await db.query("SELECT COUNT(*) n FROM baggage WHERE status='Lost'");
  if (lost.n) out.push({ sev: 'warning', title: `สัมภาระสูญหาย ${lost.n} ชิ้น`, detail: 'ตรวจสอบสถานะสัมภาระและติดตามเจ้าของ', tab: 'baggage' });
  const [dm] = await db.query("SELECT unit_id FROM equipment_units WHERE status='Damage'");
  dm.forEach(x => out.push({ sev: 'warning', title: `อุปกรณ์ ${x.unit_id} · ชำรุด`, detail: 'ต้องจัดอุปกรณ์สำรองหรือส่งซ่อม', tab: 'equipment_units' }));
  out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  s.json(out);
}));

(async () => {
  db = mysql.createPool({ host: E.DB_HOST, port: E.DB_PORT || 3306, user: E.DB_USER, password: E.DB_PASSWORD, database: E.DB_NAME, dateStrings: true, connectionLimit: 10 });
  await db.query('SELECT 1 FROM users LIMIT 1'); // ต้อง import airportsystem_fixed.sql ก่อน
  await db.query("CREATE TABLE IF NOT EXISTS alerts (alert_id INT AUTO_INCREMENT PRIMARY KEY, severity ENUM('info','warning','critical') NOT NULL DEFAULT 'warning', title VARCHAR(150) NOT NULL, detail VARCHAR(500), status ENUM('active','closed') NOT NULL DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) DEFAULT CHARSET=utf8mb4");
  const [[a]] = await db.query("SELECT COUNT(*) n FROM users WHERE username='admin'");
  if (!a.n) { // สร้างบัญชี admin เริ่มต้น (บัญชี demo ใน SQL ใช้ล็อกอินไม่ได้ เพราะ hash ไม่ใช่ bcrypt)
    let [[d]] = await db.query('SELECT department_id FROM department LIMIT 1');
    if (!d) { await db.query("INSERT INTO department VALUES ('ADMIN','ผู้ดูแลระบบ')"); d = { department_id: 'ADMIN' }; }
    await db.query("INSERT INTO users (username,password_hash,fullname,role,department_id) VALUES ('admin',?,'ผู้ดูแลระบบ','admin',?)", [await bcrypt.hash('admin1234', 10), d.department_id]);
  }
  app.listen(E.PORT || 3000, () => console.log(`เปิดที่ http://localhost:${E.PORT || 3000}`));
})().catch(e => { console.error('เชื่อมต่อ MySQL ไม่ได้ หรือยังไม่ได้ import SQL:', e.message); process.exit(1); });
