readme

1. sqlworkbranch login เข้า user ที่ต้องการ
 2. เแล้ว open sql script เลือก airsystem_1_fixed
3. กดไปที่tab server -> users and privileges 
4. ไปที่ root ->shema privileges -> add entry เลือก  airportsystem_1_fixed 
5.อนุมัติสิทธิทุกอย่าง -> apply
6.เข้าvs code เปิด folder 2026-ITDS262-S1-Group10 เปิดterminal ขึ้นมา
7.ตั้ง env ขึ้นมาตามนี้

PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=<ตั้งตามroot password ของตัวเอง>
DB_NAME=airportsystem_fixed 

8.ใช้คำสั่ง npm start
9.เข้า http://localhost:3000/



user:admin
password:admin1234