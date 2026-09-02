import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, Lock, ScanFace, Ticket } from 'lucide-react';
import { getMeshLegend, getScan, getScanAssessment, getScanMesh, getScans } from '../lib/api';
import { latestCraniofacialScan } from '../lib/latestScan';
import '../assessment.css';

const VIEW_NAMES = {
  front: ['หน้าตรง', 'Front'],
  side: ['ด้านข้าง', 'Side'],
  left_profile: ['ด้านซ้าย', 'Left'],
  right_profile: ['ด้านขวา', 'Right'],
};
const viewName = (key, isTh) => VIEW_NAMES[key]?.[isTh ? 0 : 1] ?? key;

const SEVERITY_COLOUR = {
  excellent: 'is-excellent', typical: 'is-typical', moderate: 'is-moderate', severe: 'is-severe',
};

/**
 * The distribution as one figure: the histogram as bars, the smoothed curve over it, and a
 * marker where this person sits.
 *
 * Drawn as an inline SVG rather than with a chart library because it is one shape with one
 * marker, and the server has already done every calculation — the client's only job is to turn
 * two lists of numbers into a path.
 */
function DistributionChart({ distribution, score, isTh }) {
  const { curve = [], histogram = [], sample_size: sampleSize, drawn_sample_size: drawn } = distribution || {};
  if (!curve.length && !histogram.length) return null;
  const peak = Math.max(...curve.map((point) => point.density), 1e-9);
  const tallest = Math.max(...histogram.map((bucket) => bucket.count), 1);
  const path = curve
    .map((point, index) => `${index ? 'L' : 'M'}${point.score},${100 - (point.density / peak) * 92}`)
    .join(' ');
  return (
    <figure className="assessment-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
           aria-label={isTh ? `การกระจายคะแนนจาก ${drawn} คน` : `Score distribution across ${drawn} people`}>
        {histogram.map((bucket) => (
          <rect
            key={bucket.from} x={bucket.from + 0.4} width={bucket.to - bucket.from - 0.8}
            y={100 - (bucket.count / tallest) * 92} height={(bucket.count / tallest) * 92}
            className="assessment-bar"
          />
        ))}
        {path && <path d={path} className="assessment-curve" vectorEffect="non-scaling-stroke" />}
        {typeof score === 'number' && (
          <line x1={score} x2={score} y1="0" y2="100" className="assessment-marker"
                vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <figcaption>
        <span>0</span>
        {typeof score === 'number' && <b style={{ left: `${score}%` }}>{score}</b>}
        <span>100</span>
      </figcaption>
      {/* The count travels with the shape. A curve with no idea how many people are in it is
          exactly the fiction the server-side module was written to avoid. */}
      <small>{isTh
        ? `วาดจากคะแนนของ ${drawn} คน · จัดอันดับเทียบ ${sampleSize} คน`
        : `Drawn from ${drawn} scores · ranked against ${sampleSize}`}</small>
    </figure>
  );
}

/** One finding: what it is, what the measurement says, and what a clinic does about it. */
function Finding({ item, isTh }) {
  if (item.locked) {
    return (
      <li className="assessment-finding is-locked">
        <span className="assessment-finding-name">{isTh ? item.name_th : item.name_en}</span>
        <Lock size={14} aria-hidden="true" />
      </li>
    );
  }
  const headroom = item.headroom?.gain;
  return (
    <li className={`assessment-finding ${SEVERITY_COLOUR[item.severity] || ''}`}>
      <div className="assessment-finding-head">
        <span className="assessment-finding-name">{isTh ? item.name_th : item.name_en}</span>
        <em>{isTh ? item.severity_th : item.severity_en}</em>
      </div>
      <p>{isTh ? item.verdict_th : item.verdict_en}</p>
      {/* The catalogue's own caveat travels with the finding, so a summary cannot present a
          number more confidently than the table it came from. */}
      {(isTh ? item.note_th : item.note_en) && (
        <small className="assessment-note">{isTh ? item.note_th : item.note_en}</small>
      )}
      {headroom ? (
        <small className="assessment-headroom">{isTh
          ? `ถ้าค่านี้อยู่ที่ค่าอ้างอิง คะแนนหมวดนี้จะขึ้น ${headroom} — เป็นเลขคณิตของการให้คะแนน ไม่ใช่การทำนายผล`
          : `At the reference this category would score ${headroom} higher — scoring arithmetic, never a prediction.`}</small>
      ) : null}
      {item.procedures?.length > 0 && (
        <div className="assessment-procedures">
          <span>{isTh ? 'หัตถการที่เกี่ยวข้อง' : 'Related procedures'}</span>
          <p>{item.procedures.map((procedure) => (isTh ? procedure.name_th : procedure.name_en)).join(' · ')}</p>
          <small>{isTh ? 'ไม่ใช่คำแนะนำการรักษา' : 'Not treatment advice.'}</small>
        </div>
      )}
    </li>
  );
}

/**
 * The mesh, with the legend that names its colours.
 *
 * The object URL is revoked when the view changes or the component goes away: each one holds a
 * PNG of a face in memory until it is, and the viewer switches between three of them.
 */
function MeshPanel({ scanId, views, isTh }) {
  const [view, setView] = useState(views[0]);
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const legend = useQuery({ queryKey: ['mesh-legend'], queryFn: getMeshLegend });

  useEffect(() => {
    let revoked = false;
    let created = null;
    setUrl(null);
    setFailed(false);
    getScanMesh(scanId, view)
      .then((objectUrl) => {
        created = objectUrl;
        if (revoked) { if (objectUrl) URL.revokeObjectURL(objectUrl); return; }
        if (objectUrl) setUrl(objectUrl); else setFailed(true);
      })
      .catch(() => { if (!revoked) setFailed(true); });
    return () => { revoked = true; if (created) URL.revokeObjectURL(created); };
  }, [scanId, view]);

  return (
    <section className="assessment-card assessment-mesh">
      <header>
        <h2>{isTh ? 'โครงหน้าเป็นพื้นผิว' : 'The face as a surface'}</h2>
        <div className="assessment-tabs" role="group" aria-label={isTh ? 'มุมกล้อง' : 'Camera angle'}>
          {views.map((name) => (
            <button key={name} className={view === name ? 'is-active' : ''} onClick={() => setView(name)}>
              {viewName(name, isTh)}
            </button>
          ))}
        </div>
      </header>
      {url ? <img src={url} alt={isTh ? 'ภาพโครงหน้าแบบพื้นผิว' : 'Depth-shaded face mesh'} />
        : failed ? <p className="assessment-empty">{isTh
          ? 'อ่านจุดบนใบหน้าจากภาพมุมนี้ไม่ได้ จึงวาดพื้นผิวให้ไม่ได้'
          : 'The landmarks could not be read from this angle, so there is no surface to draw.'}</p>
          : <p className="assessment-empty"><Activity className="capture-spin" /></p>}
      {legend.data?.zones && (
        <ul className="assessment-legend">
          {legend.data.zones.map((zone) => (
            <li key={zone.key}>
              <i style={{ background: `rgb(${zone.colour.join(',')})` }} aria-hidden="true" />
              {zone.label_th}
            </li>
          ))}
        </ul>
      )}
      <small>{isTh
        ? 'ความสว่างมาจากความลึก ส่วนที่นูนจะสว่างกว่าส่วนที่ยุบ · สีบอกแค่ว่าเป็นบริเวณใด'
        : 'Brightness is depth — what protrudes is lighter than what recedes. Colour only says which region.'}</small>
    </section>
  );
}

export default function AssessmentView({ lang = 'th', onNavigate }) {
  const isTh = lang === 'th';
  const requestedScanId = new URLSearchParams(window.location.search).get('scan_id');
  const scans = useQuery({ queryKey: ['scans'], queryFn: getScans, enabled: !requestedScanId });
  const scanId = requestedScanId || latestCraniofacialScan(scans.data)?.id;
  const scan = useQuery({ queryKey: ['scan', scanId], queryFn: () => getScan(scanId), enabled: Boolean(scanId) });
  const assessment = useQuery({
    queryKey: ['assessment', scanId], queryFn: () => getScanAssessment(scanId), enabled: Boolean(scanId),
  });

  const data = assessment.data;
  const meshViews = useMemo(() => Object.keys(scan.data?.view_urls || {}), [scan.data]);

  if (!scanId && !scans.isPending) {
    return (
      <div className="assessment-page assessment-blank">
        <ScanFace />
        <h1>{isTh ? 'ยังไม่มีผลสแกน' : 'No scan yet'}</h1>
        <button onClick={() => onNavigate('onboarding')}>{isTh ? 'เริ่มสแกนใบหน้า' : 'Start a scan'}</button>
      </div>
    );
  }
  if (assessment.isPending || scan.isPending) {
    return <div className="assessment-page assessment-blank"><Activity className="capture-spin" />{isTh ? 'กำลังเปิดผลวิเคราะห์…' : 'Opening the assessment…'}</div>;
  }
  if (assessment.isError) {
    return <div className="assessment-page assessment-blank"><p>{assessment.error.message}</p></div>;
  }

  const strengths = data.strengths || [];
  const improvements = data.improvements || [];

  return (
    <div className="assessment-page">
      <header className="assessment-header">
        <button className="assessment-back" onClick={() => onNavigate('analysis')}
                aria-label={isTh ? 'กลับหน้าวิเคราะห์' : 'Back to analysis'}><ArrowLeft /></button>
        <div>
          <span>ASSESSMENT</span>
          <h1>{isTh ? 'อะไรที่เด่น และอะไรที่ต่างจากค่าอ้างอิง' : 'What stands out, and what sits away from the reference'}</h1>
          <p>{isTh
            ? 'เทียบกับค่าเฉลี่ยที่ตีพิมพ์ของคนไทย 240 คน อายุ 18–35 ปี ไม่ใช่คะแนนความสวย'
            : 'Against the published means of 240 Thai adults aged 18–35. Not an attractiveness score.'}</p>
        </div>
        {typeof data.overall_score === 'number' && (
          <div className="assessment-score"><strong>{data.overall_score}</strong><span>/100</span></div>
        )}
      </header>

      {data.cohort_match === 'outside_reference_age_range' && (
        <p className="assessment-warning">{isTh
          ? 'คุณอยู่นอกช่วงอายุ 18–35 ปีของกลุ่มอ้างอิง คะแนนไม่ได้ปรับตามอายุ'
          : 'You are outside the 18–35 reference age range, and the score is not adjusted for that.'}</p>
      )}
      {data.population_match === 'outside_reference_population' && (
        <p className="assessment-warning">{isTh
          ? 'ค่าอ้างอิงมาจากประชากรไทย ไม่ได้ปรับตามประเทศที่คุณเลือก'
          : 'The reference values are Thai and are not adjusted for the country you selected.'}</p>
      )}

      <main className="assessment-layout">
        <section className="assessment-card">
          <h2>{isTh ? 'เทียบกับคนอื่นที่วัดด้วยวิธีเดียวกัน' : 'Against everyone else measured the same way'}</h2>
          <DistributionChart distribution={data.distribution} score={data.overall_score} isTh={isTh} />
          {/* Below the reliable sample size nothing here is presented as a fact. Saying so is the
              whole point — a percentile drawn from six people looks identical to one from six
              hundred unless the screen says which it is. */}
          {data.distribution && !data.distribution.reliable && (
            <p className="assessment-warning">{isTh
              ? `ยังมีคนวัดไว้ ${data.distribution.sample_size} คน ซึ่งน้อยกว่า ${data.distribution.reliable_at} คนที่จะเรียกว่าอันดับได้จริง ตัวเลขนี้จึงเป็นแค่การเทียบคร่าว ๆ`
              : `${data.distribution.sample_size} people have been measured, fewer than the ${data.distribution.reliable_at} it takes to call this a rank. Read it as a rough comparison.`}</p>
          )}
          {data.distribution?.synthetic_sample_size > 0 && (
            <p className="assessment-warning">{isTh
              ? `ในกราฟนี้มีคะแนนตัวอย่างที่สร้างขึ้น ${data.distribution.synthetic_sample_size} รายการ ไม่ใช่คนจริงทั้งหมด`
              : `${data.distribution.synthetic_sample_size} of the scores drawn here are placeholders, not real people.`}</p>
          )}
          {data.views?.length > 0 && (
            <ul className="assessment-views">
              {data.views.map((item) => (
                <li key={item.key}>
                  <span>{viewName(item.key, isTh)}</span>
                  <strong>{item.score}</strong>
                  <small>{isTh ? `จาก ${item.metric_count} ค่า` : `${item.metric_count} measurements`}</small>
                </li>
              ))}
            </ul>
          )}
          {data.coverage?.scored_metrics != null && (
            <p className="assessment-coverage">{isTh
              ? `ให้คะแนนได้ ${data.coverage.scored_metrics} ค่า จากทั้งหมด ${data.coverage.available_reference_metrics} ค่าที่มีค่าอ้างอิงตีพิมพ์`
              : `${data.coverage.scored_metrics} of ${data.coverage.available_reference_metrics} measurements have a published reference to score against.`}</p>
          )}
        </section>

        {meshViews.length > 0 && <MeshPanel scanId={scanId} views={meshViews} isTh={isTh} />}

        <section className="assessment-card">
          <h2>{isTh ? 'ใกล้ค่าอ้างอิง' : 'Close to the reference'}</h2>
          {strengths.length
            ? <ul className="assessment-findings">{strengths.map((item) => <Finding key={item.key} item={item} isTh={isTh} />)}</ul>
            : <p className="assessment-empty">{isTh ? 'ยังไม่มีค่าที่อยู่ในช่วงปกติ' : 'Nothing sits inside the typical range yet.'}</p>}
        </section>

        <section className="assessment-card">
          <h2>{isTh ? 'ต่างจากค่าอ้างอิง' : 'Away from the reference'}</h2>
          {improvements.length
            ? <ul className="assessment-findings">{improvements.map((item) => <Finding key={item.key} item={item} isTh={isTh} />)}</ul>
            : <p className="assessment-empty">{isTh ? 'ทุกค่าอยู่ในช่วงปกติ' : 'Every measurement sits inside the typical range.'}</p>}
          {data.locked_findings?.length > 0 && (
            <p className="assessment-warning">{isTh
              ? `อีก ${data.locked_findings.length} รายการดูได้เมื่อมีสิทธิ์`
              : `${data.locked_findings.length} more are available with an entitlement.`}
              <button onClick={() => onNavigate('pricing')}><Ticket size={14} />{isTh ? 'ดูแพ็กเกจ' : 'See plans'}</button>
            </p>
          )}
        </section>

        {data.unnamed?.length > 0 && (
          <section className="assessment-card">
            <h2>{isTh ? 'วัดได้แต่ยังไม่มีชื่อเรียก' : 'Measured but not yet named'}</h2>
            {/* Reported rather than dropped: a measurement added to the scorer without a
                catalogue entry should show up as a gap, not vanish from the summary. */}
            <p className="assessment-empty">{data.unnamed.join(', ')}</p>
          </section>
        )}
      </main>
    </div>
  );
}
