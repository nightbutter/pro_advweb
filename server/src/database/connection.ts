import Database from 'better-sqlite3';
import path from 'path';

// Vercel's filesystem is read-only except /tmp (data resets when the function restarts)
const dbPath = process.env.VERCEL
  ? '/tmp/database.sqlite'
  : path.resolve(__dirname, '../../database.sqlite');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// 13 Distinct Rider Colors for visual clarity on map
export const RIDER_COLORS = [
  '#E6194B', // Red
  '#3CBA54', // Green
  '#0082C8', // Blue
  '#F58231', // Orange
  '#911EB4', // Purple
  '#46F0F0', // Cyan
  '#F032E6', // Magenta
  '#BCF60C', // Lime
  '#FABEBE', // Pink
  '#008080', // Teal
  '#E6BEFF', // Lavender
  '#9A6324', // Brown
  '#800000'  // Maroon
];

export const SHOP_LOCATION = {
  name: 'ร้านข้าวกล่องเดลิเวอรี่ (หน้า ม.มหาสารคาม มมส.ใหม่ ขามเรียง)',
  lat: 16.2465,
  lng: 103.2505
};

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderNumber TEXT NOT NULL UNIQUE,
      customerId INTEGER NOT NULL,
      boxCount INTEGER NOT NULL CHECK(boxCount >= 1 AND boxCount <= 3),
      orderTime TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      assignedRiderId INTEGER,
      deliverySequence INTEGER,
      FOREIGN KEY(customerId) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS riders (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      color TEXT NOT NULL,
      maxOrders INTEGER DEFAULT 3,
      status TEXT DEFAULT 'active'
    );
  `);

  // Seed 13 Fixed Riders if not existing
  const riderCount = db.prepare('SELECT COUNT(*) as count FROM riders').get() as { count: number };
  if (riderCount.count === 0) {
    const insertRider = db.prepare(`
      INSERT INTO riders (id, name, phone, color, maxOrders, status)
      VALUES (?, ?, ?, ?, 3, 'active')
    `);

    const riderNames = [
      'ไรเดอร์ สมชาย (เบอร์ 1)',
      'ไรเดอร์ ชัยวัฒน์ (เบอร์ 2)',
      'ไรเดอร์ อานนท์ (เบอร์ 3)',
      'ไรเดอร์ ธีรพงษ์ (เบอร์ 4)',
      'ไรเดอร์ ณัฐวุฒิ (เบอร์ 5)',
      'ไรเดอร์ ประวิทย์ (เบอร์ 6)',
      'ไรเดอร์ สันติ (เบอร์ 7)',
      'ไรเดอร์ เกียรติศักดิ์ (เบอร์ 8)',
      'ไรเดอร์ วรวุฒิ (เบอร์ 9)',
      'ไรเดอร์ อนุชา (เบอร์ 10)',
      'ไรเดอร์ ธนากร (เบอร์ 11)',
      'ไรเดอร์ กิตติพงษ์ (เบอร์ 12)',
      'ไรเดอร์ ศักดิ์ดา (เบอร์ 13)'
    ];

    const seedRiders = db.transaction(() => {
      riderNames.forEach((name, i) => {
        insertRider.run(i + 1, name, `089-111-20${(i + 1).toString().padStart(2, '0')}`, RIDER_COLORS[i]);
      });
    });
    seedRiders();
  }

  // Seed sample customers around Mahasarakham University (ขามเรียง / มมส. ใหม่) within 3km
  const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number };
  if (customerCount.count === 0) {
    const sampleCustomers = [
      { name: 'คุณนภา หอพักร่มเย็น', phone: '081-234-5601', address: 'หอพักร่มเย็น ซอยวุ่นวาย ขามเรียง', lat: 16.2482, lng: 103.2488 },
      { name: 'คุณวิชัย คอนโดเอสเปซ', phone: '081-234-5602', address: 'คอนโด S-Space ชั้น 4 ห้อง 402', lat: 16.2449, lng: 103.2530 },
      { name: 'อาจารย์สุดา คณะวิทย์', phone: '081-234-5603', address: 'คณะวิทยาศาสตร์ มมส. อาคาร SC2', lat: 16.2415, lng: 103.2510 },
      { name: 'คุณกิตติ ตลาดน้อย มมส.', phone: '081-234-5604', address: 'ร้านถ่ายเอกสารข้างตลาดน้อย มมส.', lat: 16.2435, lng: 103.2475 },
      { name: 'คุณพิมพ์ใจ หอเจริญสุข', phone: '081-234-5605', address: 'หอพักเจริญสุข ซอยเคหะขามเรียง', lat: 16.2520, lng: 103.2450 },
      { name: 'คุณทศพร คณะไอที', phone: '081-234-5606', address: 'คณะวิทยาการสารสนเทศ ชั้น 2', lat: 16.2440, lng: 103.2555 },
      { name: 'คุณวรรณา สำนักวิทยบริการ', phone: '081-234-5607', address: 'หอสมุด มมส. เคาน์เตอร์ยืมคืน', lat: 16.2458, lng: 103.2515 },
      { name: 'คุณเอก หอพักแกรนด์พาร์ค', phone: '081-234-5608', address: 'หอแกรนด์พาร์ค ขามเรียง 5/1', lat: 16.2510, lng: 103.2560 },
      { name: 'คุณมานพ ร้านกาแฟอินทนิล', phone: '081-234-5609', address: 'ปั๊มบางจาก หน้าป้าย มมส.', lat: 16.2480, lng: 103.2580 },
      { name: 'คุณรัตนา หอพักสิรินทร์', phone: '081-234-5610', address: 'หอสิรินทร์ ซอยรื่นรมย์', lat: 16.2390, lng: 103.2490 },
      { name: 'น้องโบว์ คณะศึกษาศาสตร์', phone: '081-234-5611', address: 'ตึกเรียนรวมคณะศึกษาศาสตร์ มมส.', lat: 16.2430, lng: 103.2440 },
      { name: 'คุณอรรถพล หอพักโชคดี', phone: '081-234-5612', address: 'หอพักโชคดี ซอยข้างเซเว่นขามเรียง', lat: 16.2540, lng: 103.2495 },
      { name: 'คุณรุ่งโรจน์ สถาบันภาษา', phone: '081-234-5613', address: 'สถาบันภาษา มมส. ตึก RN', lat: 16.2460, lng: 103.2445 },
      { name: 'คุณกรรณิการ์ หอบ้านสวน', phone: '081-234-5614', address: 'หอพักบ้านสวน คลองสมถวิล', lat: 16.2560, lng: 103.2460 },
      { name: 'คุณอนุวัฒน์ ตลาดคลองถม', phone: '081-234-5615', address: 'ร้านซ่อมคอม ซอยตลาดนัดมอ', lat: 16.2505, lng: 103.2420 },
      { name: 'คุณชลธิชา คอนโดโมเดิร์น', phone: '081-234-5616', address: 'Modern Condo อาคาร B ชั้น 3', lat: 16.2475, lng: 103.2610 },
      { name: 'คุณนิพนธ์ อาคารพลศึกษา', phone: '081-234-5617', address: 'โรงยิมเนเซียม 1 มหาวิทยาลัย', lat: 16.2380, lng: 103.2530 },
      { name: 'คุณเบญจวรรณ หอสตรีมาลี', phone: '081-234-5618', address: 'หอพักสตรีมาลีวัลย์ ขามเรียง 4', lat: 16.2535, lng: 103.2525 },
      { name: 'คุณธวัชชัย คณะเภสัช', phone: '081-234-5619', address: 'คณะเภสัชศาสตร์ อาคารปฏิบัติการ', lat: 16.2405, lng: 103.2465 },
      { name: 'คุณประภัสสร หออินเตอร์', phone: '081-234-5620', address: 'Inter Dormitory ซอยคาวบอย', lat: 16.2550, lng: 103.2545 },
      { name: 'คุณศิริพร คณะมนุษยศาสตร์', phone: '081-234-5621', address: 'คณะมนุษยศาสตร์และสังคมศาสตร์', lat: 16.2450, lng: 103.2490 },
      { name: 'คุณภาณุพงศ์ คลินิกทันตกรรม', phone: '081-234-5622', address: 'อาคารเฉลิมพระเกียรติ มมส.', lat: 16.2410, lng: 103.2560 },
      { name: 'คุณวาสนา หอสุขใจ', phone: '081-234-5623', address: 'หอสุขใจ ท่าขอนยาง-ขามเรียง', lat: 16.2360, lng: 103.2515 },
      { name: 'คุณจักรพงษ์ โรงอาหารกลาง', phone: '081-234-5624', address: 'ศูนย์อาหาร มมส. ร้านน้ำผลไม้', lat: 16.2445, lng: 103.2500 },
      { name: 'คุณดวงใจ คณะสิ่งแวดล้อม', phone: '081-234-5625', address: 'คณะสิ่งแวดล้อมและทรัพยากรศาสตร์', lat: 16.2425, lng: 103.2580 },
      { name: 'คุณพิเชษฐ์ หอพักกัลปพฤกษ์', phone: '081-234-5626', address: 'หอกัลปพฤกษ์ 2 ท่าขอนยาง', lat: 16.2350, lng: 103.2480 },
      { name: 'คุณลลิตา ธนาคารไทยพาณิชย์', phone: '081-234-5627', address: 'สาขามหาวิทยาลัยมหาสารคาม', lat: 16.2468, lng: 103.2520 },
      { name: 'คุณยงยุทธ กองกิจการนิสิต', phone: '081-234-5628', address: 'อาคารพัฒนานิสิต ชั้น 1', lat: 16.2440, lng: 103.2485 },
      { name: 'คุณอรทัย หอพักภูเพชร', phone: '081-234-5629', address: 'หอพักภูเพชร ถนนดอนยม', lat: 16.2570, lng: 103.2510 },
      { name: 'คุณกฤษฎา คอนโดพรีเมียม', phone: '081-234-5630', address: 'Premium Place Condo ขามเรียง', lat: 16.2500, lng: 103.2630 }
    ];

    const insertCustomer = db.prepare(`
      INSERT INTO customers (name, phone, address, lat, lng)
      VALUES (@name, @phone, @address, @lat, @lng)
    `);

    const seedCustomers = db.transaction(() => {
      sampleCustomers.forEach(c => insertCustomer.run(c));
    });
    seedCustomers();

    // Also seed sample 28 orders for lunch rush
    const insertOrder = db.prepare(`
      INSERT INTO orders (orderNumber, customerId, boxCount, orderTime, status)
      VALUES (?, ?, ?, '10:15:00', 'pending')
    `);

    const boxDistribution = [1, 2, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 2, 1, 2, 3, 1, 2, 3, 1, 2, 3, 2, 1, 2, 3, 2];
    const seedOrders = db.transaction(() => {
      boxDistribution.forEach((boxes, idx) => {
        const orderNum = `ORD-20261003-${(idx + 1).toString().padStart(3, '0')}`;
        insertOrder.run(orderNum, idx + 1, boxes);
      });
    });
    seedOrders();
  }
}
