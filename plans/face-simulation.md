# การจำลองใบหน้าแบบซ้อนหลายบริเวณ พร้อมล็อกรายบริเวณ

- feature_key: `face-simulation`
- สถานะ: พร้อมลงมือ
- อัปเดตล่าสุด: 2026-08-09

## เป้าหมายและเกณฑ์สำเร็จ

ผู้ใช้เลือกการจำลองได้หลายบริเวณพร้อมกันในภาพเดียว เห็นชื่อหัตถการที่เกี่ยวข้องของแต่ละรายการ และ **ล็อก** รายการที่พอใจแล้วเพื่อไปปรับบริเวณอื่นต่อโดยรายการที่ล็อกไม่หายและแก้ไม่ได้

สำเร็จเมื่อ:

1. เลือก "แนวกรามแคบลง" → กดกุญแจล็อก → สลับไปแท็บ "คาง" → เลือก "คางยาวขึ้น" แล้วภาพแสดง **ทั้งกรามและคาง** พร้อมกัน และการ์ดกรามกดเปลี่ยนไม่ได้
2. panel ขวาแสดงรายการที่กำลังจำลองทั้งหมด พร้อมชื่อบริเวณ ชื่อแบบ และชื่อหัตถการ
3. แท็บบริเวณด้านบนบอกได้ว่าบริเวณไหนมีของอยู่ และบริเวณไหนถูกล็อก โดยไม่ต้องกดเข้าไปดู
4. request แบบเดิม (`region` + `preset_id` เดี่ยว) ที่ `apps/mobile` ใช้อยู่ ยังทำงานได้ 200 เหมือนเดิม

## สถานะปัจจุบันจาก repo

ข้อเท็จจริง (ตรวจจากโค้ดจริง ไม่ใช่สมมติฐาน):

| จุด | สถานะตอนนี้ |
| --- | --- |
| `apps/web/src/components/SimulationView.jsx:206` | `changeRegion()` เรียก `resetSelection()` ล้าง selection + preview ทั้งหมด นี่คือสาเหตุตรง ๆ ที่ล็อกข้ามบริเวณไม่ได้ |
| `SimulationView.jsx:122-123` | state คือ `selection = {front, profile}` และ `previews = {front, profile}` — **หนึ่ง preset ต่อมุมกล้อง** ไม่ใช่ต่อบริเวณ |
| `backend/doodee/simulation_engine.py:236` `simulate()` | รับ preset **ตัวเดียว** วาร์ปจากภาพต้นฉบับเสมอ ใส่ watermark แล้ว encode |
| `simulation_engine.py:153` `_movement()` | คืน dict `{landmark_index: (dx, dy)}` เป็นพิกเซล clamp ที่ `face_width/height * max_shift` (`DEFAULT_MAX_SHIFT = 0.03`) |
| `simulation_engine.py:13-20` `REGION_LANDMARKS` | กราม `(234,172,152,397,454)` และคาง `(172,176,152,400,397)` **ใช้จุด 152/172/397 ร่วมกัน** |
| `backend/doodee/views.py:309, 366` | `allowed_fields = {"scan_id","region","preset_id","simulation_consent_version"}` และ **reject field อื่นทั้งหมด** |
| `backend/doodee/models.py` `Simulation` | `region` และ `preset_id` เป็น `CharField` เดี่ยว |
| `backend/doodee/tasks.py:61-82` | `process_simulation` resolve preset ตัวเดียว เขียน `measurements=[measurement]` |
| `backend/doodee/views.py:445` `ProcedureList` | เรียกโดยไม่ส่ง `region` คืน catalog ทั้งหมด — ใช้ได้ทันที |
| `apps/web/src/lib/previewQueue.js` | เข้าคิวให้แล้ว: ยิงทีละคำขอ เฉพาะคำขอล่าสุดได้วาดภาพ (backend ถือ per-user lock และตอบ 409) |
| `views.py:154` `_claim_free_preview` | **เข้าไม่ถึง** เพราะ `_simulation_locked` กันบัญชี free ออกก่อน ผู้ใช้ที่เข้าหน้านี้ได้คือ paid/vip เพดาน 120 preview/ชม. |
| `apps/web/package.json` | test คือ `node --test` กับไฟล์ตรรกะล้วนใน `src/lib/*.test.js` — **ไม่มี component test** |
| `backend/doodee/procedures.py` | ทุก preset มี `related_procedures` (สูงสุด 3) อยู่แล้ว UI แสดงรวมไว้ท้าย panel เท่านั้น |

