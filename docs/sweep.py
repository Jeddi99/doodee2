"""เรนเดอร์ทุกหัตถการในแคตตาล็อกบนสแกนจริง แล้ววัดว่าภาพเปลี่ยนไปแค่ไหน

เทสต์ mock `simulate_scan_views` ไว้ทั้งหมด — จำเป็น เพราะ fused render ต้องใช้ภาพถ่ายจริงสามใบ
แต่แปลว่าไม่มีอะไรพิสูจน์ว่าหัตถการหนึ่ง ๆ ทำให้เกิดภาพที่ต่างจากเดิม สคริปต์นี้คือส่วนนั้น
รันมือ ไม่ใช่ใน CI เพราะต้องมี scan id จริงและ storage จริง

    docker compose cp docs/sweep.py api:/tmp/sweep.py
    docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings api python /tmp/sweep.py

ผลล่าสุดอยู่ใน docs/PROCEDURE-VISIBILITY.md
"""
import sys; sys.path.insert(0, "/app/backend")
import django, numpy as np, cv2, json, sys
django.setup()
from doodee.models import Scan
from doodee import procedure_catalog as pc
from doodee.simulation_engine import simulate_canonical
from doodee import storage

_cache = {}
def cached_download(name):
    if name not in _cache:
        _cache[name] = storage.download_image(name)
    return _cache[name]

scan = Scan.objects.get(id='6d80d7a3-ac1a-4ab8-b5a3-aacdce57ff73')
rows = []
for spec in pc.PROCEDURES:
    if not spec.supported:
        continue
    sel = [{'procedure_id': spec.source_ref, 'intensity_level': 5}]
    try:
        out, meas, focus, extra = simulate_canonical(scan, sel, cached_download,
                                                     output_format='.png', max_side=640)
        before = cv2.imdecode(np.frombuffer(extra['before_encoded'], np.uint8), cv2.IMREAD_COLOR)
        after = cv2.imdecode(np.frombuffer(out, np.uint8), cv2.IMREAD_COLOR)
        d = np.abs(before.astype(int) - after.astype(int))
        rows.append({'ref': spec.source_ref, 'name': spec.name_th,
                     'pct': round(float((d.max(axis=2) > 3).mean() * 100), 3),
                     'max': int(d.max()), 'meas': len(meas), 'err': None})
    except Exception as exc:
        rows.append({'ref': spec.source_ref, 'name': spec.name_th, 'pct': None,
                     'max': None, 'meas': None, 'err': f'{type(exc).__name__}: {exc}'[:120]})
    print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
json.dump(rows, open('/tmp/sweep.json', 'w'), ensure_ascii=False)
