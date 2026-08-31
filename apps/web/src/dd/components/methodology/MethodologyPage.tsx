"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, List } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Section {
  title: string;
  body: string[];
}

interface Content {
  pageTitle: string;
  pageSubtitle: string;
  sections: Section[];
  sourcesTitle: string;
  sources: string[];
}

const TH: Content = {
  pageTitle: "วิธีการวัด",
  pageSubtitle:
    "อธิบายโดยละเอียดว่า doodee วัดอะไร ไม่วัดอะไร ใช้งานวิจัยอะไร และคำนวณคะแนนยังไง",
  sections: [
    {
      title: "ระบบทำงานยังไง",
      body: [
        "doodee วัดสัดส่วนใบหน้าจากแผนที่ landmark 478 จุดบนรูปถ่ายของคุณ จากนั้นนำตำแหน่งของจุดเหล่านี้มาคำนวณเป็น 60 เมตริก เช่น มุมกราม สัดส่วน golden ratio ระยะตา-ปาก eye aspect ratio (EAR) ฯลฯ",
        "การวัดสัดส่วนหลักประมวลผลในเบราว์เซอร์ของคุณ ฟีเจอร์บัญชี โควต้า การชำระเงิน สรุปรายงาน และภาพอ้างอิงออนไลน์อาจใช้การประมวลผลฝั่งเซิร์ฟเวอร์เมื่อจำเป็น",
      ],
    },
    {
      title: "วัดอะไรบ้าง — 6 หมวด 60 เมตริก",
      body: [
        "เมตริกแบ่งเป็น 6 หมวด แต่ละหมวดน้ำหนักต่างกันในคะแนนรวม (ปรับปรุง Phase 20c):",
        "**ความสมดุล (Harmony, 7%)** — สัดส่วนคลาสสิกตาม Da Vinci / Marquardt: golden ratio, สามส่วนของใบหน้า, ระยะตา-ปาก, สัดส่วนปาก-จมูก",
        "**ความคม (Angularity, 22%)** — มุมกราม (gonial angle), องศาตา (canthal tilt), องศาคิ้ว (brow tilt), มุมจมูก-ริมฝีปาก (nasolabial)",
        "**ลักษณะเฉพาะเพศ (Dimorphism, 16%)** — กว้างกราม ÷ โหนกแก้ม, ความสูงคาง, มุมปาก, ความกว้างปาก: ค่าอุดมคติชายกับหญิงต่างกันชัดเจน",
        "**บริเวณดวงตา (Eye Area, 45%)** — ขนาดและรูปทรงของรอยแยกเปลือกตา, ระยะคิ้ว-ตา, ความกว้างของตา และความสมมาตร (น้ำหนักสูงสุดเพราะจับ aging signal ได้ดีที่สุด)",
        "**ลักษณะใบหน้า (Features, 10%)** — โปรไฟล์จมูก (จากรูปด้านข้าง), ความหนาริมฝีปาก, ตำแหน่งคาง, ตำแหน่งริมฝีปากเทียบเส้น Ricketts E",
        "**ความสมมาตร (Symmetry, 0%)** — สมมาตรซ้าย-ขวาของตา, ปาก, คิ้ว, จมูก, กราม. แสดงเป็นข้อมูลประกอบ เพราะภาพรวมใบหน้าไม่ได้ขึ้นกับความสมมาตรอย่างเดียว — ไม่นับคะแนนรวม",
        "**Skin (12% fold)** — ความสม่ำเสมอของสีผิว (uniformity), ความใส (clarity), ความเปล่งปลั่ง (glow) — sample 4 patches แล้ว fold เข้า overall เป็น 12% บนสุดของ landmark-based categories",
      ],
    },
    {
      title: "วัด '' อะไร — เพื่อความซื่อสัตย์",
      body: [
        "เพื่อไม่ให้สับสน doodee วัดเฉพาะสัดส่วนจาก landmark ที่ตรวจพบ + skin patch averages ดังนั้นจะ ไม่วัด:",
        "• ริ้วรอย รอยแผล ฝ้า กระ จุดด่างดำ เฉพาะตัว (วัดเฉพาะ uniformity / clarity / glow แบบ average)",
        "• อายุที่แท้จริง (proportions + skin texture เป็น proxy ของ aging ไม่ใช่ตัวอายุจริง)",
        "• Charisma, ปัญญา, personality, รอยยิ้ม, แววตา",
        "• ทรงผม การแต่งหน้า แว่นตา เสื้อผ้า",
        "• น้ำหนักตัว fat vs lean (กระดูกใต้ fat ยังอยู่ — landmark วัดความหนาของ fat layer ไม่ได้)",
        "• ระยะห่าง/มุมกล้องที่แน่นอน (head roll แก้แล้ว pose/yaw/pitch มี confidence layer ตัดถ่วงน้ำหนัก)",
        "ถ้าอยากรู้ว่าตัวเอง 'ดูดี' ในชีวิตจริงแค่ไหน คะแนน doodee เป็นแค่ส่วนหนึ่งของคำตอบ — ไม่ใช่คำตอบสุดท้าย",
      ],
    },
    {
      title: "วิธีคำนวณคะแนน",
      body: [
        "**คะแนนต่อเมตริก:** ค่าที่อยู่ในช่วงอ้างอิงได้คะแนนสูงกว่า นอกช่วงคะแนนจะค่อยๆลดลงตามระยะที่ห่างจากช่วงนั้น",
        "**คะแนนหมวด:** ค่าเฉลี่ยของเมตริกในหมวดนั้น เมตริกที่ flagged (ค่าอยู่นอกช่วงเป็นไปได้ของมนุษย์) ถูกตัดออก",
        "**Confidence weighting:** แต่ละเมตริก blend คะแนนกับค่า neutral 5.5 ตามความน่าเชื่อถือของ landmark (ขึ้นกับมุมหน้า) → off-axis photo จะไม่โดน 0/10 หนักเกินไป",
        "**คะแนนรวม:** ค่าเฉลี่ยถ่วงน้ำหนักของหมวด — Eye Area weight สูงสุด (45%) เพราะ จับ aging signal ได้ดีที่สุด, dimorphism + angularity รองมา. คะแนนสุดท้ายมีการ fold skin scores 12% บนสุด",
        "**Percentile:** เทียบคะแนนกับช่วงประชากรโดยประมาณ เช่น 7.0 ≈ Top 16%, 8.5 ≈ Top 2%, 5.5 ≈ Top 50%",
        "**ระดับผลลัพธ์:** คะแนน 9+ → โดดเด่นมาก, 8+ → สูงมาก, 7.5+ → สูง, 6+ → เหนือค่าเฉลี่ย, 4.5+ → ค่าเฉลี่ย, < 4.5 → ต่ำกว่าค่าเฉลี่ย",
        "**Sanity bounds:** เมตริกที่ได้ค่าผิดธรรมชาติ (เช่น มุมกราม 180°) จะถูก flagged ว่า 'ไม่มั่นใจพอ' และไม่นำมาคำนวณ",
      ],
    },
    {
      title: "คะแนน G · S · L — สามสัญญาณที่คุณเห็น",
      body: [
        "เมื่อประเมินเสร็จคุณจะเห็น chip เล็กๆ ใต้คะแนนรวม: **G · S · L** สามตัวเลขนี้คือสามสัญญาณที่ผสมกันเป็นคะแนนสุดท้าย",
        "**G (Geometric)** — ค่าเฉลี่ยถ่วงน้ำหนักของ 60 เมตริก + skin fold เป็นคะแนนหลักที่อธิบายได้: ทุกตัวเลขย้อนกลับไปดูได้ในรายละเอียดเมตริกแต่ละตัว",
        "**S (Second opinion)** — statistical ensemble ของเมตริกชุดเดียวกัน แต่ใช้วิธีรวม 4 แบบ (median, worst-K, skin-heavy, confidence-discounted) เพื่อให้ความเห็นที่สองที่ไม่เป็น linear เหมือน G จับลักษณะ 'จุดอ่อนหนึ่งจุดลากทั้งกอง' ที่ human perception จับได้ — Phase 27",
        "**L (Model review)** — ถ้ามีโมเดลเสริมที่อนุมัติไว้ ระบบจะประเมินภาพที่จัดแนวแล้วหลายรอบเพื่อให้คะแนนอ้างอิงเพิ่มเติม",
        "**สูตรรวม:** เมื่อมี L ครบ → G × 0.6 + S × 0.2 + L × 0.2 เมื่อไม่มี L → G × 0.7 + S × 0.3 (Phase 27 fallback)",
        "ทำไมโชว์ทั้ง 3? เพื่อความโปร่งใส — ช่องว่างระหว่างค่าบอกว่าระบบมั่นใจแค่ไหน เห็นพร้อมกันดีกว่า black box เดียว",
      ],
    },
    {
      title: "Photo quality gate — เช็คคุณภาพภาพก่อน",
      body: [
        "ก่อนให้คะแนน ระบบเช็ค 5 อย่าง (Phase 32):",
        "**Blur** — Laplacian variance บน 64×64 downsample ของบริเวณหน้า ถ้าต่ำเกิน (ภาพเบลอ) แจ้งให้ถ่ายใหม่",
        "**Lighting** — luminance mean + dynamic range ดูดสว่าง/มืด/แบนเกินไป",
        "**Pose frontness** — ใช้ค่า pose ที่ estimate มาแล้ว ถ้าหน้าหันเอียงมากเกิน confidence ลด",
        "**Face size** — สัดส่วนหน้าในกรอบ ถ้าเล็กเกิน (ภาพ body) หรือใหญ่เกิน (เข้ามาใกล้กล้องเกินไป) แจ้ง",
        "**Eye openness** — palpebral fissure aspect ทั้งสองข้าง ถ้าตาปิด ไม่มีข้อมูล eye-area",
        "ระบบไม่ block — เป็น advisory + คำแนะนำให้ถ่ายใหม่ + ลดค่า confidence ของเมตริก ให้ <LowConfidenceBanner> โผล่อัตโนมัติ (Phase 33)",
        "ในกล้อง live: pill สีเขียว/เหลือง/ส้มบอกคุณภาพภาพ real-time ก่อนกดถ่าย (Phase 34)",
      ],
    },
    {
      title: "การปรับเกณฑ์ (Calibration)",
      body: [
        "doodee ปรับเกณฑ์ได้ 2 มิติ:",
        "**เพศ (ชาย/หญิง)** — ค่าอุดมคติของหลายเมตริกต่างกันชัดเจน เช่น มุมกรามผู้ชายแคบกว่าผู้หญิง คิ้วผู้หญิงโค้งกว่าผู้ชาย",
        "**เชื้อชาติ (สากล/เอเชีย)** — เกณฑ์ 'สากล' ใช้ค่าจากงานวิจัยกลุ่มคอเคเซียนเป็นหลัก เกณฑ์ 'เอเชีย' ปรับให้ตรงกับสัดส่วนของชาวเกาหลี/จีน/ฮ่องกง/ไทย ตามงานวิจัยที่หาได้ (Jayaratne 2013, Hwang 2002, Kim 2018, ฯลฯ)",
        "ถ้าคุณเป็นคนเอเชียและอยากได้ผลที่ตรงกับสัดส่วนปกติของชาวเอเชีย เลือก 'เอเชีย' — เกณฑ์จะปรับให้สัดส่วนตา ริมฝีปาก จมูก ฯลฯ ตรงกับงานวิจัยกลุ่มเอเชียโดยตรง",
      ],
    },
    {
      title: "ข้อจำกัด",
      body: [
        "**Head pose** — รูปที่หัวเอียงเล็กน้อย (roll) ระบบแก้ไขให้แล้ว แต่ถ้าหันหน้าด้านข้าง (yaw) จะยังมีความเพี้ยน especially ในเมตริก symmetry",
        "**Forehead occlusion** — ผมยาวบังหน้าผากทำให้ตำแหน่ง forehead apex คลาดเคลื่อน ส่งผลต่อ facial-thirds และ fwhr",
        "**Approximated ranges** — เมตริกบางตัวยังเป็นช่วงอ้างอิงเชิงประมาณ (badge สีอำพันในรายละเอียดเมตริก) ดูได้ที่ docs/METRIC_AUDIT.md",
        "**Asian-population data** — ปัจจุบัน 4 เมตริกมี Asian range research-cited แล้ว (palpebral-fissure-aspect, lip-fullness, brow-tilt, lip-e-line) อีก ~11 เมตริกยังเป็น judgement-tuned",
        "**ไม่วัด aging** — ระบบนี้วัดสัดส่วน ไม่วัด aging markers (ผิว, ริ้วรอย, ตาตก) คนวัยกลางคนที่มี proportions ดียังคงได้คะแนนใกล้กับคนหนุ่ม",
      ],
    },
  ],
  sourcesTitle: "งานวิจัยอ้างอิง",
  sources: [
    "Bashour M. 2007 — Canthal tilt aesthetic preference",
    "Carré JM, McCormick CM. 2008. Proc R Soc B 275(1651) — fWHR and dominance",
    "Choe KS et al. 2004. Arch Facial Plast Surg 6(4) — Korean American facial measurements",
    "Choi JW et al. 2020. Arch Craniofac Surg 21(6) — Korean canthal tilt",
    "Coleman SR, Grover R. 2006. Aesthet Surg J — Lip aesthetics",
    "Farkas LG — Anthropometric norms (multiple papers)",
    "Farkas LG et al. 2005. J Craniofac Surg 16(4) — International ethnic study",
    "Gao et al. 2025. Quant Imaging Med Surg — Chinese eyebrow/eyelid 3D",
    "Hwang HS, Kim WS, McNamara JA Jr. 2002. Angle Orthod 72(1) — Korean cephalometric",
    "Hwang TS et al. 2013. Arch Plast Surg 40(5) — Korean nasal CT",
    "Jayaratne YS et al. 2013. BioMed Res Int 2013:821428 — Hong Kong Chinese",
    "Kim JH et al. 2018. J Craniofac Surg 29(3) — Korean brow tilt",
    "Powell N, Humphreys B. 1984 — Nasolabial angle norms",
    "Ricketts RM. 1968 — E-line / Ricketts profile",
    "Wang TT et al. 2017. Aesthet Surg J 37(4) — Facial asymmetry detection thresholds",
    "Marquardt SR — Phi mask (classical reference)",
    "Da Vinci canon — Classical facial proportions",
  ],
};