## การตัดสินใจและสมมติฐาน

ทั้งหมดนี้ปิดแล้วจากการสัมภาษณ์ ผู้ลงมือไม่ต้องเลือกเพิ่ม:

1. **ความหมายของ "ล็อก" = กันแก้** ทุก selection ซ้อนกันเสมอโดยอัตโนมัติ (บริเวณละ 1 แบบ) ล็อกคือกันไม่ให้เปลี่ยน/ลบโดยบังเอิญ และ "ล้างทั้งหมด" ข้ามอันที่ล็อก — **ไม่ใช่** "ต้องกดล็อกก่อนถึงจะเข้าภาพ"
2. **เรนเดอร์แบบรวม movement ครั้งเดียว** บนภาพต้นฉบับ ไม่วาร์ปทับเป็นชั้น (เลี่ยงการรัน MediaPipe ซ้ำและภาพเบลอสะสม)
3. **บริเวณละ 1 แบบ** เลือกซ้ำ = แทนที่ สูงสุด 6 บริเวณ และ **กองหน้าตรงกับกองด้านข้างแยกกัน** เพราะเป็นคนละภาพต้นฉบับ (`source_for_scan`)
4. **แสดงชื่อหัตถการ 2 ที่**: ชิปใน card แต่ละใบ (`related_procedures[0]`) และรายการสรุปในกล่อง "กำลังจำลอง"
5. **โหมด "เทียบค่าอ้างอิง" ไม่ซ้อน** คงบริเวณเดียวต่อครั้ง เพราะ `_exact_movement` อ้างว่าไปถึงค่าเฉลี่ยจริง ซึ่งจะไม่จริงทันทีถ้าจุดร่วมถูกขยับจากหลายบริเวณ — เป็น claim ที่พังเงียบ
6. **เว็บก่อน** แต่ API รับ list ตั้งแต่รอบนี้ และรับรูปแบบเดิมด้วย มือถือจึงไม่พังและตามมาทีหลังได้โดยไม่แตะ backend ซ้ำ
7. **เพดานความปลอดภัย: clamp รายจุดหลังบวกรวม ที่ 3% เท่าเดิม** ไม่มีเพดานรวมทั้งภาพ (เพดานรวมจะทำให้บริเวณที่ล็อกไว้หดเองเมื่อเพิ่มบริเวณใหม่ ซึ่งขัดกับคำว่า "ล็อก") รายงาน `capped` รายบริเวณ
8. **บันทึก: เพิ่ม `selections` JSONField** และยังเขียน `region`/`preset_id` ด้วยรายการแรกเพื่อ backward compatibility ไม่มี data migration
9. **ซูมเล็งไปที่บริเวณที่แตะล่าสุด** ไม่ใช่ union box (union จะซูมออกจนไร้ประโยชน์เมื่อเลือกครบ) backend ส่ง `focus_boxes` เป็น map มาทั้งกอง client เลือกใช้เอง
10. **รายการพังในกอง = validate ทั้งกองก่อนเรนเดอร์ แล้ว 400** ไม่เรนเดอร์บางส่วน (ภาพที่ขาดกรามไปเงียบ ๆ คือภาพที่ผู้ใช้เชื่อผิด)
11. **บันทึกภาพเต็ม = กองของมุมที่กำลังดูอยู่เท่านั้น** ปุ่มระบุมุมชัดเจน ตรงกับ schema ที่เก็บ before/after ได้คู่เดียว
12. **กล่อง "กำลังจำลอง" อยู่บนสุด ใต้ consent** เพราะเป็นสถานะปัจจุบันของภาพ ไม่ใช่ผลพลอยได้
13. **ถอน consent = หยุดเรนเดอร์และลบภาพ preview แต่ไม่ล้างกอง** ติ๊กกลับแล้วเรนเดอร์ใหม่จากกองเดิม
14. **สลับไปโหมดอ้างอิง = `window.confirm` ระบุจำนวนรายการที่จะถูกล้าง** ถ้ากองว่างสลับเงียบ ๆ
15. **ไม่ persist กองข้าม reload** ไม่เขียน localStorage — selection ผูกกับ `scan_id` ที่หมดอายุได้ และ "ผู้ใช้เลือกจำลองอะไรกับหน้าตัวเอง" เป็นข้อมูลอ่อนไหวที่ไม่ควรค้างบนเครื่องร่วม

