# Webhook Server for GitHub Deployment 🚀

## 🔥 คุณสมบัติหลัก
✅ รับ **Webhook** จาก GitHub และอัปเดตโค้ดอัตโนมัติ
✅ ดึง (`pull`) หรือโคลน (`clone`) โปรเจกต์จาก GitHub
✅ ติดตั้ง dependencies (`npm install`) ก่อนเริ่มรัน
✅ ใช้ **PM2** เพื่อจัดการ process ของแต่ละโปรเจกต์
✅ รองรับการดูแลหลายโปรเจกต์พร้อมกัน
✅ อัปเดตและรันใหม่อัตโนมัติเมื่อไฟล์ `.ini` เปลี่ยนแปลง



repo=https://github.com/hunterfury/bucket
token=xxxx
run=['npm install','pm2 stop bucket','pm2 start ./server.js --name bucket']
