// ══════════════════════════════════════════════
// 리포트아이 — 분석 프롬프트 v15
// 호출 2단계 분리: 
//   Phase 1: 성적/활동/역량/강점·보완 (구조 데이터)
//   Phase 2: 종합리포트 + 탐구주제 + 면접질문 (서술)
// ══════════════════════════════════════════════

export const ANALYSIS_CRITERIA = `
■ 합격생 패턴 5가지
P1 의문→탐구→해석→확장 (자료조사만=C이하)
P2 최신키워드 반영 (교과개념→최신연구)
P3 학년간 연속탐구 (1학년→2·3학년 심화)
P4 Why-How-So (왜? 어떻게? 무엇을 깨달았나?)
P5 교과-탐구 밀접 연계
채점: S=Why+How+So+확장 / A=2개이상 / B=So약함 / C=나열식 / D=단순참여

■ 대학별 평가 핵심
서울대: 학업역량+학업태도+학업외소양 (종합정성)
연세대: 학기별 성적변화 → 발전가능성 중시
고려대: 성장서사 + 리더십
서강대: 학업50% + 성장30% + 공동체20%
성균관대: 자기주도 + 융합 + 기업가정신
한양대: 학업역량 + 인성
중앙대: 학업/탐구 균형 + 진로 일관성
경희대: 인성 + 학업 + 진로 균형
이화여대: 학업 + 활동의 깊이
건국대: 학업30% + 진로40% + 공동체30%
동국대: 전공적합성 50% 강조
서울과기대: 진로탐구50% + 기초학업30% + 공동체20%

■ 역량 배점 (총 100점)
학업역량 40 / 탐구역량 25 / 진로역량 15 / 공동체역량 10 / 성장역량 10
`;