สมมติฐานเดียวที่เหลือ: จำนวนบริเวณสูงสุด 6 ไม่ทำให้ latency เกินที่รับได้ เพราะ MediaPipe รันครั้งเดียวต่อ request ไม่ว่ากองจะใหญ่แค่ไหน ต้นทุนที่เพิ่มคือ Gaussian field ต่อจุดควบคุมบน crop ที่ใหญ่ขึ้น — ถ้าวัดแล้วเกิน 4 วินาที ให้ลด `max_side` ของ preview จาก 1280 ลง ไม่ใช่ลดจำนวนบริเวณ

## การเปลี่ยนแปลง

### UX

**panel ขวา เรียงใหม่เป็น:** ยินยอม → **กล่อง "กำลังจำลอง"** → ชื่อบริเวณ → การ์ดแบบ → ปุ่มบันทึก

กล่อง "กำลังจำลอง" (ซ่อนเมื่อกองว่าง) แต่ละแถว:

```
[ไอคอน] คาง · คางยาวขึ้น          [ชิป: Chin filler]   [🔓] [✕]
        กราม · แนวกรามแคบลง       [ชิป: Jaw contouring] [🔒] [✕ disabled]
```

- ปุ่มกุญแจ: `aria-pressed` บอกสถานะ, label ไทย "ล็อกไม่ให้แก้ <ชื่อบริเวณ>" / "ปลดล็อก <ชื่อบริเวณ>"
- ปุ่มลบ disabled เมื่อล็อก พร้อม `title` อธิบายว่าต้องปลดล็อกก่อน
- ท้ายกล่องมีปุ่ม "ล้างที่ยังไม่ล็อก" (ซ่อนเมื่อไม่มีอันที่ปลดล็อกอยู่)
- คง disclaimer "ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์" ไว้ใต้กล่องนี้แทนตำแหน่งเดิมท้าย panel

**การ์ดแบบ (`PresetGroup`)**: เพิ่มชิปชื่อหัตถการใต้ชื่อแบบ (`preset.related_procedures[0]`, ไม่มีก็ไม่แสดง) และการ์ดในบริเวณที่ล็อกอยู่ต้อง `disabled` + `title` ว่า "ปลดล็อก <บริเวณ> ก่อนจึงจะเปลี่ยนแบบได้"

**แท็บบริเวณ (`simulation-region-tabs`)**: บริเวณที่มีของในกองของมุมปัจจุบัน ติดจุดสีเล็ก ๆ; ถ้าล็อกให้เป็นไอคอนกุญแจแทนจุด เพิ่มข้อความใน `aria-label` เช่น "กราม มีการจำลองและถูกล็อกไว้"

**ปุ่มบันทึก**: label เปลี่ยนตามมุม — "บันทึกภาพมุมหน้าตรง · เก็บ 30 วัน" / "บันทึกภาพมุมด้านข้าง · เก็บ 30 วัน" disabled พร้อมเหตุผลเมื่อกองของมุมนั้นว่าง

**แท็บมุมด้านข้าง**: เงื่อนไขเปลี่ยนจาก "บริเวณปัจจุบันมี profile preset" เป็น **"กองด้านข้างไม่ว่าง หรือ บริเวณปัจจุบันมี profile preset"** และยังต้อง `hasProfiles` — ไม่งั้นล็อกจมูกด้านข้างไว้แล้วสลับไปแท็บตา จะกลับไปดูไม่ได้

### Frontend

