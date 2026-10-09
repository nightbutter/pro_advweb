# Smart Rider Backend – คู่มือ API และการ Deploy

## ภาพรวมและ Base URL

| สภาพแวดล้อม | Backend origin | API base | Health |
|---|---|---|---|
| **Production (Vercel)** | `https://backend-pro-advweb.vercel.app` | `https://backend-pro-advweb.vercel.app/api` | `https://backend-pro-advweb.vercel.app/api/health` |
| **Local development** | `http://localhost:3000` | `http://localhost:3000/api` | `http://localhost:3000/api/health` |

ทุกเส้นอยู่ใต้ prefix `/api` (mount ใน `src/index.ts`) และรับ/ส่ง JSON (`Content-Type: application/json`)

## ข้อตกลงทั่วไป (Request/Error Conventions)

- Error ทุกเส้นมีรูปแบบ `{ "error": "ข้อความ" }` พร้อม status `400` / `404` / `500`
- path ใต้ `/api` ที่ไม่มีอยู่จริง → `404 { "error": "Not found: METHOD /api/..." }` (JSON เสมอ ไม่มี HTML error page)
- request body ที่เป็น JSON เสียรูป → `400 { "error": "Malformed request body" }`
- error ฝั่ง server ไม่ leak stack trace หรือ path ภายใน
- ยังไม่มีระบบ authentication ใครมี URL ก็เรียกได้ทุกเส้น **รวมถึงเส้นที่ลบข้อมูล**

## สรุปทุกเส้น

| # | Method | Path | หน้าที่ |
|---|---|---|---|
| 1 | GET | `/api/health` | เช็คว่า server ทำงาน |
| 2 | GET | `/api/customers` | ลูกค้าทั้งหมด |
| 3 | GET | `/api/customers/:id` | ลูกค้า 1 คน |
| 4 | POST | `/api/customers` | เพิ่มลูกค้า |
| 5 | PUT | `/api/customers/:id` | แก้ไขลูกค้า |
| 6 | DELETE | `/api/customers/:id` | ลบลูกค้า (ลบออเดอร์ของลูกค้าด้วย) |
| 7 | GET | `/api/customers/search?q=` | ค้นหาลูกค้าจากบางส่วนของชื่อ |
| 8 | GET | `/api/customers/nearby?lat=&lng=` | ลูกค้าในรัศมี 1 กม. |
| 9 | GET | `/api/orders` | ออเดอร์ทั้งหมด |
| 10 | GET | `/api/orders/nearby?lat=&lng=` | ออเดอร์ในรัศมี 2 กม. |
| 11 | POST | `/api/orders` | เพิ่มออเดอร์ |
| 12 | PUT | `/api/orders/:id` | แก้ไขออเดอร์ |
| 13 | DELETE | `/api/orders/:id` | ลบออเดอร์ 1 รายการ |
| 14 | DELETE | `/api/orders` | ลบออเดอร์ทั้งหมด |
| 15 | POST | `/api/orders/simulate` | จำลองออเดอร์มื้อเที่ยง |
| 16 | GET | `/api/riders` | ไรเดอร์ทั้งหมด (13 คน) |
| 17 | GET | `/api/riders/:idOrCode` | ไรเดอร์ 1 คน |
| 18 | POST | `/api/routes/optimize` | คำนวณเส้นทางใหม่ |
| 19 | GET | `/api/routes/current` | แผนเส้นทางล่าสุด |
| 20 | GET | `/api/routes/rider/:jobCodeOrId` | ใบงานของไรเดอร์ 1 คน |

---

## 1. Health

### GET `/api/health`
```json
{ "status": "ok", "timestamp": "2026-10-09T03:00:00.000Z", "storage": "ephemeral" }
```
- `storage`: `"ephemeral"` เมื่อรันบน Vercel (SQLite ใน `/tmp`) / `"file"` เมื่อรัน local

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
Body (บังคับทุกฟิลด์ ถ้าขาดหรือค่าไม่ถูกต้อง → `400`)
```json
{ "name": "สมชาย", "phone": "0812345678", "address": "หอพัก A ขามเรียง", "lat": 16.2468, "lng": 103.2521 }
```
- `lat` ต้องเป็นตัวเลข −90..90 และ `lng` −180..180 ถ้าไม่ใช่ → `400`
- ตอบ `201` พร้อมลูกค้าที่สร้าง (มี `id`)

