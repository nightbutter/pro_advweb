# Smart Rider Backend – คู่มือ API และการ Deploy

Base URL
- Local: `http://localhost:3000/api`
- Vercel: `https://<project-name>.vercel.app/api`

ทุกเส้นรับ/ส่ง JSON (`Content-Type: application/json`)
Error ทุกเส้นมีรูปแบบ `{ "error": "ข้อความ" }` พร้อม status 400 / 404 / 500
ยังไม่มีระบบ authentication ใครมี URL ก็เรียกได้ทุกเส้น รวมถึงเส้นที่ลบข้อมูล

## สรุปทุกเส้น

| # | Method | Path | หน้าที่ |
|---|---|---|---|
| 1 | GET | `/api/health` | เช็คว่า server ทำงาน |
| 2 | GET | `/api/customers` | ลูกค้าทั้งหมด |
| 3 | GET | `/api/customers/:id` | ลูกค้า 1 คน |
| 4 | POST | `/api/customers` | เพิ่มลูกค้า |
| 5 | PUT | `/api/customers/:id` | แก้ไขลูกค้า |
| 6 | DELETE | `/api/customers/:id` | ลบลูกค้า (ลบออเดอร์ของลูกค้าด้วย) |
| 7 | GET | `/api/orders` | ออเดอร์ทั้งหมด |
| 8 | POST | `/api/orders` | เพิ่มออเดอร์ |
| 9 | PUT | `/api/orders/:id` | แก้ไขออเดอร์ |
| 10 | DELETE | `/api/orders/:id` | ลบออเดอร์ 1 รายการ |
| 11 | DELETE | `/api/orders` | ลบออเดอร์ทั้งหมด |
| 12 | POST | `/api/orders/simulate` | จำลองออเดอร์มื้อเที่ยง |
| 13 | GET | `/api/riders` | ไรเดอร์ทั้งหมด (13 คน) |
| 14 | GET | `/api/riders/:idOrCode` | ไรเดอร์ 1 คน |
| 15 | POST | `/api/routes/optimize` | คำนวณเส้นทางใหม่ |
| 16 | GET | `/api/routes/current` | แผนเส้นทางล่าสุด |
| 17 | GET | `/api/routes/rider/:jobCodeOrId` | ใบงานของไรเดอร์ 1 คน |

---

## 1. Health

### GET `/api/health`
```json
{ "status": "ok", "timestamp": "2026-10-09T03:00:00.000Z" }
```

---

## 2. Customers

ข้อมูลลูกค้า
```json
{ "id": 1, "name": "สมชาย", "phone": "0812345678", "address": "หอพัก A ขามเรียง", "lat": 16.2468, "lng": 103.2521 }
```

### GET `/api/customers`
คืน array ของลูกค้า เรียง id จากใหม่ไปเก่า

### GET `/api/customers/:id`
คืนลูกค้า 1 คน ถ้าไม่พบ → `404 Customer not found`

### POST `/api/customers`
Body (บังคับทุกฟิลด์ ถ้าขาด → `400`)
```json
{ "name": "สมชาย", "phone": "0812345678", "address": "หอพัก A ขามเรียง", "lat": 16.2468, "lng": 103.2521 }
```
ตอบ `201` พร้อมลูกค้าที่สร้าง (มี `id`)

### PUT `/api/customers/:id`
Body เหมือน POST ต้องส่งครบทุกฟิลด์ (ฟิลด์ที่ไม่ส่งจะกลายเป็นค่าว่าง)
ตอบลูกค้าที่แก้แล้ว ถ้าไม่พบ → `404`

### DELETE `/api/customers/:id`
ลบลูกค้าและออเดอร์ทั้งหมดของลูกค้าคนนั้น
```json
{ "success": true, "message": "Customer deleted" }
```

---

## 3. Orders

ข้อมูลออเดอร์ (join ข้อมูลลูกค้ามาให้)
```json
{
  "id": 1,
  "orderNumber": "ORD-LUNCH-001",
  "customerId": 1,
  "boxCount": 2,
  "orderTime": "10:12:00",
  "status": "pending",
  "assignedRiderId": null,
  "deliverySequence": null,
  "customerName": "สมชาย",
  "customerPhone": "0812345678",
  "customerAddress": "หอพัก A ขามเรียง",
  "lat": 16.2468,
  "lng": 103.2521
}
```
`status`: `pending` → `assigned` (หลังเรียก optimize) → `delivered`

### GET `/api/orders`
คืน array ของออเดอร์ทั้งหมด เรียง id จากน้อยไปมาก

