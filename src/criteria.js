// ══════════════════════════════════════════════
// 리포트아이 — Claude 분석 프롬프트 (v2)
// 핵심 원칙: PDF 원본이 진실. 로컬파서는 참고만.
// Claude가 PDF를 직접 보고 모든 데이터를 추출.
// ══════════════════════════════════════════════

export const ANALYSIS_CRITERIA = `
■ 합격생 패턴 5가지 (유니브클래스 2026)
P1: 의문→탐구→해석→확장 (자료조사만=C이하)
P2: 최신키워드 반영 (교과개념→최신연구)
P3: 학년간 연속탐구 (1학년→2·3학년심화)
P4: Why-How-So (왜?어떻게?무엇을깨달았나?)
P5: 교과-탐구 밀접연계
채점: S=Why+How+So+확장 / A=2개이상 / B=So약함 / C=나열식 / D=단순참여

■ 대학별 핵심
서울대: 학업역량+학업태도+학업외소양(종합정성)
연세대: 학기별성적변화→발전가능성 중시
고려대: 성장서사+리더십
서강대: 학업50%+성장30%+공동체20%(과정>결과)
동국대: 전공적합성50%★
성균관대: 자기주도+융합+기업가정신
한양대: 학업역량+인성
건국대: 학업30%+진로40%+공동체30%
서울과기대: 진로탐구50%+기초학업30%+공동체20%

■ 역량배점: 학업40+탐구25+진로15+공동체10+성장10
■ 분析원칙: 원문근거필수. 원문직접인용(따옴표). 없는내용생성금지.
`;