const EN: Content = {
  pageTitle: "Methodology",
  pageSubtitle:
    "What doodee measures, what it doesn't, the research it draws on, and how the score is calculated.",
  sections: [
    {
      title: "How the system works",
      body: [
        "doodee measures facial proportions from a 478-point facial landmark map generated from your photo. Those landmark positions feed into 60 metrics — gonial angle, golden ratio, eye-to-mouth distance, eye aspect ratio (EAR), and so on.",
        "Core measurements run in your browser. Account, quota, payment, report-summary, and visual-reference features may use secure server-side processing when needed.",
      ],
    },
    {
      title: "What we measure — 6 categories, 60 metrics",
      body: [
        "Metrics are grouped into 6 categories, each weighted differently in the overall score (updated Phase 20c):",
        "**Harmony (7%)** — Classical proportions: golden ratio, facial thirds, eye-to-mouth distance, nose-to-mouth ratio.",
        "**Angularity (22%)** — Gonial angle, canthal tilt, brow tilt, nasolabial angle.",
        "**Dimorphism (16%)** — Jaw-to-cheek width, chin height, mouth-corner tilt, mouth width. Male and female ideals differ explicitly.",
        "**Eye Area (45%)** — Palpebral fissure aspect, eyebrow-eye distance, eye width, symmetry of eye position. Highest weight because eye-area is the strongest age-discrimination signal.",
        "**Features (10%)** — Side-profile nose shape, lip thickness, chin projection, lip position vs Ricketts E-line.",
        "**Symmetry (0%)** — Left/right symmetry of eyes, mouth, brows, nose, and jaw. Shown for context because facial impression is not determined by strict symmetry alone; it does not count toward the overall score.",
        "**Skin (12% fold)** — uniformity, clarity, glow — sampled from 4 patches (forehead + cheeks + chin) and folded onto the landmark overall as a 12% top-layer.",
      ],
    },
    {
      title: "What we don't measure — for honesty",
      body: [
        "So you understand what the score represents, doodee measures detected landmark proportions plus skin patch averages. It does NOT measure:",
        "• Individual wrinkles / scars / pigmentation (skin scoring is aggregate uniformity / clarity / glow only)",
        "• Actual age (proportions + skin are proxies for aging, not age itself)",
        "• Charisma, intelligence, personality, smile, expressive eyes",
        "• Hair, makeup, eyewear, clothing",
        "• Body weight: fat sits ON TOP of the skeleton; we can't measure the fat layer from landmarks",
        "• Exact camera distance / angle (head roll is corrected; pose / yaw / pitch are converted to a confidence weight)",
        "The score is one structured reference point. It is not a final judgement of how you appear in real life.",
      ],
    },
    {
      title: "How the score is calculated",
      body: [
        "**Per-metric score:** Values inside the reference range score higher. Outside the range, the score gradually tapers based on distance from that range.",
        "**Category score:** Average of the metrics in that category. Flagged metrics (raw values outside the plausible-human envelope) are excluded.",
        "**Confidence weighting:** Each metric blends its score toward neutral 5.5 based on how reliable the landmark detection is for the given head pose. Off-axis photos don't dump 0/10 onto users.",
        "**Overall score:** Weighted average of category scores. Eye-Area gets the highest weight (45%) because it captures aging signals best. Skin scores (12%) are folded on top as a multiplier.",
        "**Population percentile:** The score is compared with a population-style benchmark. 7.0 → ~Top 16%, 8.5 → ~Top 2%, 5.5 → Top 50%.",
        "**Result band:** 9+ → Exceptional, 8+ → Very high, 7.5+ → High, 6+ → Above average, 4.5+ → Average, < 4.5 → Below average.",
        "**Sanity bounds:** Metrics whose raw value lands outside any plausible human range (e.g. a gonial angle of 180°) are flagged as “Not confident” and excluded from aggregation.",
      ],
    },
    {
      title: "G · S · L — the three signals you see",
      body: [
        "After an assessment you'll see a small chip under the overall: **G · S · L**. Three numbers that blend into the final score.",
        "**G (Geometric)** — Weighted mean of the 60 metrics + skin fold. The explainable score: every number traces back to a specific metric you can click into.",
        "**S (Second opinion)** — Statistical ensemble of the same metric scores, but aggregated four different ways (median, worst-K mean, skin-heavy, confidence-discounted) to give a non-linear second view. Catches the 'one weak feature drags the gestalt' pattern human perception uses — Phase 27.",
        "**L (Model review)** — If an approved supplemental model is available, the system evaluates an aligned face crop through multiple passes and shows that model-review score as L.",
        "**Blend formula:** With L → overall = G × 0.6 + S × 0.2 + L × 0.2. Without L → G × 0.7 + S × 0.3 (Phase 27 fallback).",
        "Why surface all three? Transparency. The spread between numbers shows how confident the system is — three signals you can compare beats one black box.",
      ],
    },
    {
      title: "Photo quality gate — pre-flight checks",
      body: [
        "Before scoring, doodee runs 5 quality checks (Phase 32):",
        "**Blur** — Laplacian variance on a 64×64 downsample of the face region. Low variance = blurry → retake suggestion.",
        "**Lighting** — Luminance mean + dynamic range catches too dark / too bright / flat lighting.",
        "**Pose frontness** — Reuses the existing pose estimate. Significantly off-axis lowers confidence.",
        "**Face size** — Face fraction of the image. Too small = body shot; too large = too close to camera.",
        "**Eye openness** — Palpebral fissure aspect on both eyes. Closed eyes invalidate the eye-area category.",
        "The gate is non-blocking — it shows an advisory banner + lowers metric confidence (so the existing `<LowConfidenceBanner>` fires automatically) (Phase 33).",
        "In live camera: a green/yellow/orange pill in the viewfinder shows quality in real time before you press the shutter (Phase 34).",
      ],
    },
    {
      title: "Calibration",
      body: [
        "doodee calibrates along two dimensions:",
        "**Gender (male / female)** — Many ideal ranges differ by sex: male jaw angle is sharper than female, female brow has more arch, etc.",
        "**Ethnicity (universal / Asian)** — 'Universal' uses primarily Caucasian-cohort research data. 'Asian' shifts the ideal ranges to match Korean / Chinese / Hong Kong-Chinese / Vietnamese anthropometric studies (Jayaratne 2013, Hwang 2002, Kim 2018, etc.).",
        "If you're East/Southeast Asian and want results calibrated to typical Asian proportions, pick 'Asian' — the ranges for eye aspect, lip thickness, nasal dorsum, and so on shift to research-cited Asian-cohort norms.",
      ],
    },
    {
      title: "Limitations",
      body: [
        "**Head pose** — Slight head tilt (roll) is corrected. Significant head turn (yaw) still distorts measurements, especially in the symmetry category.",
        "**Forehead occlusion** — Long bangs / hair covering the forehead can make the forehead-apex landmark unreliable, affecting facial-thirds and fWHR scores.",
        "**Approximated ranges** — Some metrics still use judgement-tuned ranges rather than research-cited (marked with an amber 'Approximated' badge in metric detail).",
        "**Asian-population data** — Currently 4 metrics have research-cited Asian ranges (palpebral-fissure-aspect, lip-fullness, brow-tilt, lip-e-line); ~11 are still judgement-tuned.",
        "**No aging detection** — The system measures proportions, not aging markers (skin texture, wrinkles, eyelid sag). A middle-aged person with good proportions can score close to a younger one.",
      ],
    },
  ],
  sourcesTitle: "Cited research",
  sources: [
    "Bashour M. 2007 — Canthal tilt aesthetic preference",
    "Carré JM, McCormick CM. 2008. Proc R Soc B 275(1651) — fWHR and dominance",
    "Choe KS et al. 2004. Arch Facial Plast Surg 6(4) — Korean American facial measurements",
    "Choi JW et al. 2020. Arch Craniofac Surg 21(6) — Korean canthal tilt",
    "Coleman SR, Grover R. 2006. Aesthet Surg J — Lip aesthetics",
    "Farkas LG — Anthropometric norms (multiple papers)",
    "Farkas LG et al. 2005. J Craniofac Surg 16(4) — International ethnic study",
    "Gao et al. 2025. Quant Imaging Med Surg — Chinese eyebrow/eyelid 3D",
    "Hwang HS, Kim WS, McNamara JA Jr. 2002. Angle Orthod 72(1) — Korean cephalometric",
    "Hwang TS et al. 2013. Arch Plast Surg 40(5) — Korean nasal CT",
    "Jayaratne YS et al. 2013. BioMed Res Int 2013:821428 — Hong Kong Chinese",
    "Kim JH et al. 2018. J Craniofac Surg 29(3) — Korean brow tilt",
    "Powell N, Humphreys B. 1984 — Nasolabial angle norms",
    "Ricketts RM. 1968 — E-line / Ricketts profile",
    "Wang TT et al. 2017. Aesthet Surg J 37(4) — Facial asymmetry detection thresholds",
    "Marquardt SR — Phi mask (classical reference)",
    "Da Vinci canon — Classical facial proportions",
  ],
};

