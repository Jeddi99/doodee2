import { useEffect, useMemo, useRef, useState } from 'react';
import { describeVisibility, pollUntilSettled } from '@doodee/shared';
import { ActivityIndicator, Button, Image, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, auth } from '../lib/backend';
import { colors } from '../theme';

// The three photographs the fused model is built from, which are also the three it renders.
// Both profiles are real renders, not one "side": the face is not symmetric.
const ANGLES = [['front', 'หน้าตรง'], ['left_profile', 'ด้านซ้าย'], ['right_profile', 'ด้านขวา']] as const;
const angleName = (id: string) => ANGLES.find(([key]) => key === id)?.[1] ?? id;

export default function SimulationScreen() {
  const router = useRouter();
  const { scan_id } = useLocalSearchParams<{ scan_id: string }>();
  const [scan, setScan] = useState<any>();
  const [headings, setHeadings] = useState<any[]>([]);
  const [category, setCategory] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [procedureId, setProcedureId] = useState('');
  const [level, setLevel] = useState(3);
  const [view, setView] = useState('front');
  const [consented, setConsented] = useState(false);
  const [preview, setPreview] = useState<any>();
  const [saved, setSaved] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'before'|'after'|'compare'>('compare');
  const [split, setSplit] = useState(50);
  const [stageWidth, setStageWidth] = useState(320);
  const widthRef = useRef(stageWidth);
  useEffect(() => { widthRef.current = stageWidth; }, [stageWidth]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => setSplit(Math.max(0, Math.min(100, event.nativeEvent.locationX / widthRef.current * 100))),
    onPanResponderMove: (event) => setSplit(Math.max(0, Math.min(100, event.nativeEvent.locationX / widthRef.current * 100))),
  }), []);

  useEffect(() => { if (scan_id && auth.currentUser) api.getScan(scan_id).then(setScan).catch((cause: Error) => setError(cause.message)); }, [scan_id]);
  // The whole catalog and the headings, once. Fetching per tab would re-request 72 rows every
  // time a thumb slides across the strip, and the rows are the same rows either way.
  useEffect(() => {
    Promise.all([api.getProcedures(), api.getProcedureCategories()])
      .then(([rows, groups]: [any[], any[]]) => {
        setCatalog(rows);
        setHeadings(groups);
        setCategory((current) => current ?? groups[0]?.id ?? null);
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const visible = catalog.filter((row) => row.category_id === category);
  const active = catalog.find((row) => row.id === procedureId);
  // A catalog procedure is a pipeline the fused engine runs across all three photographs, so a
  // scan without the profiles cannot render one at all — the server refuses it with
  // `canonical_required`. Said here so it is not discovered by tapping.
  const hasProfiles = Boolean(scan?.has_profile_images);
  const before = saved?.before_url || preview?.before_url;
  const after = saved?.after_url || preview?.after_url || preview?.after_data_url;
  const visibility = describeVisibility(preview?.visibility, view);
  const levels = active?.intensity_levels;

  const reset = () => { setPreview(undefined); setSaved(undefined); };

  const generate = async () => {
    setBusy(true); setError('');
    try {
      const created: any = await api.previewSimulation(scan_id, [{ procedure_id: procedureId, intensity_level: level }], view);
      setPreview(created.already_near_reference ? created : await pollUntilSettled(created, () => api.getSimulation(created.id)));
    }
    catch (cause: any) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const created: any = await api.createSimulation(scan_id, [{ procedure_id: procedureId, intensity_level: level }], view);
      // Same shared schedule as the scan poll, and the same ceiling: a job that never settles
      // now raises PollTimeout into the catch below instead of spinning until force-quit.
      const result: any = await pollUntilSettled(created, () => api.getSimulation(created.id));
      if (result.status === 'failed') throw new Error(result.error_message);
      setSaved(result);
    } catch (cause: any) { setError(cause.message); }
    finally { setBusy(false); }
  };

  if (!scan) return <View style={styles.center}>{error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}</View>;
  return <ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>กลับหน้าวิเคราะห์</Text></Pressable>
    <Text style={styles.kicker}>LOCAL FACIAL SIMULATION</Text><Text style={styles.title}>ทดลองสัดส่วนใบหน้า</Text><Text style={styles.note}>ภาพเพื่อการศึกษา ไม่ใช่ผลลัพธ์ที่ทำนายได้</Text>
    {!hasProfiles && <View style={styles.warningBox}><Text style={styles.warning}>การจำลองหัตถการสร้างจากภาพทั้งสามมุมรวมกัน สแกนนี้ไม่มีภาพด้านข้าง จึงจำลองไม่ได้ ต้องสแกนแบบมาตรฐานใหม่</Text></View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{headings.map((heading) => <Pressable key={heading.id} onPress={() => setCategory(heading.id)} style={[styles.tab, category === heading.id && styles.active]}><Text style={category === heading.id && styles.activeText}>{heading.name_th}</Text></Pressable>)}</ScrollView>
    <View style={styles.modeRow}>{([['before','ก่อนปรับ'],['after','หลังปรับ'],['compare','เปรียบเทียบ']] as const).map(([id,label]) => <Pressable key={id} onPress={() => setMode(id)} style={[styles.mode,mode === id && styles.active]}><Text style={mode === id && styles.activeText}>{label}</Text></Pressable>)}</View>
    <View style={styles.stage} onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)} {...(mode === 'compare' ? pan.panHandlers : {})}>
      {before && mode !== 'after' && <Image source={{ uri: before }} style={styles.fixedImage} resizeMode="cover" />}
      {after && mode !== 'before' && <View style={[styles.afterClip, mode === 'compare' ? { width: `${split}%` } : { width: '100%' }]}><Image source={{ uri: after }} style={[styles.fixedImage,{ width: stageWidth }]} resizeMode="cover" /></View>}
      {!before && <View style={styles.placeholder}><Text style={styles.bold}>เลือกหัตถการแล้วกดสร้าง Preview</Text><Text style={styles.note}>การเลือกการ์ดยังไม่ใช้สิทธิ์</Text></View>}
      {mode === 'compare' && before && <View pointerEvents="none" style={[styles.divider,{ left: `${split}%` }]}><View style={styles.knob} /></View>}
    </View>
    {/* Which of the three renders to ask for. The engine draws all of them; this picks the one
        that comes back, and a projection change is only visible from the side. */}
    <View style={styles.modeRow}>{ANGLES.map(([id,label]) => <Pressable key={id} disabled={!hasProfiles && id !== 'front'} onPress={() => { setView(id); reset(); }} style={[styles.mode, view === id && styles.active, !hasProfiles && id !== 'front' && styles.disabled]}><Text style={view === id && styles.activeText}>{label}</Text></Pressable>)}</View>
    {/* A correct render nobody can see must say so, rather than the catalog's strengths being
        raised until every row looks like it did something. */}
    {preview && visibility.level === 'elsewhere' && <View style={styles.warningBox}><Text style={styles.warning}>มุมนี้แทบไม่ต่างเลย — หัตถการนี้เห็นได้ที่มุม{angleName(visibility.elsewhere!)} ลองสลับไปดู</Text></View>}
    {preview && visibility.level === 'faint' && <View style={styles.warningBox}>
      <Text style={styles.warning}>{visibility.percent! < 0.01 ? 'ภาพนี้แทบไม่ต่างเลย' : `ภาพนี้ต่างจากเดิม ${visibility.percent}% ของพื้นที่ภาพ`} ซึ่งน้อยจนแทบมองไม่ออก — ไม่ใช่ข้อผิดพลาด แต่แปลว่าบนใบหน้าของคุณ หัตถการนี้ทำให้เปลี่ยนไปน้อยมาก</Text>
      {levels && level < 5 && <Pressable onPress={() => { setLevel(5); reset(); }}><Text style={styles.link}>ลองระดับแรงสุด</Text></Pressable>}
    </View>}
    <View style={styles.grid}>{visible.map((row,index) => <Pressable key={row.id} disabled={!hasProfiles} onPress={() => { setProcedureId(row.id); setLevel(3); reset(); }} style={[styles.card,procedureId === row.id && styles.cardActive,!hasProfiles && styles.disabled]}><Text style={styles.number}>{String(index+1).padStart(2,'0')}</Text><Text style={styles.bold}>{row.name_th}</Text>{row.technique ? <Text style={styles.chip}>{row.technique}</Text> : null}</Pressable>)}</View>
    {/* Only the rows the catalog marks `variable`. A level on a fixed procedure would be a
        choice that changes nothing. */}
    {levels && <View style={styles.levelRow}><Text style={styles.levelLabel}>ระดับ</Text>{levels.map((item:any) => <Pressable key={item.level} onPress={() => { setLevel(item.level); reset(); }} style={[styles.level, level === item.level && styles.active]}><Text style={level === item.level && styles.activeText}>{item.level}</Text></Pressable>)}</View>}
    <View style={styles.consent}><Text style={styles.consentText}>ยินยอมให้ประมวลผลภาพเพื่อสร้างภาพจำลองนี้</Text><Switch value={consented} onValueChange={setConsented} /></View>
    <Button title={busy ? 'กำลังประมวลผล…' : 'สร้าง Preview'} disabled={busy || !consented || !procedureId || !hasProfiles} onPress={generate} />
    <Button title={`บันทึกภาพมุม${angleName(view)} · เก็บ 30 วัน`} disabled={busy || !preview} onPress={save} />
    {/* The fused engine answers with a treatment record, not a ratio: what was done, how much,
        how far it moves tissue, and whether a study measured that or it was derived from one. */}
    {preview?.measurements?.map((item:any) => <View key={item.key} style={styles.measure}><Text>{item.procedure || item.key}</Text><Text style={styles.bold}>{item.dose} {item.unit} · {item.mmShown ?? item.mm} มม.</Text><Text style={styles.note}>{item.statusLabel}</Text>{item.sourceTitle ? <Text style={styles.note}>{item.sourceTitle}</Text> : null}</View>)}
    {/* A picture with no numbers beside it looks like numbers that failed to load. */}
    {preview && preview.measurements?.length === 0 && <Text style={styles.note}>หัตถการนี้ทำงานกับพื้นผิวและสีผิว ยังไม่มีงานวิจัยที่ระบุปริมาณหรือระยะเป็นมิลลิเมตรไว้ จึงไม่มีบรรทัดตัวเลขกำกับภาพนี้</Text>}
    {preview?.related_procedures?.length > 0 && <View style={styles.info}><Text style={styles.bold}>หัตถการที่อยู่ในภาพนี้</Text><Text>{preview.related_procedures.join(' · ')}</Text><Text style={styles.note}>ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์</Text></View>}
    {error && <Text style={styles.error}>{error}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{padding:18,paddingBottom:60,gap:12,backgroundColor:colors.ice},center:{flex:1,alignItems:'center',justifyContent:'center'},back:{color:colors.blueStrong,fontWeight:'700'},kicker:{fontSize:11,fontWeight:'800',letterSpacing:1,color:colors.blueStrong},title:{fontSize:27,fontWeight:'800',color:colors.ink},note:{fontSize:12,color:colors.muted},tabs:{gap:7},tab:{paddingHorizontal:16,paddingVertical:9,borderRadius:12,backgroundColor:colors.iceStrong},active:{backgroundColor:colors.blueStrong},activeText:{color:colors.canvas,fontWeight:'700'},modeRow:{flexDirection:'row',alignSelf:'flex-end',padding:3,borderRadius:12,backgroundColor:colors.iceStrong},mode:{paddingHorizontal:12,paddingVertical:7,borderRadius:9},stage:{height:360,borderRadius:22,overflow:'hidden',backgroundColor:colors.line,position:'relative'},fixedImage:{position:'absolute',left:0,top:0,width:'100%',height:'100%'},afterClip:{position:'absolute',left:0,top:0,bottom:0,overflow:'hidden'},placeholder:{flex:1,alignItems:'center',justifyContent:'center',gap:6},divider:{position:'absolute',top:0,bottom:0,width:2,backgroundColor:colors.canvas,alignItems:'center',justifyContent:'center'},knob:{width:42,height:42,borderRadius:21,borderWidth:3,borderColor:colors.blue,backgroundColor:colors.canvas},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{width:'48%',minHeight:82,padding:11,borderRadius:15,borderWidth:1,borderColor:colors.line,backgroundColor:colors.canvas},cardActive:{borderWidth:2,borderColor:colors.blue,backgroundColor:colors.blueSoft},number:{fontSize:10,fontWeight:'800',color:colors.muted},bold:{fontWeight:'700'},chip:{fontSize:11,color:colors.muted,marginTop:4},warning:{fontSize:12,color:colors.warning},warningBox:{padding:11,borderRadius:12,backgroundColor:colors.canvas,gap:6},link:{color:colors.blueStrong,fontWeight:'700'},levelRow:{flexDirection:'row',alignItems:'center',gap:6},levelLabel:{fontSize:12,color:colors.muted,marginRight:4},level:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:colors.iceStrong},disabled:{opacity:.45},consent:{flexDirection:'row',alignItems:'center',padding:12,borderRadius:14,backgroundColor:colors.canvas},consentText:{flex:1},measure:{padding:12,borderRadius:12,backgroundColor:colors.blueSoft,gap:4},info:{padding:14,borderRadius:14,backgroundColor:colors.canvas,gap:7},error:{color:colors.danger},
});
