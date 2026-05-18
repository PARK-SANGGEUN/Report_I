// ══════════════════════════════════════════════
// 리포트아이 — 분석 프롬프트 v14
// GPT-4o 전용 최적화 / 분량 강제 / 빈 배열 금지
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
서강대: 학업50% + 성장30% + 공동체20% (과정>결과)
성균관대: 자기주도 + 융합 + 기업가정신
한양대: 학업역량 + 인성
중앙대: 학업/탐구 균형 + 진로 일관성
경희대: 인성 + 학업 + 진로 균형
이화여대: 학업 + 활동의 깊이
한국외대: 어학·국제 진로 일관성
건국대: 학업30% + 진로40% + 공동체30%
동국대: 전공적합성 50% 강조
세종대: 학업역량 + 발전가능성
숭실대: 학업 + 활동의 진정성
국민대: 진로탐색 + 자기주도성
홍익대: 창의성 + 실기·이론 균형 (예체능)
인하대: 학업 + 전공탐색
아주대: 학업 + 잠재력
서울시립대: 학업 + 가치관
서울과기대: 진로탐구50% + 기초학업30% + 공동체20%

■ 역량 배점 (총 100점)
학업역량 40 / 탐구역량 25 / 진로역량 15 / 공동체역량 10 / 성장역량 10
`;

export function buildGptPrompt(parsed, name, major, curr, ranks) {
  const targets = ranks.filter(r => r.u || r.d);
  const targetStr = targets.length
    ? targets.map((t,i)=>`${i+1}순위:${t.u} ${t.d}`).join(' / ')
    : '미입력';

  const univSchema = targets.map((t,i) => `{
    "rank":${i+1},"univ":"${t.u}","dept":"${t.d}",
    "score":점수0-100,"verdict":"유리/보통/불리","creditRate":이수충족률0-100,
    "reason":"이 대학 평가기준 기반 분석 300자 이상 (원문 근거 인용 필수)",
    "keyStrength":"핵심 강점 100자 이상","keyRisk":"보완 사항 100자 이상",
    "strategy":"합격 전략 200자 이상"
  }`).join(',');

  // 로컬파서 추출 데이터 (참고용)
  const gradesStr = parsed.grades.length > 0
    ? parsed.grades.map(g => `${g.grade}${g.semester} ${g.subject} ${g.credit}단위 원점수${g.rawScore} 평균${g.avg} SD${g.sd} ${g.level}등급`).join('\n')
    : '(로컬 파서 추출 실패 — 원문에서 직접 추출하세요)';

  const achvStr = parsed.achievementSubjects.length > 0
    ? parsed.achievementSubjects.map(a => `${a.grade}${a.semester} ${a.subject} 성취도${a.achievement} 분포:${a.distribution}`).join('\n')
    : '(없음)';

  const behaviorStr = Object.entries(parsed.behaviorOpinion || {})
    .map(([g, t]) => `[${g} 종합의견]\n${t}`).join('\n\n');

  const rawTextTrimmed = parsed.rawText.length > 30000
    ? parsed.rawText.slice(0, 30000) + '\n...(이하 생략)'
    : parsed.rawText;

  return `당신은 대한민국 최상위 입학사정관 + 생기부 전문 컨설턴트입니다.
아래 학생의 생기부를 정밀 분석합니다.

