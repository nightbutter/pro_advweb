import { app, ensureDb } from './app';

// ใช้ PORT ตัวพิมพ์ใหญ่ตามมาตรฐาน (บริการโฮสติ้งจะส่งค่ามาให้)
const PORT = process.env.PORT || 3000;

// On Vercel the exported app is used as a serverless function, so only listen locally
if (!process.env.VERCEL) {
  ensureDb()
    .then((ok) => {
      if (!ok) {
        process.exit(1);
      }
      app.listen(PORT, () => {
        console.log(`🚀 Smart Rider Backend running on http://localhost:${PORT}`);
      });
    })
    .catch(() => process.exit(1));
}

export default app;
