import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Button, Image, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, auth } from '../lib/backend';

const REGIONS = [['eyes','ดวงตา'],['nose','จมูก'],['lips','ริมฝีปาก'],['cheeks','แก้ม'],['jaw','กราม'],['chin','คาง']] as const;

export default function SimulationScreen() {
  const router = useRouter();
  const { scan_id } = useLocalSearchParams<{ scan_id: string }>();
  const [scan, setScan] = useState<any>();
  const [region, setRegion] = useState('eyes');
  const [presets, setPresets] = useState<any[]>([]);
  const [presetId, setPresetId] = useState('');
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
  useEffect(() => { api.getProcedures(region).then((items: any[]) => { setPresets(items); setPresetId(items[0]?.id || ''); setPreview(undefined); setSaved(undefined); }).catch((cause: Error) => setError(cause.message)); }, [region]);
  const active = presets.find((item) => item.id === presetId);
  // Profile presets depend on the stored side photos, not on the scan mode name.
  const hasProfiles = Boolean(scan?.has_profile_images);
  const blocked = active?.source_view === 'profile' && !hasProfiles;
  const before = saved?.before_url || preview?.before_url;
  const after = saved?.after_url || preview?.after_data_url;

  const generate = async () => {
    setBusy(true); setError('');
    try { setPreview(await api.previewSimulation(scan_id, region, presetId)); }
    catch (cause: any) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      let result: any = await api.createSimulation(scan_id, region, presetId);
      while (!['completed','failed'].includes(result.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = await api.getSimulation(result.id);
      }
      if (result.status === 'failed') throw new Error(result.error_message);
      setSaved(result);
    } catch (cause: any) { setError(cause.message); }
    finally { setBusy(false); }
  };

  if (!scan) return <View style={styles.center}>{error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}</View>;
  return <ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>กลับหน้าวิเคราะห์</Text></Pressable>
    <Text style={styles.kicker}>LOCAL FACIAL SIMULATION</Text><Text style={styles.title}>ทดลองสัดส่วนใบหน้า</Text><Text style={styles.note}>ภาพเพื่อการศึกษา ไม่ใช่ผลลัพธ์ที่ทำนายได้</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{REGIONS.map(([id,label]) => <Pressable key={id} onPress={() => setRegion(id)} style={[styles.tab, region === id && styles.active]}><Text style={region === id && styles.activeText}>{label}</Text></Pressable>)}</ScrollView>
    <View style={styles.modeRow}>{([['before','ก่อนปรับ'],['after','หลังปรับ'],['compare','เปรียบเทียบ']] as const).map(([id,label]) => <Pressable key={id} onPress={() => setMode(id)} style={[styles.mode,mode === id && styles.active]}><Text style={mode === id && styles.activeText}>{label}</Text></Pressable>)}</View>
    <View style={styles.stage} onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)} {...(mode === 'compare' ? pan.panHandlers : {})}>
      {before && mode !== 'after' && <Image source={{ uri: before }} style={styles.fixedImage} resizeMode="cover" />}
      {after && mode !== 'before' && <View style={[styles.afterClip, mode === 'compare' ? { width: `${split}%` } : { width: '100%' }]}><Image source={{ uri: after }} style={[styles.fixedImage,{ width: stageWidth }]} resizeMode="cover" /></View>}
      {!before && <View style={styles.placeholder}><Text style={styles.bold}>เลือกแบบแล้วกดสร้าง Preview</Text><Text style={styles.note}>การเลือกการ์ดยังไม่ใช้สิทธิ์</Text></View>}
      {mode === 'compare' && before && <View pointerEvents="none" style={[styles.divider,{ left: `${split}%` }]}><View style={styles.knob} /></View>}
    </View>
    <View style={styles.grid}>{presets.map((preset,index) => { const profileBlocked = preset.source_view === 'profile' && !hasProfiles; return <Pressable key={preset.id} disabled={profileBlocked} onPress={() => { setPresetId(preset.id); setPreview(undefined); setSaved(undefined); }} style={[styles.card,presetId === preset.id && styles.cardActive,profileBlocked && styles.disabled]}><Text style={styles.number}>0{index+1}</Text><Text style={styles.bold}>{preset.name_th}</Text>{profileBlocked && <Text style={styles.warning}>ต้องมีภาพด้านข้าง</Text>}</Pressable>; })}</View>
    <View style={styles.consent}><Text style={styles.consentText}>ยินยอมให้ประมวลผลภาพเพื่อสร้างภาพจำลองนี้</Text><Switch value={consented} onValueChange={setConsented} /></View>
    <Button title={busy ? 'กำลังประมวลผล…' : 'สร้าง Preview'} disabled={busy || !consented || !presetId || blocked} onPress={generate} />
    <Button title="บันทึกภาพเต็ม · เก็บ 30 วัน" disabled={busy || !preview} onPress={save} />
    {preview?.measurements?.map((item:any) => <View key={item.key} style={styles.measure}><Text>{item.key}</Text><Text style={styles.bold}>{item.before_ratio} → {item.target_ratio} ({item.change_percent}%)</Text></View>)}
    {preview && <View style={styles.info}><Text style={styles.bold}>หัตถการที่อาจเกี่ยวข้อง</Text><Text>{preview.related_procedures.join(' · ')}</Text><Text style={styles.note}>ไม่ใช่คำแนะนำการรักษาหรือการทำนายผลลัพธ์</Text></View>}
    {error && <Text style={styles.error}>{error}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{padding:18,paddingBottom:60,gap:12,backgroundColor:'#f6f5f8'},center:{flex:1,alignItems:'center',justifyContent:'center'},back:{color:'#6549d8',fontWeight:'700'},kicker:{fontSize:11,fontWeight:'800',letterSpacing:1,color:'#7055d8'},title:{fontSize:27,fontWeight:'800',color:'#292337'},note:{fontSize:12,color:'#746d7b'},tabs:{gap:7},tab:{paddingHorizontal:16,paddingVertical:9,borderRadius:12,backgroundColor:'#ebe8f2'},active:{backgroundColor:'#6549d8'},activeText:{color:'#fff',fontWeight:'700'},modeRow:{flexDirection:'row',alignSelf:'flex-end',padding:3,borderRadius:12,backgroundColor:'#ebe8f2'},mode:{paddingHorizontal:12,paddingVertical:7,borderRadius:9},stage:{height:360,borderRadius:22,overflow:'hidden',backgroundColor:'#e7e4ec',position:'relative'},fixedImage:{position:'absolute',left:0,top:0,width:'100%',height:'100%'},afterClip:{position:'absolute',left:0,top:0,bottom:0,overflow:'hidden'},placeholder:{flex:1,alignItems:'center',justifyContent:'center',gap:6},divider:{position:'absolute',top:0,bottom:0,width:2,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},knob:{width:42,height:42,borderRadius:21,borderWidth:3,borderColor:'#7658ef',backgroundColor:'#fff'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{width:'48%',minHeight:82,padding:11,borderRadius:15,borderWidth:1,borderColor:'#e2ddeb',backgroundColor:'#fff'},cardActive:{borderWidth:2,borderColor:'#7658ef',backgroundColor:'#f0ebff'},number:{fontSize:10,fontWeight:'800',color:'#8b8295'},bold:{fontWeight:'700'},warning:{fontSize:11,color:'#9c6b23',marginTop:5},disabled:{opacity:.45},consent:{flexDirection:'row',alignItems:'center',padding:12,borderRadius:14,backgroundColor:'#fff'},consentText:{flex:1},measure:{padding:12,borderRadius:12,backgroundColor:'#f0ebff',gap:4},info:{padding:14,borderRadius:14,backgroundColor:'#fff',gap:7},error:{color:'#b42318'},
});
