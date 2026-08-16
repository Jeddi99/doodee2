import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ScanFace } from 'lucide-react';

import { getScans } from '../lib/api';
import { AnalysisResults } from './AnalysisResults';

export default function AnalysisDashboard({ lang = 'th', onNavigate }) {
  const isTh = lang === 'th';
  const scans = useQuery({
    queryKey: ['scans'],
    queryFn: getScans,
    refetchInterval: (query) => ['queued', 'processing'].includes(query.state.data?.[0]?.status) ? 1500 : false,
  });
  const latest = scans.data?.[0];
  const expired = latest && new Date(latest.expires_at) <= new Date();

  if (scans.isPending) return <div className="analysis-dashboard-state"><Activity className="capture-spin" /><h1>{isTh ? 'กำลังเปิดผลวิเคราะห์…' : 'Opening your analysis…'}</h1></div>;
  if (scans.error) return <div className="analysis-dashboard-state"><AlertTriangle /><h1>{isTh ? 'เปิดผลวิเคราะห์ไม่ได้' : 'Could not open analysis'}</h1><p>{scans.error.message}</p><button onClick={() => scans.refetch()}>{isTh ? 'ลองอีกครั้ง' : 'Try again'}</button></div>;
  if (!latest || expired || latest.status === 'failed') return <div className="analysis-dashboard-state"><ScanFace /><h1>{isTh ? (latest?.status === 'failed' ? 'ผลสแกนล่าสุดไม่สำเร็จ' : expired ? 'ผลสแกนหมดอายุแล้ว' : 'เริ่มวิเคราะห์ใบหน้าครั้งแรก') : (latest?.status === 'failed' ? 'Latest scan failed' : expired ? 'Your scan has expired' : 'Start your first face analysis')}</h1><p>{isTh ? 'ถ่ายภาพตามคำแนะนำเพื่อรับคะแนนสัดส่วนอ้างอิงและใช้ภาพเดียวกันในการจำลอง' : 'Follow the capture guide for reference scores and reuse the same scan for simulation.'}</p><button onClick={() => onNavigate('onboarding')}>{isTh ? 'เริ่มสแกนใบหน้า' : 'Start face scan'}</button></div>;
  if (['queued', 'processing'].includes(latest.status)) return <div className="analysis-dashboard-state"><Activity className="capture-spin" /><h1>{isTh ? 'กำลังวิเคราะห์ใบหน้า' : 'Analyzing your face'}</h1><p>{latest.progress}%</p></div>;

  return <AnalysisResults
    result={latest}
    imageUrl={latest.front_url}
    lang={lang}
    onSimulation={() => onNavigate('simulation', { scanId: latest.id })}
    onScanNew={() => onNavigate('onboarding')}
  />;
}
