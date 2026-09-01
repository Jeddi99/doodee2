# รวม doodoodeedee เข้า doodee web

`github.com/Rapeepath/doodoodeedee` มีชั้นวิเคราะห์และจำลองใบหน้าที่ลึกกว่าที่นี่มาก ส่วนที่นี่มีสิ่งที่นั่น
ไม่มีเลย — auth จริง, สมาชิก/แผน, chat, คูปอง/ออเดอร์, ชวนเพื่อน, ถอนเงิน, แจ้งเตือน, skin vision

เอกสารนี้คือแผนรวมสองระบบให้เป็นระบบเดียว โดยใช้ UI ของที่นี่

---

## สิ่งที่ค้นพบแล้วเปลี่ยนรูปงาน

**โค้ดฝั่งจำลองถูกพอร์ตมาแล้ว ~3,900 บรรทัด แต่แทบไม่เคยทำงาน**

`canonical_pipeline`, `geometry_controls`, `surface_effects`, `evidence`, `procedure_catalog`,
`flux_refine` อยู่ครบใน `backend/doodee/` แล้วตั้งแต่ `7f72892` — แต่สายขาดตรงนี้:

```
simulation_engine._canonical_presets  →  geometry_controls.get_preset()  คืน dict
canonical_pipeline.simulate_scan_views →  กรอง isinstance(p, ProcedureSpec)  →  [] เสมอ
```

ผลเป็นทอด: `surface_effects` ไม่เคยรัน · `flux_refine` ไม่เคยถูกเรียก · **หัตถการ 92 รายการไม่เคย
render และไม่มี route ไหน expose** · `evidence.record()` ไม่เคยทำงาน

### แต่มันไม่ใช่การแก้จุดเดียว — วัดแล้ว

`legacy preset id resolve ในแคตตาล็อกใหม่ได้ 0 จาก 24` สองชุดนี้เป็นคนละคำศัพท์โดยสิ้นเชิง และ
**เป็นชั้นที่ซ้อนกัน ไม่ใช่ของซ้ำ**:

```
                    ผู้ใช้เลือก
          ┌─────────────────┴─────────────────┐
   "อยากให้ตาเปิดขึ้น" (24)          "กำลังพิจารณาร้อยไหม" (92)
   procedures.py / SIMULATION_PRESETS  procedure_catalog.PROCEDURES
   eyes-open, nose-narrow, …           thread-lift, hifu-lift, facelift, …
          └─────────────────┬─────────────────┘
                    compile → ชื่อ slider
                             ↓
                  geometry_controls.RULES     ← ชั้นเดียวกัน ใช้ร่วมกัน
                             ↓
                     canonical_pipeline
```

ยืนยันด้วยการรันจริง: `resolve_procedure('thread-lift')` → `compile_warp_sliders` →
`{'hifuLifting': 66.25}` และ `hifuLifting` มีอยู่ใน `geometry_controls.RULES`

เปลี่ยน `_canonical_presets` ให้คืน `ProcedureSpec` เฉย ๆ จะทำให้ทุก selection ที่ UI ส่งมาพังทันที
เพราะไม่มี id ไหน resolve ได้ — **การต่อสายจึงผูกกับการเปลี่ยนคำศัพท์ที่ UI ส่ง** ไปด้วยเสมอ

เหตุผลที่ต้องเป็นชั้น 92: `surface_effects` ทำงานเฉพาะหัตถการที่ technique เป็น `test`/`Hybrid`
— **ชั้นคลินิกเท่านั้นที่แสดงผลซึ่งไม่ใช่การบิดรูปทรงได้** เช่น HIFU ที่กระชับผิวโดยไม่ย้ายตำแหน่งอะไร

ตายด้วยเหตุอื่น: `canonical_pipeline.mesh_map()` ไม่มีคนเรียก (docstring ชี้ไป `main.py` ที่เป็น
hello-world 6 บรรทัด) · `Simulation.view_objects` เขียนลง DB แต่ไม่มี serializer อ่าน · capture
helper 6 ไฟล์ลอยตั้งแต่ UI ถูก revert ที่ `1a9f8f0` · `intensity_level` ถูก `validate_selections`
ปฏิเสธ

**เทสต์ 3,900 บรรทัดนั้นครอบด้วย mock ที่ขอบเท่านั้น** — `@patch("doodee.tasks.simulate_canonical")`
ไม่มีเทสต์ไหนแตะ `canonical_pipeline` จริง