### PUT `/api/customers/:id`
Body เหมือน POST — **ต้องส่งครบทุกฟิลด์** ถ้าขาดฟิลด์หรือ `lat`/`lng` ไม่ถูกต้อง → `400`
ตอบลูกค้าที่แก้แล้ว ถ้าไม่พบ → `404`

### DELETE `/api/customers/:id`
ลบลูกค้าและออเดอร์ทั้งหมดของลูกค้าคนนั้น
```json
{ "success": true, "message": "Customer deleted" }
```

### GET `/api/customers/search?q=<ข้อความ>`
ค้นหาลูกค้าจาก **บางส่วนของชื่อ** (column `name` เก็บชื่อเต็ม ดังนั้นจับคู่ได้ทั้งชื่อและนามสกุล)
- `q` บังคับ ถ้าขาดหรือว่าง → `400`
- ตัวอักษร `%`, `_`, `\` ใน q ถูก escape เป็น literal
- คืน array ของลูกค้า (รูปแบบเดียวกับ GET /api/customers) เรียง id จากใหม่ไปเก่า

### GET `/api/customers/nearby?lat=<ละติจูด>&lng=<ลองจิจูด>[&radius=<เมตร>]`
ค้นหาลูกค้าในรัศมี **1 กิโลเมตร** (ค่าเริ่มต้น `radius=1000` เมตร) จากพิกัดที่ระบุ
- `lat`, `lng` บังคับ ต้องเป็นตัวเลข lat ∈ [-90,90], lng ∈ [-180,180] ถ้าขาด/ไม่ถูกต้อง → `400`
- `radius` ไม่บังคับ หน่วยเป็นเมตร ต้อง > 0 ถ้าไม่ถูกต้อง → `400`
- ระยะทางคำนวณด้วยสูตร Haversine (รัศมีโลก 6,371,000 ม.) เทียบแบบ `ระยะ <= radius` (รวมขอบเขตพอดี)
- ลูกค้าที่ไม่มีพิกัดที่ถูกต้องจะถูกข้าม

```json
{ "radiusMeters": 1000, "count": 22, "customers": [ { "id": 1, "name": "...", "lat": 16.2482, "lng": 103.2488, "distanceMeters": 132.1 } ] }
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

### GET `/api/orders/nearby?lat=<ละติจูด>&lng=<ลองจิจูด>[&radius=<เมตร>]`
ค้นหาออเดอร์ในรัศมี **2 กิโลเมตร** (ค่าเริ่มต้น `radius=2000` เมตร) จากพิกัดที่ระบุ
- พิกัดของออเดอร์ = พิกัดที่อยู่จัดส่งของลูกค้า (JOIN จากตาราง customers)
- validation และรูปแบบผลลัพธ์เหมือน `/api/customers/nearby` แต่คืน `orders` พร้อมข้อมูลลูกค้าและ `distanceMeters`

```json
{ "radiusMeters": 2000, "count": 28, "orders": [ { "id": 1, "orderNumber": "ORD-LUNCH-001", "customerName": "...", "boxCount": 2, "lat": 16.2482, "lng": 103.2488, "distanceMeters": 132.1 } ] }
```

### POST `/api/orders`
```json
{ "customerId": 1, "boxCount": 2 }
```
- `boxCount` ต้องเป็นจำนวนเต็ม 1–3 ถ้าไม่ใช่ → `400`
- `customerId` ต้องอ้างถึงลูกค้าที่มีอยู่จริง ถ้าไม่พบ → `400 Customer not found`
- server สร้าง `orderNumber`, `orderTime` (เวลาปัจจุบัน) และ `status = pending` ให้

ตอบ `201` พร้อมออเดอร์ที่สร้าง

### PUT `/api/orders/:id`
ส่งเฉพาะฟิลด์ที่ต้องการแก้
```json
{ "boxCount": 3, "customerId": 2 }
```
ถ้าไม่พบ → `404` ถ้า `boxCount` ไม่ใช่จำนวนเต็ม 1–3 → `400` ถ้า `customerId` ไม่มีอยู่จริง → `400`