// ─────────────────────────────────────────────
// Phase 1: 구조 데이터 추출 (성적·활동·역량·강점)
// ─────────────────────────────────────────────
export function buildPhase1Prompt(parsed, name, major, curr, ranks, univFitData) {
  const targets = ranks.filter(r => r.u || r.d);
  const targetStr = targets.length
    ? targets.map((t,i)=>`${i+1}순위:${t.u} ${t.d}`).join(' / ')
    : '미입력';

  // 권장과목 충족률 사전 계산 결과 (로컬에서 미리 계산됨)
  const univFitStr = (univFitData || []).map(f => {
    if (!f.hasCriteria) return `[${f.univ} ${f.dept}] 권장과목 데이터 없음`;
    return `[${f.univ} ${f.dept}] 충족률 ${f.rate}% — 충족: ${f.matched.join(',') || '없음'} / 미이수: ${f.missing.join(',') || '없음'} / ${f.note}`;
  }).join('\n');

  const gradesStr = parsed.grades.length > 0
    ? parsed.grades.map(g => `${g.grade}${g.semester} ${g.subject} ${g.credit}단위 원점수${g.rawScore} 평균${g.avg} SD${g.sd} ${g.level}등급`).join('\n')
    : '(원문에서 직접 추출하세요)';

  const achvStr = parsed.achievementSubjects.length > 0
    ? parsed.achievementSubjects.map(a => `${a.grade}${a.semester} ${a.subject} 성취도${a.achievement} 분포:${a.distribution}`).join('\n')
    : '(없음)';

  const behaviorStr = Object.entries(parsed.behaviorOpinion || {})
    .map(([g, t]) => `[${g} 종합의견]\n${t}`).join('\n\n');

  const rawTextTrimmed = parsed.rawText.length > 14000
    ? parsed.rawText.slice(0, 14000) + '\n...(이하 생략 — 전체는 원문 참고)'
    : parsed.rawText;

  return `당신은 대한민국 최상위 입학사정관 + 생기부 컨설턴트입니다.
[Phase 1: 구조 데이터 추출] 단계입니다. 성적·활동·역량·강점·보완을 풍부하게 추출하세요.

【⚠️ 절대 규칙】
1. 모든 배열은 최소 개수를 반드시 채울 것. 빈 배열([]) 절대 금지.
2. 각 필드의 최소 분량 지시를 반드시 지킬 것.
3. 원문 인용은 따옴표로 표시. 없는 내용 생성 금지.
4. JSON만 반환. 마크다운 금지.

【분석 기준】
${ANALYSIS_CRITERIA}

【학생 정보】
이름: ${name||parsed.studentInfo?.name||'미입력'}
희망 전공: ${major||'미입력'}
학교: ${parsed.studentInfo?.school||'원문 추출'}
교육과정: ${curr==='2022'?'2022 개정 (5등급제)':curr==='2015'?'2015 개정 (9등급제)':'자동 감지'}
평균등급(참고): ${parsed.gradeAvg}
지원 희망: ${targetStr}

【대학별 권장과목 충족률 (사전 계산 — 그대로 활용)】
${univFitStr || '(지원 희망 미입력)'}

【로컬 파서 성적 데이터】
${gradesStr}

【성취도 과목 (진로선택)】
${achvStr}

【행동특성 및 종합의견】
${behaviorStr || '(원문에서 추출)'}

【생기부 원문】
${rawTextTrimmed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 응답 JSON 스키마 (모든 필드 필수):

{
  "schoolName": "학교명",
  "studentName": "${name||'학생명'}",
  "curriculum": "2022 또는 2015",
  "totalScore": 종합점수(0-100),
  "gradeAvg": "전체 평균등급 (예: 2.34)",
  "studentType": "학생유형 한줄 정의",

  "grades": [
    /* ⚠️ 최소 12개 이상! 학기별 모든 일반선택 과목 */
    {"grade":"1학년","semester":"1학기","gN":1,"sN":1,"subject":"과목명","credit":"단위","rawScore":"원점수","avg":"평균","sd":"표준편차","level":등급숫자,"group":"국어/수학/영어/사회/과학/기술가정/예체능/기타"}
  ],

  "achievementSubjects": [
    /* 진로선택 과목 (성취도 A/B/C) */
    {"grade":"학년","semester":"학기","gN":숫자,"sN":숫자,"subject":"과목","credit":"단위","achievement":"A","distribution":"A:%% B:%% C:%%","students":"수강자수","group":"교과군","note":"해석"}
  ],

  "gradeAnalysis": {
    "currExplain": "교육과정 해석 150자 이상",
    "overall": "전체 성적 종합 분석 500자 이상 — 학기별 추이·강점교과·약점교과·구체 등급 수치",
    "majorLink": "희망전공 연계 교과 분석 300자 이상 — 구체 과목명·등급 명시",
    "trendByGroup": {
      "국영수": "국영수 추이 분석 200자 이상",
      "국영수사": "국영수사 추이 분석 200자 이상",
      "국영수과": "국영수과 추이 분석 200자 이상",
      "전공연계": "희망전공 관련 교과 추이 분석 200자 이상"
    },
    "rising": ["상승 과목 3개 이상"],
    "falling": ["하락 과목 (없으면 '해당 없음' 문자열 1개)"]
  },

  "creditStatus": {
    /* ⚠️ 사전 계산된 univFitData를 그대로 활용하되 해석을 추가 */
    "byUniv": [
      /* 지원 희망 대학별 — univFitData 결과를 풀어서 작성 */
      {
        "univ":"대학명","dept":"학과명","rate":충족률숫자,
        "matched":["충족 과목"],"missing":["미이수 권장 과목"],
        "analysis":"이 대학·학과 기준으로 분석 200자 이상 — 어떤 점이 강하고 무엇이 아쉬운지",
        "recommend":"앞으로 어떤 과목을 들으면 좋을지 구체 안내 150자 이상"
      }
    ],
    "summary": "전체 이수 현황 종합 평가 300자 이상"
  },

  "patternCheck": {
    "pattern1":{"grade":"S/A/B/C/D","evidence":"원문 인용 포함 200자 이상"},
    "pattern2":{"grade":"S/A/B/C/D","evidence":"키워드 명시 200자 이상"},
    "pattern3":{"grade":"S/A/B/C/D","evidence":"학년간 연계 200자 이상"},
    "pattern4":{"grade":"S/A/B/C/D","evidence":"Why-How-So 200자 이상"},
    "pattern5":{"grade":"S/A/B/C/D","evidence":"교과-탐구 연결 200자 이상"}
  },

  "competencies": {
    /* ⚠️ 각 detail은 400자 이상, evidence는 100자 이상 원문 인용 */
    "academic":{"score":점수,"max":40,"grade":"S/A/B/C","detail":"학업역량 분석 400자+ (과목명·등급·수치·원문)","evidence":"원문 인용 100자+"},
    "inquiry":{"score":점수,"max":25,"grade":"S/A/B/C","detail":"탐구역량 분석 400자+ (탐구 사례 원문)","evidence":"원문 인용 100자+"},
    "career":{"score":점수,"max":15,"grade":"S/A/B/C","detail":"진로역량 분석 300자+ (진로활동 원문)","evidence":"원문 인용 80자+"},
    "community":{"score":점수,"max":10,"grade":"S/A/B/C","detail":"공동체역량 분석 300자+ (리더십·봉사 근거)","evidence":"원문 인용 80자+"},
    "growth":{"score":점수,"max":10,"grade":"S/A/B/C","detail":"성장역량 분석 300자+ (변화·성찰 근거)","evidence":"원문 인용 80자+"}
  },

  "strengths": [
    /* ⚠️ 최소 5개 이상! 각각 다른 영역에서 — 연계·융합·심화·탐구 관점 포함 */
    {"area":"학업/탐구/진로/공동체/성장","title":"강점 제목","content":"300자 이상 (학년·학기·활동명·연계활동 명시)","quote":"원문 직접 인용 100자 이상","highlight":"입시 의미 80자 이상"}
  ],

  "weaknesses": [
    /* ⚠️ 최소 3개 이상 */
    {"area":"영역","title":"보완점 제목","content":"200자 이상","suggestion":"구체적 개선 방법 100자 이상"}
  ],

  "activities": [
    /* ⚠️ 최소 15개 이상! 자율·동아리·진로·봉사·세특·종합의견 전부 추출 */
    {"year":"학년","semester":"학기","gN":숫자,"sN":숫자,"type":"자율/동아리/진로/봉사/세특/종합의견","title":"활동명","content":"200자 이상 (원문 핵심 인용)","whyHowSo":"W: 동기 / H: 방법 / S: 성장·결과"}
  ],

  "keywords": [
    /* ⚠️ 최소 25개 이상! 빈도와 함께 */
    {"word":"키워드","count":등장횟수,"area":"학업/탐구/진로/공동체"}
  ],

  "methodAnalysis": {
    /* 탐구 방법 빈도 분류 */
    "methods": [
      {"type":"실험","count":횟수,"examples":["활동명 1","활동명 2"]},
      {"type":"문헌조사","count":횟수,"examples":["활동명"]},
      {"type":"발표","count":횟수,"examples":["활동명"]},
      {"type":"토론","count":횟수,"examples":["활동명"]},
      {"type":"설계/제작","count":횟수,"examples":["활동명"]},
      {"type":"분석","count":횟수,"examples":["활동명"]}
    ],
    "dominant": "주요 탐구 방법 (가장 많은 것)",
    "isSkewed": true/false,
    "analysis": "탐구 방법 편향 분석 200자 이상 — 균형 잡혔는지, 어떤 방법을 더 추가하면 좋을지"
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 최종 점검:
- grades < 12 → 다시 추출
- activities < 15 → 다시 추출
- strengths < 5 → 다시 작성
- weaknesses < 3 → 다시 작성
- keywords < 25 → 다시 추출
- 어떤 detail이든 400자 미만이면 다시 작성
JSON만 반환.`;
}