---

## การตัดสินใจที่ตกลงแล้ว

| # | ประเด็น | ข้อสรุป |
|---|---|---|
| 1 | ลำดับ | รวมให้เสร็จก่อน แล้ว deploy ทีเดียว |
| 2 | นิยาม "100%" | ทั้ง feature parity **และ** ไม่เหลือ stub |
| 3 | ขอบเขต | backend + `apps/web` · **`apps/mobile` นอกขอบเขต** |
| 4 | เวลา | ไม่จำกัด เอาให้ครบ |
| 5 | percentile | ใช้ `score_distribution.py` (KDE เทียบผู้ใช้จริง) แทน `percentile.py` |
| 6 | metric | เอาชุด ~50 ตัวของ doodoodeedee · bump `FORMULA_VERSION` เป็น `2026.5-extended` |
| 7 | หัตถการ | **เอาแค่ชั้นคลินิก 92 รายการ** · ทิ้งชั้นรูปทรง 24 รายการ (`procedures.py` + `SIMULATION_PRESETS`) และ legacy `simulate()` · `geometry_controls.RULES` ยังอยู่ในฐานะเครื่องยนต์ slider · ยืนยันอีกครั้งหลังรู้ว่าสองชั้นซ้อนกันไม่ใช่ของซ้ำ — **ผู้ใช้จะต้องรู้จักชื่อหัตถการถึงจะเลือกได้** |
| 8 | reference-target | **สอน canonical ให้ทำเอง** ไม่เก็บ legacy ไว้ |
| 9 | n<30 | บอกตรง ๆ ว่าข้อมูลยังไม่พอ ไม่ seed คะแนนสังเคราะห์ |
| 10 | paywall | ยก `redact()` จาก `percentile.py` มาครอบ `score_distribution` |

---

## ตารางเทียบ

| ความสามารถ | doodoodeedee | doodee web | ต้องทำ |
|---|---|---|---|
| `analysis_engine` | 677 บรรทัด ~50 metric `2026.5` | 507 ~28 metric `2026.4` | **ยกชุดใหญ่มา** |
| `reference_scoring` | 278 + `REFERENCE_TARGETS` | 187 | รวม targets |
| `metric_catalog` 86 รายการ | ✅ | ❌ (มี static 102 ฝั่ง web แต่ map ได้ 12) | **ยกมา** |
| `findings.py` | ✅ 367 | ❌ | **ยกมา** |
| `score_distribution.py` | ✅ 297 | ❌ (มี `percentile.py` คนละแนวคิด) | **ยกมา + redact** |
| `medical_references.py` | ✅ 183 | ❌ | **ยกมา** |
| `face_mesh_render.py` | ✅ 157 | มี `mesh_map()` แต่ตาย | **ต่อสาย** |
| `canonical_pipeline` | ✅ 1301 | ✅ 1301 (ตาย) | **ต่อสาย** |
| `procedure_catalog` 92 | ✅ | ✅ (ตาย) | **ต่อสาย** |
| `surface_effects` · `evidence` · `flux_refine` | ✅ | ✅ (ตาย) | **ต่อสาย** |
| route `/assessment/` `/mesh/` `/mesh-legend/` `/metric-catalog/` | ✅ | ❌ | **สร้าง** |
| auth · แผน · chat · คูปอง · ชวนเพื่อน · ถอนเงิน · skin vision | ❌ | ✅ | ไม่แตะ |

---

## ลำดับงาน

### Phase 0 — เปลี่ยนคำศัพท์แล้วต่อสาย ✅ เสร็จแล้ว

commit `76d2c78` · `177bf4d` · `4e028bc` · `0749ca4` — 739 backend tests, 251 web tests, build ผ่าน

ทำพร้อมกันเพราะแยกไม่ได้:

1. `GET /procedures/` เสิร์ฟ `public_catalog()` — 72 แถวที่ render ได้ ซ่อน 20 แถวนอกขอบเขต
   (`?include_unavailable=true` คืนครบ 92 ไว้ตรวจกับ data.txt) · เพิ่ม `/procedures/categories/`
   · route detail เดิมใช้ `<slug:>` ซึ่ง character class ไม่มีจุด → id จริงอย่าง `"1.1"` ตอบ 404 ทุกตัว
