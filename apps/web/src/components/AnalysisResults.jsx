import React from 'react';
import { ArrowLeft, BookOpen, Lock, ScanFace, Sparkles } from 'lucide-react';
import AnalysisMetricsPanel from './AnalysisMetricsPanel';

// Lifted out of FacialAnalysisView, whose capture flow was replaced by the ported ScanPage.
// The fallback now points at an asset that still exists — the old upgrade-assets/ portrait went
// out with the components that were its only other consumer.
const FALLBACK_FACE_IMAGE = '/assets/sample-face-front.png';

const SCORE_LABELS = {
  proportions: ['สัดส่วนรวม', 'Proportions'], eyes: ['ดวงตา', 'Eyes'], nose: ['จมูก', 'Nose'],
  lips: ['ริมฝีปาก', 'Lips'], chin: ['คาง', 'Chin'],
};

export function AnalysisResults({ result, imageUrl, lang, onBack, onSimulation, onScanNew }) {
  const isTh = lang === 'th';
  const scores = result.analysis_data?.reference_scores;
  const minor = result.age_band === 'minor';
  return <div className="analysis-results-page">
    <header className={`analysis-results-header${onBack ? '' : ' is-dashboard'}`}>
      {onBack && <button onClick={onBack} aria-label={isTh ? 'กลับ' : 'Back'}><ArrowLeft /></button>}
      <div><span><Sparkles /> THAI REFERENCE ANALYSIS</span><h1>{isTh ? 'ผลวิเคราะห์สัดส่วนใบหน้า' : 'Facial proportion analysis'}</h1><p>{isTh ? 'ดัชนีความใกล้ค่าอ้างอิง ไม่ใช่คะแนนความสวย' : 'Reference similarity, not a beauty score.'}</p></div>
      {!minor && <div className="analysis-overall"><strong>{scores?.overall_score ?? '—'}</strong><span>/100</span><small>{isTh ? 'ใกล้ค่าอ้างอิงไทย' : 'Thai reference similarity'}</small></div>}
    </header>
    <main className="analysis-results-layout">
      {/* The portrait and the measurement tables are one unit: tapping a row lights up the span it was
          measured from, so they cannot be separate components. */}
      <AnalysisMetricsPanel result={result} imageUrl={imageUrl || FALLBACK_FACE_IMAGE} lang={lang} />
      <section className="analysis-score-card">
        {minor ? <div className="analysis-minor-note"><Lock /><h2>{isTh ? 'โหมดผู้เยาว์' : 'Minor mode'}</h2><p>{isTh ? 'แสดงค่าการวัดพื้นฐานโดยไม่เทียบคะแนนผู้ใหญ่ และไม่มีการจำลองภาพ' : 'Basic measurements are shown without adult reference scores or simulation.'}</p></div> : <>
          {/* Read from the payload rather than hardcoded, so the page cannot claim a cohort the score
              was not computed against. */}
          <div className="analysis-reference-line"><div><span>{isTh ? 'ฐานอ้างอิง' : 'Reference'}</span><strong>{result.reference_profile}</strong></div><div><span>{isTh ? 'ประชากรอ้างอิง' : 'Reference population'}</span><strong>{result.reference_population || 'TH'}</strong></div><div><span>{isTh ? 'กลุ่มอายุงานวิจัย' : 'Research cohort'}</span><strong>{scores?.reference?.age_range || '—'}</strong></div><div><span>{isTh ? 'ขนาดกลุ่มตัวอย่าง' : 'Sample size'}</span><strong>{scores?.reference?.sample_size ?? '—'}</strong></div></div>
          {scores?.cohort_match === 'outside_reference_age_range' && <p className="analysis-cohort-warning">{isTh ? 'คุณอยู่นอกช่วงอายุของกลุ่มอ้างอิง จึงควรตีความคะแนนอย่างจำกัด' : 'You are outside the reference cohort age range; interpret with caution.'}</p>}
          {scores?.population_match === 'outside_reference_population' && <p className="analysis-cohort-warning">{isTh ? 'ค่าอ้างอิงมาจากประชากรไทย คะแนนของคุณไม่ได้ถูกปรับตามประเทศที่เลือก' : 'The reference values are Thai; your score is not adjusted for the country you selected.'}</p>}
          <h2>{isTh ? 'คะแนนรายหมวด' : 'Category scores'}</h2>
          <div className="analysis-category-grid">{scores?.categories?.map((category) => <article key={category.key}><div><span>{SCORE_LABELS[category.key]?.[isTh ? 0 : 1] || category.key}</span><strong>{category.score}</strong></div><div><i style={{ width: `${category.score}%` }} /></div><small>{category.metric_count} {isTh ? 'ตัววัด' : 'metrics'}</small></article>)}</div>
          <div className="analysis-unsupported"><strong>{isTh ? 'หมวดที่ยังไม่มีข้อมูลอ้างอิงไทย' : 'No Thai reference data yet'}</strong><p>{scores?.unsupported_categories?.join(' · ')}</p></div>
          <div className="analysis-scan-meta"><span>{isTh ? 'สแกนเมื่อ' : 'Scanned'}: {new Date(result.created_at).toLocaleString(isTh ? 'th-TH' : 'en-US')}</span><span>{isTh ? 'เก็บถึง' : 'Retained until'}: {new Date(result.expires_at).toLocaleDateString(isTh ? 'th-TH' : 'en-US')}</span></div>
          <button className="analysis-simulation-cta" onClick={onSimulation}><ScanFace />{isTh ? 'จำลองหัตถการจากผลสแกนนี้' : 'Simulate from this scan'}</button>
          {onScanNew && <button className="analysis-rescan-cta" onClick={onScanNew}>{isTh ? 'สแกนใหม่' : 'New scan'}</button>}
        </>}
      </section>
      <section className="analysis-evidence-card"><BookOpen /><div><h2>{isTh ? 'Golden ratio ไม่ใช่คะแนนความงาม' : 'Golden ratio is not a beauty score'}</h2><p>{isTh ? 'งานทบทวนไม่พบความสัมพันธ์สม่ำเสมอกับความดึงดูด และสัดส่วนแตกต่างตามประชากร จึงไม่รวม Golden ratio ในคะแนนนี้' : 'Reviews find no consistent association with attractiveness, and ratios vary by population, so it is excluded from this score.'}</p><a href="https://pubmed.ncbi.nlm.nih.gov/35738927/" target="_blank" rel="noreferrer">{isTh ? 'อ่านงานทบทวนเชิงระบบ' : 'Read the systematic review'}</a></div></section>
    </main>
  </div>;
}

export default AnalysisResults;
