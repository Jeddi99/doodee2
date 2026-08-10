import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, Ruler, ShieldCheck } from 'lucide-react';
import {
  CATEGORY_LABELS, METRIC_CATEGORIES, REFERENCE_DENOMINATOR, REFERENCE_METRIC_LABELS,
  REFERENCE_METRIC_SPANS, displayedMetrics,
} from '../data/faceMetrics';
import { coverFit, faceSpan } from '../lib/makeupGeometry';
import { allSegments, metricSegments, referenceSegments } from '../lib/metricLines';

// Solid red for the distance being measured, dashed for what it is divided by. Every other measured
// span sits underneath in translucent white so a reader can see the whole set at once and still tell
// which line belongs to the row they picked.
const BASE_LINE = 'rgba(255,255,255,.5)';
const MEASURED_LINE = '#ff3b5c';
const DENOMINATOR_LINE = 'rgba(101,73,216,.95)';

const formatValue = (value, unit) => (unit === 'degree' ? `${value}°` : value);

/** Where a z-score sits on a bar centred on the reference mean, clamped at ±3 SD. */
const deviationOffset = (z) => 50 + (Math.max(-3, Math.min(3, z || 0)) / 3) * 50;

function drawLines(context, segments, { colour, width, dashed, dots }) {
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.lineCap = 'round';
  if (dashed) context.setLineDash([width * 3, width * 3]);
  // A dark halo keeps a light line legible over a pale cheek or a bright background.
  context.shadowColor = 'rgba(20,12,40,.55)';
  context.shadowBlur = width * 1.5;
  for (const segment of segments) {
    const [start, end] = segment.points;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  if (dots) {
    context.setLineDash([]);
    context.fillStyle = colour;
    for (const segment of segments) {
      for (const point of segment.points) {
        context.beginPath();
        context.arc(point.x, point.y, width * 1.6, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  context.restore();
}

export default function AnalysisMetricsPanel({ result, imageUrl, lang }) {
  const isTh = lang === 'th';
  const scores = result.analysis_data?.reference_scores;
  const rows = useMemo(() => displayedMetrics(result.analysis_data?.metrics), [result.analysis_data]);
  const referenceRows = scores?.metrics || [];

  // `{ family, key }` — the two metric families use different denominators, so a row has to say
  // which one it belongs to before its lines can be drawn.
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [status, setStatus] = useState('loading');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const landmarksRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // The server derives the ratios and throws the landmark coordinates away on purpose — 478 points of
  // someone's face identify them in a way a dimensionless ratio does not. So the lines are recovered
  // in the browser and kept in memory only, never stored.
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    setStatus('loading');
    landmarksRef.current = null;
    imageRef.current = null;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = imageUrl;

    (async () => {
      try {
        await image.decode();
        if (cancelled) return;
        imageRef.current = image;
        const liveFace = await import('../lib/liveFace');
        if (cancelled) return;
        const landmarks = await liveFace.detectStillAnyDelegate(image);
        if (cancelled) return;
        landmarksRef.current = landmarks;
        setStatus(landmarks ? 'ready' : 'no-face');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => { cancelled = true; };
  }, [imageUrl]);

  useEffect(() => () => {
    import('../lib/liveFace').then((liveFace) => liveFace.closeStillFaceLandmarker()).catch(() => {});
  }, []);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !stageSize.width || !stageSize.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stageSize.width * ratio);
    canvas.height = Math.round(stageSize.height * ratio);
    const context = canvas.getContext('2d');
    const fit = coverFit({ width: image.naturalWidth, height: image.naturalHeight }, { width: canvas.width, height: canvas.height });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, canvas.width, canvas.height);

    const landmarks = landmarksRef.current;
    if (!landmarks) return;
    // Line weight scales with how large the face is on this canvas, so the overlay reads the same on a
    // narrow phone column as on a wide desktop one.
    const unit = Math.max(1, faceSpan(landmarks, fit) * .006);

    drawLines(context, allSegments(rows, landmarks, fit), { colour: BASE_LINE, width: unit });

    if (selected) {
      const segments = selected.family === 'reference'
        ? referenceSegments(REFERENCE_METRIC_SPANS[selected.key], REFERENCE_DENOMINATOR, landmarks, fit)
        : metricSegments(rows.find((row) => row.key === selected.key), landmarks, fit);
      drawLines(context, segments.filter((segment) => segment.role === 'denominator'),
        { colour: DENOMINATOR_LINE, width: unit * 1.4, dashed: true });
      drawLines(context, segments.filter((segment) => segment.role === 'measured'),
        { colour: MEASURED_LINE, width: unit * 2.2, dots: true });
    }
  }, [rows, selected, stageSize, status]);

  useEffect(() => { repaint(); }, [repaint]);

  const pick = (family, key, drawable) => {
    setSelected((current) => (current?.family === family && current?.key === key ? null : { family, key }));
    setExpanded((current) => (current === `${family}:${key}` ? null : `${family}:${key}`));
    if (!drawable) setSelected(null);
  };

  const overlayNote = status === 'ready' ? null
    : status === 'loading' ? (isTh ? 'กำลังหาตำแหน่งจุดวัด…' : 'Locating the measured points…')
      : status === 'no-face' ? (isTh ? 'ตรวจไม่พบใบหน้าที่ชัดพอสำหรับวาดเส้น ตัวเลขด้านล่างยังใช้ได้ตามปกติ' : 'No face clear enough to draw the lines. The numbers below are unaffected.')
        : (isTh ? 'เบราว์เซอร์นี้เรียกใช้ตัวหาจุดวัดไม่ได้ (ต้องรองรับ WebGL) ตัวเลขด้านล่างยังใช้ได้ตามปกติ' : 'This browser cannot run the point detector — it needs WebGL. The numbers below are unaffected.');

  return <>
    <section className="analysis-portrait-card">
      <div className="analysis-portrait-stage" ref={stageRef}>
        <canvas ref={canvasRef} aria-label={isTh ? 'ภาพหน้าตรงพร้อมเส้นบอกจุดที่วัด' : 'Front image with the measured spans drawn'} />
        {overlayNote && <p className="analysis-portrait-status" role="status">
          {status === 'loading' && <Activity className="capture-spin" size={14} />}{overlayNote}
        </p>}
      </div>
      <div><ShieldCheck /><span>{isTh ? 'ภาพ 2D · ค่า ratio เท่านั้น' : '2D image · ratios only'}</span></div>
      {status === 'ready' && <p className="analysis-portrait-legend">
        <b style={{ background: MEASURED_LINE }} />{isTh ? 'ระยะที่วัด' : 'Measured span'}
        <b className="is-dashed" style={{ background: DENOMINATOR_LINE }} />{isTh ? 'ตัวหาร' : 'Divided by'}
      </p>}
    </section>

    <section className="analysis-metrics-card">
      <h2><Ruler size={16} /> {isTh ? 'ค่าสัดส่วนที่วัดได้' : 'Measured proportions'}</h2>
      <p className="analysis-metrics-basis">{isTh
        ? `${rows.length} ค่า เทียบกับความกว้างหรือความสูงของใบหน้าคุณเอง — แตะแถวเพื่อดูว่าวัดจากจุดไหน`
        : `${rows.length} values, each against your own face width or height — tap a row to see where it was measured.`}</p>

      {METRIC_CATEGORIES.map((category) => {
        const inCategory = rows.filter((row) => row.category === category);
        if (!inCategory.length) return null;
        return (
          <div className="analysis-metric-group" key={category}>
            <h3>{CATEGORY_LABELS[category][isTh ? 0 : 1]}</h3>
            {inCategory.map((row) => {
              const id = `measured:${row.key}`;
              const drawable = Boolean(row.span);
              const isSelected = selected?.family === 'measured' && selected.key === row.key;
              return (
                <div className={`analysis-metric-row${isSelected ? ' is-selected' : ''}`} key={row.key}>
                  <button aria-expanded={expanded === id} onClick={() => pick('measured', row.key, drawable)}>
                    <span>{isTh ? row.name_th : row.name_en}</span>
                    <strong>{row.measured.value}</strong>
                    <ChevronDown size={14} />
                  </button>
                  {expanded === id && <p>
                    {isTh ? row.about_th : row.about_en}
                    {!drawable && <em>{isTh ? ' · ค่านี้วาดเป็นเส้นเดียวไม่ได้' : ' · this one cannot be drawn as a single line'}</em>}
                    <small>{isTh ? 'ความเชื่อมั่น' : 'Confidence'} {Math.round(row.measured.confidence * 100)}%</small>
                  </p>}
                </div>
              );
            })}
          </div>
        );
      })}

      {referenceRows.length > 0 && <>
        <h2><Ruler size={16} /> {isTh ? 'เทียบค่าอ้างอิงไทย' : 'Against the Thai reference'}</h2>
        <p className="analysis-metrics-basis">{isTh
          ? 'ชุดนี้เทียบกับความสูงจากหัวคิ้วถึงปลายคาง (n–gn) เพื่อให้เทียบกับค่ามิลลิเมตรของงานวิจัยได้ จึงเป็นตัวเลขคนละฐานกับชุดด้านบน'
          : 'This set divides by nasion-to-menton height (n–gn) so it can be compared with the published millimetre means. Different denominator, so different numbers from the set above.'}</p>
        {scores?.coverage && <p className="analysis-metrics-basis">{isTh
          ? `วัดได้ ${scores.coverage.scored_metrics} จาก ${scores.coverage.available_reference_metrics} ค่าที่มีข้อมูลอ้างอิง`
          : `${scores.coverage.scored_metrics} of ${scores.coverage.available_reference_metrics} referenced values were measurable.`}</p>}

        {referenceRows.map((metric) => {
          const id = `reference:${metric.key}`;
          const drawable = Boolean(REFERENCE_METRIC_SPANS[metric.key]);
          const isSelected = selected?.family === 'reference' && selected.key === metric.key;
          const z = metric.normalized_deviation;
          return (
            <div className={`analysis-metric-row is-reference${isSelected ? ' is-selected' : ''}`} key={metric.key}>
              <button aria-expanded={expanded === id} onClick={() => pick('reference', metric.key, drawable)}>
                <span>{REFERENCE_METRIC_LABELS[metric.key]?.[isTh ? 0 : 1] || metric.key}</span>
                <strong>{formatValue(metric.observed, metric.unit)}
                  <small> {isTh ? 'อ้างอิง' : 'ref'} {formatValue(metric.reference, metric.unit)}</small>
                </strong>
                <b>{metric.score}</b>
              </button>
              {/* Signed, so the direction is visible: a value can be above or below the mean and score
                  the same, and "which way" is the part a reader can act on. */}
              <div className="analysis-deviation" aria-hidden="true">
                <i /><span style={{ left: `${deviationOffset(z)}%` }} />
              </div>
              {expanded === id && <p>
                {z > 0
                  ? (isTh ? `มากกว่าค่าอ้างอิง ${Math.abs(z)} SD` : `${Math.abs(z)} SD above the reference`)
                  : z < 0
                    ? (isTh ? `น้อยกว่าค่าอ้างอิง ${Math.abs(z)} SD` : `${Math.abs(z)} SD below the reference`)
                    : (isTh ? 'ตรงกับค่าอ้างอิง' : 'On the reference')}
                {!drawable && <em>{isTh ? ' · วัดจากภาพด้านข้าง จึงไม่มีเส้นบนภาพนี้' : ' · measured on a side photo, so no line here'}</em>}
              </p>}
            </div>
          );
        })}
      </>}
    </section>
  </>;
}