2. `_canonical_presets` resolve ผ่าน `resolve_procedure()` คืน `ProcedureSpec`
3. `validate_selections` รับ `{procedure_id, intensity_level}` คู่กับ `{region, preset_id}` เดิม
   ปฏิเสธ stack ที่ผสมสองแคตตาล็อก และปฏิเสธหัตถการซ้ำแทนที่จะยุบ (ยุบแล้ว zip กับ selections เพี้ยน)
4. `SimulationView.jsx` เขียนใหม่รอบแคตตาล็อก — tab ตามหมวด, stack เดียวคีย์ด้วยหัตถการ,
   ระดับความเข้มบนแถว stack, สามมุมกล้อง

**สี่เรื่องที่โผล่มาตอนต่อสายจริง และแก้ไปแล้ว:**

| เจอ | ทำไมถึงไม่เจอตอนวางแผน | แก้ |
|---|---|---|
| หัตถการ catalog ไม่มี legacy fallback | legacy renderer วาดจากภาพเดียว ทำ pipeline สามมุมไม่ได้ | สแกนที่ fuse ไม่ได้ → `canonical_required` ตั้งแต่ validate ไม่ปล่อยให้ไป render ครึ่ง ๆ |
| preview คืนแต่มุมหน้าตรง | `legacy_view` hardcode เป็น `"front"` สำหรับ spec | รับ `view` จาก client · บันทึกใน `parameters` ให้ worker render มุมเดียวกัน |
| zoom ใช้ไม่ได้ | selection ของ catalog ไม่มี `region` — หัตถการมี ผ่าน pipeline และเป็นคนละคำศัพท์ (22 ชื่อ ไม่ใช่ 6) | `_region_indices` อ่านจากตารางไหนก็ได้ที่รู้จักชื่อนั้น · `surface_effects.REGION_GROUPS` มีครบ 22 อยู่แล้ว |
| หัตถการ 1.2 ทำ render ล้มทั้งภาพ | ดัน `cheekFiller` ติดลบ ซึ่ง `evidence` ไม่มีทิศนั้น (ตั้งใจ — ไม่มีหัตถการที่ลดปริมาตรกลางหน้า) | movement ยัง render แต่ไม่มีบรรทัดในบันทึก · dose ที่กุขึ้นแย่กว่าบรรทัดที่หายไป · มีเทสต์ตรึงว่าเหลือแถวเดียว |

**และหนึ่งเรื่องที่พอร์ตตกไปตั้งแต่แรก:** `apps/web/src/simulation.css` ไม่เคยถูกยกมาจาก doodoodeedee
หน้าจำลองทั้งหน้าจึงใช้สไตล์ default ของ browser มาตลอด — เขียนใหม่ด้วย token `--dd-*` ของ doodee web
(ฟ้าบนน้ำแข็ง) ไม่ใช่ก็อปม่วงบนเทาของ doodoodeedee

**`apps/mobile` แก้แล้ว** (แม้จะอยู่นอกขอบเขตที่ตกลงกันตอนแรก — แต่มันคือจอที่พังจริง ไม่ใช่ฟีเจอร์ที่ไม่ได้พอร์ต)
`packages/shared/src/api.ts` ส่ง `{procedure_id, intensity_level}` + `view` เหมือน web แล้ว ·
`simulation.tsx` เปลี่ยนเป็น tab ตามหมวด · เลือกทีละหัตถการ · ระดับ 1–5 · เลือกมุมกล้องได้ ·
แสดงบันทึกการรักษาแทนอัตราส่วน · มีข้อความบอกเมื่อภาพแทบไม่เปลี่ยน
กฎ visibility ย้ายไป `packages/shared/src/simulation-visibility.ts` ให้ทั้งสองแอปใช้ชุดเดียว
และมีเทสต์ backend ตรึง shape ที่ mobile ส่ง — จอนั้นไม่มี test runner ในรีโปนี้ และ endpoint
ปฏิเสธ field ที่ไม่รู้จัก ฟิลด์ที่เพิ่มข้างเดียวจึงกลายเป็น 400 ที่ไม่มีใครเห็นจนกว่าจะเปิดแอปบนมือถือ

ไฟล์: `simulation_engine.py`, `views.py`, `urls.py`, `serializers.py`, `tasks.py`,
`canonical_pipeline.py`, `SimulationView.jsx`, `lib/procedureStack.js`, `lib/simulationError.js`,
`lib/api.js`, `simulation.css`

