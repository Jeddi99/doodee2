import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, BarChart3, Clock3, History, RefreshCw, ScanFace, ShieldCheck, WandSparkles } from 'lucide-react';

import { getScans, getSession } from '../lib/api';
import { homeScanState } from '../lib/homeState';

const STATUS_TEXT = {
  queued: ['อยู่ในคิว', 'Queued'], processing: ['กำลังประมวลผล', 'Processing'],
  completed: ['พร้อมใช้งาน', 'Ready'], failed: ['ไม่สำเร็จ', 'Failed'],
};

export default function HomeView({ lang = 'th', onNavigate }) {
  const isTh = lang === 'th';
  const scans = useQuery({
    queryKey: ['scans'],
    queryFn: getScans,
    refetchInterval: (query) => ['queued', 'processing'].includes(query.state.data?.[0]?.status) ? 1500 : false,
  });
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  const items = scans.data || [];
  const latest = items[0];
  const state = homeScanState(latest);
  const score = latest?.analysis_data?.reference_scores?.overall_score;
  const previewRemaining = !session.data ? '—' : session.data.plan === 'free' ? session.data.preview_remaining : '∞';

  if (scans.isPending) return <div className="home-loading"><Activity className="capture-spin" /><span>{isTh ? 'กำลังเปิดหน้าหลัก…' : 'Opening home…'}</span></div>;
  if (scans.error) return <div className="home-loading"><RefreshCw /><h1>{isTh ? 'เปิดหน้าหลักไม่ได้' : 'Could not open home'}</h1><p>{scans.error.message}</p><button onClick={() => scans.refetch()}>{isTh ? 'ลองอีกครั้ง' : 'Try again'}</button></div>;

  return <div className="home-page">
    <header className="home-header">
      <div><h1>{isTh ? 'หน้าหลัก' : 'Home'}</h1><p>{isTh ? 'ดูสถานะล่าสุดและเลือกสิ่งที่ต้องการทำต่อ' : 'See your latest status and choose what to do next.'}</p></div>
      <span>{session.data?.email || ''}</span>
    </header>

    <main className="home-layout">
      <section className={`home-primary is-${state}`}>
        {state === 'completed' ? <>
          <div className="home-result-copy"><span>{isTh ? 'ผลวิเคราะห์ล่าสุด' : 'Latest analysis'}</span><h2>{isTh ? 'ผลสแกนพร้อมสำหรับวิเคราะห์และจำลอง' : 'Your scan is ready to analyze and simulate'}</h2><p>{isTh ? 'คะแนนนี้บอกความใกล้ค่าอ้างอิงไทย ไม่ใช่คะแนนความสวย' : 'This is similarity to a Thai reference, not a beauty score.'}</p><div className="home-actions"><button onClick={() => onNavigate('analysis')}><BarChart3 />{isTh ? 'ดูคะแนนทั้งหมด' : 'View all scores'}</button><button className="is-secondary" onClick={() => onNavigate('simulation', { scanId: latest.id })}><WandSparkles />{isTh ? 'จำลองหัตถการ' : 'Simulate procedures'}</button></div></div>
          <div className="home-score"><strong>{score ?? '—'}</strong><span>/100</span><small>{isTh ? 'ใกล้ค่าอ้างอิงไทย' : 'Thai reference similarity'}</small></div>
          {latest.front_url ? <img src={latest.front_url} alt={isTh ? 'ภาพสแกนล่าสุด' : 'Latest scan'} /> : null}
        </> : state === 'processing' ? <>
          <Activity className="capture-spin" /><div><span>{isTh ? 'ผลสแกนล่าสุด' : 'Latest scan'}</span><h2>{isTh ? 'กำลังวิเคราะห์ใบหน้า' : 'Analyzing your face'}</h2><p>{isTh ? 'ออกจากหน้านี้ได้ ระบบจะประมวลผลต่อให้เอง' : 'You can leave this page while processing continues.'}</p><div className="home-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={latest.progress}><i style={{ width: `${latest.progress}%` }} /></div><strong>{latest.progress}%</strong><button onClick={() => onNavigate('analysis')}>{isTh ? 'ดูสถานะ' : 'View status'}<ArrowRight /></button></div>
        </> : <>
          <ScanFace /><div><h2>{isTh ? (state === 'failed' ? 'ผลสแกนล่าสุดไม่สำเร็จ' : state === 'expired' ? 'ผลสแกนหมดอายุแล้ว' : 'เริ่มจากการสแกนใบหน้า') : (state === 'failed' ? 'Your latest scan failed' : state === 'expired' ? 'Your scan has expired' : 'Start with a face scan')}</h2><p>{isTh ? 'ใช้ภาพชุดเดียวเพื่อรับคะแนนสัดส่วนและสร้างภาพจำลองภายหลัง' : 'Use one scan for proportion scores and later simulations.'}</p><button onClick={() => onNavigate('onboarding')}>{isTh ? 'เริ่มสแกนใบหน้า' : 'Start face scan'}<ArrowRight /></button></div>
        </>}
      </section>

      <aside className="home-usage" aria-label={isTh ? 'สิทธิ์คงเหลือ' : 'Remaining allowance'}>
        <div><WandSparkles /><span>{isTh ? 'Preview คงเหลือเดือนนี้' : 'Previews left this month'}</span><strong>{previewRemaining ?? '—'}</strong></div>
        <div><ShieldCheck /><span>{isTh ? 'บันทึกภาพคงเหลือ' : 'Saved images left'}</span><strong>{session.data?.saved_remaining ?? '—'}</strong></div>
        <small>{isTh ? 'การเลือก preset ยังไม่ใช้สิทธิ์ ระบบนับเมื่อสร้าง Preview' : 'Selecting a preset does not use quota; generating a preview does.'}</small>
      </aside>

      <section className="home-history">
        <header><div><History /><h2>{isTh ? 'กิจกรรมล่าสุด' : 'Recent activity'}</h2></div><button onClick={() => onNavigate('history')}>{isTh ? 'ดูทั้งหมด' : 'View all'}<ArrowRight /></button></header>
        {items.length ? <div>{items.slice(0, 3).map((scan, index) => <article key={scan.id}><Clock3 /><div><strong>{isTh ? `ผลวิเคราะห์ ${index === 0 ? 'ล่าสุด' : ''}` : `${index === 0 ? 'Latest ' : ''}analysis`}</strong><span>{new Date(scan.created_at).toLocaleString(isTh ? 'th-TH' : 'en-US')}</span></div><b className={`is-${scan.status}`}>{STATUS_TEXT[scan.status]?.[isTh ? 0 : 1] || scan.status}</b>{scan.status === 'completed' ? <button aria-label={isTh ? 'เปิดผลวิเคราะห์' : 'Open analysis'} onClick={() => onNavigate(index === 0 ? 'analysis' : 'face-scan', index === 0 ? {} : { scanId: scan.id })}><ArrowRight /></button> : null}</article>)}</div> : <p>{isTh ? 'ยังไม่มีกิจกรรม เริ่มสแกนเพื่อสร้างผลวิเคราะห์แรก' : 'No activity yet. Start a scan to create your first analysis.'}</p>}
      </section>

      <footer className="home-disclaimer"><ShieldCheck /><p>{isTh ? 'Doodee ใช้ภาพ 2D เพื่อการสื่อสารเชิงการศึกษาเท่านั้น ไม่ใช่การวินิจฉัย แผนรักษา หรือการทำนายผลลัพธ์ ภาพผู้ใหญ่และผลจำลองลบภายใน 30 วัน' : 'Doodee uses 2D imagery for educational communication only—not diagnosis, treatment planning, or outcome prediction. Adult scans and simulations are deleted within 30 days.'}</p></footer>
    </main>
  </div>;
}
