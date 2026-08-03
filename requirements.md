# Product Requirements Document (PRD) - Facial Analysis System (Production Grade)

## 1. Project Overview
ระบบวิเคราะห์ใบหน้า (Facial Analysis System) ระดับ Production สำหรับประเมินสัดส่วนใบหน้าแบบเจาะลึก ครอบคลุมตัวชี้วัดมากกว่า 100 รายการ แบ่งเป็น 12 หมวดหมู่ พร้อมสร้างรายงานสรุปและคำแนะนำในการพัฒนาตัวเอง (Personalized Improvement Plan) รองรับการสเกลและผู้ใช้งานจำนวนมากพร้อมกัน

## 2. Production Technology Stack
* **Authentication:** Firebase Authentication / Supabase Auth
* **Backend API:** Python, FastAPI
* **Background Processing:** Celery + Redis (Task Queue สำหรับแยกงาน AI ที่กินทรัพยากร)
* **AI Engine:** MediaPipe, OpenCV
* **Database:** PostgreSQL (โครงสร้างรองรับ Dynamic Scoring Rules และ JSONB)
* **Image Storage:** Cloud Storage (AWS S3 / Google Cloud Storage)
* **Web Frontend:** Next.js, React, Tailwind CSS
* **Mobile Frontend:** React Native (Expo)

## 3. Core Features (ฟีเจอร์หลัก)
1. **Cloud Image Upload:** อัปโหลดรูปภาพใบหน้าและบันทึกลง Cloud Storage ทันที
2. **Asynchronous AI Analysis:** ส่งรูปให้ Worker ประมวลผลเบื้องหลัง (ดึง 468 Landmarks) เพื่อไม่ให้กระทบ API หลัก
3. **Dynamic Scoring Engine:** การคำนวณคะแนนที่สามารถปรับแต่งเกณฑ์และสูตรได้ผ่านฐานข้อมูล (Admin สามารถเปลี่ยนเกณฑ์ได้แบบ Real-time)
4. **Personalized Report:** สรุปผลวิเคราะห์ 12 หมวดหมู่ พร้อมกราฟแสดงผล จุดแข็ง จุดอ่อน และคำแนะนำเชิงลึก
5. **Progress Tracking:** ระบบติดตามผลและเปรียบเทียบรูปภาพ ก่อน-หลัง (Before/After Compare)

## 4. Facial Analysis Categories (12 หมวดหมู่การวิเคราะห์)

### 4.1. Harmony (ความสมดุลของใบหน้า)
* Facial thirds (บน-กลาง-ล่าง)
* Upper / Mid / Lower face ratio
* Face width to height ratio (FWHR)
* Total facial width-height ratio
* Midface ratio
* Cheekbone height
* Chin proportion
* Forehead proportion
* Face shape analysis
* Overall facial harmony score 

### 4.2. Eyes (ดวงตา)
* Lateral Canthal Tilt
* Eye Aspect Ratio
* Eye spacing
* One-eye-apart test
* Interpupillary ratio
* Eyebrow tilt
* Brow position
* Brow length
* Eyebrow low-setness
* Eye symmetry
* Eye size
* Eye openness 

### 4.3. Nose (จมูก)
* Nose width
* Nose length
* Nose bridge ratio
* Nose tip projection
* Nose tip position
* Intercanthal–nose ratio
* Alar angle
* Nose deviation
* Nose symmetry
* Nasolabial-related proportions 

### 4.4. Lips & Mouth (ริมฝีปากและปาก)
* Lip width
* Upper/lower lip ratio
* Lip fullness
* Philtrum length
* Mouth width
* Lip symmetry
* Vermillion height

### 4.5. Jaw & Chin (กรามและคาง)
* Jaw width
* Jaw angle
* Gonial angle
* Chin width
* Chin projection
* Chin height
* Jaw definition
* Mandibular proportion
* Neck–jaw transition
* Facial angularity

### 4.6. Cheeks / Midface (แก้มและช่วงกลางใบหน้า)
* Cheekbone prominence
* Midface length
* Midface width
* Zygomatic projection
* Facial convexity
* Buccal fullness

### 4.7. Facial Symmetry (ความสมมาตร)
* Left-right symmetry
* Eye symmetry
* Nose symmetry
* Lip symmetry
* Jaw symmetry
* Facial center alignment
* Overall symmetry score

### 4.8. Skin / Health Indicators (สุขภาพผิว)
* Skin texture
* Acne
* Acne scars
* Wrinkles
* Pigmentation
* Dark circles
* Redness
* Skin clarity
* Skin smoothness
* Skin health score 

### 4.9. Dimorphism (ลักษณะความเป็นชาย/หญิง)
สำหรับผู้ชาย เช่น
* Brow ridge prominence
* Jaw robustness
* Chin robustness
* Facial width
* Facial length
* Eye shape
* Nose masculinity
* Lip characteristics
* Facial angularity
* Bone structure
*(รวมแล้วกว่า 40 ตัวชี้วัด ในหมวดนี้)*

### 4.10. Angularity (ความคมชัดของโครงหน้า)
* Jaw sharpness
* Mandible definition
* Chin angle
* Facial angles
* Cheekbone definition
* Neck angle
* Bone prominence
* Gonial angle
* Overall angularity score 

### 4.11. Side Profile (รูปหน้าด้านข้าง)
* Facial convexity
* Nasofrontal angle
* Nasolabial angle
* Cervicomental angle
* Chin projection
* Nose projection
* Forehead slope
* Jaw projection
* Overall side harmony 

### 4.12. รายงานหลังวิเคราะห์
นอกจากวัดค่าแล้ว ยังมี
* Overall Score
* Harmony Score
* Angularity Score
* Dimorphism Score
* Health Score
* จุดแข็ง (Strengths)
* จุดอ่อน (Weaknesses)
* Personalized Improvement Plan
* Surgical recommendations
* Non-surgical recommendations
* Simulation
* Progress Tracking
* Before/After Compare