> `procedures.py` **ยังไม่ลบ** — `development_plan.py` และโหมดเทียบค่าอ้างอิงยังใช้อยู่ · ลบใน Phase 3

### Phase 1 — ชั้นวัด

- ยก metric ที่ `2ef0164` จงใจไม่เอามา: `_tilt_degrees`, `_facing`, `_signed_point_line_distance`,
  E-line (Ricketts), gonial angle proxy, canthal/brow tilt, mentolabial angle
- ขยายเพดานจาก 30 เป็น 60 metric
- bump `FORMULA_VERSION` → `2026.5-extended`
- ยก `metric_catalog.py` มา แล้วให้ `apps/web/src/analysisCatalog.ts` (static 102 รายการ) อ่านจาก
  backend แทนการ hardcode — `CATALOG_NAME_TO_METRIC` ที่ map ได้ 12 จะหายไปเอง

> **ผลข้างเคียงที่ยอมรับแล้ว:** สแกนที่เก็บไว้ (ตอนนี้ 6 รายการ, production 0) จะเทียบกับของใหม่ไม่ได้
> ตอนนี้คือช่วงที่ราคาถูกที่สุดที่จะทำ

ไฟล์: `backend/doodee/analysis_engine.py`, `metric_catalog.py` (ใหม่),
`apps/web/src/data/faceMetrics.js` (`MetricCatalogTest` บังคับให้ key ตรงกัน)

### Phase 2 — ชั้นตีความ

- `findings.py` — z-score → คำตัดสินไทย/อังกฤษ 4 ระดับ + `_category_headroom`
- `score_distribution.py` — KDE + histogram + percentile · **ครอบด้วย `redact()` ที่ยกมาจาก
  `percentile.py`** เพื่อรักษาโมเดลธุรกิจ · gate `reliable` ที่ n≥30 และรายงานตรง ๆ เมื่อไม่ถึง
- `medical_references.py`
- route `GET /scans/<uuid>/assessment/` — รวม overall/categories/per-view/distribution/findings/
  coverage/cohort ในคำตอบเดียว

> `percentile.py` เดิมถูกแทนที่ แต่ `ScoreCardEndpointTest` และ `SimilarityPercentileTest` ต้อง
> เขียนใหม่ให้ครอบพฤติกรรมเดิมที่ยังต้องจริง: ตัวเลขที่ปิดต้อง**หายจาก payload** ไม่ใช่ติดธง

ไฟล์: `backend/doodee/findings.py`, `score_distribution.py`, `medical_references.py` (ใหม่ทั้งสาม),
`views.py`, `urls.py`, `percentile.py` (ยุบ), `tests.py`

### Phase 3 — ชั้นจำลองให้ครบ

(การสลับแคตตาล็อกกับ intensity ลงไปแล้วใน Phase 0 — ที่เหลือคือทำให้ครบ)

- ลบ legacy `simulation_engine.simulate()` — เหลือ renderer เดียว
- serve `Simulation.view_objects` (เขียนแล้วแต่ไม่มีใครอ่าน)
- ส่ง `refine=False` สำหรับ preview ให้ตรงกับที่ docstring อ้างไว้

**reference-target บน canonical engine** — ตัวที่ต้องคิดใหม่ ไม่ใช่การย้ายโค้ด

legacy ทำได้เพราะมันขยับ control point บนภาพเดียวจนวัดได้ตามเป้า · fused engine รัน slider บนโมเดล
3D แล้ว project กลับ จึงไม่มีลูปแบบนั้น

แนวทาง: `reference_scoring.reference_target()` ให้ ratio เป้าหมาย → **solve หา slider setting ด้วย
bisection บน landmark อย่างเดียว** (`morph_fused` + `project_to_view` + วัด ไม่ต้อง warp ภาพ) ราว
5–8 รอบ ซึ่งถูกมากเพราะไม่แตะ pixel → ได้ setting แล้วค่อย render ครั้งเดียว

ไฟล์: `backend/doodee/simulation_engine.py`, `canonical_pipeline.py`, `procedures.py` (ลบ),
`views.py`, `serializers.py`

### Phase 4 — mesh

ต่อ `face_mesh_render.mesh_png()` / `canonical_pipeline.mesh_map()` เข้ากับ route
`GET /scans/<uuid>/mesh/<view>/` (PNG, `Cache-Control: private, max-age=900`) และ
`GET /mesh-legend/` (โซน + ป้ายไทย + สี)