【⚠️ 절대 규칙】
1. 모든 필드를 빠짐없이 채울 것. **빈 배열([])이나 빈 문자열("") 절대 금지.**
2. 각 필드의 최소 분량 지시를 반드시 지킬 것.
3. 원문 근거 인용 시 따옴표로 표시. 없는 내용 생성 금지.
4. JSON만 반환. 마크다운(\`\`\`json) 코드블록 절대 금지.
5. grades 배열은 최소 8개 이상 (학기별 모든 과목). 활동은 최소 12개 이상.

【분석 기준】
${ANALYSIS_CRITERIA}

【학생 정보】
이름: ${name||parsed.studentInfo?.name||'미입력'}
희망 전공: ${major||'미입력'}
학교: ${parsed.studentInfo?.school||'원문에서 추출'}
교육과정: ${curr==='2022'?'2022 개정 (5등급제)':curr==='2015'?'2015 개정 (9등급제)':'원문에서 자동 감지'}
평균등급(참고): ${parsed.gradeAvg}
지원 희망: ${targetStr}

【로컬 파서가 추출한 성적 데이터】
${gradesStr}

【성취도 과목 (진로선택)】
${achvStr}

【행동특성 및 종합의견 원문】
${behaviorStr || '(원문 텍스트에서 추출)'}

【생기부 전체 원문】
${rawTextTrimmed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 응답 JSON 스키마 (모든 필드 필수, 빈 값 금지):

{
  "schoolName": "학교명",
  "studentName": "${name||'학생명'}",
  "curriculum": "2022 또는 2015",
  "totalScore": 종합점수(0-100),
  "gradeAvg": "전체 평균등급 (예: 2.34)",
  "studentType": "학생유형 한줄 정의 (예: 역사·고고학 융합탐구형 인재)",

  "grades": [
    // ⚠️ 최소 8개 이상! 학기별 모든 일반선택 과목 포함
    {"grade":"1학년","semester":"1학기","gN":1,"sN":1,"subject":"과목명","credit":"단위","rawScore":"원점수","avg":"평균","sd":"표준편차","level":등급숫자,"group":"국어/수학/영어/사회/과학/기술가정/예체능/기타"}
  ],

  "achievementSubjects": [
    // 진로선택 과목 (성취도 A/B/C)
    {"grade":"학년","semester":"학기","gN":숫자,"sN":숫자,"subject":"과목","credit":"단위","achievement":"A","distribution":"A:%% B:%% C:%%","students":"수강자수","group":"교과군","note":"해석"}
  ],

  "gradeAnalysis": {
    "currExplain": "교육과정 해석 150자 이상",
    "overall": "전체 성적 종합 분석 500자 이상 ⚠️ 학기별 추이·강점교과·약점교과·구체 등급 수치 인용 필수",
    "rising": ["성적 상승 과목 3개 이상"],
    "falling": ["성적 하락 과목 (없으면 빈 배열 대신 '해당 없음' 문자열 1개)"],
    "majorLink": "희망전공 연계 교과 분석 300자 이상 (구체 과목명·등급 명시)"
  },

  "patternCheck": {
    "pattern1":{"grade":"S/A/B/C/D","evidence":"원문 인용 포함 200자 이상"},
    "pattern2":{"grade":"S/A/B/C/D","evidence":"키워드 명시 200자 이상"},
    "pattern3":{"grade":"S/A/B/C/D","evidence":"학년간 연계 200자 이상"},
    "pattern4":{"grade":"S/A/B/C/D","evidence":"Why-How-So 분석 200자 이상"},
    "pattern5":{"grade":"S/A/B/C/D","evidence":"교과-탐구 연결 200자 이상"}
  },

  "competencies": {
    "academic":{"score":점수,"max":40,"grade":"S/A/B/C","detail":"학업역량 분석 400자 이상 (과목명·등급·수치·원문 인용)","evidence":"원문 직접 인용 100자 이상"},
    "inquiry":{"score":점수,"max":25,"grade":"S/A/B/C","detail":"탐구역량 분석 400자 이상 (탐구 사례 원문 인용)","evidence":"원문 인용 100자 이상"},
    "career":{"score":점수,"max":15,"grade":"S/A/B/C","detail":"진로역량 분석 300자 이상 (진로활동 원문 인용)","evidence":"원문 인용 80자 이상"},
    "community":{"score":점수,"max":10,"grade":"S/A/B/C","detail":"공동체역량 분석 300자 이상 (리더십·봉사 근거)","evidence":"원문 인용 80자 이상"},
    "growth":{"score":점수,"max":10,"grade":"S/A/B/C","detail":"성장역량 분석 300자 이상 (변화·성찰 근거)","evidence":"원문 인용 80자 이상"}
  },

  "strengths": [
    // ⚠️ 최소 4개 이상
    {"area":"학업/탐구/진로/공동체/성장","title":"강점 제목","content":"300자 이상 (학년·학기·활동명 명시)","quote":"원문 직접 인용 100자 이상","highlight":"입시 의미 80자 이상"}
  ],

  "weaknesses": [
    // ⚠️ 최소 2개 이상
    {"area":"영역","title":"보완점 제목","content":"200자 이상","suggestion":"구체적 개선 방법 100자 이상"}
  ],

  "activities": [
    // ⚠️ 최소 12개 이상! 창의적체험활동 + 세특 + 종합의견 모두 추출
    {"year":"학년","semester":"학기","gN":숫자,"sN":숫자,"type":"자율/동아리/진로/봉사/세특/종합의견","title":"활동명","content":"200자 이상 (원문 핵심 인용)","whyHowSo":"W: 동기 / H: 방법 / S: 성장·결과"}
  ],

  "keywords": ["핵심 키워드 20개 이상"],

  "univAnalysis": [${univSchema||''}],

  "majorFit": [
    // ⚠️ 최소 3개 학과 적합도
    {"rank":1,"major":"학과명","score":점수0-100,"reason":"적합 사유 300자 이상","evidence":"원문 인용 100자 이상","matchedSubjects":["관련 교과 3개 이상"],"gap":"부족한 부분 100자 이상"}
  ],

  "topics": [
    // ⚠️ 최소 4개 탐구 주제 제안
    {"title":"탐구 주제","basedOn":"근거 활동","reason":"왜 이 주제? 200자 이상","method":"탐구 방법론 150자 이상","benefit":"기대 효과 100자 이상","difficulty":"상/중/하"}
  ],

  "interviewQs": [
    // ⚠️ 최소 5개 면접 예상 질문
    {"question":"면접 질문","basedOn":"생기부 근거","tip":"답변 팁 200자 이상","pitfall":"피해야 할 답변 100자 이상"}
  ],

  "reportLetter": "⚠️ 1800자 이상 필수. 담임이 학생에게 보내는 편지체. 다음 8개 단락 모두 포함: ①이름 호명으로 시작, 3년 한줄 정의 ②교과 성적 심층 분석 (학기별 추이·원점수·SD 언급) ③핵심 탐구 활동 3개 이상 따옴표 인용 ④합격패턴 5가지 평가 ⑤5개 역량 종합 ⑥지원 대학별 전략 ⑦보완점 → 성장 가능성 ⑧응원 마무리. 각 단락 사이에 \\n\\n 빈 줄 필수."
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 최종 점검:
- grades 배열이 8개 미만이면 다시 추출
- activities 배열이 12개 미만이면 다시 추출  
- strengths가 4개 미만이면 다시 작성
- reportLetter가 1800자 미만이면 다시 작성
- 어떤 필드든 빈 배열/빈 문자열이면 다시 작성
- JSON만 반환. 다른 설명/마크다운 금지.`;
}