**ไฟล์ใหม่ `apps/web/src/lib/simulationStack.js`** — ตรรกะล้วน ไม่มี React ไม่มี fetch (ตามแบบ `previewQueue.js`)

```js
// รูปร่าง state: { front: Item[], profile: Item[] }  |  Item = { region, presetId, locked }
export const emptyStack = () => ({ front: [], profile: [] });
export const MAX_ITEMS = 6;

export function select(stack, view, region, presetId)  // แทนที่บริเวณเดิม; ไม่ทำอะไรถ้าบริเวณนั้นล็อก หรือกองเต็มและเป็นบริเวณใหม่
export function toggleLock(stack, view, region)
export function remove(stack, view, region)            // ไม่ทำอะไรถ้าล็อก
export function clearUnlocked(stack, view)
export function clearAll(stack)                        // ใช้ตอนสลับโหมด/เปลี่ยน scan — ล้างจริงรวมอันที่ล็อก
export const itemFor = (stack, view, region) => ...     // undefined ถ้าไม่มี
export const isLocked = (stack, view, region) => ...
export const count = (stack, view) => stack[view].length
export const toRequest = (stack, view) => stack[view].map(({ region, presetId }) => ({ region, preset_id: presetId }))
```

ทุกฟังก์ชันคืน state ใหม่เสมอ (immutable) และคืน state เดิมตัวเดิมเมื่อไม่มีอะไรเปลี่ยน เพื่อให้ React ข้าม re-render ได้

**`apps/web/src/components/SimulationView.jsx`**

- ลบ state `selection` ทิ้ง ใช้ `const [stack, setStack] = useState(emptyStack)` แทน
- **โหลด catalog ทั้งก้อนครั้งเดียว**: เปลี่ยน `useQuery(['procedures', region], () => getProcedures(region))` เป็น `useQuery(['procedures'], () => getProcedures())` แล้วกรองด้วย `useMemo` ตาม region จำเป็นเพราะกองซ้อนต้องแสดงชื่อแบบ/หัตถการของบริเวณที่ยังไม่ได้เปิดแท็บ
- `changeRegion(next)` = `setRegion(next)` เท่านั้น **ลบการเรียก `resetSelection()` ออก** (นี่คือหัวใจของงานนี้)
- `choosePreset(preset)`: `const view = preset.source_view === 'profile' ? 'profile' : 'front'` → `next = select(stack, view, region, preset.id)` → ถ้า `next === stack` ไม่ทำอะไร (ล็อกอยู่/กองเต็ม) → `setStack(next); setViewAngle(view); setLastTouched(region); setSimulationId(null);` → ถ้า consent แล้วสั่ง `requestPreview({ view, selections: toRequest(next, view) })`
- `requestPreview` / `runPreview`: เปลี่ยน payload จาก `(region, presetId)` เป็น `selections` array ตรรกะคิวใน `previewQueue.js` **ไม่แก้เลย** เพราะเป็น opaque `selection` object อยู่แล้ว
- เพิ่ม `const [lastTouched, setLastTouched] = useState(null)` ใช้เลือก `focusBox` จาก `preview.focus_boxes[lastTouched]` fallback เป็น box แรก
- `acceptConsent(false)`: `setPreviews(noPreviews())` และล้างคิว (`queueRef.current = emptyQueue()`) แต่ **ไม่แตะ `stack`**; `acceptConsent(true)`: ยิง preview ของทุกมุมที่กองไม่ว่าง
- `switchMode(next)`: ถ้า `count(stack,'front') + count(stack,'profile') > 0` ให้ `window.confirm` ว่า `จะล้างการจำลอง N รายการ` ก่อน ยกเลิกแล้วไม่สลับ
- `toggleLock` / `remove` / `clearUnlocked` ต่อเข้ากล่องใหม่ — `remove`/`clearUnlocked` ต้องยิง preview ใหม่ด้วย (หรือเคลียร์ภาพถ้ากองว่างลง)
- เมื่อ `scanId` เปลี่ยน → `clearAll` + `emptyQueue`
- component ใหม่ `StackPanel` วางไว้ในไฟล์เดียวกันข้าง `PresetGroup` (ตามแบบที่ไฟล์นี้ทำอยู่)
- โหมด reference: เดินทางเดิมทุกอย่าง ส่ง `selections` ยาว 1 (`[{region, preset_id: 'reference:<region>'}]`) กล่อง "กำลังจำลอง" ซ่อนในโหมดนี้

