import React, { useEffect, useState } from 'react';
import { Calendar, History, RefreshCw, Trash2 } from 'lucide-react';

import { deleteScan, getScans } from '../lib/api';


export default function HistoryView({ lang, onNavigate }) {
  const isTh = lang === 'th';
  const [scans, setScans] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getScans().then(setScans).catch((loadError) => setError(loadError.message)).finally(() => setLoading(false));
  }, []);

  const remove = async (scanId) => {
    if (!window.confirm(isTh ? 'ลบผลวิเคราะห์และข้อมูลที่เกี่ยวข้องถาวรหรือไม่?' : 'Permanently delete this analysis and its related data?')) return;
    try {
      await deleteScan(scanId);
      setScans((current) => current.filter((scan) => scan.id !== scanId));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <div className="history-workspace-grid history-view" style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 20 }}>
      <section className="history-card history-list-card" style={{ background: '#fff', border: '1px solid #d2d2d7', borderRadius: 24, padding: 20 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={20} color="#0066cc" />{isTh ? 'ประวัติการวิเคราะห์' : 'Analysis history'}</h2>
        <p>{isTh ? 'แสดงเฉพาะบัญชีผู้ใหญ่ ไม่มีคะแนนความสวย และภาพต้นฉบับจะถูกลบภายใน 30 วัน' : 'Adult accounts only. No beauty scores. Source images are deleted within 30 days.'}</p>
        {loading && <p><RefreshCw size={16} /> {isTh ? 'กำลังโหลด…' : 'Loading…'}</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && scans.length === 0 && <button type="button" className="btn-brand-primary" onClick={() => onNavigate('face-scan')}>{isTh ? 'เริ่มวิเคราะห์ครั้งแรก' : 'Start your first analysis'}</button>}
        <div style={{ display: 'grid', gap: 12 }}>
          {scans.map((scan) => (
            <article key={scan.id} style={{ border: '1px solid #d2d2d7', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span><strong>{isTh ? 'ผลวิเคราะห์' : 'Analysis'} #{scan.id} · {scan.status}</strong><small style={{ display: 'block' }}><Calendar size={12} /> {new Date(scan.created_at).toLocaleString(isTh ? 'th-TH' : 'en-US')} · {scan.analysis_data?.metrics?.length || 0} {isTh ? 'ค่า' : 'metrics'}</small></span>
              <button type="button" onClick={() => remove(scan.id)} aria-label={isTh ? 'ลบผลวิเคราะห์' : 'Delete analysis'}><Trash2 size={17} /></button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