function renderBody(line: string, idx: number) {
  const boldMatch = /^\*\*([^*]+)\*\*\s*(.*)$/.exec(line);
  if (boldMatch) {
    return (
      <p key={idx} className="leading-relaxed text-[#5f574f]">
        <strong className="font-semibold text-[#241f1a]">{boldMatch[1]}</strong>{" "}
        {boldMatch[2]}
      </p>
    );
  }
  return (
    <p key={idx} className="leading-relaxed text-[#5f574f]">
      {line}
    </p>
  );
}

/**
 * Phase 85 — Slugify a section title into a stable URL fragment.
 * Used for `<h2 id>` anchors and TOC `href="#..."` links.
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9฀-๿]+/g, "-") // keep Thai code-point range
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function MethodologyPage() {
  const { lang } = useT();
  const c = lang === "th" ? TH : EN;
  const tocItems = useMemo(
    () => [
      ...c.sections.map((s) => ({ id: slugify(s.title), title: s.title })),
      { id: slugify(c.sourcesTitle), title: c.sourcesTitle },
    ],
    [c]
  );

  // Phase 86: active-section tracking via IntersectionObserver. The
  // section whose top edge is closest to (but above) the sticky-header
  // band wins. Updates as the user scrolls.
  const [activeId, setActiveId] = useState<string>("");
  useEffect(() => {
    const sections = tocItems
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    // Top margin = sticky-header height so a section counts as "active"
    // as soon as its heading enters the viewport just under the header.
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that's
        // still intersecting. Sort by `top` ascending; first positive
        // wins. If none intersect, keep the last known.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lang, tocItems]);

  return (
    <div className="methodology-glass-page mx-auto max-w-5xl space-y-12 text-[#f8fafc] lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 lg:space-y-0">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <details className="group" open>
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl border border-[#241f1a]/10 bg-white/60 px-3 py-2 text-xs font-medium text-[#6f625a] shadow-[0_12px_32px_-28px_rgba(36,31,26,0.32)] backdrop-blur-md transition hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35 lg:hidden">
            <List className="h-3.5 w-3.5" />
            {lang === "th" ? "สารบัญ" : "Contents"}
            <ChevronDown className="h-3 w-3 ml-auto transition-transform group-open:rotate-180" />
          </summary>
          <nav
            aria-label={lang === "th" ? "สารบัญ" : "Methodology contents"}
            className="mt-3 space-y-1 rounded-2xl border border-[#241f1a]/10 bg-white/60 p-3 shadow-[0_14px_40px_-34px_rgba(36,31,26,0.3)] backdrop-blur-md lg:mt-0"
          >
            {tocItems.map((item) => {
              const active = item.id === activeId;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  aria-current={active ? "location" : undefined}
                  className={`flex min-h-11 items-center rounded-xl border-l-2 px-3 py-2 text-xs leading-snug transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35 ${
                    active
                      ? "border-[#067e96] bg-[#eef8f8]/70 text-[#067e96]"
                      : "border-transparent text-[#6f625a] hover:bg-white/45 hover:text-[#241f1a]"
                  }`}
                >
                  {item.title}
                </a>
              );
            })}
          </nav>
        </details>
      </aside>

      <article className="space-y-12 rounded-3xl border border-[#241f1a]/10 bg-white/60 p-5 shadow-[0_24px_70px_-52px_rgba(36,31,26,0.34)] backdrop-blur-md sm:p-7">
        <header className="text-center lg:text-left space-y-3">
          <h1 className="font-serif italic font-light text-4xl md:text-5xl">
            {c.pageTitle}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[#5f574f] md:text-base">
            {c.pageSubtitle}
          </p>
        </header>

        <div className="space-y-10">
          {c.sections.map((section, i) => (
            <section
              key={i}
              id={slugify(section.title)}
              className="scroll-mt-20 space-y-3 border-t border-[#241f1a]/10 pt-7 first:border-t-0 first:pt-0"
            >
              <h2 className="font-serif italic font-light text-2xl">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm">
                {section.body.map((line, j) => renderBody(line, j))}
              </div>
            </section>
          ))}

          <section id={slugify(c.sourcesTitle)} className="space-y-3 scroll-mt-20">
            <h2 className="font-serif italic font-light text-2xl">
              {c.sourcesTitle}
            </h2>
            <ul className="space-y-1 text-xs text-[#5f574f]">
              {c.sources.map((source, i) => (
                <li key={i} className="leading-relaxed">
                  · {source}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}