### DELETE `/api/orders/:id`
```json
{ "success": true, "message": "Order deleted" }
```

### DELETE `/api/orders`
ลบออเดอร์ทั้งหมด — ⚠️ **destructive** ห้ามยิงไปที่ production เพื่อทดสอบ
```json
{ "success": true, "message": "All orders cleared" }
```

### POST `/api/orders/simulate`
ลบออเดอร์เดิมทั้งหมด แล้วสร้างออเดอร์จำลองใหม่ — ⚠️ **destructive** (ลบออเดอร์จริงทิ้งทั้งหมด)
```json
{ "count": 28 }
```
- `count` ไม่บังคับ (ค่าเริ่มต้น 28) ถ้าส่งต้องเป็น **จำนวนเต็ม 1–500** ถ้าไม่ถูกต้อง → `400` และ **ออเดอร์เดิมจะไม่ถูกลบ**
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

---

## 6. ตัวอย่างการทดสอบ Production และ Local

### Production (`https://backend-pro-advweb.vercel.app/api`)

```bash
# health
curl "https://backend-pro-advweb.vercel.app/api/health"

# ลูกค้าทั้งหมด / ไรเดอร์ / ออเดอร์
curl "https://backend-pro-advweb.vercel.app/api/customers"
curl "https://backend-pro-advweb.vercel.app/api/riders"
curl "https://backend-pro-advweb.vercel.app/api/orders"

# ค้นหาลูกค้าจากบางส่วนของชื่อ (URL-encode ข้อความภาษาไทย)
curl "https://backend-pro-advweb.vercel.app/api/customers/search?q=%E0%B8%AB%E0%B8%AD%E0%B8%9E%E0%B8%B1%E0%B8%81"

# ลูกค้าในรัศมี 1 กม. จากจุดตั้งร้าน (16.2465, 103.2505)
curl "https://backend-pro-advweb.vercel.app/api/customers/nearby?lat=16.2465&lng=103.2505"

# ออเดอร์ในรัศมี 2 กม.
curl "https://backend-pro-advweb.vercel.app/api/orders/nearby?lat=16.2465&lng=103.2505"

# ใบงานไรเดอร์ / แผนเส้นทางล่าสุด (อ่านอย่างเดียว ปลอดภัย)
curl "https://backend-pro-advweb.vercel.app/api/routes/rider/TASK-01"
curl "https://backend-pro-advweb.vercel.app/api/routes/current"
```

ตัวอย่าง POST/PUT ที่ **เขียนข้อมูลจริงลง production** — ใช้เฉพาะตอนจำเป็นและควรลบข้อมูลทดสอบออกหลังใช้:
```bash
# สร้างลูกค้า (เขียนข้อมูลจริง)
curl -X POST "https://backend-pro-advweb.vercel.app/api/customers" \
  -H "Content-Type: application/json" \
  -d '{"name":"ทดสอบ","phone":"0800000000","address":"ทดสอบ","lat":16.25,"lng":103.25}'

# แก้ไขลูกค้า id 31 (ต้องส่งครบทุกฟิลด์)
curl -X PUT "https://backend-pro-advweb.vercel.app/api/customers/31" \
  -H "Content-Type: application/json" \
  -d '{"name":"ทดสอบ2","phone":"0800000001","address":"ทดสอบ","lat":16.25,"lng":103.25}'
```

> ⚠️ **ห้ามรันคำสั่งเหล่านี้กับ production เพื่อทดสอบ** เพราะทำลาย/เปลี่ยนข้อมูลจริง:
> `DELETE /api/orders`, `DELETE /api/orders/:id`, `DELETE /api/customers/:id`, `POST /api/orders/simulate` (ลบออเดอร์ทั้งหมดแล้วสร้างใหม่)

### Local development (`http://localhost:3000/api`)

ตัวอย่างข้างล่างนี้สำหรับ **local เท่านั้น** — ปลอดภัยที่จะทดลองเต็มที่รวมถึงคำสั่ง destructive:

