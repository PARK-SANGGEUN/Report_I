import { useState, useRef, useEffect, useCallback } from "react";
import { buildPhase1Prompt, buildPhase2Prompt } from "./criteria.js";
import { parseStudentRecord } from "./parser.js";
import { diagnoseUnivFit, SUPPORTED_UNIVS } from "./univCriteria.js";
import "./App.css";

const UNIVS = ["강원대학교","건국대학교","경기대학교","경북대학교","경희대학교","고려대학교","광운대학교","국민대학교","단국대학교","덕성여자대학교","동국대학교","부산대학교","서강대학교","서울과학기술대학교","서울대학교","서울시립대학교","성균관대학교","세종대학교","숙명여자대학교","숭실대학교","아주대학교","연세대학교","이화여자대학교","인하대학교","중앙대학교","한국외국어대학교","한양대학교","홍익대학교"];
const COMP=[{k:"academic",n:"학업역량",max:40,c:"#4c6ef5"},{k:"inquiry",n:"탐구역량",max:25,c:"#0c8599"},{k:"career",n:"진로역량",max:15,c:"#d97706"},{k:"community",n:"공동체역량",max:10,c:"#6741d9"},{k:"growth",n:"성장역량",max:10,c:"#2b8a3e"}];
const GC={S:"#2b8a3e",A:"#1971c2",B:"#d97706",C:"#c92a2a",D:"#868e96"};
const GL={S:"최우수",A:"우수",B:"양호",C:"보통",D:"미흡"};
const TC=["#4c6ef5","#0c8599","#d97706","#6741d9","#c92a2a","#2b8a3e"];
const NAV=[
  {g:"성적·이수",items:[{id:"s1",ico:"📊",lbl:"교과 성적"},{id:"s2",ico:"📋",lbl:"이수 현황"}]},
  {g:"활동 분석",items:[{id:"s3",ico:"✦",lbl:"강점·보완점"},{id:"s4",ico:"📅",lbl:"활동 타임라인"},{id:"s5",ico:"🔑",lbl:"키워드 분석"}]},
  {g:"역량 분석",items:[{id:"s6",ico:"⚡",lbl:"역량 채점"}]},
  {g:"입시 진단",items:[{id:"s8",ico:"🏫",lbl:"대학 진단"},{id:"s9",ico:"🎓",lbl:"학과 적합도"}]},
  {g:"리포트",items:[{id:"s10",ico:"💡",lbl:"탐구 주제"},{id:"s11",ico:"🎤",lbl:"면접 질문"},{id:"s12",ico:"📄",lbl:"종합 리포트"}]},
];

// 그래프 탭 정의 (교과 성적 화면 내부 탭)
const GRAPH_TABS = [
  {id:"all", lbl:"전체 교과", filter:null, group:"종합"},
  {id:"kme", lbl:"국·영·수", filter:["국어","영어","수학"], group:"종합"},
  {id:"kmes", lbl:"국·영·수·사", filter:["국어","영어","수학","사회"], group:"종합"},
  {id:"kmesi", lbl:"국·영·수·과", filter:["국어","영어","수학","과학"], group:"종합"},
  {id:"major", lbl:"전공 연계", filter:"_major_", group:"종합"},
  // 교과별 (특정 교과 추이)
  {id:"subj_kor", lbl:"국어만", filter:["국어"], group:"교과별"},
  {id:"subj_math", lbl:"수학만", filter:["수학"], group:"교과별"},
  {id:"subj_eng", lbl:"영어만", filter:["영어"], group:"교과별"},
  {id:"subj_soc", lbl:"사회만", filter:["사회"], group:"교과별"},
  {id:"subj_sci", lbl:"과학만", filter:["과학"], group:"교과별"},
];

// 희망 전공에 따른 연계 교과군 자동 매핑
function getMajorRelatedGroups(major) {
  const m = String(major||'').toLowerCase();
  if (/공학|컴퓨터|전기|전자|기계|화공|신소재|반도체|로봇|항공|건축|토목|산업/.test(m)) return ["수학","과학"];
  if (/의학|약학|간호|보건|생명|의예|치의|한의|약/.test(m)) return ["수학","과학"];
  if (/수학|물리|화학|지구|천문|통계/.test(m)) return ["수학","과학"];
  if (/경영|경제|회계|금융|상경/.test(m)) return ["수학","사회","영어"];
  if (/법|행정|정치|외교|사회|심리/.test(m)) return ["국어","사회","영어"];
  if (/국어|국문|언어|문학|역사|철학|문화/.test(m)) return ["국어","사회","영어"];
  if (/영어|영문|외국어|국제|글로벌/.test(m)) return ["영어","국어","사회"];
  if (/교육/.test(m)) return ["국어","수학","영어","사회"];
  if (/예술|미술|음악|체육|디자인/.test(m)) return ["예체능","국어","영어"];
  return ["국어","수학","영어"]; // 기본
}