**`apps/web/src/lib/api.js`**: `previewSimulation(scanId, selections, consentVersion)` และ `createSimulation(scanId, selections, consentVersion)` ส่ง `{ scan_id, selections, simulation_consent_version }`

**`apps/web/src/simulation.css`**: สไตล์ `.simulation-stack`, `.simulation-stack-row`, `.simulation-lock`, `.simulation-procedure-chip`, `.simulation-region-tabs button .is-marked` ตาม token ที่มีอยู่ ไม่เพิ่มไฟล์ CSS ใหม่

**ไม่แตะ `apps/mobile`** และไม่แตะ `packages/shared/src/api.ts` ในรอบนี้ (ยังส่งรูปแบบเดิม ซึ่ง backend ยังรับ)

### Backend

**`backend/doodee/simulation_engine.py`**

`simulate(source, presets, max_side=2048, output_format=".png")` — `presets` เป็น **list** (ผู้เรียกทุกที่ส่ง list) คืน `(encoded_bytes, measurements: list, focus_boxes: dict)`

ขั้นตอนภายใน หลังได้ `points`, `pixels`, `face_width`, `face_height`:

1. `max_shift = max(preset.get("max_shift", DEFAULT_MAX_SHIFT) for preset in presets)`
2. รวม movement: สำหรับแต่ละ preset เรียก `_movement(pixels, preset, face_width, face_height, preset.get("max_shift", DEFAULT_MAX_SHIFT))` แล้ว **บวก** `(dx, dy)` เข้า dict รวมตาม landmark index
3. **clamp หลังบวก** รายจุด: `dx` ที่ `±face_width * max_shift`, `dy` ที่ `±face_height * max_shift`
4. `capped` รายบริเวณ: บริเวณหนึ่งเป็น `capped` เมื่อจุดใดที่ preset นั้นสั่งขยับ ถูก clamp ในขั้น 3 หรือ ถูก clamp ในตัว `_movement` เอง (เทียบ contribution ก่อนบวกกับเพดานของมันเอง เหมือนตรรกะเดิมที่ `simulation_engine.py:252`)
5. crop bbox = bounding rect ของ **union ของ `REGION_LANDMARKS` ทุกบริเวณในกอง** + padding จาก movement ที่รวมแล้ว
6. mask = **union ของ convex hull รายบริเวณ** (`fillConvexPoly` ทีละบริเวณลง mask เดียวกัน) — **ห้ามทำ convex hull เดียวครอบทุกบริเวณ** เพราะ hull ของตา+กรามจะกินทั้งใบหน้าและเบลอทุกอย่าง
7. displacement field, `remap`, blend, `_watermark(output)` **ครั้งเดียว** ตอนท้าย เหมือนเดิม
8. `measurements` = หนึ่งรายการต่อ preset ตามลำดับที่รับมา (`preset.get("measurement")` สำหรับ reference มิฉะนั้น `measurement_for(points, preset)`) แต่ละรายการเพิ่มคีย์ `region` และ `capped`
9. `focus_boxes` = `{preset["region"]: _focus_box(region_points_of_that_region, width, height)}`

ฟังก์ชันใหม่ `validate_selections(scan, selections, has_profile_images)` ใน engine หรือ `views.py` (เลือกที่เดียวแล้วให้ทั้ง view และ task เรียกร่วมกัน — **อย่า duplicate**):

- `selections` ต้องเป็น list ยาว 1..6
- ทุก item เป็น dict ที่มีคีย์ `region` และ `preset_id` เท่านั้น
- region ห้ามซ้ำ → `duplicate_region`
- resolve ทุกตัวด้วย `resolve_preset` → error ระบุ region ที่พัง
- `source_view` ของทุกตัวต้องเหมือนกัน → `mixed_source_view` (กองหน้าตรงกับด้านข้างแยกกันตามข้อ 3)
- ถ้า `source_view == "profile"` ต้องมีภาพ profile → `profile_photos_required`
- reference preset (`id` ขึ้นต้น `reference:`) อนุญาตเฉพาะเมื่อ `len(selections) == 1` → `reference_cannot_stack`
- คืน `(presets, targets)`

