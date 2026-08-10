---
name: plan
description: แปลงความต้องการภาษาธรรมดาของโปรเจกต์ Doodee เป็นแผนเทคนิคภาษาไทยที่พร้อมให้ Agent ลงมือ และบันทึกใน plans ตาม feature key ใช้เมื่อผู้ใช้เรียก /plan หรือ $plan ขอวางแผน feature, redesign, flow, architecture หรือ implementation โดยต้องตรวจ repo และสัมภาษณ์เพื่อปิดการตัดสินใจก่อนเขียนแผน
---

# Development Planner

วางแผนและเขียนไฟล์แผนเท่านั้น ห้ามแก้ source code, deploy หรือสร้าง archive/index ของแผน

## Workflow

1. อ่าน `doodee.md` ก่อนหากมี แล้วอ่าน `plans/`, แผนเดิม, code, tests และเอกสารที่เกี่ยวข้องกับคำขอ ใช้ `flow.md` เป็นโน้ตประกอบเท่านั้น
2. สรุปสถานะจริงจาก repo และแตก decision tree ของ product, UX, architecture, data, privacy และการทดสอบ ห้ามถามสิ่งที่ค้นจาก repo ได้
3. สัมภาษณ์แบบ `$grill-me` โดยถามเฉพาะการตัดสินใจที่ยังเปิดอยู่ ครั้งละหนึ่งคำถาม พร้อมบริบท ตัวเลือก และคำแนะนำที่เหมาะกับ Doodee อย่าถามยืนยันสิ่งที่ผู้ใช้ระบุแล้ว
4. หลังคำตอบแต่ละครั้ง ให้อ่านบริบทเพิ่มเมื่อจำเป็นและคำนวณ decision tree ใหม่ ทำต่อจน Agent ผู้ลงมือไม่ต้องตัดสินใจสาระสำคัญเพิ่ม
5. Resolve `feature_key` แล้วบันทึกแผนอัตโนมัติทันทีเมื่อครบ ห้ามขออนุมัติซ้ำ รายงาน path ที่สร้างหรืออัปเดต

## Resolve Plan File

- ใช้ key แบบ lowercase kebab-case ที่เรียกผลลัพธ์หรือ feature จริง เช่น `home-page`, `face-simulation`, `authentication`; ห้ามใช้ key กว้างอย่าง `ui`
- อ่าน metadata และเนื้อหาใน `plans/*.md` เพื่อหา feature เดียวกันจากความหมาย ไม่พึ่งชื่อที่ผู้ใช้เรียกเพียงอย่างเดียว
- หากตรงกับ feature เดิมเพียงไฟล์เดียว ให้อัปเดตไฟล์นั้นทั้งแผนและวันที่ แม้ feature เคย implement แล้ว
- หากไม่ตรงไฟล์ใด ให้สร้าง `plans/<feature-key>.md`
- หน้าหรือ feature คนละส่วนต้องเป็นคนละไฟล์
- หากอาจตรงมากกว่าหนึ่งไฟล์ หรือคำขอครอบคลุมหลาย feature จนไม่ชัดว่าควรแยกไฟล์อย่างไร ให้ถามก่อนและห้ามแก้ไฟล์จนกว่าจะตอบ
- ห้ามสร้าง backup, archive, index หรือไฟล์ชื่อซ้ำเพื่อเก็บ revision; ใช้ Git เป็นประวัติ

## Doodee Safety Decisions

เมื่องานเกี่ยวกับใบหน้า การวิเคราะห์ หรือ simulation ต้อง resolve และบันทึกเรื่องต่อไปนี้เท่าที่เกี่ยวข้อง:

- consent แยกตามวัตถุประสงค์ และข้อกำหนดอายุ 18+
- retention, deletion และสิ่งที่ถูกหรือไม่ถูกบันทึก
- ถ้อยคำและข้อจำกัดของ clinical claims
- watermark ของผล simulation
- provider ที่ประมวลผล ต้นทุนต่อภาพ/งาน และ latency target

ห้ามลดทอน validation, privacy, security, accessibility หรือ failure handling เพื่อให้แผนสั้นลง หาก repo ตอบเรื่องเหล่านี้แล้ว ให้บันทึกเป็นข้อเท็จจริงแทนการถาม

## Output Format

เขียนแผนเป็นภาษาไทยและอธิบายศัพท์เทคนิคด้วยภาษาง่าย คงชื่อ route, API, schema, component, file path และคำสั่งทดสอบเป็นภาษาอังกฤษ ใช้โครงนี้โดยตัดหัวข้อย่อยที่ไม่เกี่ยวข้องได้ แต่ห้ามตัดข้อมูลที่ Agent ต้องใช้ลงมือ:

```markdown
# <ชื่อแผน>

- feature_key: `<feature-key>`
- สถานะ: พร้อมลงมือ | มี blocker
- อัปเดตล่าสุด: YYYY-MM-DD

## เป้าหมายและเกณฑ์สำเร็จ
## สถานะปัจจุบันจาก repo
## การตัดสินใจและสมมติฐาน
## การเปลี่ยนแปลง
### UX
### Frontend
### Backend
### API และข้อมูล
## Edge cases, privacy และ failure states
## การทดสอบและเกณฑ์รับงาน
## สิ่งที่ไม่รวมและ blocker
```

ระบุไฟล์/จุดเชื่อมต่อที่คาดว่าต้องแก้, behavior ก่อนและหลัง, data flow, migration/compatibility เมื่อมี, คำสั่งตรวจสอบที่รันได้ และ acceptance criteria ที่สังเกตผลได้ แยกข้อเท็จจริงจาก repo ออกจากสมมติฐานชัดเจน ห้ามแต่ง route, API หรือ schema ที่ยังไม่ตัดสินใจ; ถ้าจำเป็นต่อการลงมือให้ถามก่อนเขียน

## Completion Check

ก่อนบันทึก ตรวจว่า:

- ทุกการตัดสินใจที่กระทบ behavior, contract, data หรือความปลอดภัยถูก resolve หรือระบุเป็น blocker
- feature เดิมถูกอัปเดตแทนการสร้างชื่อพ้อง และ UI คนละหน้ามีคนละ key
- แผนครบพอให้ Agent อื่นลงมือได้โดยไม่ต้องเลือก design เพิ่ม
- มี test/acceptance criteria, edge cases และ failure states ตามความเสี่ยง
- การเปลี่ยนแปลงมีเฉพาะ `plans/<feature-key>.md`
