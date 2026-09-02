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

### Phase 1 — ชั้นวัด ✅ เสร็จแล้ว

commit `31bc5cc` · `03510aa` — metric 27 → **51** · `FORMULA_VERSION` = `2026.5-extended`

- มุมเป็นองศา (canthal/brow tilt, gonial angle, mentolabial), สัดส่วนเทียบ feature ต่อ feature,
  เส้น E ของ Ricketts แบบ**มีเครื่องหมาย** (ริมฝีปากล้ำเส้นกับอยู่หลังเส้นเป็นคนละเรื่อง)
- `metric_catalog.py` 85 รายการ · `GET /metric-catalog/?group=`
- `reference_scoring` ได้ `views_from_metrics` → คะแนนแยกหน้าตรง/ด้านข้าง (ของจริง: front 83, side 52)

**ที่ต่างจากแผน:**

| เจอ | ทำอะไร |
|---|---|
| `analysis_engine` แตกกันสองทาง — WEB มี `skin` scan mode + `skin_engine` ที่ DDD ไม่มี | merge ทีละส่วน ไม่ทับไฟล์ · **ไม่เอา** `_skin_metrics` ของ DDD เพราะ `skin_engine` ที่นี่ (LAB, band-pass, per-region) ดีกว่ามาก |
| `metric_catalog` อ้างคีย์ผิว `visible_*` 4 ตัวที่ engine ที่นี่ไม่ผลิต | เพิ่ม family ที่สาม `skin_signals` ชี้ไปคีย์จริงของ `skin_engine` · แยกจาก `metrics` เพราะ face scan ผลิต metric ครบแต่ไม่มี skin signal เลย |
| เทสต์ที่ปักคีย์ไว้เป็น**รายชื่อเขียนมือ** และเก่าไปแล้วสองทาง (ขาด `lip_fullness_ratio`, ยังอ้าง `visible_*` ที่เลิกผลิต) | แทนด้วยสองอย่างที่อ่านไฟล์ต้นทางจริง: `METRIC_KEYS` ตรวจกับ output ทุกครั้งที่สแกน + `faceMetrics.test.js` แกะ `analysis_engine.py` |

> `CATALOG_NAME_TO_METRIC` ใน `dashboardData.ts` ยังไม่ลบ — ผูกกับหน้าจอ measurement library ยกไป Phase 5

### Phase 2 — ชั้นตีความ ✅ เสร็จแล้ว

commit `f07eab7` — `findings.py` · `score_distribution.py` · `GET /scans/<uuid>/assessment/`

ของจริงบนสแกนที่มีอยู่: strengths 6 · improvements 6 · unnamed 0 พร้อมคำตัดสินไทย/อังกฤษ

**สามช่องที่ต้นทางเปิดทิ้งไว้ และปิดที่นี่:**

1. **`/assessment/` ไม่มี gating เลย** — วางข้าง `score_card` ที่ redact อยู่ มันคือ**ประตูที่สอง**
   เข้าถึงตัวเลขที่ประตูแรกกันไว้ · ตอนนี้ redact ด้วย `percentile.redact` ตัวเดียวกัน
   บวกกับคำตัดสินที่เป็นคำตอบของแพ็กเกจจ่ายเงิน — รายการที่ล็อกเหลือแค่ชื่อ จำนวนยังบอกครบ
2. **`_procedures_by_id()` คืน `{}`** — เป็น stub ที่ทำให้ทุก finding บอกเงียบ ๆ ว่าทำอะไรไม่ได้ ·
   ต่อกับตารางจริง · Phase 3 ลบ `procedures.py` เมื่อไหร่ เทสต์แดงทันทีจนกว่าจะ re-point
3. **`medical_reference` อ่านจาก `data.json` ที่ไม่มีในรีโปต้นทางด้วยซ้ำ** — ตัดทิ้ง
   dose/หน่วย/มม./แหล่งอ้างอิงอยู่ใน `evidence.py` แล้ว คีย์ด้วย control ที่ simulation ขยับจริง

**แผนเดิมผิดหนึ่งข้อ:** `percentile.py` **ไม่ได้**ถูกแทนที่ · `similarity_percentile` วัดระยะ
chi-square ถึงค่าเฉลี่ยอ้างอิง ส่วน `score_distribution` วัดอันดับเทียบผู้ใช้คนอื่น
คนละปริมาณ ทั้งคู่ควรมี — เก็บทั้งสองไฟล์

> `medical_references.py` **ไม่พอร์ต** — ไม่มีไฟล์ข้อมูล และคีย์ด้วย preset_id ที่กำลังจะลบ

### Phase 3 — เหลือ renderer เดียว ✅ เสร็จแล้ว

commit `0dbcea7` · `259bb95` · `f1347e2` · `666bcf7`

**reference-target บน canonical** — เดิมทำไม่ได้เพราะ fused engine รัน slider บนโมเดล 3D แล้ว
project กลับ จึงไม่มีลูปที่เล็งไปยังค่าที่วัดได้ · `solve_reference_sliders` คือลูปนั้น:
bisection บน landmark อย่างเดียว 12 รอบ ก่อนแตะ pixel · ของจริง — คางเข้าเป้าพอดีที่ setting 83.69