**`backend/doodee/views.py`**

ทั้ง `SimulationViewSet.create` และ `.preview`:

- `allowed_fields` เพิ่ม `"selections"`
- normalize ก่อน: ถ้ามี `selections` ใช้เลย; ถ้าไม่มีแต่มี `region`/`preset_id` แปลงเป็น `[{"region": ..., "preset_id": ...}]`; ถ้ามีทั้งคู่ → 400 `conflicting_selection_fields`
- validate ทั้งกอง **ก่อน** claim quota / ก่อนจับ lock / ก่อนแตะ storage
- `already_near_reference` ยังเช็คก่อนคิดโควตาเหมือนเดิม (เกิดได้เฉพาะ reference ซึ่งยาว 1)
- response ของ `preview` เพิ่ม/เปลี่ยน:
  - `presets`: list (ใหม่)
  - `preset`: รายการแรก (**คงไว้** เพื่อ `apps/mobile/app/simulation.tsx:34`)
  - `measurements`: หนึ่งรายการต่อบริเวณ
  - `related_procedures`: union แบบไม่ซ้ำ เรียงตามลำดับกอง
  - `focus_boxes`: `{region: box}` (ใหม่)
  - `focus_box`: box ของรายการแรก (**คงไว้**)
  - ที่เหลือ (`source_view`, `before_url`, `after_data_url`, cohort, `entitlement`) เหมือนเดิม

**`backend/doodee/models.py` + migration**

```python
selections = models.JSONField(default=list)   # [{"region": "jaw", "preset_id": "jaw-narrow"}, ...]
```

`backend/doodee/migrations/0005_simulation_selections.py` — `AddField` ตัวเดียว ไม่มี data migration แถวเก่าอ่านได้เป็น `[]` แล้ว fallback ไป `region`/`preset_id`

`SimulationViewSet.create` เขียน: `selections=<list>`, `region=<selections[0].region>`, `preset_id=<selections[0].preset_id>`, `parameters={"delta": presets[0]["delta"], "deltas": [{"region":…, "preset_id":…, "delta":…}, …]}`

**`backend/doodee/serializers.py`**: เพิ่ม `"selections"` ใน `fields` (อยู่ใน `read_only_fields` อัตโนมัติเพราะ `read_only_fields = fields`)

**`backend/doodee/tasks.py` `process_simulation`**

```python
selections = simulation.selections or [{"region": simulation.region, "preset_id": simulation.preset_id}]
presets, _ = validate_selections(simulation.scan, selections, ...)   # ก่อนแตะ storage; พังแล้ว fail ทั้งงาน
source, source_object, source_view = source_for_scan(simulation.scan, presets[0], download_image)
output, measurements, _boxes = simulate(source, presets)
simulation.measurements = measurements
simulation.related_procedures = <union ไม่ซ้ำ>
```

`error_code` เมื่อ validate ไม่ผ่านต้องระบุ region เช่น `"profile_photos_required:nose"` (จำกัด 40 ตัวอักษรตาม field เดิม)

### API และข้อมูล

`POST /api/simulations/preview/` และ `POST /api/simulations/`

```jsonc
{
  "scan_id": "…",
  "selections": [
    { "region": "jaw",  "preset_id": "jaw-narrow" },
    { "region": "chin", "preset_id": "chin-long" }
  ],
  "simulation_consent_version": "2026.3-local"
}
```

รูปแบบเดิมยังรับได้ (แปลงเป็น `selections` ยาว 1 ภายใน) — ห้ามส่งทั้งสองแบบพร้อมกัน

response ของ `preview` (ส่วนที่เปลี่ยน):

