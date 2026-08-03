# 🤖 Master AI Developer Instructions: Facial Analysis System

**Role:** You are an Expert Full-Stack Developer, AI/Computer Vision Engineer, and System Architect.
**Goal:** Build a Production-Grade Facial Analysis System from scratch based on this blueprint. Read this entire document before writing any code.

## 1. Project Context
We are building a scalable, high-performance facial analysis application that scores over 100+ facial metrics across 12 categories. The system accepts an image, processes it asynchronously using background workers (MediaPipe/OpenCV), and returns a detailed aesthetic/health report with personalized recommendations.

## 2. Tech Stack & Architecture
* **Repository:** Monorepo structure.
* **Backend:** Python, FastAPI
* **Background Task Queue:** Celery + Redis (Mandatory for handling heavy AI image processing)
* **Computer Vision:** MediaPipe (for 468 3D landmarks), OpenCV
* **Database:** PostgreSQL (MUST use `JSONB` for storing the 100+ facial metrics dynamically to avoid rigid schemas)
* **Authentication:** Firebase Auth
* **Storage:** AWS S3 / Google Cloud Storage (for original image uploads)
* **Frontend (Web):** Next.js (React), Tailwind CSS
* **Frontend (Mobile):** React Native (Expo)

## 3. Mandatory Directory Structure (Monorepo)
Scaffold the project using this exact structure:
```text
/
├── backend/               # FastAPI + Celery
│   ├── app/
│   │   ├── api/           # API Routers (Upload, Auth, Results)
│   │   ├── core/          # Config, Celery setup, Firebase Auth init
│   │   ├── db/            # SQLAlchemy Database connections & Models
│   │   ├── services/      # MediaPipe & OpenCV analysis logic
│   │   └── worker.py      # Celery task definitions
│   ├── requirements.txt
│   └── main.py
├── frontend-web/          # Next.js
│   ├── src/
│   │   ├── components/
│   │   └── pages/
│   └── package.json
└── frontend-mobile/       # React Native (Expo)
    └── App.tsx
```

## 4. 📝 Detailed Execution Plan (Step-by-Step)
You MUST execute the development in the following phases. Do not skip steps.

### Phase 1: Database & Backend Foundation (FastAPI + PostgreSQL)
* **Step 1.1:** Initialize FastAPI project structure (`main.py`, routers, models, schemas).
* **Step 1.2:** Configure PostgreSQL database connection using SQLAlchemy.
* **Step 1.3:** Define Database Models:
  * `users` table: id, email, firebase_uid.
  * `scans` table: id, user_id, image_url, `analysis_data` (JSONB), `scores` (JSONB), `status` (String: pending, completed, failed).
  * `scoring_rules` table: Store standard criteria for dynamic calculation (e.g., metric_name, ideal_value, tolerance).
* **Step 1.4:** Implement Firebase Admin SDK for backend authentication middleware.
* **Step 1.5:** Create basic REST endpoints (`/auth/login`, `/scan/status/{id}`).

### Phase 2: Asynchronous AI Pipeline (Celery + Redis)
* **Step 2.1:** Configure Celery and Redis broker inside the FastAPI project.
* **Step 2.2:** Implement Cloud Storage service (S3/GCS) to upload images safely before processing.
* **Step 2.3:** Create a Celery worker task `process_facial_analysis(scan_id, image_url)`.
* **Step 2.4:** Build the `/scan/upload` endpoint to receive an image, save it to Cloud Storage, trigger the Celery task, and return a `scan_id` to the client.

### Phase 3: Core AI Computer Vision Engine (MediaPipe + OpenCV)
* **Step 3.1:** Integrate MediaPipe Face Mesh to extract the 468 3D facial landmarks inside the Celery worker.
* **Step 3.2:** Write strict mathematical utility functions (Euclidean distance, angles) to calculate facial ratios.
* **Step 3.3:** Map the 468 landmarks to extract the exact metrics needed for the 12 categories (e.g., Eye spacing, FWHR, Gonial Angle).
* **Step 3.4:** Implement OpenCV logic to analyze Skin Health (texture, redness, dark circles) using color channel separation and frequency separation techniques.

### Phase 4: Dynamic Scoring Engine
* **Step 4.1:** Read the dynamic "Golden Ratio" criteria from the `scoring_rules` database table.
* **Step 4.2:** Compare the extracted physical ratios against the database criteria to generate a normalized score (0-100) for each metric.
* **Step 4.3:** Aggregate scores to generate Overall Harmony, Dimorphism, and Angularity scores.
* **Step 4.4:** Save the final `analysis_data` and `scores` back to the PostgreSQL `scans` table via JSONB.

### Phase 5: Web Frontend Dashboard (Next.js)
* **Step 5.1:** Scaffold Next.js project with Tailwind CSS.
* **Step 5.2:** Implement Firebase Authentication on the client side.
* **Step 5.3:** Build the Image Upload UI with a polling mechanism to check the Celery task status via `/scan/status/{id}`.
* **Step 5.4:** Build the Analytics Dashboard UI to render Spider Charts and Ratios based on the completed JSONB response.
* **Step 5.5:** Create the "Personalized Improvement Plan" section detailing surgical and non-surgical recommendations.

### Phase 6: Mobile Application (React Native)
* **Step 6.1:** Scaffold React Native (Expo) project.
* **Step 6.2:** Implement a Camera component with an overlay guide for face alignment.
* **Step 6.3:** Consume the FastAPI upload and polling endpoints to display results natively.


## 5. Reference: The 12 Analysis Categories & Metrics
*When building the scoring engine, ensure these metrics are extracted/calculated:*

1. **Harmony:** Facial thirds, Upper/Mid/Lower face ratio, FWHR, Midface ratio, Cheekbone height, Chin proportion, Forehead proportion.
2. **Eyes:** Lateral Canthal Tilt, Eye Aspect Ratio, Eye spacing, Interpupillary ratio, Brow tilt/position, Eye symmetry.
3. **Nose:** Width, length, bridge ratio, tip projection, Alar angle, deviation.
4. **Lips & Mouth:** Lip width, upper/lower ratio, fullness, Philtrum length, symmetry.
5. **Jaw & Chin:** Jaw width/angle, Gonial angle, Chin projection/height, Mandibular proportion.
6. **Cheeks / Midface:** Cheekbone prominence, Midface length/width, Zygomatic projection.
7. **Facial Symmetry:** Left-right, Eye/Nose/Lip/Jaw symmetry.
8. **Skin / Health:** Texture, Acne, Wrinkles, Dark circles, Redness (Use OpenCV/color analysis).
9. **Dimorphism:** Brow ridge prominence, Jaw robustness, Facial angularity.
10. **Angularity:** Jaw sharpness, Mandible definition, Chin angle.
11. **Side Profile:** Convexity, Nasofrontal angle, Cervicomental angle, Chin/Nose projection.
12. **Report Generation:** Aggregate scores, Strengths/Weaknesses, Personalized Surgical/Non-surgical recommendations.

## 6. Hard Constraints & Rules
* **DO NOT** block the FastAPI event loop with AI processing. You MUST use Celery.
* **DO NOT** create 100 individual columns in PostgreSQL. You MUST use `JSONB`.
* Implement robust error handling for images where faces cannot be detected by MediaPipe.
