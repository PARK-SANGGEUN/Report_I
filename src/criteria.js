// ══════════════════════════════════════════════
// 리포트아이 — 분석 프롬프트 v21
// 풍부한 분석 강제 (근거 4~5개, 분량 대폭 증대)
// ══════════════════════════════════════════════

export const ANALYSIS_CRITERIA = `
■ 합격생 패턴 5가지
P1 의문→탐구→해석→확장
P2 최신키워드 반영
P3 학년간 연속탐구
P4 동기-과정-성장 구조
P5 교과-탐구 밀접 연계
채점: S=4요소 모두 / A=3요소 / B=성장 약함 / C=나열식 / D=단순참여

■ 대학별 평가 핵심
서울대: 학업역량+학업태도+학업외소양
연세대: 학기별 성적변화 → 발전가능성
고려대: 성장서사 + 리더십
서강대: 학업50% + 성장30% + 공동체20%
성균관대: 자기주도 + 융합 + 기업가정신
한양대: 학업역량 + 인성
중앙대: 학업/탐구 균형 + 진로 일관성
경희대: 인성 + 학업 + 진로 균형
이화여대: 학업 + 활동의 깊이

■ 역량 배점 (총 100점)
학업역량 40 / 탐구역량 25 / 진로역량 15 / 공동체역량 10 / 성장역량 10
`;