```jsonc
{
  "presets": [ {...}, {...} ],
  "preset": { /* = presets[0], สำหรับ client เดิม */ },
  "measurements": [ { "region": "jaw", "key": "jaw_width_ratio", "before_ratio": …, "target_ratio": …, "change_percent": …, "capped": false }, … ],
  "related_procedures": ["Jaw contouring", "Mandibular angle reduction", "Chin filler", "Chin implant", "Genioplasty"],
  "focus_boxes": { "jaw": {…}, "chin": {…} },
  "focus_box": { /* = ของ presets[0] */ }
}
```

รหัส error ใหม่ (ทั้งหมด 400 `ValidationError` ยกเว้นที่ระบุ): `duplicate_region`, `mixed_source_view`, `too_many_selections`, `empty_selections`, `reference_cannot_stack`, `conflicting_selection_fields`, และ `profile_photos_required` / `preset_region_mismatch` เดิมที่ต่อท้ายด้วย `:<region>`

## Edge cases, privacy และ failure states

- **จุดควบคุมร่วม (152 / 172 / 397)**: ซ้อนกราม+คางแล้ว offset บวกกัน แล้ว clamp ที่ 3% ของขนาดหน้า — ป้องกันไม่ให้คางถูกลากไกลเกินจริง และตั้ง `capped: true` ให้บริเวณที่โดน UI แสดงข้อความเดิมสไตล์ `simulation-note` ระบุชื่อบริเวณ
- **ถอน consent**: หยุดคิว ลบ `previews` ทิ้งทันที ไม่ยิง request ใหม่ กองยังอยู่ ติ๊กกลับแล้วเรนเดอร์ใหม่ — การถอนความยินยอมต้องหยุดการประมวลผล ไม่ใช่ลงโทษผู้ใช้
- **ไม่เขียนอะไรลง localStorage/sessionStorage** กองหายเมื่อ reload โดยตั้งใจ
- **watermark "EDUCATIONAL SIMULATION" ยังใส่ทุกภาพ ครั้งเดียวตอนท้าย** ไม่ว่ากองจะมีกี่บริเวณ
- **18+ gate, retention 30 วัน, ConsentEvent แยก purpose `SIMULATION`, per-user preview lock 15 วิ, โควตาบันทึก 3/เดือน** — ไม่เปลี่ยนทั้งหมด (1 กอง = 1 record จึงใจกว้างกว่าเดิมโดยอัตโนมัติ)
- **ถ้อยคำ claim ไม่เปลี่ยน**: "ภาพเพื่อการศึกษา ไม่ใช่ผลลัพธ์ที่ทำนายได้" และ "ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์" ต้องยังอยู่ และรายการหัตถการที่ยาวขึ้นจากการ union ต้องอยู่ใต้ disclaimer เดิม
- **กองเต็ม 6**: การ์ดของบริเวณที่ยังไม่มีของถูก disable พร้อม `title` บอกว่าครบ 6 แล้ว
- **ล็อกแล้วกดการ์ดเดิม**: ไม่ทำอะไร ไม่ยิง request ไม่กระพริบภาพ
- **scan หมดอายุ / ภาพ profile หาย ระหว่างกองยังอยู่**: 400 ระบุ region → UI แสดง `simulation-error` และไฮไลต์แถวนั้นในกล่อง พร้อมปุ่มลบรายการนั้น (ปลดล็อกให้อัตโนมัติเพื่อให้ลบออกได้)
- **latency**: กด 6 บริเวณติดกันเร็ว ๆ ไม่ยิง 6 request ซ้อน `previewQueue` ยิงอันแรกและอันล่าสุดเท่านั้น
- **a11y**: ปุ่มกุญแจมี `aria-pressed` + label ไทย/อังกฤษตาม `lang`; กล่อง "กำลังจำลอง" เป็น `<ul>` มี `aria-live="polite"` เพื่ออ่านออกเสียงเมื่อมีรายการเพิ่ม/ถูกล็อก; แท็บบริเวณสื่อสถานะผ่าน `aria-label` ไม่ใช่สีอย่างเดียว
- **prefers-reduced-motion** ในโหมด blink ยังทำงานเหมือนเดิม ไม่แตะ

## การทดสอบและเกณฑ์รับงาน

**1. `npm run test:web`** — เพิ่ม `src/lib/simulationStack.test.js` เข้า script ใน `apps/web/package.json`