### POST `/api/orders`
```json
{ "customerId": 1, "boxCount": 2 }
```
- `boxCount` ต้องเป็น 1–3 ถ้าไม่ใช่ → `400`
- server สร้าง `orderNumber`, `orderTime` (เวลาปัจจุบัน) และ `status = pending` ให้

ตอบ `201` พร้อมออเดอร์ที่สร้าง

### PUT `/api/orders/:id`
ส่งเฉพาะฟิลด์ที่ต้องการแก้
```json
{ "boxCount": 3, "customerId": 2 }
```
ถ้าไม่พบ → `404` ถ้า `boxCount` ไม่ใช่ 1–3 → `400`

### DELETE `/api/orders/:id`
```json
{ "success": true, "message": "Order deleted" }
```

### DELETE `/api/orders`
ลบออเดอร์ทั้งหมด
```json
{ "success": true, "message": "All orders cleared" }
```

### POST `/api/orders/simulate`
ลบออเดอร์เดิมทั้งหมด แล้วสร้างออเดอร์จำลองใหม่
```json
{ "count": 28 }
```
- `count` ไม่บังคับ (ค่าเริ่มต้น 28)
- ออเดอร์ชื่อ `ORD-LUNCH-001`... วนตามลูกค้า สุ่ม 1–3 กล่อง เวลาสั่ง 10:00–10:45

```json
{ "message": "Simulated 28 lunch orders successfully!", "orders": [ ... ] }
```

---

## 4. Riders

```json
{ "id": 1, "name": "ไรเดอร์ สมชาย (เบอร์ 1)", "phone": "089-111-2001", "color": "#E6194B", "maxOrders": 3, "status": "active" }
```

### GET `/api/riders`
คืนไรเดอร์ทั้ง 13 คน (id 1–13 ตายตัว)

### GET `/api/riders/:idOrCode`
รับได้ทั้ง `1`, `RD-01`, `TASK-01` (server ดึงตัวเลขออกมาเอง) ถ้าไม่พบ → `404`

---

## 5. Routes (วางแผนเส้นทาง)

### POST `/api/routes/optimize`
คำนวณเส้นทางจากออเดอร์ทั้งหมด แล้วบันทึก `assignedRiderId`, `deliverySequence`, `status = assigned` ลงออเดอร์
```json
{ "seed": 0 }
```
`seed` ไม่บังคับ ใส่เลขต่างกันจะได้แผนต่างกัน

ผลลัพธ์
```json
{
  "routes": [ /* RiderRoute */ ],
  "summary": {
    "totalOrders": 28,
    "totalBoxes": 55,
    "assignedRidersCount": 10,
    "totalDistanceKm": 32.4,
    "totalDeliveryCost": 520,
    "totalRevenue": 3575,
    "totalFoodCost": 2200,
    "netProfit": 855,
    "profitMarginPercent": 23.9,
    "onTimeDeliveryRate": 100,
    "allOnTime": true
  },
  "shopLocation": { "lat": 16.2465, "lng": 103.2505, "name": "ร้านข้าวกล่องเดลิเวอรี่ ..." }
}
```
(ตัวเลขด้านบนเป็นตัวอย่าง)

RiderRoute
| ฟิลด์ | ความหมาย |
|---|---|
| `riderId`, `riderName`, `riderPhone`, `color`, `jobCode` | ข้อมูลไรเดอร์และรหัสใบงาน (เช่น `TASK-01`) |
| `orders` | ออเดอร์ที่ได้รับ เรียงตาม `deliverySequence` |
| `waypoints` | จุดบนเส้นทาง (`type`: `shop`/`delivery`, `stepNumber`, `distanceFromPrevKm`, `estimatedArrival`) |
| `totalBoxes`, `orderCount` | จำนวนกล่องและจำนวนออเดอร์ |
| `totalDistanceKm`, `estimatedDurationMinutes`, `estimatedFinishTime` | ระยะทางและเวลา |
| `isLate` | ส่งเกิน 12:30 หรือไม่ |
| `baseDeliveryFee` | ค่าส่งพื้นฐาน 15 บาท |
| `distanceBoxFee` | 2 บาท × ระยะทาง × จำนวนกล่อง |
| `totalDeliveryCost` | ค่าส่งรวม |
| `totalRevenue` | 65 บาท × กล่อง |
| `totalFoodCost` | 40 บาท × กล่อง |
| `netProfit`, `profitMarginPercent` | กำไรสุทธิและ % กำไร |

### GET `/api/routes/current`
คืนแผนล่าสุด (รูปแบบเดียวกับ optimize) ถ้ายังไม่เคยคำนวณ จะคำนวณด้วย seed 0 ให้ แต่ไม่บันทึกลง DB