export function buildPhase1Prompt(parsed, name, major, curr, ranks, univFitData) {
  const targets = ranks.filter(r => r.u || r.d);
  const targetStr = targets.length
    ? targets.map((t,i)=>`${i+1}순위:${t.u} ${t.d}`).join(' / ')
    : '미입력';

  const univFitStr = (univFitData || []).map(f => {
    if (!f.hasCriteria) return `[${f.univ} ${f.dept}] 권장과목 데이터 없음`;
    return `[${f.univ} ${f.dept}] 충족률 ${f.rate}% — 충족: ${f.matched.join(',') || '없음'} / 미이수: ${f.missing.join(',') || '없음'}`;
  }).join('\n');

  const gradesStr = parsed.grades.length > 0
    ? parsed.grades.map(g => `${g.grade}${g.semester} ${g.subject} ${g.credit}단위 ${g.rawScore} 평균${g.avg} SD${g.sd} ${g.level}등급`).join('\n')
    : '(원문에서 직접 추출)';

  const achvStr = parsed.achievementSubjects.length > 0
    ? parsed.achievementSubjects.map(a => `${a.grade}${a.semester} ${a.subject} ${a.achievement} ${a.distribution}`).join('\n')
    : '(없음)';

  const behaviorStr = Object.entries(parsed.behaviorOpinion || {})
    .map(([g, t]) => `[${g}]\n${t}`).join('\n\n');

  const rawTextTrimmed = parsed.rawText.length > 80000
    ? parsed.rawText.slice(0, 80000) + '\n...(생략)'
    : parsed.rawText;

  return `당신은 최상위 입학사정관 + 생기부 컨설턴트입니다.

【🔥 절대 규칙】
1. 각 분석마다 생기부 원문에서 4~5개 근거 발췌 필수. 1~2개는 부족.
2. 빈 배열 금지. 모든 배열 최소 개수 채우기.
3. 분량 지시 반드시 준수.
4. 따옴표로 원문 인용.
5. JSON만 반환. 마크다운 금지.

${ANALYSIS_CRITERIA}

【학생】
이름:${name||parsed.studentInfo?.name||'미입력'} / 전공:${major||'미입력'} / 학교:${parsed.studentInfo?.school||'추출'}
평균등급:${parsed.gradeAvg} / 지원:${targetStr}

【권장과목 충족률】
${univFitStr || '(미입력)'}

【성적 데이터】
${gradesStr}

【진로선택】
${achvStr}

【종합의견】
${behaviorStr || '(추출)'}

【원문】
${rawTextTrimmed}

━━━━━━━━━━━━━━━━━
📌 응답 JSON:

{
  "schoolName": "학교명",
  "studentName": "${name||'학생명'}",
  "curriculum": "2022 또는 2015",
  "totalScore": 점수(0-100),
  "gradeAvg": "평균등급",
  "studentType": "학생유형 한줄",

  "grades": [
    {"grade":"1학년","semester":"1학기","gN":1,"sN":1,"subject":"과목","credit":"단위","rawScore":"원점수","avg":"평균","sd":"표준편차","level":등급,"group":"국어/수학/영어/사회/과학/기술가정/예체능/기타"}
  ],

  "achievementSubjects": [
    {"grade":"학년","semester":"학기","gN":숫자,"sN":숫자,"subject":"과목","credit":"단위","achievement":"A","distribution":"분포","students":"수강자","group":"교과군","note":"해석"}
  ],

  "gradeAnalysis": {
    "currExplain": "교육과정 해석 150자+",
    "overall": "🔥 전체 성적 종합 분석 700자+ — 학기별 추이·강점교과·약점교과·구체 등급·원점수·SD. 4개 학기 모두 다룰 것.",
    "majorLink": "🔥 전공 연계 교과 분석 400자+ — 구체 과목·등급·원점수 명시",
    "trendByGroup": {
      "국영수": "🔥 국영수 추이 분석 300자+",
      "국영수사": "🔥 국영수사 추이 분석 300자+",
      "국영수과": "🔥 국영수과 추이 분석 300자+",
      "전공연계": "🔥 전공연계 추이 분석 300자+"
    },
    "rising": ["상승 과목 3개+"],
    "falling": ["하락 과목 (없으면 '해당 없음')"]
  },

  "creditStatus": {
    "byUniv": [
      {
        "univ":"대학명","dept":"학과명","rate":충족률,
        "matched":["충족"],"missing":["미이수"],
        "analysis":"🔥 분석 300자+ — 구체 과목·등급 인용",
        "recommend":"🔥 추천 200자+ — 어떤 과목 이수"
      }
    ],
    "summary": "전체 이수 종합 평가 400자+"
  },

  "patternCheck": {
    "pattern1":{"grade":"S/A/B/C/D","evidence":"🔥 원문 인용 4개+, 300자+"},
    "pattern2":{"grade":"S/A/B/C/D","evidence":"🔥 키워드·원문 인용 300자+"},
    "pattern3":{"grade":"S/A/B/C/D","evidence":"🔥 학년간 연계 3개+, 300자+"},
    "pattern4":{"grade":"S/A/B/C/D","evidence":"🔥 동기-과정-성장 300자+"},
    "pattern5":{"grade":"S/A/B/C/D","evidence":"🔥 교과-탐구 연결 3개+, 300자+"}
  },

  "competencies": {
    "academic": {
      "score":점수,"max":40,"grade":"S/A/B/C",
      "detail":"🔥 학업역량 분석 600자+ — 학기별 등급·구체 과목·원점수·표준편차",
      "evidenceList":[
        "🔥 원문 인용 근거 1 (100자+)",
        "🔥 원문 인용 근거 2 (100자+)",
        "🔥 원문 인용 근거 3 (100자+)",
        "🔥 원문 인용 근거 4 (100자+)"
      ]
    },
    "inquiry": {
      "score":점수,"max":25,"grade":"S/A/B/C",
      "detail":"🔥 탐구역량 분석 600자+ — 탐구 사례 3개+ 인용·동기-과정-성장",
      "evidenceList":[
        "🔥 탐구활동 인용 1 (100자+)",
        "🔥 탐구활동 인용 2 (100자+)",
        "🔥 탐구활동 인용 3 (100자+)",
        "🔥 탐구활동 인용 4 (100자+)"
      ]
    },
    "career": {
      "score":점수,"max":15,"grade":"S/A/B/C",
      "detail":"🔥 진로역량 분석 500자+",
      "evidenceList":[
        "🔥 인용 1 (100자+)",
        "🔥 인용 2 (100자+)",
        "🔥 인용 3 (100자+)",
        "🔥 인용 4 (100자+)"
      ]
    },
    "community": {
      "score":점수,"max":10,"grade":"S/A/B/C",
      "detail":"🔥 공동체역량 분석 500자+",
      "evidenceList":[
        "🔥 인용 1 (100자+)",
        "🔥 인용 2 (100자+)",
        "🔥 인용 3 (100자+)",
        "🔥 인용 4 (100자+)"
      ]
    },
    "growth": {
      "score":점수,"max":10,"grade":"S/A/B/C",
      "detail":"🔥 성장역량 분석 500자+",
      "evidenceList":[
        "🔥 인용 1 (100자+)",
        "🔥 인용 2 (100자+)",
        "🔥 인용 3 (100자+)",
        "🔥 인용 4 (100자+)"
      ]
    }
  },

  "strengths": [
    /* 🔥 5개 이상 */
    {
      "area":"학업/탐구/진로/공동체/성장",
      "title":"강점 제목",
      "content":"🔥 400자+ — 학년·학기·활동 구체 명시",
      "quoteList":[
        "🔥 원문 인용 1 (50자+)",
        "🔥 원문 인용 2 (50자+)",
        "🔥 원문 인용 3 (50자+)"
      ],
      "highlight":"입시 의미 150자+"
    }
  ],

  "weaknesses": [
    /* 3개 이상 */
    {
      "area":"영역",
      "title":"보완점 제목",
      "content":"🔥 300자+ — 구체 근거와 함께",
      "evidenceList":["근거 1","근거 2","근거 3"],
      "suggestion":"🔥 200자+ — 개선 방법"
    }
  ],

  "activities": [
    /* 🔥 15개 이상 */
    {
      "year":"학년","semester":"학기","gN":숫자,"sN":숫자,
      "type":"자율/동아리/진로/봉사/세특/종합의견",
      "title":"활동명",
      "content":"300자+ (원문 인용)",
      "motivation":"🔥 동기 100자+",
      "process":"🔥 과정 100자+",
      "growth":"🔥 성장 100자+",
      "linkedTo":"연계 활동·교과"
    }
  ],

  "timelineAnalysis": {
    "summary":"🔥 활동 흐름 종합 600자+ — 학년별 변화·심화·확장",
    "strongPoints":[
      {"title":"연계 패턴","description":"200자+","activities":["활동1","활동2","활동3"]}
    ],
    "gaps":[
      {"area":"부족 영역","description":"200자+","suggestion":"보완 100자+"}
    ],
    "usageGuide":"🔥 활용 가이드 400자+ — 면접·자소서·추가활동 계획"
  },

  "keywords": [
    {"word":"키워드","count":횟수,"area":"학업/탐구/진로/공동체"}
  ],

  "keywordAnalysis": {
    "top5":["주요 5개"],
    "dominantArea":"가장 많은 영역",
    "interpretation":"🔥 키워드 분석 500자+ — 정체성·진로 적합도·강점/약점 영역",
    "usageGuide":"🔥 활용 가이드 300자+ — 자소서·면접 핵심 단어"
  },

  "methodAnalysis": {
    "methods":[
      {"type":"실험","count":횟수,"examples":["활동"]},
      {"type":"문헌조사","count":횟수,"examples":["활동"]},
      {"type":"발표","count":횟수,"examples":["활동"]},
      {"type":"토론","count":횟수,"examples":["활동"]},
      {"type":"설계/제작","count":횟수,"examples":["활동"]},
      {"type":"분석","count":횟수,"examples":["활동"]}
    ],
    "dominant":"주요 방법",
    "isSkewed":true/false,
    "analysis":"탐구 방법 분석 300자+"
  }
}

⚠️ 최종 점검: 분량/개수 미달 시 다시 작성. JSON만 반환.`;
}