```bash
# รัน backend ก่อน: cd server && npm run dev
curl "http://localhost:3000/api/health"

# ค้นหา + รัศมี (local)
curl "http://localhost:3000/api/customers/search?q=สมชาย"
curl "http://localhost:3000/api/customers/nearby?lat=16.2465&lng=103.2505"
curl "http://localhost:3000/api/orders/nearby?lat=16.2465&lng=103.2505"

# สร้างลูกค้าใหม่ (local)
curl -X POST "http://localhost:3000/api/customers" \
  -H "Content-Type: application/json" \
  -d '{"name":"สมชาย","phone":"0812345678","address":"หอพัก A ขามเรียง","lat":16.2468,"lng":103.2521}'

# สร้าง/แก้ไขออเดอร์ (local)
curl -X POST "http://localhost:3000/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"customerId":1,"boxCount":2}'
curl -X PUT "http://localhost:3000/api/orders/1" \
  -H "Content-Type: application/json" \
  -d '{"boxCount":3}'

# ลำดับการใช้งานเต็ม (local) — simulate ลบออเดอร์เดิมทั้งหมดก่อนสร้างใหม่
curl -X POST "http://localhost:3000/api/orders/simulate" -H "Content-Type: application/json" -d '{"count":28}'
curl -X POST "http://localhost:3000/api/routes/optimize" -H "Content-Type: application/json" -d '{"seed":0}'
curl "http://localhost:3000/api/routes/rider/TASK-01"
```

หมายเหตุ: คำสั่ง curl บน Windows อาจต้องใช้ Git Bash / PowerShell หรือส่ง query ภาษาไทยแบบ percent-encoded ตามตัวอย่าง production ด้านบน

---

## 7. CORS และ Environment Configuration

CORS ของ backend (`src/index.ts`) อนุญาตเฉพาะ origin เหล่านี้:
- `https://pro-advweb.vercel.app` (production frontend)
- preview deployments `https://pro-advweb-*.vercel.app`
- `http://localhost:4200`, `http://127.0.0.1:4200` (Angular dev server)
- origin ใน env `FRONTEND_URL` ถ้าตั้งไว้
- request ที่ไม่มี `Origin` header (curl, health check) ผ่านเสมอ

origin ที่ไม่อยู่ใน list: request **จะได้รับ response ปกติแต่ไม่มี CORS headers** — browser จะ block ฝั่ง client (ไม่ใช่ error 500)

Frontend อ่าน URL ของ API จาก environment file:
- `client/src/environments/environment.ts` — production (`ng build`) ชี้ไปที่ `https://backend-pro-advweb.vercel.app/api`
- `client/src/environments/environment.development.ts` — ใช้ตอน `ng serve` ชี้ไปที่ `http://localhost:3000/api`

Environment variables ของ backend (ทั้งหมดไม่บังคับ):
- `FRONTEND_URL` — เพิ่ม origin ที่อนุญาตใน CORS
- `PORT` — port ตอนรัน local (default 3000)
- `VERCEL` — Vercel ตั้งให้อัตโนมัติ ใช้ตัดสินว่าเขียน SQLite ลง `/tmp`

---

## 8. Deploy บน Vercel

โปรเจกต์นี้ deploy เป็น **2 Vercel projects แยกกัน** (dashboard settings — ตรวจจาก repo ไม่ได้ทั้งหมด):

| Project | Root Directory | หมายเหตุ |
|---|---|---|
| Frontend | `client` | มี `client/vercel.json`: `outputDirectory: dist/frontend/browser` + SPA rewrite ทุก path → `/index.html` |
| Backend | `server` | ไม่มี `vercel.json` — Vercel หา entrypoint `src/index.ts` เอง (มี `export default app`) |

### ข้อจำกัดที่ต้องรู้ก่อน
- Backend ใช้ SQLite (ไฟล์) แต่ Vercel เขียนไฟล์ได้เฉพาะ `/tmp` และข้อมูลใน `/tmp` จะหายเมื่อ function ถูกปิด/เปิดใหม่ หรือเมื่อ deploy ใหม่
- ผลคือข้อมูลที่เพิ่ม/แก้จะหายเป็นระยะ แล้ว server จะ seed ข้อมูลตัวอย่างใหม่ให้ ใช้สำหรับ demo ได้ แต่ไม่เหมาะกับข้อมูลจริง
- ถ้าต้องเก็บข้อมูลถาวร ให้ย้ายไปใช้ฐานข้อมูลภายนอก เช่น Turso (SQLite บนคลาวด์), Neon/Supabase (Postgres) หรือ deploy backend บน Render/Railway ที่มี disk แทน
- แผนเส้นทาง (`latestPlan`) เก็บในหน่วยความจำ บน Vercel อาจหายระหว่าง request ได้ ให้เรียก `POST /api/routes/optimize` ก่อนดึงแผนเสมอ