### Phase 5 — UI

- ต่อหน้าจอที่มีอยู่เข้ากับ endpoint ใหม่ — `DashboardPage` Analysis view ยังมี SVG ตกแต่งคงที่,
  ปุ่ม "Start Angularity/Dimorphism/Features" ที่แค่สลับแท็บ, และ `dimorphism` ที่ล็อกถาวรเพราะ
  `PILLAR_CATEGORIES.dimorphism = []`
- เอา capture helper 6 ไฟล์ที่ลอยมาใช้: `captureCandidates`, `captureConfidence`,
  `capturePerformance`, `captureGuidance`, `facePreview`, `stillFace`
- `SimulationView` ต้องมี intensity control (ตอนนี้ไม่มี UI เลย ทุกอย่างวิ่งที่ระดับ 3)

> **ห้ามทำซ้ำ `1a9f8f0`** — การพอร์ต UI ก้อนใหญ่ 82,000 บรรทัดถูก revert มาแล้วครั้งหนึ่ง
> รอบนี้ต่อทีละหน้าจอเข้ากับ UI ที่มีอยู่ ไม่ยก UI อีกฝั่งมาทั้งชุด

### Phase 6 — เทสต์

`canonical_pipeline`, `surface_effects`, `procedure_catalog`, `flux_refine`, `geometry_controls`
ไม่มีเทสต์อ้างถึงเลยในทั้งสามไฟล์เทสต์ · ยก `test_simulation_pipeline.py` (626 บรรทัด) จาก
doodoodeedee มาแล้วปรับให้เข้ากับ schema ที่นี่

---

## ความเสี่ยง

1. **`Scan.analysis_data` เปลี่ยนรูป** — เป็น JSONField ที่ทั้งสองฝั่งเขียนคนละแบบ การ bump
   `FORMULA_VERSION` ทำให้สแกนเก่าเทียบไม่ได้ (ยอมรับแล้ว) แต่โค้ดที่อ่านมันต้องทนกับทั้งสองรูป
   จนกว่าสแกนเก่าจะหมดอายุ — `percentile.py`, `development_plan.py`, `chat_facts.py`,
   `demo_data.py`, `dashboardData.ts` อ่านทั้งหมด
2. **migration** — ที่นี่มี 36 ตัว อีกฝั่งมี 10 ตัว ไม่ merge กัน ต้องเขียนใหม่จากความต่างของ field
3. **`reference_scoring.UNSUPPORTED_CATEGORIES`** (brows, cheeks, jaw, smile, neck, skin) ไม่มีค่า
   มาตรฐานตีพิมพ์ · `metric_catalog` 86 รายการจะมีรายการที่วัดได้แต่ให้คะแนนไม่ได้ — ต้องแสดงเป็น
   `measured` แต่ไม่มี score ไม่ใช่ซ่อน
4. **เวลา render** — canonical วัดได้ 2.7 วิ เทียบ legacy 0.1–0.4 วิ ที่ `max_side=1280` การทิ้ง
   legacy แปลว่าทุกคำขอจ่ายราคานั้น · อยู่ใน Celery อยู่แล้วแต่ preview เป็น synchronous
5. **`SIMULATION_ENABLED=true`** ตอนเปิดสาธารณะ ขัดกับคำเตือนใน `.env.example` ที่ให้รอรีวิวโดยแพทย์
   — ตัดสินใจรับความเสี่ยงไว้แล้ว บันทึกซ้ำตรงนี้เพราะงานนี้ทำให้ฟีเจอร์นั้นใหญ่ขึ้นมาก

---

## Verification

แต่ละ phase ต้องผ่านทั้งหมดนี้ก่อนไป phase ถัดไป:

```sh
docker compose exec api python manage.py test doodee     # ตอนนี้ 701 tests
npm run test:web
npm run doctor
```

ปลายทาง — สแกนจริงหนึ่งครั้งต้องได้ครบ: `/assessment/` คืน findings + distribution + coverage ·
`/mesh/front/` คืน PNG · `/procedures/` คืน 92 รายการ · simulation หนึ่งครั้ง render สามมุมด้วย
`model_version = canonical-3d-fusion-lab-v1` และมี `measurements` ที่อ้าง mm จาก `evidence.py` ·
ไม่มีโมดูลไหนใน `backend/doodee/` ที่ไม่มีคนเรียก