export function buildGptPrompt(parsed, name, major, curr, ranks) {
  const targets = ranks.filter(r => r.u || r.d);
  const targetStr = targets.length
    ? targets.map((t,i)=>`${i+1}순위:${t.u} ${t.d}`).join(' / ')
    : '미입력';

  const univSchema = targets.map((t,i) => `{
    "rank":${i+1},"univ":"${t.u}","dept":"${t.d}",
    "score":0,"verdict":"유리/보통/불리","creditRate":0,
    "reason":"이대학 공식평가기준으로 250자+분析(원문근거필수)",
    "keyStrength":"핵심강점","keyRisk":"보완사항",
    "strategy":"합격전략150자+"
  }`).join(',');

  // ⚠️ 변경점: 로컬파서 데이터는 "참고용"으로만 제공
  // Claude가 PDF를 직접 보고 추출하는 것이 진실
  const gradesHint = parsed.grades.length > 0
    ? `(참고용 — 로컬 파서가 ${parsed.grades.length}개 과목 추출. 단, 표 구조에 따라 부정확할 수 있음. PDF 원본을 우선 신뢰할 것)\n` +
      parsed.grades.slice(0, 10).map(g => `${g.grade}${g.semester} ${g.subject} ${g.level}등급`).join(' / ')
    : '(로컬 파서 추출 실패 — PDF에서 직접 읽을 것)';

  const achvHint = parsed.achievementSubjects.length > 0
    ? `(참고용 — ${parsed.achievementSubjects.length}개 추출)\n` +
      parsed.achievementSubjects.slice(0, 5).map(a => `${a.grade}${a.semester} ${a.subject} 성취도${a.achievement}`).join(' / ')
    : '';

  const behaviorStr = Object.entries(parsed.behaviorOpinion || {})
    .map(([g, t]) => `[${g} 종합의견] ${t}`).join('\n\n');

  // 원문 텍스트는 보조 자료 (PDF 원본이 우선)
  const rawTextTrimmed = parsed.rawText.length > 30000
    ? parsed.rawText.slice(0, 30000) + '\n...(이하생략)'
    : parsed.rawText;

  return `당신은 대한민국 최상위 입학사정관+생기부 전문 컨설턴트입니다.

【가장 중요한 원칙】
1. 첨부된 PDF 원본이 유일한 진실(Ground Truth)입니다.
2. 아래 제공되는 "로컬파서 추출 데이터"와 "원문 텍스트"는 보조 참고자료입니다. 
   PDF와 충돌하면 무조건 PDF를 따르세요.
3. 로컬파서는 정규식 기반이라 표 구조에 따라 부정확합니다. 
   특히 성적(grades), 성취도(achievementSubjects), 학년/학기 매핑은 PDF에서 직접 확인하세요.
4. 활동명, 세특 내용, 종합의견은 반드시 PDF 원문 그대로 인용하세요.

【출력 형식】
JSON만 반환. 마크다운/코드블록 절대 금지. 모든 필드 구체적으로 작성.

【분석 기준】
${ANALYSIS_CRITERIA}

【학생 정보】
이름:${name||parsed.studentInfo?.name||'PDF에서 확인'} / 희망전공:${major||'미입력'}
교육과정:${curr==='2022'?'2022개정(5등급제)':curr==='2015'?'2015개정(9등급제)':'PDF에서 자동감지'}
지원희망:${targetStr}

【로컬파서 참고 데이터 — 정확하지 않을 수 있음, PDF 우선】
성적: ${gradesHint}
성취도: ${achvHint || '없음'}

【종합의견 원문 (참고용)】
${behaviorStr || '없음 — PDF에서 직접 확인'}

【생기부 원문 텍스트 (보조자료)】
${rawTextTrimmed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 지시:
- grades 배열은 PDF의 학교생활기록부II(교과학습발달상황) 표를 직접 보고 채우세요.
  · 각 학기별로 빠뜨리지 말 것
  · 등급(1~5 또는 1~9)을 정확히 읽을 것
  · 진로선택과목(성취도 ABC)은 achievementSubjects에 따로 분리
- activities 배열은 PDF의 창의적체험활동/세특/종합의견에서 직접 추출하세요.
- 모든 원문 인용(quote, evidence)은 PDF에서 그대로 따옴표 인용하세요. 
  로컬파서 텍스트는 깨졌을 수 있으니 PDF를 참고하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【응답 JSON 스키마 - 모든 필드 필수】
{
  "schoolName":"PDF에서 학교명 추출",
  "studentName":"${name||'PDF에서 학생명 추출'}",
  "curriculum":"2022 또는 2015 (PDF에서 판단)",
  "totalScore":0,
  "gradeAvg":"전체 평균등급 (PDF의 성적표를 직접 계산. 예: 2.34)",
  "studentType":"학생유형 한줄 (예: 역사·고고학 융합탐구형 인재)",

  "grades": [
    // ⚠️ PDF의 교과학습발달상황 표를 직접 보고 추출
    // 학기별로 모든 일반선택과목 포함
    {"grade":"1학년","semester":"1학기","gN":1,"sN":1,"subject":"과목명","credit":"단위","rawScore":"원점수","avg":"평균","sd":"표준편차","level":등급숫자,"group":"국어/수학/영어/사회/과학/기술가정/예체능/기타"}
  ],

  "achievementSubjects": [
    // ⚠️ 진로선택과목 (성취도 A/B/C로 표기되는 과목)
    {"grade":"학년","semester":"학기","gN":숫자,"sN":숫자,"subject":"과목","credit":"단위","achievement":"A","distribution":"A:%% B:%% C:%%","students":"수강자수","group":"교과군","note":"해석"}
  ],

  "gradeAnalysis":{
    "currExplain":"교육과정 해석 100자+",
    "overall":"전체 성적 종합분석 300자+ (학기별 추이·강점교과·약점교과, 등급 수치 인용 필수)",
    "rising":["성적 상승 과목명"],
    "falling":["성적 하락 과목명"],
    "majorLink":"희망전공 연계교과 200자+ (구체 과목명·등급 명시)"
  },

  "patternCheck":{
    "pattern1":{"grade":"S/A/B/C/D","evidence":"PDF 원문 인용 포함 150자+"},
    "pattern2":{"grade":"S/A/B/C/D","evidence":"구체 키워드 명시 100자+"},
    "pattern3":{"grade":"S/A/B/C/D","evidence":"1→2학년 연결 예시 150자+"},
    "pattern4":{"grade":"S/A/B/C/D","evidence":"원문 인용 포함 150자+"},
    "pattern5":{"grade":"S/A/B/C/D","evidence":"교과→탐구 연결 100자+"}
  },

  "competencies":{
    "academic":{"score":0,"max":40,"grade":"A","detail":"300자+ (과목명·등급·수치·원문인용)","evidence":"PDF 원문 직접인용 80자+"},
    "inquiry":{"score":0,"max":25,"grade":"A","detail":"300자+ (탐구사례 원문인용)","evidence":"원문 인용 80자+"},
    "career":{"score":0,"max":15,"grade":"A","detail":"200자+ (진로활동 원문인용)","evidence":"원문 인용 60자+"},
    "community":{"score":0,"max":10,"grade":"A","detail":"200자+ (리더십·봉사 원문근거)","evidence":"원문 인용 60자+"},
    "growth":{"score":0,"max":10,"grade":"A","detail":"200자+ (변화·성찰 원문근거)","evidence":"원문 인용 60자+"}
  },

  "strengths":[
    {"area":"영역","title":"강점 제목","content":"200자+ (학년·학기·활동명 명시)","quote":"PDF 원문 직접인용 70자+","highlight":"입시 의미 50자+"}
  ],

  "weaknesses":[
    {"area":"영역","title":"보완점","content":"150자+","suggestion":"개선방법 70자+"}
  ],

  "activities":[
    {"year":"학년","semester":"학기","gN":숫자,"sN":숫자,"type":"자율/동아리/진로/세특/종합의견","title":"활동명","content":"150자+","whyHowSo":"W:동기 H:방법 S:성장"}
  ],

  "keywords":["핵심 키워드 최대 25개"],
  "verbAnalysis":[{"verb":"탐구","count":5}],
  "methodBias":{"dominant":"분析형/실험형/발표형/조사형/설계형","isSkewed":false,"analysis":"100자+"},

  "univAnalysis":[${univSchema||''}],

  "majorFit":[{"rank":1,"major":"학과명","score":0,"reason":"200자+","evidence":"PDF 원문 인용","matchedSubjects":["관련 교과"],"gap":"50자+"}],

  "creditAnalysis":[{"group":"교과군","subjects":[{"name":"과목","done":true,"required":false}],"rate":0}],

  "topics":[{"title":"탐구 주제","basedOn":"근거 활동","reason":"150자+","method":"방법론","benefit":"효과 70자+","difficulty":"상/중/하"}],

  "interviewQs":[{"question":"면접 질문","basedOn":"근거","tip":"150자+","pitfall":"50자+"}],

  "reportLetter":"【필수: 1500자 이상】담임→학생 편지체. 이름 호명 시작. ①학생 3년 한줄 정의 ②교과성적 심층분석(학기별 추이·원점수·SD 언급) ③핵심 탐구 3개 이상 따옴표 인용 ④합격패턴 5가지 평가 ⑤역량 종합 ⑥지원대학 전략 ⑦보완점→성장가능성 ⑧응원 마무리. 문단 구분 필수."
}`;
}