> **กับดักที่เกือบพลาด:** `chin_height` ในระบบคือ stomion→gnathion **ไม่ใช่** ขอบริมฝีปาก 17→152
> เวอร์ชันแรกใช้ตัวหลัง ผิดไป 40% ซึ่งมากกว่าการเปลี่ยนแปลงที่กำลัง solve หาทั้งก้อน
> จับได้ตอนวัดกับสแกนจริง · ตอนนี้ parity 0.1–1.4% และมีเทสต์อ่าน `analysis_engine.py` มาตรึง

**ทำไม legacy renderer ถึงยังอยู่มาตลอด** — ไม่ใช่เพราะ reference target แต่เพราะ
`engine_for_selections` ต้องการครบสามมุม ส่วน `fast` scan ถ่าย **oblique ไม่ใช่ profile** ·
วัดแล้วพบว่า `fuse_views` ไม่เคยต้องการสามมุมเลย (fuse 3/2/1 มุมให้ displacement เท่ากัน) ·
เปลี่ยนเป็น "มีภาพหน้าตรงก็พอ" → fast scan ได้แคตตาล็อก 72 หัตถการแทนที่จะไม่ได้อะไรเลย
→ legacy ไม่มีใครเรียก → ลบ (`simulation_engine` สั้นลง 631 บรรทัด, ลบ `procedures.py`)

> **เกือบหายไปสองอย่างตอนลบ:**
> 1. **ลายน้ำ** — `_watermark` อยู่ใน renderer ที่ถูกลบ ส่วน fused engine ไม่วาดอะไรเลย
>    (`DISCLAIMER_TH` ลอยไม่มีคนเรียก) การลบจึงถอด "EDUCATIONAL SIMULATION" ออกจากทุกภาพ
>    ย้ายเข้า fused render แล้ว วาดหลังวัดความเปลี่ยนแปลง เพื่อไม่ให้ลายน้ำถูกนับเป็นการเปลี่ยน
> 2. **แถวที่บันทึกไว้แล้ว** — preset id 24 ตัวเก่าเก็บไว้เป็น input alias เหมือนที่
>    `procedure_catalog` ทำกับ slug เก่า · แถวที่ worker re-render ไม่ได้คือแถวที่หายไปเงียบ ๆ

**ตารางคลินิกหนึ่งเดียว** — `procedure_catalog.MEASUREMENT_PROCEDURES` แทนที่ `procedures=`
ที่กระจายอยู่ 85 แถว + ลูปใน `development_plan` · มีช่อง `direction` ซึ่งข้อมูลเก่าบอกไม่ได้:
ตัดปีกจมูกทำให้แคบอย่างเดียว จมูกที่แคบอยู่แล้วจึงไม่ถูกเสนออีก

**`view_objects`** — worker เขียนมาตลอดตั้งแต่ fused engine เกิด แต่ไม่มี serializer ไหนอ่าน
สองมุมที่เหลือถูก render อัปโหลด จ่ายเงินเก็บ แล้วเข้าถึงไม่ได้ · เสิร์ฟแล้ว

### Phase 4 — mesh ✅ เสร็จแล้ว

commit `4af710a` — `face_mesh_render.py` · `GET /scans/<id>/mesh/<view>/` (PNG, private 900s) ·
`GET /mesh-legend/` (RGB ไม่ใช่ BGR) · ของจริง: PNG 205KB, 12,975 สี, 8 โซน

### Phase 5 — UI ✅ หน้าจอ assessment เสร็จแล้ว

commit `16393b5` — `AssessmentView.jsx` + `assessment.css` (token `--dd-*` เดียวกับ simulation)

findings พร้อมคำตัดสิน · กราฟการกระจาย (histogram + KDE + หมุดของตัวเอง) · คะแนนรายมุม ·
mesh พร้อม legend · `lib/api.js` ได้ `getScanAssessment` `getMetricCatalog` `getScanMesh` `getMeshLegend`

ความรุนแรงเป็นแถบขอบซ้าย ไม่ใช่สีทั้งการ์ด — การ์ดแดงเต็มหน้าอ่านเป็นคำตัดสินต่อตัวคน

> **ยังเหลือใน Phase 5:** `CATALOG_NAME_TO_METRIC` + `analysisCatalog` 102 รายการ hardcode
> ในหน้า measurement library ยังไม่ได้เปลี่ยนไปใช้ `/metric-catalog/` · `PILLAR_CATEGORIES.dimorphism`
> ยังล็อก · capture helper 6 ไฟล์ยังลอย

### Phase 6 — เทสต์ ✅ เสร็จแล้ว

commit `4b772b8` — ยก `test_simulation_pipeline.py` มา **36 tests ผ่านหมดโดยไม่ต้องแก้**
ซึ่งเป็นผลลัพธ์ที่มีความหมายเอง: แคตตาล็อก, surface pipeline และ refine planner ที่นี่
ยังเข้ากันได้กับที่เขียนไว้ หลังแก้ทั้งสามอย่างมาแปด commit

รวม **825 backend tests** · ทุกโมดูลใน `backend/doodee/` มีคน import แล้ว ·
เหลือ `canonical_pipeline.mesh_map` ฟังก์ชันเดียวที่ไม่มีคนเรียก — wireframe overlay ที่ไม่มีหน้าจอไหนขอ
ไม่ลบและไม่ต่อไปยังการใช้งานที่กุขึ้น

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