export default function App() {
  const [phase,setPhase]=useState("landing");
  const [pdfB64,setPdfB64]=useState(""); const [fileName,setFileName]=useState("");
  const [prog,setProg]=useState(0); const [step,setStep]=useState(""); const [err,setErr]=useState("");
  const [G,setG]=useState(null); const [drag,setDrag]=useState(false); const [busy,setBusy]=useState(false);
  const [sec,setSec]=useState("s1"); const [univTab,setUnivTab]=useState(0);
  const [graphTab,setGraphTab]=useState("all"); // 교과 성적 그래프 탭
  const [editMode,setEditMode]=useState(false); // 성적표 수동 편집 모드
  const [editingRow,setEditingRow]=useState(null); // 편집 중인 행 인덱스
  const [inName,setInName]=useState(""); const [inMajor,setInMajor]=useState(""); const [inCurr,setInCurr]=useState("auto");
  const [u0,setU0]=useState(""); const [d0,setD0]=useState("");
  const [u1,setU1]=useState(""); const [d1,setD1]=useState("");
  const [u2,setU2]=useState(""); const [d2,setD2]=useState("");
  const [sg0,setSg0]=useState([]); const [op0,setOp0]=useState(false);
  const [sg1,setSg1]=useState([]); const [op1,setOp1]=useState(false);
  const [sg2,setSg2]=useState([]); const [op2,setOp2]=useState(false);
  const rTrend=useRef(); const rGroup=useRef();
  const formRef=useRef(); const resRef=useRef();
  const ranks=[{u:u0,d:d0},{u:u1,d:d1},{u:u2,d:d2}];

  const processPdf=useCallback(async file=>{
    if(!file||file.type!=="application/pdf") return;
    const arr=await file.arrayBuffer(); const bytes=new Uint8Array(arr);
    let bin=""; for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]);
    setPdfB64(btoa(bin)); setFileName(file.name);
    setTimeout(()=>formRef.current?.scrollIntoView({behavior:"smooth"}),350);
  },[]);
  const onDrop=useCallback(e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)processPdf(f);},[processPdf]);

  const run=useCallback(async()=>{
    if(!pdfB64){setErr("학생부 PDF를 먼저 업로드하세요");return;}
    setBusy(true); setErr(""); setProg(5); setStep("생기부 텍스트 파싱 중...");
    try{
      // ─── 1단계: PDF 로컬 파싱 ───
      let parsed = await parseStudentRecord(pdfB64);
      if(!parsed || !parsed.rawText || parsed.rawText.length < 300){
        setStep("로컬 파싱 약함 — AI가 PDF 직접 분석합니다...");
        parsed = parsed || {};
        parsed.rawText = parsed.rawText || "";
        parsed.grades = parsed.grades || [];
        parsed.achievementSubjects = parsed.achievementSubjects || [];
        parsed.activities = parsed.activities || [];
        parsed.studentInfo = parsed.studentInfo || {};
        parsed.gradeAvg = parsed.gradeAvg || "0";
        parsed.pageCount = parsed.pageCount || 0;
        parsed.behaviorOpinion = parsed.behaviorOpinion || {};
      }
      if(parsed.studentInfo?.name && !inName) setInName(parsed.studentInfo.name);

      // ─── 2단계: 지원 희망 대학별 권장과목 사전 매칭 ───
      setProg(15); setStep("대학별 권장과목 매칭 중...");
      const univFitData = ranks
        .filter(r => r.u && r.d)
        .map(r => {
          // 대학명 정규화 (예: "고려대학교" → "고려대")
          const univShort = r.u.replace(/학교$/, '').replace(/대$/, '대');
          const cleaned = r.u.replace(/대학교$/, '대').replace(/대학$/, '대');
          // SUPPORTED_UNIVS에서 가장 잘 매칭되는 키 찾기
          const matchKey = SUPPORTED_UNIVS.find(k => 
            k === cleaned || k === univShort || r.u.includes(k) || k.includes(cleaned)
          ) || cleaned;
          return diagnoseUnivFit(matchKey, r.d, parsed.grades, parsed.achievementSubjects);
        });

      // ─── 3단계: Phase 1 프롬프트 생성 (구조 데이터 추출) ───
      setProg(25); setStep("AI 분석 1단계 시작 — 성적·활동·역량 추출 중... (40~60초)");
      const phase1Prompt = buildPhase1Prompt(parsed, inName||parsed.studentInfo?.name, inMajor, inCurr, ranks, univFitData);

      // ─── 4단계: Phase 1 호출 (백엔드 단일) ───
      const resp1=await fetch("/api/analyze",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          pdfB64,
          prompt: phase1Prompt,
          phase: "phase1",
          pdfText: parsed.rawText,
          parsed:{
            grades:parsed.grades,
            achievementSubjects:parsed.achievementSubjects,
            gradeAvg:parsed.gradeAvg,
            studentInfo:parsed.studentInfo,
            behaviorOpinion:parsed.behaviorOpinion
          }
        })
      });
      setProg(50); setStep("AI 1단계 결과 받는 중...");
      const data1=await resp1.json();
      if(!resp1.ok) throw new Error(data1.error||`Phase 1 서버 오류 ${resp1.status}`);
      const raw1=data1.content?.find(b=>b.type==="text")?.text||"{}";
      const clean1=raw1.replace(/```json|```/g,"").trim();
      let json={};
      try{json=JSON.parse(clean1);}
      catch{
        const m=clean1.match(/\{[\s\S]*\}/);
        if(m) json=JSON.parse(m[0]);
        else throw new Error("Phase 1 JSON 파싱 실패");
      }

      // ─── 5단계: Phase 2 호출 (Phase 1 결과 기반 종합 리포트) ───
      setProg(60); setStep("AI 분석 2단계 시작 — 학과적합도·탐구주제·종합리포트 생성 중... (40~60초)");
      const phase2Prompt = buildPhase2Prompt(parsed, json, inName||parsed.studentInfo?.name, inMajor, ranks, univFitData);

      let phase2Json = {};
      try {
        const resp2=await fetch("/api/analyze",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            pdfB64,
            prompt: phase2Prompt,
            phase: "phase2",
            pdfText: parsed.rawText,
            parsed:{}
          })
        });
        const data2=await resp2.json();
        if(resp2.ok){
          const raw2=data2.content?.find(b=>b.type==="text")?.text||"{}";
          const clean2=raw2.replace(/```json|```/g,"").trim();
          try{phase2Json=JSON.parse(clean2);}
          catch{
            const m=clean2.match(/\{[\s\S]*\}/);
            if(m) phase2Json=JSON.parse(m[0]);
          }
        } else {
          console.warn('Phase 2 실패 (Phase 1만 표시):', data2.error);
        }
      } catch(e) {
        console.warn('Phase 2 예외 (Phase 1만 표시):', e.message);
      }

      // Phase 2 결과 병합
      if (phase2Json.majorFit) json.majorFit = phase2Json.majorFit;
      if (phase2Json.topics) json.topics = phase2Json.topics;
      if (phase2Json.interviewQs) json.interviewQs = phase2Json.interviewQs;
      if (phase2Json.reportLetter) json.reportLetter = phase2Json.reportLetter;

      setProg(85); setStep("결과 후처리 중...");

      if(json.studentName && !inName) setInName(json.studentName);

      // ─── 6단계: 로컬 폴백 보강 ───
      if((!json.grades || json.grades.length === 0) && parsed.grades.length > 0){
        json.grades = parsed.grades;
      }
      if((!json.achievementSubjects || json.achievementSubjects.length === 0) && parsed.achievementSubjects.length > 0){
        json.achievementSubjects = parsed.achievementSubjects;
      }
      if((!json.gradeAvg || json.gradeAvg==="0" || json.gradeAvg==="") && parsed.gradeAvg && parsed.gradeAvg!=="0"){
        json.gradeAvg = parsed.gradeAvg;
      }
      if(!json.schoolName && parsed.studentInfo?.school){
        json.schoolName = parsed.studentInfo.school;
      }

      // ─── 7단계: 권장과목 매칭 결과 주입 (AI가 빠뜨렸을 때 보장) ───
      if(!json.creditStatus || !json.creditStatus.byUniv || json.creditStatus.byUniv.length === 0){
        json.creditStatus = json.creditStatus || {};
        json.creditStatus.byUniv = univFitData.map(f => ({
          univ: f.univ, dept: f.dept,
          rate: f.rate || 0,
          matched: f.matched || [],
          missing: f.missing || [],
          analysis: f.hasCriteria
            ? `${f.univ} ${f.dept} 권장 과목 ${(f.matched||[]).length + (f.missing||[]).length}개 중 ${(f.matched||[]).length}개 이수. 충족률 ${f.rate}%.`
            : f.note,
          recommend: f.missing && f.missing.length > 0
            ? `${f.missing.slice(0,3).join(', ')} 등의 과목을 추가 이수하면 충족률이 향상됩니다.`
            : '권장 과목을 충실히 이수했습니다.'
        }));
        json.creditStatus.summary = '지원 희망 대학별 권장과목 충족 현황을 확인하세요.';
      }
      // 권장과목 데이터 원본도 첨부 (UI에서 활용)
      json._univFitRaw = univFitData;

      setG(json); setProg(100); setStep("✅ 분석 완료!");
      setPhase("result");
      setTimeout(()=>{resRef.current?.scrollIntoView({behavior:"smooth"});setProg(0);setStep("");},600);
    }catch(e){setErr(String(e.message||e).slice(0,200));setProg(0);setStep("");}
    setBusy(false);
  },[pdfB64,inName,inMajor,inCurr,u0,d0,u1,d1,u2,d2]);

  /* 그래프 */
  useEffect(()=>{
    if(phase!=="result"||sec!=="s1"||!G?.grades?.length||!window.Chart) return;
    const gs=[...G.grades].sort((a,b)=>a.gN!==b.gN?a.gN-b.gN:a.sN-b.sN);
    const cur=(G.curriculum||"2015"); const maxLv=cur.includes("2022")?5:9;

    // ⚡ 탭에 따른 필터링
    const tabDef = GRAPH_TABS.find(t => t.id === graphTab) || GRAPH_TABS[0];
    let activeGroups;
    let tabColor = "#4c6ef5";
    let isSubjectTab = false;
    let targetSubject = null;

    if (tabDef.filter === null) { activeGroups = null; tabColor = "#1a1d2e"; }
    else if (tabDef.filter === "_major_") { activeGroups = getMajorRelatedGroups(inMajor || G?.studentType); tabColor = "#d97706"; }
    else if (tabDef.id?.startsWith("subj_")) {
      // 교과별 탭 (특정 교과군만)
      isSubjectTab = true;
      targetSubject = tabDef.filter[0];
      activeGroups = tabDef.filter;
      tabColor = ({국어:"#4c6ef5",수학:"#c92a2a",영어:"#2b8a3e",사회:"#d97706",과학:"#1971c2"})[targetSubject] || "#4c6ef5";
    }
    else { activeGroups = tabDef.filter; tabColor = "#4c6ef5"; }

    const sks=[...new Set(gs.map(r=>`${r.gN}-${r.sN}`))].sort();
    const sls=sks.map(k=>{const[g,s]=k.split("-");return`${g}학년${s}학기`;});

    // 학기별 평균 (필터 적용)
    const filterAvg = (sk) => {
      const[g,s]=sk.split("-");
      const f=gs.filter(r=>String(r.gN)===g&&String(r.sN)===s&&(!activeGroups||activeGroups.includes(r.group))&&parseInt(r.level||0)>0);
      return f.length?+(f.reduce((a,b)=>a+parseInt(b.level),0)/f.length).toFixed(2):null;
    };

    const baseOpts={
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{display:false}, // 단순화 — 범례 숨김
        tooltip:{
          backgroundColor:"rgba(26,29,46,.93)",titleColor:"#fff",bodyColor:"rgba(255,255,255,.9)",
          padding:12,cornerRadius:8,titleFont:{size:13},bodyFont:{size:13},
          callbacks:{
            label:(ctx)=>ctx.parsed.y!==null?`평균등급 ${ctx.parsed.y}`:'데이터 없음'
          }
        }
      },
      scales:{
        y:{reverse:true,min:1,max:maxLv,ticks:{stepSize:1,callback:v=>`${v}등급`,font:{size:11,family:"'DM Mono',monospace",weight:"600"}},title:{display:true,text:"평균 등급 (낮을수록 우수)",font:{size:11,weight:"600"},color:"#64748b"},grid:{color:"rgba(0,0,0,.05)"}},
        x:{ticks:{font:{size:11,weight:"600"}},grid:{display:false}}
      }
    };

    if(rTrend.current){
      if(rTrend.current._c) rTrend.current._c.destroy();

      // 단일 평균선만 표시 (본인 요청대로 단순화)
      const avgData = sks.map(filterAvg);
      const dataset = {
        label: tabDef.lbl,
        data: avgData,
        borderColor: tabColor,
        backgroundColor: tabColor + "20",
        borderWidth: 3,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 8,
        pointHoverRadius: 12,
        pointBackgroundColor: tabColor,
        pointBorderColor: "#fff",
        pointBorderWidth: 3,
        fill: true
      };

      rTrend.current._c = new window.Chart(rTrend.current, {
        type: "line",
        data: { labels: sls, datasets: [dataset] },
        options: baseOpts
      });
    }
    // 막대 그래프 제거됨
  },[phase,sec,G,graphTab,inMajor]);

  const name=G?.studentName||inName||"학생";
  const total=G?.totalScore||0;
  const grd=total>=90?"S":total>=80?"A":total>=70?"B":total>=60?"C":"D";

  const PH=({eye,title,sub})=>(
    <div className="pg-hd">
      <div className="pg-eye">{eye}</div>
      <h2 className="pg-title">{title}</h2>
      {sub&&<div className="pg-sub">{sub}</div>}
    </div>
  );
  const Empty=({msg="분析 후 표시됩니다"})=><div className="empty">{msg}</div>;

  const lv=n=>parseInt(n)||0;

  return (<>
    {/* HERO */}
    <div className="hero">
      <div className="hero-top">
        <div className="logo-row">
          <div className="logo-box">RI</div>
          <div><div className="logo-name">리포트아이</div><div className="logo-sub">학생부종합전형 분析</div></div>
        </div>
        <span className="hero-pill">Beta v1.0</span>
      </div>
      <div className="hero-body">
        <div className="hero-eye">학생부 정밀 분析</div>
        <h1 className="hero-title">당신의 생기부,<br/><span className="em">입학사정관</span>처럼<br/>읽어드립니다</h1>
        <p className="hero-desc">학생부 PDF 하나로 <strong>성적·활동·역량</strong>을 정밀 분析합니다.<br/>합격생 빅데이터 기준 · 대학별 공식 가이드북 내장.<br/><strong>15개 대학 학종 평가기준</strong>으로 맞춤 전략을 제시합니다.</p>
        <div className="feat-row">
          <span className="feat feat-b">📄 PDF 원문 직접 분析</span>
          <span className="feat feat-g">🏆 합격생 패턴 5가지</span>
          <span className="feat feat-p">🏫 15개 대학 학종 기준</span>
        </div>
        <label className={`drop-zone${drag?" drag":""}`}
          onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}>
          <input type="file" accept="application/pdf" onChange={e=>{const f=e.target.files[0];if(f)processPdf(f);}}/>
          <span className="dz-icon">{fileName?"✅":"📄"}</span>
          <div className="dz-title">{fileName||"학생부 PDF를 클릭하거나 드래그하세요"}</div>
          <div className="dz-sub">{fileName?"파일 준비 완료 — 아래로 스크롤하여 분析 시작":"PDF 원문 직접 독해 · 파싱 오류 없음"}</div>
        </label>
      </div>
      <div className="scroll-cue">
        <p>스크롤하여 정보 입력</p>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
      </div>
    </div>

    {/* FORM */}
    <div className="form-sec" ref={formRef}>
      <div className="form-inner">
        <div className="f-eye">Step 1 — 학생 정보</div>
        <h2 className="f-title">기본 정보를 입력해주세요</h2>
        <p className="f-desc">정확할수록 더 정밀한 분析이 가능합니다.</p>
        <div className="form-grid">
          <div><label className="f-label">학생 이름</label><input className="f-input" value={inName} onChange={e=>setInName(e.target.value)} placeholder="홍길동" autoComplete="off"/></div>
          <div><label className="f-label">교육과정</label>
            <select className="f-input" value={inCurr} onChange={e=>setInCurr(e.target.value)}>
              <option value="auto">자동감지</option>
              <option value="2022">2022 개정 (5등급제)</option>
              <option value="2015">2015 개정 (9등급제)</option>
            </select>
          </div>
          <div className="form-full"><label className="f-label">희망 전공</label><input className="f-input" value={inMajor} onChange={e=>setInMajor(e.target.value)} placeholder="예: 역사학과, 사학과, 고고학과, 의학과" autoComplete="off"/></div>
        </div>
        <div style={{marginBottom:28}}>
          <div className="f-eye" style={{marginBottom:6}}>Step 2 — 지원 희망 대학 (선택사항)</div>
          <p className="f-desc" style={{marginBottom:14}}>최대 3순위까지 입력하면 대학별 맞춤 진단을 드립니다. 비워두셔도 됩니다.</p>
          <div className="univ-rows">
            {[[u0,setU0,d0,setD0,sg0,setSg0,op0,setOp0],[u1,setU1,d1,setD1,sg1,setSg1,op1,setOp1],[u2,setU2,d2,setD2,sg2,setSg2,op2,setOp2]].map(([u,setU,d,setD,sg,setSg,op,setOp],i)=>(
              <div key={i} className="univ-row">
                <div className={`u-num u${i+1}`}>{i+1}</div>
                <div className="dd-wrap">
                  <input className="f-input" placeholder={`${i+1}순위 대학`} value={u} autoComplete="off"
                    onChange={e=>{const v=e.target.value;setU(v);setSg(v.length>=1?UNIVS.filter(x=>x.includes(v)).slice(0,6):[]);setOp(true);}}
                    onFocus={()=>{setSg(u.length>=1?UNIVS.filter(x=>x.includes(u)).slice(0,6):[]);setOp(true);}}
                    onBlur={()=>setTimeout(()=>setOp(false),180)}/>
                  {op&&sg.length>0&&<div className="u-dd">{sg.map((x,j)=><div key={j} className="u-opt" onMouseDown={()=>{setU(x);setSg([]);setOp(false);}}>{x}</div>)}</div>}
                </div>
                <input className="f-input" placeholder="학과" value={d} autoComplete="off" onChange={e=>setD(e.target.value)}/>
              </div>
            ))}
          </div>
        </div>
        <div className="cta-wrap">
          <button className="btn-go" onClick={run} disabled={!pdfB64||busy}>{busy?"분析 진행 중...":"분析 시작하기"}</button>
          {step&&(
            <div className="prog-wrap">
              <div className="prog-step"><div className="spin"/>{step}</div>
              <div className="prog-rail"><div className="prog-bar" style={{width:prog+"%"}}/></div>
              <div className="prog-pct-row">
                <span>{prog<30?"📄 PDF 파싱":prog<65?"🤖 AI 분析":prog<90?"⚙️ 결과 처리":"✅ 완료"}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700}}>{prog}%</span>
              </div>
            </div>
          )}
          {err&&<div className="err-msg">⚠ {err}</div>}
        </div>
      </div>
    </div>

    {/* RESULT */}
    {phase==="result"&&(
      <div ref={resRef} className="app-shell">
        <nav className="sidebar">
          <div className="sb-brand"><div className="sb-logo">RI</div><span className="sb-title">리포트아이</span></div>
          {G&&(
            <div className="sb-profile">
              <div className="sb-school">{G.schoolName||""}</div>
              <div className="sb-name">{name}</div>
              <div className="sb-type">{G.studentType||""}</div>
              <div className="sb-score-row">
                <span className="sb-score">{total}</span>
                <span className="sb-grade" style={{background:GC[grd]+"22",color:GC[grd],border:`1px solid ${GC[grd]}44`}}>{grd}등급</span>
              </div>
            </div>
          )}
          <div className="sb-nav">
            {NAV.map(g=>(
              <div key={g.g}>
                <div className="sb-group">{g.g}</div>
                {g.items.map(it=>(
                  <button key={it.id} className={`sb-btn${sec===it.id?" on":""}`} onClick={()=>setSec(it.id)}>
                    <span className="sb-ico">{it.ico}</span>{it.lbl}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="main-panel">
          <div className="panel-body">

            {/* S1 교과성적 */}
            {sec==="s1"&&(
              <div>
                <PH eye="성적 분析" title="교과 성적 현황" sub={(G?.curriculum||"2015").includes("2022")?"2022 개정 교육과정 · 5등급제":"2015 개정 교육과정 · 9등급제"}/>
                {G?.gradeAnalysis?.currExplain&&<div className="info-note blue" style={{marginBottom:14}}>{G.gradeAnalysis.currExplain}</div>}

                {/* ⚡ 그래프 탭 UI — 두 그룹으로 분리 */}
                <div style={{marginBottom:16}}>
                  {/* 종합 탭 */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--ink3)",letterSpacing:".05em",minWidth:48}}>📊 종합</span>
                    <div className="graph-tabs" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {GRAPH_TABS.filter(t=>t.group==="종합").map(t=>(
                        <button
                          key={t.id}
                          onClick={()=>setGraphTab(t.id)}
                          style={{
                            padding:"8px 14px",
                            background:graphTab===t.id?"#4c6ef5":"#fff",
                            color:graphTab===t.id?"#fff":"var(--ink2)",
                            border:`1px solid ${graphTab===t.id?"#4c6ef5":"var(--border)"}`,
                            borderRadius:6,
                            cursor:"pointer",
                            fontWeight:graphTab===t.id?700:500,
                            fontSize:12,
                            transition:"all .15s"
                          }}
                        >{t.lbl}{t.id==="major"&&inMajor?` (${inMajor})`:""}</button>
                      ))}
                    </div>
                  </div>
                  {/* 교과별 탭 */}
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--ink3)",letterSpacing:".05em",minWidth:48}}>📚 교과별</span>
                    <div className="graph-tabs" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {GRAPH_TABS.filter(t=>t.group==="교과별").map(t=>(
                        <button
                          key={t.id}
                          onClick={()=>setGraphTab(t.id)}
                          style={{
                            padding:"8px 14px",
                            background:graphTab===t.id?"#d97706":"#fff",
                            color:graphTab===t.id?"#fff":"var(--ink2)",
                            border:`1px solid ${graphTab===t.id?"#d97706":"var(--border)"}`,
                            borderRadius:6,
                            cursor:"pointer",
                            fontWeight:graphTab===t.id?700:500,
                            fontSize:12,
                            transition:"all .15s"
                          }}
                        >{t.lbl}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 탭별 분석글 */}
                {(() => {
                  const tabDef = GRAPH_TABS.find(t=>t.id===graphTab) || GRAPH_TABS[0];

                  // 종합 탭 — AI 분석글 사용
                  if (tabDef.group === "종합") {
                    let text = "";
                    if (graphTab==="all") text = G?.gradeAnalysis?.overall || "전체 교과 분석 데이터가 없습니다.";
                    else if (graphTab==="kme") text = G?.gradeAnalysis?.trendByGroup?.국영수 || "국영수 분석 데이터가 없습니다.";
                    else if (graphTab==="kmes") text = G?.gradeAnalysis?.trendByGroup?.국영수사 || "국영수사 분석 데이터가 없습니다.";
                    else if (graphTab==="kmesi") text = G?.gradeAnalysis?.trendByGroup?.국영수과 || "국영수과 분석 데이터가 없습니다.";
                    else if (graphTab==="major") text = G?.gradeAnalysis?.trendByGroup?.전공연계 || G?.gradeAnalysis?.majorLink || "전공 연계 분석 데이터가 없습니다.";

                    return (
                      <div className="info-note blue" style={{marginBottom:14,fontSize:13,lineHeight:1.7}}>
                        <strong>📊 {tabDef.lbl} 성적 추이 분석:</strong><br/>
                        {text}
                      </div>
                    );
                  }

                  // 교과별 탭 — 자동 분석글 생성
                  if (tabDef.group === "교과별" && G?.grades?.length) {
                    const subj = tabDef.filter[0];
                    const filtered = G.grades.filter(r => r.group === subj && parseInt(r.level||0) > 0);
                    if (!filtered.length) {
                      return (
                        <div className="info-note yellow" style={{marginBottom:14,fontSize:13}}>
                          ⚠️ {subj} 교과 데이터가 없습니다.
                        </div>
                      );
                    }

                    const avg = (filtered.reduce((s,r)=>s+parseInt(r.level),0)/filtered.length).toFixed(2);
                    const sorted = [...filtered].sort((a,b)=>a.gN!==b.gN?a.gN-b.gN:a.sN-b.sN);
                    const first = sorted[0];
                    const last = sorted[sorted.length-1];
                    const trend = parseInt(first.level) - parseInt(last.level);
                    const trendText = trend > 0.5 ? `📈 ${first.grade}${first.semester} ${first.level}등급 → ${last.grade}${last.semester} ${last.level}등급으로 향상`
                      : trend < -0.5 ? `📉 ${first.grade}${first.semester} ${first.level}등급 → ${last.grade}${last.semester} ${last.level}등급으로 하락 (보완 필요)`
                      : `→ 안정적인 성적 유지 (${first.level}~${last.level}등급)`;
                    const subjects = [...new Set(filtered.map(r => r.subject))];

                    return (
                      <div className="info-note blue" style={{marginBottom:14,fontSize:13,lineHeight:1.7}}>
                        <strong>📚 {subj} 교과 추이 분석</strong><br/>
                        • 이수 과목 <strong>{filtered.length}개</strong>: {subjects.join(", ")}<br/>
                        • 평균 등급: <strong style={{fontSize:15,color:"#4c6ef5"}}>{avg}등급</strong><br/>
                        • 추이: {trendText}<br/>
                        {G?.gradeAnalysis?.overall && (
                          <span style={{color:"var(--ink3)",fontSize:12}}>※ 전체 교과 분석 참고: 종합 탭 클릭</span>
                        )}
                      </div>
                    );
                  }

                  return null;
                })()}

                <div className="grade-section">
                  {/* 학기별 평균 등급 요약 (탭 필터 반영) */}
                  {(() => {
                    if (!G?.grades?.length) return null;
                    const tabDef = GRAPH_TABS.find(t=>t.id===graphTab) || GRAPH_TABS[0];
                    let activeGroups;
                    if (tabDef.filter === null) activeGroups = null;
                    else if (tabDef.filter === "_major_") activeGroups = getMajorRelatedGroups(inMajor || G?.studentType);
                    else activeGroups = tabDef.filter;

                    const filtered = activeGroups
                      ? G.grades.filter(r => activeGroups.includes(r.group))
                      : G.grades;
                    if (!filtered.length) return null;

                    const validGrades = filtered.filter(r => parseInt(r.level||0) > 0);
                    const avg = validGrades.length
                      ? (validGrades.reduce((s,r)=>s+parseInt(r.level),0)/validGrades.length).toFixed(2)
                      : "-";

                    // 학기별 평균
                    const sems = [...new Set(filtered.map(r=>`${r.gN}-${r.sN}`))].sort();
                    const semAvgs = sems.map(sk => {
                      const [g,s] = sk.split("-");
                      const f = filtered.filter(r => String(r.gN)===g && String(r.sN)===s && parseInt(r.level||0)>0);
                      const a = f.length ? (f.reduce((s,r)=>s+parseInt(r.level),0)/f.length).toFixed(2) : "-";
                      return { lbl: `${g}학년 ${s}학기`, avg: a, count: f.length };
                    });

                    return (
                      <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:14,marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                          <div>
                            <div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:4}}>📊 {tabDef.lbl} 종합</div>
                            <div style={{fontSize:13,color:"#1e3a8a"}}>이수 과목 <strong>{filtered.length}개</strong> · 평균 등급 <strong style={{fontSize:18,color:"#1e40af"}}>{avg}</strong></div>
                          </div>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            {semAvgs.map((s,i)=>(
                              <div key={i} style={{padding:"6px 12px",background:"#fff",borderRadius:6,border:"1px solid #bfdbfe",fontSize:12}}>
                                <div style={{color:"#64748b",fontSize:10}}>{s.lbl}</div>
                                <div style={{fontWeight:700,color:"#1e40af",fontFamily:"'DM Mono',monospace"}}>{s.avg}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 성적표 + 추이 그래프 나란히 (탭에 따라 표도 필터링) */}
                  <div className="grade-row">
                    <div className="tbl-card">
                      <div style={{padding:"14px 16px 10px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>📋 {GRAPH_TABS.find(t=>t.id===graphTab)?.lbl} 성적표</span>
                        <button
                          onClick={()=>{setEditMode(!editMode);setEditingRow(null);}}
                          style={{
                            padding:"4px 10px",
                            fontSize:11,
                            fontWeight:600,
                            background:editMode?"#dc2626":"#4c6ef5",
                            color:"#fff",
                            border:"none",
                            borderRadius:4,
                            cursor:"pointer"
                          }}
                        >{editMode?"✅ 편집 완료":"✏️ 직접 수정"}</button>
                      </div>
                      {editMode && (
                        <div style={{padding:"8px 16px",background:"#fef3c7",borderBottom:"1px solid var(--border)",fontSize:11,color:"#92400e"}}>
                          💡 학기/과목/등급 등을 직접 수정할 수 있어요. 행을 클릭하여 편집하거나, 아래 + 버튼으로 행을 추가하세요.
                        </div>
                      )}
                      <div className="tbl-scroll">
                        {(() => {
                          if (!G?.grades?.length) return <Empty msg="성적 데이터 없음"/>;
                          const tabDef = GRAPH_TABS.find(t=>t.id===graphTab) || GRAPH_TABS[0];
                          let activeGroups;
                          if (tabDef.filter === null) activeGroups = null;
                          else if (tabDef.filter === "_major_") activeGroups = getMajorRelatedGroups(inMajor || G?.studentType);
                          else activeGroups = tabDef.filter;

                          // 편집 모드에서는 모든 데이터 표시 (필터 무시)
                          const filtered = editMode
                            ? G.grades
                            : (activeGroups ? G.grades.filter(r => activeGroups.includes(r.group)) : G.grades);
                          if (!filtered.length) return <Empty msg={`${tabDef.lbl} 해당 과목 없음`}/>;

                          const sortedAll = [...filtered].sort((a,b)=>a.gN!==b.gN?a.gN-b.gN:a.sN-b.sN);
                          // 원본 인덱스 매핑 (편집 시 사용)
                          const indexMap = sortedAll.map(item => G.grades.findIndex(g => g === item));

                          return (
                            <table>
                              <thead><tr><th>학년/학기</th><th>교과군</th><th>과목</th><th>단위</th><th>원점수</th><th>평균(SD)</th><th>등급</th>{editMode && <th>삭제</th>}</tr></thead>
                              <tbody>
                                {sortedAll.map((r,i,arr)=>{
                                  const prev=arr[i-1]; const isNew=!prev||prev.gN!==r.gN||prev.sN!==r.sN;
                                  const n=lv(r.level);
                                  const realIdx = indexMap[i];
                                  const isEditing = editMode && editingRow === realIdx;

                                  if (isEditing) {
                                    return (
                                      <tr key={`edit-${i}`} style={{background:"#fef3c7"}}>
                                        <td>
                                          <select value={`${r.gN}-${r.sN}`} onChange={e=>{
                                            const[g,s]=e.target.value.split("-");
                                            const newG=[...G.grades];
                                            newG[realIdx]={...newG[realIdx],gN:parseInt(g),sN:parseInt(s),grade:`${g}학년`,semester:`${s}학기`};
                                            setG({...G,grades:newG});
                                          }} style={{fontSize:12,padding:4,width:"100%"}}>
                                            <option value="1-1">1학년 1학기</option>
                                            <option value="1-2">1학년 2학기</option>
                                            <option value="2-1">2학년 1학기</option>
                                            <option value="2-2">2학년 2학기</option>
                                            <option value="3-1">3학년 1학기</option>
                                            <option value="3-2">3학년 2학기</option>
                                          </select>
                                        </td>
                                        <td>
                                          <select value={r.group||"기타"} onChange={e=>{
                                            const newG=[...G.grades];
                                            newG[realIdx]={...newG[realIdx],group:e.target.value};
                                            setG({...G,grades:newG});
                                          }} style={{fontSize:12,padding:4,width:"100%"}}>
                                            <option value="국어">국어</option>
                                            <option value="수학">수학</option>
                                            <option value="영어">영어</option>
                                            <option value="사회">사회</option>
                                            <option value="과학">과학</option>
                                            <option value="기술가정">기술가정</option>
                                            <option value="예체능">예체능</option>
                                            <option value="기타">기타</option>
                                          </select>
                                        </td>
                                        <td><input type="text" value={r.subject||""} onChange={e=>{
                                          const newG=[...G.grades];
                                          newG[realIdx]={...newG[realIdx],subject:e.target.value};
                                          setG({...G,grades:newG});
                                        }} style={{fontSize:12,padding:4,width:"100%"}}/></td>
                                        <td><input type="text" value={r.credit||""} onChange={e=>{
                                          const newG=[...G.grades];
                                          newG[realIdx]={...newG[realIdx],credit:e.target.value};
                                          setG({...G,grades:newG});
                                        }} style={{fontSize:12,padding:4,width:50}}/></td>
                                        <td><input type="text" value={r.rawScore||""} onChange={e=>{
                                          const newG=[...G.grades];
                                          newG[realIdx]={...newG[realIdx],rawScore:e.target.value};
                                          setG({...G,grades:newG});
                                        }} style={{fontSize:12,padding:4,width:60}}/></td>
                                        <td><input type="text" value={r.avg||""} onChange={e=>{
                                          const newG=[...G.grades];
                                          newG[realIdx]={...newG[realIdx],avg:e.target.value};
                                          setG({...G,grades:newG});
                                        }} style={{fontSize:12,padding:4,width:60}} placeholder="평균"/></td>
                                        <td><input type="number" min="1" max="9" value={r.level||""} onChange={e=>{
                                          const newG=[...G.grades];
                                          newG[realIdx]={...newG[realIdx],level:parseInt(e.target.value)||0};
                                          setG({...G,grades:newG});
                                        }} style={{fontSize:12,padding:4,width:50,fontWeight:700}}/></td>
                                        <td>
                                          <button onClick={()=>setEditingRow(null)} style={{padding:"2px 8px",fontSize:11,background:"#10b981",color:"#fff",border:"none",borderRadius:3,cursor:"pointer"}}>확인</button>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return(
                                    <tr key={i} className={isNew?"sem-sep":""} onClick={()=>editMode&&setEditingRow(realIdx)} style={{cursor:editMode?"pointer":"default"}}>
                                      <td style={{fontWeight:700,whiteSpace:"nowrap",fontSize:13}}>
                                        <span className={`s-dot ${r.sN===1?"s1":"s2"}`}/>{r.grade} {r.sN}학기
                                      </td>
                                      <td style={{fontSize:12,color:"var(--ink3)"}}>{r.group}</td>
                                      <td style={{fontWeight:600,fontSize:13}}>{r.subject}</td>
                                      <td style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--ink3)"}}>{r.credit}</td>
                                      <td style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:13}}>{r.rawScore}</td>
                                      <td style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--ink3)"}}>{r.avg}{r.sd?`(${r.sd})`:""}</td>
                                      <td><span className={`lv${n?" lv"+n:""}`}>{r.level||"·"}</span></td>
                                      {editMode && (
                                        <td>
                                          <button onClick={(e)=>{
                                            e.stopPropagation();
                                            if(confirm("이 행을 삭제하시겠습니까?")){
                                              const newG=G.grades.filter((_,idx)=>idx!==realIdx);
                                              setG({...G,grades:newG});
                                              setEditingRow(null);
                                            }
                                          }} style={{padding:"2px 6px",fontSize:11,background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:3,cursor:"pointer"}}>×</button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                                {editMode && (
                                  <tr>
                                    <td colSpan="8" style={{textAlign:"center",padding:8}}>
                                      <button onClick={()=>{
                                        const newRow={grade:"2학년",semester:"1학기",gN:2,sN:1,subject:"새과목",credit:"3",rawScore:"",avg:"",sd:"",level:1,group:"국어"};
                                        const newG=[...G.grades,newRow];
                                        setG({...G,grades:newG});
                                        setEditingRow(newG.length-1);
                                      }} style={{padding:"6px 14px",fontSize:12,background:"#10b981",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600}}>+ 행 추가</button>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="chart-card">
                      <div className="chart-lbl">{GRAPH_TABS.find(t=>t.id===graphTab)?.lbl} 학기별 등급 추이</div>
                      <div className="chart-sub">{graphTab==="all"?"교과군별 색상":"필터된 교과군만 표시"} · 평균선 점선</div>
                      <div style={{height:280}}><canvas ref={rTrend}/></div>
                    </div>
                  </div>
                  {/* 진로선택 성취도 과목 */}
                  {G?.achievementSubjects?.length>0&&(
                    <div className="tbl-card">
                      <div style={{padding:"14px 16px 10px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:13}}>📋 진로선택과목 성취도 (A/B/C — 등급 미산출)</div>
                      <div className="info-note yellow" style={{margin:"12px 16px 0"}}>분포비율과 함께 해석하세요. 단순 A만으로 판단 금지.</div>
                      <div className="tbl-scroll" style={{padding:"0 0 8px"}}>
                        <table>
                          <thead><tr><th>학년/학기</th><th>과목</th><th>단위</th><th>성취도</th><th>분포비율</th><th>수강자</th><th>해석</th></tr></thead>
                          <tbody>
                            {G.achievementSubjects.map((r,i)=>(
                              <tr key={i}>
                                <td style={{fontSize:12,color:"var(--ink3)",whiteSpace:"nowrap"}}>{r.grade} {r.semester}</td>
                                <td style={{fontWeight:600}}>{r.subject}</td>
                                <td style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{r.credit}</td>
                                <td><span className={`achv-${r.achievement}`}>{r.achievement}</span></td>
                                <td style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{r.distribution}</td>
                                <td style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--ink3)"}}>{r.students}명</td>
                                <td style={{fontSize:12,color:"var(--ink3)",fontStyle:"italic"}}>{r.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {/* 성적 분析 텍스트 */}
                  {G?.gradeAnalysis&&(
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {G.gradeAnalysis.overall&&(
                        <div className="card">
                          <div className="card-eye">전체 성적 종합 분析</div>
                          <div className="ana-text">{G.gradeAnalysis.overall}</div>
                          {(G.gradeAnalysis.rising?.length||G.gradeAnalysis.falling?.length)&&(
                            <div style={{display:"flex",gap:16,marginTop:12,fontSize:13,flexWrap:"wrap"}}>
                              {G.gradeAnalysis.rising?.length>0&&<span style={{color:"var(--green)",fontWeight:700}}>📈 상승: {G.gradeAnalysis.rising.join(", ")}</span>}
                              {G.gradeAnalysis.falling?.length>0&&<span style={{color:"var(--red)",fontWeight:700}}>📉 하락: {G.gradeAnalysis.falling.join(", ")}</span>}
                            </div>
                          )}
                        </div>
                      )}
                      {G.gradeAnalysis.majorLink&&(
                        <div className="card blue">
                          <div className="card-eye" style={{color:"var(--blue)"}}>희망전공 연계 교과</div>
                          <div className="ana-text">{G.gradeAnalysis.majorLink}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* S2 이수현황 */}
            {sec==="s2"&&(
              <div>
                <PH eye="이수 분析" title="교과 이수 현황" sub="지원 희망 대학별 권장과목 충족 분석"/>

                {/* 종합 평가 */}
                {G?.creditStatus?.summary&&(
                  <div className="info-note blue" style={{marginBottom:18,fontSize:14,lineHeight:1.7}}>
                    📊 <strong>종합 평가:</strong> {G.creditStatus.summary}
                  </div>
                )}

                {/* 대학별 충족률 카드 */}
                {G?.creditStatus?.byUniv?.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:18,marginBottom:24}}>
                    <h3 style={{fontSize:16,fontWeight:700,marginTop:8}}>🏫 지원 희망 대학별 권장과목 충족률</h3>
                    {G.creditStatus.byUniv.map((u,i)=>{
                      const pct = u.rate || 0;
                      const col = pct>=70?"var(--green)":pct>=40?"var(--gold)":"var(--red)";
                      const verdict = pct>=70?"매우 우수":pct>=50?"양호":pct>=30?"보통":"보완 필요";
                      return(
                        <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:20}}>
                          {/* 대학명·학과·충족률 */}
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                            <div>
                              <div style={{fontSize:18,fontWeight:700}}>{u.univ}</div>
                              <div style={{fontSize:13,color:"var(--ink3)",marginTop:2}}>{u.dept}</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:32,fontWeight:800,color:col,lineHeight:1,fontFamily:"'DM Mono',monospace"}}>{pct}%</div>
                              <div style={{fontSize:11,color:col,fontWeight:600,marginTop:2}}>{verdict}</div>
                            </div>
                          </div>

                          {/* 진행률 바 */}
                          <div style={{height:8,background:"var(--border)",borderRadius:99,overflow:"hidden",marginBottom:14}}>
                            <div style={{width:pct+"%",height:"100%",background:col,borderRadius:99,transition:"width .4s"}}/>
                          </div>

                          {/* 충족·미이수 목록 */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                            <div>
                              <div style={{fontSize:12,fontWeight:700,color:"var(--green)",marginBottom:8}}>✓ 충족 ({(u.matched||[]).length}개)</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                                {(u.matched||[]).length>0?u.matched.map((s,j)=>(
                                  <span key={j} style={{background:"#e3f5e3",color:"#1f7a1f",padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:500}}>{s}</span>
                                )):<span style={{fontSize:12,color:"var(--ink3)"}}>없음</span>}
                              </div>
                            </div>
                            <div>
                              <div style={{fontSize:12,fontWeight:700,color:"var(--red)",marginBottom:8}}>✕ 미이수 ({(u.missing||[]).length}개)</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                                {(u.missing||[]).length>0?u.missing.map((s,j)=>(
                                  <span key={j} style={{background:"#fde2e2",color:"#a01818",padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:500}}>{s}</span>
                                )):<span style={{fontSize:12,color:"var(--ink3)"}}>없음</span>}
                              </div>
                            </div>
                          </div>

                          {/* 분석글 + 추천 */}
                          {u.analysis&&(
                            <div style={{padding:12,background:"#fff",borderRadius:8,border:"1px solid var(--border)",marginBottom:8}}>
                              <div style={{fontSize:11,fontWeight:700,color:"var(--blue)",marginBottom:6}}>📊 분석</div>
                              <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink2)"}}>{u.analysis}</div>
                            </div>
                          )}
                          {u.recommend&&(
                            <div style={{padding:12,background:"#fffbeb",borderRadius:8,border:"1px solid #fde68a"}}>
                              <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:6}}>💡 추천</div>
                              <div style={{fontSize:13,lineHeight:1.7,color:"#92400e"}}>{u.recommend}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ):(
                  <div className="info-note yellow" style={{marginBottom:18}}>
                    ⚠️ 지원 희망 대학을 입력하지 않았거나, 데이터베이스에 등록되지 않은 대학입니다. 대학·학과를 입력하면 권장과목 충족률을 분석해드립니다.
                  </div>
                )}

                {/* 기존 교과군별 이수 (있으면 보조 정보로) */}
                {G?.creditAnalysis?.length>0&&(
                  <>
                    <h3 style={{fontSize:16,fontWeight:700,marginTop:24,marginBottom:14}}>📋 교과군별 이수 현황</h3>
                    <div className="credit-grid">
                      {[...G.creditAnalysis].sort((a,b)=>(b.rate||0)-(a.rate||0)).map((c,i)=>{
                        const pct=c.rate||0; const col=pct>=70?"var(--green)":pct>=40?"var(--gold)":"var(--red)";
                        return(
                          <div key={i} className="cred-card">
                            <div className="cred-top"><span className="cred-nm">{c.group}</span><span className="cred-pct" style={{color:col}}>{pct}%</span></div>
                            <div className="cred-rail"><div style={{width:pct+"%",height:"100%",background:col,borderRadius:99}}/></div>
                            {(c.subjects||[]).slice(0,8).map((s,j)=>(
                              <div key={j} className="cred-row">
                                <span>{s.name}{s.required&&<span style={{color:"var(--red)",marginLeft:3}}>●</span>}</span>
                                <span style={{color:s.done?"var(--green)":"var(--red)",fontWeight:700}}>{s.done?"✓":"✕"}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {!G?.creditStatus?.byUniv?.length&&!G?.creditAnalysis?.length&&<Empty msg="이수 현황 데이터 없음"/>}
              </div>
            )}

            {/* S3 강점·보완점 */}
            {sec==="s3"&&(
              <div>
                <PH eye="활동 분析" title="강점 · 보완점" sub="생기부 원문 근거 기반"/>
                {G?.strengths?.length||G?.weaknesses?.length?(
                  <div className="sw-grid">
                    {(G?.strengths||[]).map((s,i)=>(
                      <div key={i} className="str-card">
                        <div className="sw-tag str-tag">✦ 강점</div>
                        <div className="sw-title">[{s.area}] {s.title}</div>
                        <div className="sw-body">{s.content}</div>
                        {s.quote&&<div className="sw-quote">"{s.quote}"</div>}
                        {s.highlight&&<div className="sw-hl">💡 {s.highlight}</div>}
                      </div>
                    ))}
                    {(G?.weaknesses||[]).map((w,i)=>(
                      <div key={i} className="wk-card">
                        <div className="sw-tag wk-tag">◈ 보완점</div>
                        <div className="sw-title">[{w.area}] {w.title}</div>
                        <div className="sw-body">{w.content}</div>
                        {w.suggestion&&<div className="sw-tip">→ {w.suggestion}</div>}
                      </div>
                    ))}
                  </div>
                ):<Empty/>}
              </div>
            )}

            {/* S4 타임라인 */}
            {sec==="s4"&&(
              <div>
                <PH eye="활동 기록" title="활동 타임라인" sub="학년·학기순 · Why-How-So 분析"/>
                {G?.activities?.length?(
                  <div className="timeline">
                    {[...G.activities].sort((a,b)=>a.gN!==b.gN?a.gN-b.gN:a.sN-b.sN).map((a,i)=>{
                      const typeMap={"자율":"t-자율","동아리":"t-동아리","진로":"t-진로","세특":"t-세특","종합의견":"t-종합의견"};
                      return(
                        <div key={i} className="tl-item">
                          <div className="tl-dot"/>
                          <div className="tl-meta">
                            <span className="tl-period">{a.year} {a.semester}</span>
                            <span className={`tl-type ${typeMap[a.type]||"t-세특"}`}>{a.type}</span>
                          </div>
                          <div className="tl-title">{a.title}</div>
                          <div className="tl-body">{a.content}</div>
                          {a.whyHowSo&&(
                            <div className="tl-whs">
                              {a.whyHowSo.split(" H:").map((part,j)=>j===0
                                ?<span key={j} className="tw">W: {part.replace("W:","").trim()}</span>
                                :part.split(" S:").map((p2,k)=>k===0
                                  ?<span key={k} className="th">H: {p2.trim()}</span>
                                  :<span key={k} className="ts">S: {p2.trim()}</span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ):<Empty/>}
              </div>
            )}

            {/* S5 키워드 */}
            {sec==="s5"&&(
              <div>
                <PH eye="언어 분析" title="키워드 분析" sub="빈도와 영역별 분류"/>
                {G?.keywords?.length?(
                  <>
                    {/* 키워드 클라우드 — 빈도 크기 반영 */}
                    <div className="card">
                      <div className="card-eye">핵심 키워드 클라우드 (크기 = 빈도)</div>
                      <div className="kw-cloud">
                        {G.keywords.slice(0,40).map((k,i)=>{
                          // 새 형식: {word, count, area} 또는 옛 형식: string
                          const word = typeof k === 'string' ? k : k.word;
                          const count = typeof k === 'string' ? 1 : (k.count || 1);
                          const area = typeof k === 'string' ? null : k.area;
                          const maxCount = Math.max(...G.keywords.map(kk=>typeof kk==='string'?1:(kk.count||1)));
                          const sz = Math.max(12, Math.min(24, 12 + Math.floor((count/maxCount)*12)));
                          return (
                            <span key={i} className="kw-tag" style={{fontSize:sz,color:TC[i%TC.length],background:TC[i%TC.length]+"16",border:`1px solid ${TC[i%TC.length]}28`}}>
                              {word}{count>1&&<span style={{fontSize:10,marginLeft:4,opacity:.6}}>×{count}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* 빈도 표 */}
                    <div className="card" style={{marginTop:14}}>
                      <div className="card-eye">키워드 빈도 표 (상위 15개)</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
                        {G.keywords.slice(0,15).map((k,i)=>{
                          const word = typeof k === 'string' ? k : k.word;
                          const count = typeof k === 'string' ? 1 : (k.count || 1);
                          const area = typeof k === 'string' ? null : k.area;
                          const maxCount = Math.max(...G.keywords.map(kk=>typeof kk==='string'?1:(kk.count||1)));
                          const pct = Math.round((count/maxCount)*100);
                          return(
                            <div key={i} style={{padding:"8px 10px",border:"1px solid var(--border)",borderRadius:6,fontSize:12}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{fontWeight:600}}>{word}</span>
                                <span style={{fontFamily:"'DM Mono',monospace",color:"var(--ink3)"}}>{count}회</span>
                              </div>
                              <div style={{height:4,background:"var(--border)",borderRadius:99}}>
                                <div style={{width:pct+"%",height:"100%",background:TC[i%TC.length],borderRadius:99}}/>
                              </div>
                              {area&&<div style={{fontSize:10,color:"var(--ink3)",marginTop:4}}>{area}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 탐구 방법 빈도 분류 */}
                    {G?.methodAnalysis?.methods?.length>0&&(
                      <div className="card" style={{marginTop:14}}>
                        <div className="card-eye">🔬 탐구 방법 빈도 분류</div>

                        {/* 주요/편향 배지 */}
                        {G.methodAnalysis.dominant&&(
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
                            <span style={{fontSize:12,fontWeight:700,padding:"6px 14px",borderRadius:6,background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a"}}>
                              주요 방법: {G.methodAnalysis.dominant}
                            </span>
                            <span style={{fontSize:12,fontWeight:700,padding:"6px 14px",borderRadius:6,
                              background:G.methodAnalysis.isSkewed?"#fee2e2":"#dcfce7",
                              color:G.methodAnalysis.isSkewed?"#991b1b":"#166534",
                              border:`1px solid ${G.methodAnalysis.isSkewed?"#fca5a5":"#86efac"}`}}>
                              {G.methodAnalysis.isSkewed?"⚠ 편중됨":"✓ 균형 잡힘"}
                            </span>
                          </div>
                        )}

                        {/* 방법별 막대 + 예시 */}
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {[...G.methodAnalysis.methods].sort((a,b)=>(b.count||0)-(a.count||0)).map((m,i)=>{
                            const maxC = Math.max(...G.methodAnalysis.methods.map(mm=>mm.count||0));
                            const pct = maxC>0 ? Math.round((m.count||0)/maxC*100) : 0;
                            return(
                              <div key={i} style={{padding:"10px 14px",background:"var(--bg2)",borderRadius:8,border:"1px solid var(--border)"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                  <span style={{fontWeight:700,fontSize:13}}>{m.type}</span>
                                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:TC[i%TC.length],fontWeight:700}}>{m.count||0}회</span>
                                </div>
                                <div style={{height:6,background:"var(--border)",borderRadius:99,overflow:"hidden",marginBottom:8}}>
                                  <div style={{width:pct+"%",height:"100%",background:TC[i%TC.length],borderRadius:99}}/>
                                </div>
                                {(m.examples||[]).length>0&&(
                                  <div style={{fontSize:11,color:"var(--ink3)"}}>
                                    예시: {m.examples.slice(0,3).join(" · ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 분석글 */}
                        {G.methodAnalysis.analysis&&(
                          <div style={{padding:14,marginTop:14,background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe",fontSize:13,lineHeight:1.7,color:"#1e40af"}}>
                            📝 <strong>탐구 방법 종합 분석:</strong> {G.methodAnalysis.analysis}
                          </div>
                        )}
                      </div>
                    )}

                    {/* methodAnalysis 없을 때 폴백: 기존 verbAnalysis */}
                    {!G?.methodAnalysis?.methods?.length&&(G?.verbAnalysis?.length>0||G?.methodBias)&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:14}}>
                        <div className="card">
                          <div className="card-eye">탐구 동사 빈도</div>
                          {(G.verbAnalysis||[]).slice(0,10).map((v,i)=>{
                            const max=G.verbAnalysis[0]?.count||1;
                            return(
                              <div key={i} className="verb-row">
                                <span style={{fontSize:13,fontWeight:600,minWidth:64,color:"var(--ink2)"}}>{v.verb}</span>
                                <div className="verb-track"><div style={{width:Math.round(v.count/max*100)+"%",height:"100%",background:TC[i%TC.length],borderRadius:99}}/></div>
                                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--ink3)",minWidth:22,textAlign:"right"}}>{v.count}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="card">
                          <div className="card-eye">탐구방법 분析</div>
                          {G.methodBias?.dominant&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                            <span style={{fontSize:12,fontWeight:700,padding:"5px 12px",borderRadius:3,background:"var(--gold-l)",color:"var(--gold)",border:"1px solid #fed7aa"}}>주요: {G.methodBias.dominant}</span>
                          </div>}
                          <div className="ana-text">{G.methodBias?.analysis||"데이터 없음"}</div>
                        </div>
                      </div>
                    )}
                  </>
                ):<Empty/>}
              </div>
            )}

            {/* S6 역량 */}
            {sec==="s6"&&(
              <div>
                <PH eye="역량 평가" title="역량 매핑 · 채점" sub="Why-How-So 5단계 기준"/>
                <div className="score-hero" style={{marginBottom:16}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <div className="score-num">{total}</div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,.3)",marginTop:-4}}>/ 100점</div>
                    <div className="score-gp" style={{background:GC[grd]+"22",color:GC[grd],border:`1px solid ${GC[grd]}44`}}>{grd}등급 · {GL[grd]}</div>
                    <div className="score-tp">{G?.studentType||""}</div>
                  </div>
                  <div className="sbar-wrap">
                    {COMP.map(cm=>{
                      const d=G?.competencies?.[cm.k]||{}; const pct=Math.round((d.score||0)/cm.max*100); const gc=GC[d.grade||"C"];
                      return(
                        <div key={cm.k} className="sbar">
                          <div className="sbar-top">
                            <span className="sbar-nm">{cm.n} <span style={{color:"rgba(255,255,255,.25)",fontSize:10}}>{cm.max}점</span></span>
                            <span className="sbar-val" style={{color:gc||"rgba(255,255,255,.4)"}}>{d.grade||"?"} {d.score||0}/{cm.max}</span>
                          </div>
                          <div className="sbar-track"><div style={{width:pct+"%",height:"100%",background:cm.c,borderRadius:99}}/></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="comp-grid">
                  {COMP.map(cm=>{
                    const d=G?.competencies?.[cm.k]||{}; const pct=Math.round((d.score||0)/cm.max*100); const gc=GC[d.grade||"C"]||"#868e96";
                    return(
                      <div key={cm.k} className="comp-card">
                        <div className="comp-top" style={{background:gc+"12"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <span className="comp-nm" style={{color:cm.c}}>{cm.n}</span>
                            <span className="comp-gr" style={{color:gc}}>{d.grade||"?"}</span>
                          </div>
                          <div style={{fontSize:12,color:"var(--ink3)",marginBottom:8}}>{d.score||0}/{cm.max}점 · {GL[d.grade||"C"]||""}</div>
                          <div className="comp-track"><div style={{width:pct+"%",height:"100%",background:gc,borderRadius:99}}/></div>
                        </div>
                        <div className="comp-body">
                          <div className="comp-det">{d.detail||"분析 데이터 없음"}</div>
                          {d.evidence&&<div className="comp-ev">"{d.evidence}"</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* S7 패턴 */}
            {sec==="s7"&&(
              <div>
                <PH eye="합격 패턴" title="합격생 공통 패턴 분析" sub="유니브클래스 2026 합격생 빅데이터"/>
                <div className="info-note yellow" style={{marginBottom:16}}>합격생 공통 패턴 5가지 — <strong>의문→탐구→해석→확장</strong> 구조, 최신 키워드 반영, 학년간 연속 탐구, Why-How-So 사고구조, 교과-탐구 연계.</div>
                <div className="pat-list">
                  {[{k:"pattern1",n:"의문→탐구→해석→확장",ico:"🔄"},{k:"pattern2",n:"최신 키워드 반영",ico:"🔬"},{k:"pattern3",n:"학년간 연속 탐구",ico:"📚"},{k:"pattern4",n:"Why-How-So 구조",ico:"💡"},{k:"pattern5",n:"교과-탐구 연계",ico:"🔗"}].map(p=>{
                    const d=G?.patternCheck?.[p.k]||{}; const g=d.grade||"?"; const gc=GC[g]||"#868e96";
                    const patCls=g==="S"?"pat-S":g==="A"?"pat-A":g==="B"?"pat-B":g==="C"?"pat-C":"pat-D";
                    return(
                      <div key={p.k} className={`pat-item ${patCls}`}>
                        <div className="pat-ico">{p.ico}</div>
                        <div><div className="pat-nm">{p.n}</div><div className="pat-ev">{d.evidence||"분析 데이터 없음"}</div></div>
                        <div className="pat-gr" style={{background:gc+"18",color:gc,border:`1px solid ${gc}30`}}>{g}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* S8 대학 진단 */}
            {sec==="s8"&&(
              <div>
                <PH eye="입시 진단" title="지원 대학 맞춤 진단" sub="대학별 공식 학종 평가기준 적용"/>
                {G?.univAnalysis?.length?(
                  <>
                    <div className="utabs">
                      {G.univAnalysis.map((u,i)=>(<button key={i} className={`utab${univTab===i?" on":""}`} onClick={()=>setUnivTab(i)}>{i+1}순위 {u.univ}</button>))}
                    </div>
                    {G.univAnalysis.map((u,i)=>univTab!==i?null:(
                      <div key={i}>
                        <div className="u-hero">
                          <div>
                            <div className="u-rank">{["1st","2nd","3rd"][i]} Priority</div>
                            <div className="u-nm">{u.univ}</div>
                            <div className="u-dept">{u.dept}</div>
                          </div>
                          <span className={`vd v-${u.verdict||"보통"}`}>{u.verdict||"보통"}</span>
                        </div>
                        <div className="u-score-row">
                          <span className="u-score-n">{u.score}<span style={{fontSize:14,color:"var(--ink3)"}}>/100</span></span>
                          <div className="u-score-track"><div className="u-score-fill" style={{width:(u.score||0)+"%"}}/></div>
                          <span style={{fontSize:12,color:"var(--ink3)",whiteSpace:"nowrap"}}>이수율 {u.creditRate||"-"}%</span>
                        </div>
                        <div className="u-reason">{u.reason||"분析 데이터 없음"}</div>
                        {u.strategy&&<div className="u-strategy"><strong>🎯 합격 전략: </strong>{u.strategy}</div>}
                        <div className="u-keys">
                          {u.keyStrength&&<div className="uk-s"><strong>💪 핵심 강점</strong><br/>{u.keyStrength}</div>}
                          {u.keyRisk&&<div className="uk-r"><strong>⚠ 보완 필요</strong><br/>{u.keyRisk}</div>}
                        </div>
                      </div>
                    ))}
                  </>
                ):<Empty msg="지원 대학 입력 후 분析하면 표시됩니다"/>}
              </div>
            )}

            {/* S9 학과 적합도 */}
            {sec==="s9"&&(
              <div>
                <PH eye="학과 분析" title="학과 적합도 (Top 5)" sub="성적·이수·탐구활동 다관점 분석"/>
                {G?.majorFit?.length?G.majorFit.slice(0,10).map((m,i)=>(
                  <div key={i} className="mf-card">
                    <div className="mf-top">
                      <div className="mf-num" style={{background:TC[i%TC.length]}}>{i+1}</div>
                      <div className="mf-nm">{m.major}</div>
                      <span className="mf-sc" style={{color:TC[i%TC.length]}}>{m.score||"-"}%</span>
                    </div>
                    <div className="mf-body">
                      <div className="ana-text" style={{marginBottom:10}}>{m.reason}</div>
                      {m.evidence&&<div className="ana-quote">{m.evidence}</div>}
                      {m.matchedSubjects?.length>0&&<div style={{fontSize:13,fontWeight:600,color:"var(--green)",marginTop:9}}>✓ 관련 교과: {m.matchedSubjects.join(", ")}</div>}
                      {m.gap&&<div className="hl-note" style={{marginTop:9}}>⚠ 부족한 부분: {m.gap}</div>}
                      {m.actionPlan&&(
                        <div style={{marginTop:12,padding:12,background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:6}}>🎯 진학 액션 플랜</div>
                          <div style={{fontSize:13,lineHeight:1.7,color:"#1e3a8a"}}>{m.actionPlan}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )):<Empty msg="학과 적합도 분석 데이터 없음"/>}
              </div>
            )}

            {/* S10 탐구 주제 */}
            {sec==="s10"&&(
              <div>
                <PH eye="탐구 제안" title="심화탐구 주제 제안 (5개+)" sub="희망 학과 연계 · 기존 활동과의 연결"/>
                {G?.topics?.length?(
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    {G.topics.slice(0,10).map((t,i)=>(
                      <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:18,position:"relative",overflow:"hidden"}}>
                        {/* 좌측 컬러 띠 */}
                        <div style={{position:"absolute",left:0,top:0,bottom:0,width:5,background:TC[i%TC.length]}}/>
                        <div style={{paddingLeft:10}}>
                          {/* 헤더 */}
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:8}}>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:TC[i%TC.length],marginBottom:4}}>탐구 주제 {i+1}</div>
                              <div style={{fontSize:18,fontWeight:800,marginBottom:6}}>{t.title}</div>
                            </div>
                            {t.forMajor&&(
                              <span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:99,background:TC[i%TC.length]+"22",color:TC[i%TC.length],border:`1px solid ${TC[i%TC.length]}44`,whiteSpace:"nowrap"}}>
                                🎓 {t.forMajor}
                              </span>
                            )}
                          </div>

                          {/* 기존 활동 연계 */}
                          {(t.basedOn||t.connection)&&(
                            <div style={{padding:10,background:"#fffbeb",borderRadius:8,border:"1px solid #fde68a",marginBottom:10}}>
                              <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:4}}>🔗 기존 활동과의 연계</div>
                              {t.basedOn&&<div style={{fontSize:12,color:"#92400e",fontWeight:600,marginBottom:4}}>📌 기반: {t.basedOn}</div>}
                              {t.connection&&<div style={{fontSize:13,lineHeight:1.6,color:"#7c2d12"}}>{t.connection}</div>}
                            </div>
                          )}

                          {/* 추천 이유 */}
                          {t.reason&&(
                            <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink2)",marginBottom:10}}>
                              <strong style={{color:TC[i%TC.length]}}>💡 추천 이유: </strong>{t.reason}
                            </div>
                          )}

                          {/* 방법 + 기대 결과 */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                            {t.method&&(
                              <div style={{padding:10,background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe"}}>
                                <div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:4}}>🔬 탐구 방법</div>
                                <div style={{fontSize:12,lineHeight:1.6,color:"#1e3a8a"}}>{t.method}</div>
                              </div>
                            )}
                            {(t.expectedResult||t.benefit)&&(
                              <div style={{padding:10,background:"#dcfce7",borderRadius:8,border:"1px solid #86efac"}}>
                                <div style={{fontSize:11,fontWeight:700,color:"#166534",marginBottom:4}}>🌱 기대 결과</div>
                                <div style={{fontSize:12,lineHeight:1.6,color:"#14532d"}}>{t.expectedResult||t.benefit}</div>
                              </div>
                            )}
                          </div>

                          {/* 난이도 */}
                          {t.difficulty&&(
                            <div style={{display:"inline-block",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                              background:t.difficulty==="상"?"#fee2e2":t.difficulty==="중"?"#fef3c7":"#dcfce7",
                              color:t.difficulty==="상"?"#991b1b":t.difficulty==="중"?"#92400e":"#166534"}}>
                              난이도: {t.difficulty}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ):<Empty msg="탐구 주제 데이터 없음"/>}
              </div>
            )}

            {/* S11 면접 */}
            {sec==="s11"&&(
              <div>
                <PH eye="면접 대비" title="예상 면접 질문 (7개+)" sub="생기부 기반 개인화 · 답변 가이드 포함"/>
                {G?.interviewQs?.length?(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {G.interviewQs.slice(0,10).map((q,i)=>(
                      <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:18}}>
                        {/* 질문 */}
                        <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
                          <span style={{fontSize:22,fontWeight:900,color:TC[i%TC.length],fontFamily:"'DM Mono',monospace",minWidth:36}}>Q{i+1}</span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:15,fontWeight:700,lineHeight:1.5,marginBottom:6}}>{q.question}</div>
                            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                              {q.category&&<span style={{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:99,background:TC[i%TC.length]+"22",color:TC[i%TC.length]}}>{q.category}</span>}
                              {q.basedOn&&<span style={{fontSize:11,color:"var(--ink3)"}}>📍 근거: {q.basedOn}</span>}
                            </div>
                          </div>
                        </div>

                        {/* 모범 답변 */}
                        {q.modelAnswer&&(
                          <div style={{padding:12,background:"#dcfce7",borderRadius:8,border:"1px solid #86efac",marginBottom:10}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#166534",marginBottom:6}}>💬 모범 답변 방향</div>
                            <div style={{fontSize:13,lineHeight:1.7,color:"#14532d"}}>{q.modelAnswer}</div>
                          </div>
                        )}

                        {/* 팁 */}
                        {q.tip&&(
                          <div style={{padding:12,background:"#eff6ff",borderRadius:8,border:"1px solid #bfdbfe",marginBottom:10}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:6}}>💡 답변 팁</div>
                            <div style={{fontSize:13,lineHeight:1.7,color:"#1e3a8a"}}>{q.tip}</div>
                          </div>
                        )}

                        {/* 주의 */}
                        {q.pitfall&&(
                          <div style={{padding:12,background:"#fee2e2",borderRadius:8,border:"1px solid #fca5a5"}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#991b1b",marginBottom:6}}>⚠ 피해야 할 답변</div>
                            <div style={{fontSize:13,lineHeight:1.7,color:"#7f1d1d"}}>{q.pitfall}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ):<Empty msg="면접 질문 데이터 없음"/>}
              </div>
            )}

            {/* S12 종합 리포트 */}
            {sec==="s12"&&(
              <div>
                <PH eye="종합 리포트" title="정밀 분석 종합 리포트" sub={`${G?.schoolName||""} · ${name} 학생 · 모든 탭 종합`}/>

                {/* 활용 안내 (신규) */}
                <div style={{background:"linear-gradient(135deg,#eff6ff,#dbeafe)",border:"1px solid #93c5fd",borderRadius:12,padding:18,marginBottom:18}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#1e40af",marginBottom:8}}>📖 종합 리포트 활용 가이드</div>
                  <div style={{fontSize:13,lineHeight:1.8,color:"#1e3a8a"}}>
                    이 리포트는 <strong>모든 탭의 분석을 종합</strong>한 결과입니다. 활용 방법:<br/>
                    • <strong>자기소개서 작성</strong>: 강점·핵심 활동·역량 평가를 참고해 글감 정리<br/>
                    • <strong>면접 준비</strong>: 면접 질문 탭과 함께 활용, 본 리포트의 키워드 숙지<br/>
                    • <strong>학기 계획</strong>: 부족한 부분·액션 플랜으로 남은 학기 활동 설계<br/>
                    • <strong>학부모 상담</strong>: 객관적 진단 자료로 제시
                  </div>
                </div>

                {/* 메타 정보 */}
                <div className="g4" style={{marginBottom:18}}>
                  {[{v:name,l:"학생",c:"var(--blue)"},{v:G?.gradeAvg||"-",l:"평균등급",c:"var(--purple)"},{v:total+"점",l:"종합점수",c:"var(--gold)"},{v:grd+"등급",l:"종합등급",c:GC[grd]}].map((m,i)=>(
                    <div key={i} className="metric" style={{borderTop:`4px solid ${m.c}`}}>
                      <div style={{fontSize:m.v.length>4?14:18,fontWeight:900,color:m.c,marginBottom:5}}>{m.v}</div>
                      <div style={{fontSize:10,fontWeight:700,color:"var(--ink3)",letterSpacing:".1em",textTransform:"uppercase"}}>{m.l}</div>
                    </div>
                  ))}
                </div>

                {/* 학생 유형 */}
                {G?.studentType&&(
                  <div style={{background:"linear-gradient(135deg,#4c6ef5,#6741d9)",color:"#fff",padding:24,borderRadius:14,marginBottom:18,textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:600,opacity:.8,marginBottom:6,letterSpacing:".15em"}}>STUDENT PROFILE</div>
                    <div style={{fontSize:22,fontWeight:800}}>{G.studentType}</div>
                  </div>
                )}

                {/* 메인 편지 */}
                <div className="letter-wrap">
                  <div className="letter-hd">
                    <div><div className="letter-to">To.</div><div className="letter-nm">{name} 학생</div></div>
                    <div className="letter-meta">
                      <div>{G?.schoolName||""}</div>
                      <div>{new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"})}</div>
                      <div style={{marginTop:5,fontSize:14,color:"#748ffc"}}>{total}점 · {grd}등급</div>
                    </div>
                  </div>
                  <div className="letter-body" style={{whiteSpace:"pre-wrap",lineHeight:1.9}}>{G?.reportLetter||"분석 실행 후 생성됩니다."}</div>
                  <div className="letter-ft">
                    <div className="letter-sig">리포트아이 분석팀 드림</div>
                    <div style={{display:"flex",gap:9}}>
                      <button className="btn-act" onClick={()=>navigator.clipboard?.writeText(G?.reportLetter||"").then(()=>alert("복사됐습니다"))}>📋 복사</button>
                      <button className="btn-act" onClick={()=>window.print()}>🖨 PDF 출력</button>
                    </div>
                  </div>
                </div>

                {/* ─── 부록 1: 역량 채점 요약 (강화) ─── */}
                {G?.competencies&&(
                  <div className="card" style={{marginTop:20}}>
                    <div className="card-eye">📊 부록 1. 역량 채점 요약 (5개 역량)</div>
                    <table className="sum-tbl" style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr><th>역량</th><th>등급</th><th>점수</th><th>비율</th><th>핵심 근거</th></tr></thead>
                      <tbody>
                        {COMP.map(cm=>{
                          const d=G.competencies[cm.k]||{}; const gc=GC[d.grade||"C"]||"#868e96";
                          const firstEv = (d.evidenceList && d.evidenceList[0]) || d.evidence || "";
                          return(
                            <tr key={cm.k}>
                              <td style={{fontWeight:700,padding:"11px 14px",borderBottom:"1px solid var(--border)"}}>{cm.n}</td>
                              <td style={{padding:"11px 14px",borderBottom:"1px solid var(--border)"}}><span style={{background:gc+"18",color:gc,padding:"3px 10px",borderRadius:3,fontWeight:800,fontSize:13,border:`1px solid ${gc}30`}}>{d.grade||"?"}</span></td>
                              <td style={{fontFamily:"'DM Mono',monospace",fontWeight:700,padding:"11px 14px",borderBottom:"1px solid var(--border)"}}>{d.score||0}/{cm.max}</td>
                              <td style={{color:"var(--ink3)",padding:"11px 14px",borderBottom:"1px solid var(--border)"}}>{cm.max}%</td>
                              <td style={{fontSize:12,color:"var(--ink3)",fontStyle:"italic",maxWidth:220,padding:"11px 14px",borderBottom:"1px solid var(--border)"}}>{firstEv.slice(0,80)}{firstEv.length>80?"…":""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ─── 부록 2: 합격 패턴 5가지 평가 ─── */}
                {G?.patternCheck&&(
                  <div className="card" style={{marginTop:14}}>
                    <div className="card-eye">🏆 부록 2. 합격생 패턴 5가지 평가</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {[{k:"pattern1",n:"의문→탐구→해석→확장",ico:"🔄"},{k:"pattern2",n:"최신 키워드 반영",ico:"🔬"},{k:"pattern3",n:"학년간 연속 탐구",ico:"📚"},{k:"pattern4",n:"Why-How-So 구조",ico:"💡"},{k:"pattern5",n:"교과-탐구 연계",ico:"🔗"}].map(p=>{
                        const d=G.patternCheck[p.k]||{}; const g=d.grade||"?"; const gc=GC[g]||"#868e96";
                        return(
                          <div key={p.k} style={{padding:14,background:"var(--bg2)",border:`1px solid ${gc}33`,borderLeft:`4px solid ${gc}`,borderRadius:8}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontSize:18}}>{p.ico}</span>
                                <span style={{fontSize:14,fontWeight:700}}>{p.n}</span>
                              </div>
                              <span style={{background:gc+"22",color:gc,padding:"4px 12px",borderRadius:99,fontWeight:800,fontSize:13,border:`1px solid ${gc}44`}}>{g}등급</span>
                            </div>
                            <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink2)"}}>{d.evidence||"분석 데이터 없음"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ─── 부록 3: 핵심 강점 TOP 3 ─── */}
                {G?.strengths?.length>0&&(
                  <div className="card" style={{marginTop:14}}>
                    <div className="card-eye">✦ 부록 3. 핵심 강점 TOP 3</div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {G.strengths.slice(0,3).map((s,i)=>(
                        <div key={i} style={{padding:14,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#166534",marginBottom:4}}>[{s.area}] 강점 {i+1}</div>
                          <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>{s.title}</div>
                          <div style={{fontSize:13,lineHeight:1.7,color:"#14532d",marginBottom:6}}>{s.content}</div>
                          {s.quote&&<div style={{fontStyle:"italic",fontSize:12,padding:"8px 12px",background:"#dcfce7",borderLeft:"3px solid #166534",borderRadius:4,color:"#14532d"}}>"{s.quote}"</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── 부록 4: 추천 학과 TOP 3 ─── */}
                {G?.majorFit?.length>0&&(
                  <div className="card" style={{marginTop:14}}>
                    <div className="card-eye">🎓 부록 4. 추천 학과 TOP 3</div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {G.majorFit.slice(0,3).map((m,i)=>(
                        <div key={i} style={{padding:14,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{fontSize:14,fontWeight:800}}>{i+1}. {m.major}</div>
                            <span style={{fontFamily:"'DM Mono',monospace",fontWeight:800,color:TC[i%TC.length]}}>{m.score||"-"}%</span>
                          </div>
                          <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink2)"}}>{(m.reason||"").slice(0,200)}{m.reason?.length>200?"…":""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── 부록 5: 심화 탐구 주제 TOP 3 ─── */}
                {G?.topics?.length>0&&(
                  <div className="card" style={{marginTop:14}}>
                    <div className="card-eye">💡 부록 5. 심화 탐구 주제 TOP 3</div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {G.topics.slice(0,3).map((t,i)=>(
                        <div key={i} style={{padding:14,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#92400e",marginBottom:4}}>{i+1}. {t.title}</div>
                          {t.forMajor&&<div style={{fontSize:11,fontWeight:600,color:"#a16207",marginBottom:6}}>🎓 추천 학과: {t.forMajor}</div>}
                          <div style={{fontSize:13,lineHeight:1.7,color:"#7c2d12"}}>{t.reason||t.connection||""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── 부록 6: 대학별 충족률 요약 ─── */}
                {G?.creditStatus?.byUniv?.length>0&&(
                  <div className="card" style={{marginTop:14}}>
                    <div className="card-eye">🏫 부록 6. 지원 대학별 권장과목 충족률</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{borderBottom:"2px solid var(--border)"}}><th style={{padding:"10px 12px",textAlign:"left"}}>대학</th><th style={{padding:"10px 12px",textAlign:"left"}}>학과</th><th style={{padding:"10px 12px",textAlign:"center"}}>충족률</th><th style={{padding:"10px 12px",textAlign:"left"}}>주요 미이수</th></tr></thead>
                      <tbody>
                        {G.creditStatus.byUniv.map((u,i)=>{
                          const col = u.rate>=70?"var(--green)":u.rate>=40?"var(--gold)":"var(--red)";
                          return(
                            <tr key={i} style={{borderBottom:"1px solid var(--border)"}}>
                              <td style={{padding:"10px 12px",fontWeight:700}}>{u.univ}</td>
                              <td style={{padding:"10px 12px"}}>{u.dept}</td>
                              <td style={{padding:"10px 12px",textAlign:"center",fontFamily:"'DM Mono',monospace",fontWeight:800,color:col}}>{u.rate}%</td>
                              <td style={{padding:"10px 12px",fontSize:12,color:"var(--ink3)"}}>{(u.missing||[]).slice(0,3).join(", ")||"없음"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{marginTop:18,padding:"12px 16px",background:"#f0f2f8",borderRadius:6,border:"1px solid var(--border)",fontSize:12,color:"var(--ink3)",lineHeight:1.8}}>
                  리포트아이 (Report-I) · 2028학년도 대입 데이터 기준 · {new Date().toLocaleDateString("ko-KR")}<br/>
                  본 리포트는 학생부 원문 분석 기반이며 실제 입시 결과와 차이가 있을 수 있습니다.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </>);
}