### สิ่งที่โค้ดรองรับแล้ว
- `src/index.ts` มี `export default app` และเรียก `app.listen` เฉพาะตอนไม่ได้รันบน Vercel
- `src/database/connection.ts` ใช้ `/tmp/database.sqlite` เมื่อรันบน Vercel (ตัวแปร `VERCEL` ถูกตั้งให้อัตโนมัติ)

### วิธี deploy backend ใหม่ (ผ่านหน้าเว็บ Vercel)
1. Push โค้ดขึ้น GitHub
2. ไปที่ https://vercel.com/new แล้วเลือก Import repo `ADVWEB`
3. ตั้งค่าโปรเจกต์
   - Root Directory: `server`
   - Framework Preset: `Express` (หรือ Other)
   - Build Command / Output Directory: เว้นว่าง
4. กด Deploy
5. ทดสอบ: เปิด `https://<project-name>.vercel.app/api/health`

หลังจากนี้ทุกครั้งที่ push ขึ้น `main` Vercel จะ deploy ให้อัตโนมัติ (ตรวจสอบแล้วว่า auto-deploy ทำงานจริง)

### วิธีที่ 2: ผ่าน Vercel CLI
```bash
npm i -g vercel
cd server
vercel login
vercel          # deploy แบบ preview (ครั้งแรกจะถามตั้งค่าโปรเจกต์)
vercel --prod   # deploy ขึ้น production
```
ทดสอบในเครื่องแบบเดียวกับบน Vercel ได้ด้วย `vercel dev`

### ถ้า backend ย้าย URL
แก้ `apiUrl` ใน `client/src/environments/environment.ts` เท่านั้น ไม่ต้องแก้ service — แล้ว rebuild + redeploy frontend

### ถ้าเปลี่ยน domain frontend
เพิ่ม origin ใน `server/src/index.ts` (อาเรย์ `allowedOrigins`) หรือตั้งค่า env `FRONTEND_URL` บน Vercel

---

## 9. Database Persistence และ Known Limitations

- **Local:** SQLite ไฟล์ `server/database.sqlite` (gitignored) — ข้อมูลถาวรตามปกติ
- **Vercel:** SQLite ถูกเขียนลง `/tmp/database.sqlite` เท่านั้น — ทุก deployment และ cold start จะเริ่มจากฐานข้อมูลใหม่ที่ถูก seed อัตโนมัติ (เช็คได้จาก `GET /api/health` → `"storage": "ephemeral"`) **ข้อมูล production ไม่ถาวร**
- ถ้าต้องการเก็บข้อมูลจริงถาวร ให้ย้ายไปฐานข้อมูลภายนอก เช่น Turso (`@libsql/client` — API คล้าย SQLite มาก แก้เฉพาะ `src/database/connection.ts`), Neon/Supabase (Postgres) แล้วตั้งค่า connection string เป็น Vercel Environment Variable เช่น `DATABASE_URL` / `TURSO_AUTH_TOKEN` — **ห้าม hardcode credentials ในโค้ด**
- แผนเส้นทาง (`latestPlan`) อยู่ในหน่วยความจำ อาจหายระหว่าง request บน serverless — เรียก `POST /api/routes/optimize` ใหม่ทุกครั้งก่อนดึง `/current` หรือใบงานไรเดอร์
- `better-sqlite3` ต้อง compile สำหรับ Linux ตอน build บน Vercel — ถ้า build log error เกี่ยวกับ `better-sqlite3` / `node-gyp` ให้ตั้ง Node.js Version เป็น **22.x** ใน Project Settings → Build and Deployment
- ถ้าเปิดแล้วได้ 500 ให้ดู error ที่ Project → Logs