// ─────────────────────────────────────────────
// Phase 2: 종합 리포트 + 탐구주제 + 면접질문 (서술)
// ─────────────────────────────────────────────
export function buildPhase2Prompt(parsed, phase1Result, name, major, ranks, univFitData) {
  const targets = ranks.filter(r => r.u || r.d);
  const targetStr = targets.length
    ? targets.map((t,i)=>`${i+1}순위:${t.u} ${t.d}`).join(' / ')
    : '미입력';

  // Phase 1 결과 요약 (Phase 2가 참고)
  const summary = {
    studentType: phase1Result.studentType,
    gradeAvg: phase1Result.gradeAvg,
    gradeAnalysis: phase1Result.gradeAnalysis?.overall?.slice(0, 600),
    competencies: Object.entries(phase1Result.competencies || {}).map(
      ([k,v]) => `${k}: ${v.grade}등급 ${v.score}점`
    ).join(' / '),
    topStrengths: (phase1Result.strengths || []).slice(0, 3).map(s => s.title).join(', '),
    topActivities: (phase1Result.activities || []).slice(0, 5).map(a => a.title).join(', '),
    keywords: (phase1Result.keywords || []).slice(0, 10).map(k => k.word || k).join(', '),
    creditSummary: phase1Result.creditStatus?.summary?.slice(0, 300)
  };

  const univFitStr = (univFitData || []).map(f => {
    if (!f.hasCriteria) return `[${f.univ} ${f.dept}] 권장과목 미지정`;
    return `[${f.univ} ${f.dept}] 충족률 ${f.rate}% / 미이수: ${f.missing.slice(0,5).join(',')}`;
  }).join('\n');

  return `당신은 대한민국 최상위 입학사정관 + 생기부 컨설턴트입니다.
[Phase 2: 종합 리포트 작성] 단계입니다.

⚠️ Phase 1에서 이미 추출된 분석 결과를 참고하여, 학생에게 보내는 ★깊이 있는 종합 리포트★를 작성하세요.

【Phase 1 분석 요약 (이미 추출된 데이터)】
- 학생 유형: ${summary.studentType}
- 평균 등급: ${summary.gradeAvg}
- 성적 분석: ${summary.gradeAnalysis}
- 역량 채점: ${summary.competencies}
- 핵심 강점: ${summary.topStrengths}
- 주요 활동: ${summary.topActivities}
- 키워드: ${summary.keywords}
- 이수 현황: ${summary.creditSummary}

【학생 정보】
이름: ${name} / 희망 전공: ${major} / 지원 희망: ${targetStr}

【대학별 충족률】
${univFitStr || '(지원 희망 미입력)'}

【생기부 종합의견 원문 (참고)】
${Object.entries(parsed.behaviorOpinion || {}).map(([g,t])=>`[${g}] ${t.slice(0,500)}`).join('\n\n') || '(없음)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 응답 JSON 스키마:

{
  "majorFit": [
    /* ⚠️ 최소 5개 학과 추천! 성적·이수현황·탐구활동 다관점 분석 */
    {
      "rank":순위,
      "major":"학과명",
      "score":적합도점수(0-100),
      "reason":"적합 사유 400자 이상 — 성적·이수·활동·탐구주제 등 다양한 관점에서",
      "evidence":"원문 인용 또는 활동 근거 150자 이상",
      "matchedSubjects":["관련 교과 5개 이상"],
      "gap":"부족한 부분 100자 이상",
      "actionPlan":"이 학과 진학을 위해 앞으로 해야 할 일 200자 이상"
    }
  ],

  "topics": [
    /* ⚠️ 학과별 최소 5개 이상! 희망 진로학과에 맞게 — 지금까지 활동과 연결해서 */
    {
      "title":"탐구 주제",
      "forMajor":"이 주제가 추천되는 학과",
      "basedOn":"근거 활동 (Phase 1의 activities 중 하나)",
      "connection":"기존 활동과의 연결성 200자 이상",
      "reason":"왜 이 주제인지 200자 이상",
      "method":"탐구 방법론 150자 이상",
      "expectedResult":"기대 결과·성장 100자 이상",
      "difficulty":"상/중/하"
    }
  ],

  "interviewQs": [
    /* ⚠️ 최소 7개 면접 예상 질문 */
    {
      "question":"면접 질문",
      "category":"학업/탐구/진로/공동체/인성",
      "basedOn":"생기부 근거 활동",
      "modelAnswer":"답변 방향 200자 이상",
      "tip":"답변 팁 150자 이상",
      "pitfall":"피해야 할 답변 100자 이상"
    }
  ],

  "reportLetter": "⚠️ 2500자 이상 필수! 담임이 학생에게 보내는 진심 어린 편지체. 다음 10개 단락 모두 포함하며, 각 단락은 빈 줄(\\n\\n)로 구분:\n\n①이름 호명·3년 한줄 정의 (200자+)\n②교과 성적 심층 분석 — 학기별 추이·원점수·SD·전공 연계 (300자+)\n③국영수·국영수사·국영수과·전공연계 4관점 성적 추이 (300자+)\n④이수 현황과 권장과목 충족률 — 강점·아쉬운 점 (300자+)\n⑤핵심 탐구 활동 3개 이상 따옴표 인용·해석 (400자+)\n⑥합격패턴 5가지 평가·종합 (250자+)\n⑦5개 역량 종합 평가 (250자+)\n⑧지원 대학별 합격 전략 (300자+)\n⑨보완점·앞으로 해야 할 심화탐구 (250자+)\n⑩응원과 격려·당부 (150자+)"
}

⚠️ majorFit < 5 → 다시 작성
⚠️ topics < 5 → 다시 작성
⚠️ interviewQs < 7 → 다시 작성
⚠️ reportLetter < 2500자 → 다시 작성
JSON만 반환. 마크다운 금지.`;
}

// 하위 호환: 단일 호출 (v13 호환용)
export function buildGptPrompt(parsed, name, major, curr, ranks) {
  // v15에서는 Phase 1만 호출되도록
  return buildPhase1Prompt(parsed, name, major, curr, ranks, []);
}
