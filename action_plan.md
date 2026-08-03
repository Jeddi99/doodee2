# 🚀 Facial Analysis System - Action Plan (แผนลงมือปฏิบัติ)

เอกสารนี้ใช้สำหรับติดตามความคืบหน้าในการลงมือเขียนโค้ดและพัฒนาระบบตามสถาปัตยกรรมระดับ Production

## Phase 1: Infrastructure & Database Setup (โครงสร้างพื้นฐาน)
- [ ] 1.1 ตั้งค่า Firebase Authentication Project
- [x] 1.2 สร้างโครงสร้างโฟลเดอร์ `backend/` และไฟล์เริ่มต้น
- [ ] 1.3 ออกแบบและสร้างตาราง PostgreSQL (Users, Scans, Scoring_Rules)
- [ ] 1.4 สร้าง API Endpoints พื้นฐานด้วย FastAPI (Login, Get Profile)

## Phase 2: Asynchronous AI Pipeline (ระบบ AI พื้นหลัง)
- [ ] 2.1 ติดตั้งและรัน Redis Server (บน Docker หรือ Local)
- [ ] 2.2 ตั้งค่า Celery Worker ใน FastAPI
- [ ] 2.3 เชื่อมต่อระบบอัปโหลดรูปภาพไปยัง Cloud Storage (AWS S3 / GCS)
- [ ] 2.4 สร้างฟังก์ชันสกัด Facial Landmarks (468 จุด) ด้วย MediaPipe
- [ ] 2.5 เชื่อมโยง API รับรูป -> อัปโหลดขึ้น Cloud -> ส่ง Task ให้ Celery Worker

## Phase 3: Dynamic Scoring & Recommendation Engine
- [ ] 3.1 ค้นคว้าและรวบรวมค่ามาตรฐานความงาม (Golden Ratios, Marquardt Mask)
- [ ] 3.2 เขียนสคริปต์ (Seed data) นำค่ามาตรฐานใส่ลงตาราง `scoring_rules` ใน Database
- [ ] 3.3 สร้าง Algorithm คำนวณ Ratios, Angles และแปลงเป็นคะแนน (Scoring Logic)
- [ ] 3.4 สร้างระบบ Rule-based เพื่อเลือกคำแนะนำ (Surgical / Non-surgical) ตามคะแนน
- [ ] 3.5 ทดสอบความแม่นยำของโมเดลด้วยรูปภาพตัวอย่าง

## Phase 4: Web Application (Next.js)
- [ ] 4.1 สร้างโปรเจกต์ Next.js (React + Tailwind CSS)
- [ ] 4.2 เชื่อมต่อ Firebase Auth สำหรับเข้าสู่ระบบ
- [ ] 4.3 สร้างหน้า Dashboard แดชบอร์ดสรุปผล 12 หมวดหมู่ (Spider charts)
- [ ] 4.4 สร้างหน้าแสดง Personalized Improvement Plan

## Phase 5: Mobile Application (React Native)
- [ ] 5.1 สร้างโปรเจกต์ React Native (Expo)
- [ ] 5.2 สร้างหน้าจออัปโหลดและเปิดกล้องสำหรับสแกนใบหน้า
- [ ] 5.3 เชื่อมต่อ API ตัวเดียวกันกับฝั่ง Web