export function buildPhase2Prompt(parsed, phase1Result, name, major, ranks, univFitData) {
  const targets = ranks.filter(r => r.u || r.d);
  const targetStr = targets.length
    ? targets.map((t,i)=>`${i+1}순위:${t.u} ${t.d}`).join(' / ')
    : '미입력';

  const summary = {
    studentType: phase1Result.studentType,
    gradeAvg: phase1Result.gradeAvg,
    gradeAnalysis: phase1Result.gradeAnalysis?.overall?.slice(0, 800),
    competencies: Object.entries(phase1Result.competencies || {}).map(
      ([k,v]) => `${k}: ${v.grade} ${v.score}점`
    ).join(' / '),
    topStrengths: (phase1Result.strengths || []).slice(0, 5).map(s => s.title).join(', '),
    topActivities: (phase1Result.activities || []).slice(0, 10).map(a => a.title).join(', '),
    keywords: (phase1Result.keywords || []).slice(0, 15).map(k => k.word || k).join(', '),
  };

  const univFitStr = (univFitData || []).map(f => {
    if (!f.hasCriteria) return `[${f.univ} ${f.dept}] 권장과목 미지정`;
    return `[${f.univ} ${f.dept}] 충족률 ${f.rate}% / 미이수: ${f.missing.slice(0,5).join(',')}`;
  }).join('\n');

  return `당신은 최상위 입학사정관 + 생기부 컨설턴트입니다. [Phase 2: 종합 리포트]

【🔥 절대 규칙】
1. 모든 항목에 원문 근거 4~5개 발췌 필수
2. 분량 강제 규칙 준수
3. JSON만 반환

【Phase 1 분석 요약】
${JSON.stringify(summary, null, 2)}

【학생】 ${name} / 전공:${major} / 지원:${targetStr}

【대학별 충족률】
${univFitStr || '(미입력)'}

【종합의견】
${Object.entries(parsed.behaviorOpinion || {}).map(([g,t])=>`[${g}] ${t.slice(0,800)}`).join('\n\n') || '(없음)'}

【원문 참고】
${(parsed.rawText || '').slice(0, 40000)}

━━━━━━━━━━━━━━━━━
📌 응답 JSON:

{
  "majorFit": [
    /* 🔥 5개 이상 */
    {
      "rank":순위,
      "major":"학과명",
      "score":적합도(0-100),
      "reason":"🔥 적합 사유 500자+ — 성적·이수·활동·탐구 다관점",
      "evidenceList":[
        "🔥 원문 인용 1 (100자+)",
        "🔥 원문 인용 2 (100자+)",
        "🔥 원문 인용 3 (100자+)",
        "🔥 원문 인용 4 (100자+)"
      ],
      "matchedSubjects":["관련 교과 5개+"],
      "gap":"🔥 부족 부분 300자+ — 왜 부족, 어떻게 해결",
      "actionPlan":"🔥 진학 액션 플랜 500자+ — 학기별 구체 활동(책·탐구·대회·봉사) 단계별로"
    }
  ],

  "topics": [
    /* 5개 이상 */
    {
      "title":"탐구 주제",
      "forMajor":"추천 학과",
      "basedOn":"근거 활동",
      "connection":"기존 활동 연결성 250자+",
      "reason":"왜 이 주제 250자+",
      "method":"탐구 방법 200자+",
      "expectedResult":"기대 결과 150자+",
      "recommendedBooks":["추천도서 2~3권 (저자)"],
      "difficulty":"상/중/하"
    }
  ],

  "interviewQs": [
    /* 7개 이상 */
    {
      "question":"면접 질문",
      "category":"학업/탐구/진로/공동체/인성",
      "basedOn":"생기부 근거",
      "modelAnswer":"답변 방향 300자+",
      "tip":"답변 팁 200자+",
      "pitfall":"피해야 할 답변 150자+"
    }
  ],

  "reportLetter": "🔥 3500자 이상! 담임이 학생에게 보내는 편지체. 12개 단락:\n\n①이름 호명·3년 정의 (250자+)\n②교과 성적 심층 분석 (400자+)\n③국영수·국영수사·국영수과·전공연계 4관점 (400자+)\n④이수 현황·권장과목 충족률 (350자+)\n⑤활동 타임라인 종합 (400자+)\n⑥핵심 탐구 활동 3개+ 인용 (450자+)\n⑦5개 역량 종합 평가 (450자+)\n⑧정체성·키워드 분석 (300자+)\n⑨지원 대학별 합격 전략 (400자+)\n⑩추천 학과·심화탐구 (350자+)\n⑪보완점·앞으로의 과제 (300자+)\n⑫응원·격려 (200자+)"
}

JSON만 반환.`;
}

export function buildGptPrompt(parsed, name, major, curr, ranks) {
  return buildPhase1Prompt(parsed, name, major, curr, ranks, []);
}