- เลือกแบบใหม่ในบริเวณเดิม → แทนที่ ไม่เพิ่มแถว
- ล็อกแล้ว `select` บริเวณเดิม → คืน state **ตัวเดิม** (ไม่เปลี่ยน)
- ล็อกแล้ว `remove` → คืน state ตัวเดิม
- `clearUnlocked` → เหลือเฉพาะที่ล็อก; `clearAll` → ล้างหมดรวมที่ล็อก
- preset ของมุมด้านข้างเข้ากอง `profile` ไม่ปน `front`
- กองเต็ม 6 แล้วเลือกบริเวณที่ 7 → คืน state ตัวเดิม แต่เลือกทับบริเวณที่มีอยู่แล้วยังได้
- `toRequest` คืน `[{region, preset_id}]` ตามลำดับที่เลือก

**2. `python manage.py test doodee`** — เพิ่มใน `backend/doodee/tests.py`

- preview ด้วย 2 selections → 200, `measurements` ยาว 2, `focus_boxes` มีครบ 2 region, `related_procedures` เป็น union ไม่ซ้ำ
- preview ด้วย `region` + `preset_id` แบบเดิม → 200 และยังมีคีย์ `preset` กับ `focus_box` **พิสูจน์ว่า mobile ไม่พัง**
- ส่งทั้ง `selections` และ `region` → 400 `conflicting_selection_fields`
- selections ซ้ำ region → 400; ยาว 0 → 400; ยาว 7 → 400
- ปน front กับ profile ใน request เดียว → 400 `mixed_source_view`
- selections มี profile preset แต่ scan ไม่มีภาพด้านข้าง → 400 และ **mock `simulate` แล้ว assert ว่าไม่ถูกเรียกเลย** (พิสูจน์ข้อ 10: validate ก่อนเรนเดอร์)
- `reference:<region>` ปนกับ preset อื่น → 400 `reference_cannot_stack`
- worker: `Simulation` ที่มี `selections` 2 รายการ → `measurements` ยาว 2 และ `related_procedures` เป็น union (ต่อยอดจาก `test_the_worker_stores_a_simulation_from_what_simulate_returns` ที่ `tests.py:593`)
- แถวเก่าที่ `selections == []` แต่มี `region`/`preset_id` → worker ยังทำงานได้

**3. unit ที่ engine ตรง ๆ (ไม่รัน MediaPipe)** — ทดสอบฟังก์ชันรวม/clamp movement ด้วย `pixels` ที่ประดิษฐ์ขึ้น

- กราม+คางซ้อนกัน → offset ของจุด 152/172/397 เป็นผลบวก และไม่มีจุดใดเกิน `face_height * 0.03` / `face_width * 0.03`
- `capped` เป็น `True` เฉพาะบริเวณที่ถูกตัด ไม่ใช่ทั้งกอง
- movement รวมของกอง 1 รายการ ต้องเท่ากับผลของโค้ดเดิมเป๊ะ ๆ (regression: ผู้ใช้เดิมต้องไม่เห็นภาพเปลี่ยน)

**4. ตรวจด้วยมือ** ตามเกณฑ์สำเร็จข้อ 1-4 ที่หัวแผน + `npm run lint --workspace @doodee/web`

## สิ่งที่ไม่รวมและ blocker

ไม่มี blocker

ไม่รวมในรอบนี้ (ตัดสินใจแล้ว ไม่ใช่ลืม):

- UI กองซ้อนบน `apps/mobile/app/simulation.tsx` และ `packages/shared/src/api.ts` — ยังเป็น single preset และยังทำงานได้ผ่านเส้นทาง compatibility
- การซ้อนในโหมด "เทียบค่าอ้างอิง"
- การเก็บกองข้าม reload (ถ้าจะทำ ต้องเป็น server-side บน `Simulation` ไม่ใช่ localStorage)
- การบันทึกภาพทั้งสองมุมในครั้งเดียว
- เพดานความปลอดภัยรวมทั้งภาพ (ใช้ clamp รายจุด 3% เท่าเดิม)
- การปรับความแรงรายบริเวณแบบ slider — catalog ยังเป็น preset คงที่