### GET `/api/routes/rider/:jobCodeOrId`
ใบงานของไรเดอร์ 1 คน รับ `3`, `TASK-03` หรือ `RD-03`
```json
{ "shopLocation": { ... }, "route": { /* RiderRoute */ } }
```
ถ้าไรเดอร์ไม่มีงาน → `404 ไม่พบใบงานสำหรับไรเดอร์หมายเลข ...`

### ข้อควรรู้
- แผนเส้นทางเก็บในหน่วยความจำ ถ้า server restart แผนจะหาย
- หลังเพิ่ม/แก้/ลบออเดอร์ ต้องเรียก `POST /api/routes/optimize` ใหม่ ไม่งั้น `/current` จะคืนแผนเก่า

### ตัวอย่างลำดับการใช้งาน
```bash
curl -X POST http://localhost:3000/api/orders/simulate -H "Content-Type: application/json" -d '{"count":28}'
curl -X POST http://localhost:3000/api/routes/optimize -H "Content-Type: application/json" -d '{"seed":0}'
curl http://localhost:3000/api/routes/rider/TASK-01
```

---

## Deploy Backend บน Vercel

### ข้อจำกัดที่ต้องรู้ก่อน
- Backend ใช้ SQLite (ไฟล์) แต่ Vercel เขียนไฟล์ได้เฉพาะ `/tmp` และข้อมูลใน `/tmp` จะหายเมื่อ function ถูกปิด/เปิดใหม่ หรือเมื่อ deploy ใหม่
- ผลคือข้อมูลที่เพิ่ม/แก้จะหายเป็นระยะ แล้ว server จะ seed ข้อมูลตัวอย่างใหม่ให้ ใช้สำหรับ demo ได้ แต่ไม่เหมาะกับข้อมูลจริง
- ถ้าต้องเก็บข้อมูลถาวร ให้ย้ายไปใช้ฐานข้อมูลภายนอก เช่น Turso (SQLite บนคลาวด์), Neon/Supabase (Postgres) หรือ deploy backend บน Render/Railway ที่มี disk แทน
- แผนเส้นทาง (`latestPlan`) เก็บในหน่วยความจำ บน Vercel อาจหายระหว่าง request ได้ ให้เรียก `POST /api/routes/optimize` ก่อนดึงแผนเสมอ

### สิ่งที่โค้ดรองรับแล้ว
- `src/index.ts` มี `export default app` และเรียก `app.listen` เฉพาะตอนไม่ได้รันบน Vercel
- `src/database/connection.ts` ใช้ `/tmp/database.sqlite` เมื่อรันบน Vercel (ตัวแปร `VERCEL` ถูกตั้งให้อัตโนมัติ)
- Vercel หา entrypoint `src/index.ts` เองได้ ไม่ต้องมี `vercel.json`

### วิธีที่ 1: ผ่านหน้าเว็บ Vercel (แนะนำ)
1. Push โค้ดขึ้น GitHub
2. ไปที่ https://vercel.com/new แล้วเลือก Import repo `ADVWEB`
3. ตั้งค่าโปรเจกต์
   - Root Directory: `server`
   - Framework Preset: `Express` (หรือ Other)
   - Build Command / Output Directory: เว้นว่าง
4. กด Deploy
5. ทดสอบ: เปิด `https://<project-name>.vercel.app/api/health`

หลังจากนี้ทุกครั้งที่ push ขึ้น `main` Vercel จะ deploy ให้อัตโนมัติ

### วิธีที่ 2: ผ่าน Vercel CLI
```bash
npm i -g vercel
cd server
vercel login
vercel          # deploy แบบ preview (ครั้งแรกจะถามตั้งค่าโปรเจกต์)
vercel --prod   # deploy ขึ้น production
```
ทดสอบในเครื่องแบบเดียวกับบน Vercel ได้ด้วย `vercel dev`

### เชื่อม Frontend กับ Backend ที่ deploy แล้ว
แก้ `baseUrl` ใน `client/src/app/services/api.service.ts`
```ts
private baseUrl = 'https://<project-name>.vercel.app/api';
```

### ถ้า deploy ไม่ผ่าน
- `better-sqlite3` ต้อง compile สำหรับ Linux ตอน build บน Vercel ถ้า build log ขึ้น error เกี่ยวกับ `better-sqlite3` / `node-gyp` ให้ตั้ง Node.js Version เป็น 22.x ใน Project Settings → Build and Deployment
- ถ้าเปิดแล้วได้ 500 ให้ดู error ที่ Project → Logs
