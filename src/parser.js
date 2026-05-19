// ══════════════════════════════════════════════
// 생기부 로컬 파서 v22 — 표 구조 정확히 인식
// [N학년] 헤더 + 학기 셀 빈 행 추론
// ══════════════════════════════════════════════

/* PDF → 레이아웃 텍스트 추출 */
export async function extractPdfText(b64) {
  if (!window.pdfjsLib) return { text: "", pages: [] };
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const pdf = await window.pdfjsLib.getDocument({ data: arr }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const ct = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const items = ct.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({
        str: it.str,
        x: Math.round(it.transform[4]),
        y: Math.round(vp.height - it.transform[5]),
        h: Math.abs(it.transform[3]) || 10,
        w: it.width || 0,
      }));
    const rows = [];
    items.forEach(it => {
      const tol = Math.max(3, it.h * 0.45);
      let row = rows.find(r => Math.abs(r.y - it.y) <= tol);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    });
    rows.sort((a, b) => a.y - b.y);
    const lines = rows.map(r => {
      r.items.sort((a, b) => a.x - b.x);
      let line = "", prevX2 = null;
      const avgW = r.items.reduce((s, it) => s + Math.max(it.w, it.str.length * 7), 0) / r.items.length;
      r.items.forEach(it => {
        if (prevX2 === null) { line = it.str; }
        else {
          const gap = it.x - prevX2;
          line += (gap > avgW * 1.8 ? "\t" : gap > avgW * 0.4 ? " " : "") + it.str;
        }
        prevX2 = it.x + Math.max(it.w, it.str.length * 7);
      });
      return line.trim();
    }).filter(l => l.length > 0);
    pages.push(lines);
  }
  const fullText = pages.map((lines, i) => `[${i+1}페이지]\n${lines.join("\n")}`).join("\n\n");
  return { text: fullText, pages };
}

/* ── 학생 기본정보 파싱 ── */
export function parseStudentInfo(text) {
  const info = { name: "", school: "", gender: "" };
  const nameM = text.match(/성명\s*[：:]\s*([가-힣]{2,5})/);
  if (nameM) info.name = nameM[1];
  const schoolM = text.match(/([가-힣A-Za-z\s]+고등학교)/);
  if (schoolM) info.school = schoolM[1].trim();
  const genderM = text.match(/성별\s*[：:]\s*(남|여)/);
  if (genderM) info.gender = genderM[1];
  return info;
}

/* ── 교과군 매핑 ── */
const GROUP_MAP = {
  '국어': '국어', '문학': '국어', '독서': '국어', '화법과작문': '국어', '화법': '국어',
  '언어와매체': '국어', '언어': '국어', '매체': '국어', '실용국어': '국어', '심화국어': '국어',
  '수학': '수학', '미적분': '수학', '확률과통계': '수학', '확률': '수학', '기하': '수학',
  '경제수학': '수학', '실용수학': '수학', '심화수학': '수학', '인공지능수학': '수학',
  '영어': '영어', '영어회화': '영어', '영어독해와작문': '영어', '실용영어': '영어',
  '한국사': '사회', '통합사회': '사회', '세계사': '사회', '동아시아사': '사회',
  '세계지리': '사회', '한국지리': '사회', '정치': '사회', '정치와법': '사회', '법': '사회',
  '경제': '사회', '사회문제탐구': '사회', '여행지리': '사회',
  '사회문화': '사회', '생활과윤리': '사회', '윤리와사상': '사회', '윤리': '사회',
  '한문': '사회', '제2외국어': '사회', '일본어': '사회', '중국어': '사회', '독일어': '사회',
  '프랑스어': '사회', '스페인어': '사회', '러시아어': '사회', '아랍어': '사회', '베트남어': '사회',
  '통합과학': '과학', '물리': '과학', '화학': '과학', '생명과학': '과학', '지구과학': '과학',
  '과학탐구실험': '과학', '물리학': '과학', '융합과학': '과학',
  '생활과과학': '과학', '과학사': '과학',
  '기술': '기술가정', '가정': '기술가정', '기술·가정': '기술가정', '기술가정': '기술가정',
  '정보': '기술가정', '인공지능': '기술가정', '환경': '기술가정', '진로와직업': '기술가정',
  '체육': '예체능', '음악': '예체능', '미술': '예체능', '운동': '예체능',
  '연극': '예체능', '교양': '예체능',
};

function getGroup(subject) {
  const s = String(subject).replace(/\s/g, '').replace(/[ⅠⅡⅢⅣⅤ]/g, '');
  for (const [key, val] of Object.entries(GROUP_MAP)) {
    if (s.startsWith(key) || s.includes(key)) return val;
  }
  return '기타';
}

/* ────────────────────────────────────────────
   ⭐ 핵심: 표 구조 인식 + 학기 빈 셀 추론
   본인 PDF 구조 분석 (스크린샷 기준):

   [1학년]
   학기 | 교과 | 과목 | 학점 | 원점수/평균 | 성취도 | 등급
   ─────┼──────┼──────┼─────┼─────────────┼────────┼──────
    1   | 국어 | 국어 |  4  | 93/78.2(12.7)| A(251) |  2
        | 수학 | 수학 |  3  | ...          | A(251) |  2
        | ...  |      |     |              |        |
    2   | 국어 | 국어 |  3  | 96/72.1(16.1)| A(245) |  1
        | ...  |      |     |              |        |

   [2학년]
   (같은 구조)

   핵심:
   - [N학년] 헤더로 학년 시작
   - 학기 셀에 단독 "1" 또는 "2"
   - 같은 학기 행들은 학기 셀 비어있음
   - 다음 [N학년]이나 "이수학점 합계" 만나면 종료
──────────────────────────────────────────── */
export function parseGradesWithContext(pages) {
  const result = [];
  const achieveResult = [];

  const allText = pages.map(p => p.join('\n')).join('\n');
  const lines = allText.split('\n');

  let currentGrade = 0;       // 0=시작 전, 1·2·3 = 학년
  let currentSem = 0;         // 0=시작 전, 1·2 = 학기
  let inGradeTable = false;   // 현재 성적표 구간 안인가
  let debugLog = [];

  // 정규식 모음
  // 학년 헤더: "[1학년]", "[ 1학년 ]", "[1 학년]" 등
  const gradeHeaderRe = /^\[\s*(\d)\s*학년\s*\]\s*$/;

  // 학년 헤더가 같은 줄에 다른 텍스트와 함께 있는 경우도 인식
  const gradeHeaderInlineRe = /\[\s*(\d)\s*학년\s*\]/;

  // 성적표 시작 표시 (선택적)
  const tableStartRe = /교과학습발달상황|^7\.\s/;

  // 성적표 끝 표시 — 구체적인 섹션 헤더만
  const tableEndRe = /^이수학점\s*합계|^8\.\s|^행동특성\s*및\s*종합의견|^9\.\s|^독서활동상황|^10\.\s|^11\.\s/;

  // 학기 셀이 있는 행: "1\t..." 또는 "2\t..."로 시작
  // PDF 추출에서 학기는 첫 토큰일 가능성 높음
  // 패턴: 줄 시작이 단일 숫자 "1" 또는 "2"이고 그 뒤로 데이터 (탭이나 공백)
  // 또는 줄 자체가 단독 "1" "2" (학기만 따로 추출된 경우)

  // 성취도 P (이수/미이수) 패턴 같이 처리
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // 학년 헤더 감지
    const ghm = line.match(gradeHeaderRe) || line.match(gradeHeaderInlineRe);
    if (ghm) {
      currentGrade = parseInt(ghm[1]);
      currentSem = 0;  // 새 학년은 학기 리셋
      inGradeTable = true;
      debugLog.push(`학년 시작: ${currentGrade}학년`);
      continue;
    }

    // 성적표 끝 감지
    if (tableEndRe.test(line)) {
      if (inGradeTable) {
        debugLog.push(`성적표 종료: ${line.slice(0, 30)}`);
      }
      inGradeTable = false;
      continue;
    }

    // 성적표 시작이라고 명시된 경우
    if (tableStartRe.test(line)) {
      inGradeTable = true;
      continue;
    }

    if (!inGradeTable || currentGrade === 0) continue;

    // 학기만 단독으로 있는 줄 (드물지만 가능)
    if (/^[12]$/.test(line)) {
      currentSem = parseInt(line);
      debugLog.push(`학기 변경(단독): ${currentGrade}학년 ${currentSem}학기`);
      continue;
    }

    // 표 행 파싱
    // 형식 1: "1\t국어\t국어\t4\t93/78.2(12.7)\tA(251)\t2"
    //   (학기가 첫 번째 셀)
    // 형식 2: "수학\t수학\t3\t86/67.0(15.4)\tA(251)\t2"
    //   (학기 셀 비어있음 — 이전 학기 유지)

    // 등급 패턴: 일반 과목 (마지막 숫자가 1~9 등급)
    // "원점수/평균(표준편차) A(수강자수) 등급"
    // 예: "93/78.2(12.7) A(251) 2"
    const gradePartRe = /(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)\s+([A-EP])\((\d+)\)\s+(\d)/;

    // 성취도만 (등급 미산출): "원점수/평균(표준편차) A(수강자수) A(%) B(%) C(%)"
    // 예: "100/76.6(14.7) A(47)" ← 본인 PDF의 진로선택은 분포비율 없이 등급만 있는 듯
    const achvPartRe = /(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)\s+([A-E])\((\d+)\)\s+(\d)/;
    // 또는 P(이수) 처리
    const passRe = /\sP\s+P\s*$/;

    // 토큰 분리
    const tokens = line.split(/\s+|\t/).filter(t => t);
    if (tokens.length < 3) continue;

    // 학기 셀 추출
    let semHere = null;
    let startIdx = 0;
    if (/^[12]$/.test(tokens[0])) {
      semHere = parseInt(tokens[0]);
      startIdx = 1;
      currentSem = semHere;
    }

    // currentSem이 아직 0이면 (학년 헤더 직후 학기 표시 못 잡았음) — 일단 1로 시작
    if (currentSem === 0) currentSem = 1;

    // 등급 행 매칭
    const gm = line.match(gradePartRe);
    if (gm) {
      // 학점 = 1~2자리 숫자
      // 패턴: "[학기?] 교과 과목명 학점 원점수/평균..."
      // 학점 위치 찾기 (원점수 앞)
      const rawScoreIdx = line.indexOf(`${gm[1]}/${gm[2]}`);
      const beforeRawScore = line.slice(0, rawScoreIdx).trim();

      // 마지막 1~2자리 숫자를 학점으로 인식
      const creditMatch = beforeRawScore.match(/(\d{1,2})\s*$/);
      if (!creditMatch) continue;
      const credit = creditMatch[1];

      // 학점 앞의 텍스트가 [학기?] [교과] [과목]
      const beforeCredit = beforeRawScore.slice(0, beforeRawScore.lastIndexOf(creditMatch[0])).trim();

      // 학기 토큰이 있으면 제거
      let coreText = beforeCredit;
      if (/^[12]\s/.test(coreText)) {
        coreText = coreText.replace(/^[12]\s+/, '');
      }

      // coreText = "교과 과목" 또는 "교과(긴이름) 과목"
      // 과목명은 마지막 부분 — 보통 마지막 단어
      // 단, "수학 I", "수학 II", "지구과학 I", "정치와 법" 같은 복합 과목 처리
      // 전략: 교과 부분과 과목 부분 분리

      // 교과명들 (긴 형식 포함)
      const knownDepts = [
        '국어', '수학', '영어', '한국사',
        '사회(역사/도덕포함)', '사회', '도덕',
        '과학',
        '기술·가정/제2외국어/한문/교양', '기술·가정/제2외국어', '기술·가정', '제2외국어', '한문', '교양',
        '체육', '예술', '음악', '미술',
      ];

      let subject = null;
      for (const dept of knownDepts) {
        if (coreText.startsWith(dept)) {
          subject = coreText.slice(dept.length).trim();
          break;
        }
      }

      // 못 찾으면 마지막 토큰을 과목으로
      if (!subject) {
        const tokens = coreText.split(/\s+/).filter(t => t);
        subject = tokens[tokens.length - 1];
      }

      if (!subject) continue;

      // 과목명 정리 — 공백 제거하지 말고 유지 (예: "정치와 법", "수학 I")
      // 단 양쪽 공백만 trim
      const cleanSubject = subject.trim();
      if (!cleanSubject || cleanSubject.length < 2 || cleanSubject.length > 25) continue;
      if (!/[가-힣]/.test(cleanSubject)) continue;

      // 등급 추출
      const level = parseInt(gm[6]);
      if (level < 1 || level > 9) continue;

      const achievement = gm[4];

      // 일반 과목 (등급 있음, 성취도 A~E)
      if (level >= 1 && level <= 9 && achievement !== 'P') {
        result.push({
          grade: `${currentGrade}학년`, semester: `${currentSem}학기`,
          gN: currentGrade, sN: currentSem,
          subject: cleanSubject, credit, rawScore: gm[1],
          avg: gm[2], sd: gm[3],
          achievement, students: gm[5],
          level,
          group: getGroup(cleanSubject)
        });
        debugLog.push(`잡힘: ${currentGrade}-${currentSem} ${cleanSubject} ${level}등급`);
      }
    }
  }

  // 중복 제거
  const seen = new Set();
  const deduped = result.filter(r => {
    const key = `${r.gN}-${r.sN}-${r.subject}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // 진로선택 (성취도 A/B/C with 분포비율)
  // 본인 PDF 패턴 분석 필요 — 일단 기존 로직 유지
  parseAchievementSubjects(lines, achieveResult);

  // 디버깅 출력
  const distribution = {};
  deduped.forEach(r => {
    const key = `${r.gN}학년 ${r.sN}학기`;
    distribution[key] = (distribution[key] || 0) + 1;
  });
  console.log('[parser v22] 학년별 과목 분포:', distribution);
  console.log('[parser v22] 진로선택:', achieveResult.length, '개');
  console.log('[parser v22] 디버그 로그 (처음 30줄):', debugLog.slice(0, 30));

  return { grades: deduped, achievementSubjects: achieveResult };
}

/* 진로선택 과목 파싱 (분포비율 있는 행) */
function parseAchievementSubjects(lines, achieveResult) {
  let currentGrade = 0, currentSem = 0;
  let inTable = false;

  const gradeRe = /\[\s*(\d)\s*학년\s*\]/;
  const endRe = /이수학점\s*합계|행동특성|독서활동/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const gm = line.match(gradeRe);
    if (gm) { currentGrade = parseInt(gm[1]); currentSem = 0; inTable = true; continue; }
    if (endRe.test(line)) { inTable = false; continue; }
    if (!inTable) continue;

    const tokens = line.split(/\s+|\t/).filter(t => t);
    if (/^[12]$/.test(tokens[0])) currentSem = parseInt(tokens[0]);
    if (currentSem === 0) currentSem = 1;

    // 진로선택 분포비율 형식: "94/66.0(17.4) A(92) A(20.8) B(44.9) C(34.3)"
    const achvRe = /(\d{2,3})\/(\d{1,3}\.?\d*)\(([\d.]+)\)\s+([A-E])\((\d+)\)\s+([A-E])\(([\d.]+)\)\s+([A-E])\(([\d.]+)\)\s+([A-E])\(([\d.]+)\)/;
    const am = line.match(achvRe);
    if (am) {
      const rawScoreIdx = line.indexOf(`${am[1]}/${am[2]}`);
      const beforeTokens = line.slice(0, rawScoreIdx).trim().split(/\s+|\t/).filter(t => t);
      const credit = beforeTokens[beforeTokens.length - 1];
      const subject = beforeTokens[beforeTokens.length - 2];
      if (!subject || !/[가-힣]/.test(subject)) continue;
      const cleanSubject = subject.replace(/[·\s]/g, '');
      const aRate = parseFloat(am[7]);

      achieveResult.push({
        grade: `${currentGrade}학년`, semester: `${currentSem}학기`,
        gN: currentGrade, sN: currentSem,
        subject: cleanSubject, credit, rawScore: am[1],
        achievement: am[4], students: am[5],
        distribution: `A:${am[7]}% B:${am[9]}% C:${am[11]}%`,
        group: getGroup(cleanSubject),
        note: aRate <= 25 ? `A구간 ${aRate}%로 실질 최우수` : aRate <= 50 ? `A구간 ${aRate}%로 상위권` : `A구간 ${aRate}%`
      });
    }
  }
}

/* ── 활동 파싱 (자율·동아리·진로·봉사) ── */
export function parseActivities(text) {
  const activities = [];
  const lines = text.split('\n');
  const TYPE_MAP = {
    '자율활동': '자율',
    '동아리활동': '동아리',
    '진로활동': '진로',
    '봉사활동': '봉사',
    '안전한 생활': '자율',
  };
  let inActivity = false;
  let currentType = null;
  let buffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const ent = Object.entries(TYPE_MAP).find(([k]) => line.includes(k));
    if (ent) {
      if (buffer.length > 30 && currentType) {
        activities.push({
          type: currentType,
          content: buffer.join(' ').slice(0, 400)
        });
      }
      currentType = ent[1];
      buffer = [];
      inActivity = true;
      continue;
    }
    if (inActivity && line.length > 10 && !Object.keys(TYPE_MAP).some(k => line.includes(k))) {
      buffer.push(line);
      if (buffer.join(' ').length > 500) {
        activities.push({
          type: currentType,
          content: buffer.join(' ').slice(0, 400)
        });
        buffer = [];
      }
    }
  }
  return activities.slice(0, 20);
}

/* ── 세특(과목별 세부능력 및 특기사항) 파싱 ── */
export function parseSubjectDetails(text) {
  const details = {};
  // 학기별 과목 세특 — 패턴: "과목명 (1학기): 내용"
  const re = /([가-힣A-Za-z]{2,10})\s*\((\d)학기\)[:：]\s*(.{30,500}?)(?=\n\n|[가-힣A-Za-z]{2,10}\s*\(\d학기\))/gs;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, subj, sem, content] = m;
    if (content.length > 30) {
      details[`${subj}_${sem}학기`] = content.slice(0, 300);
    }
  }
  return details;
}

/* ── 행동특성 및 종합의견 ── */
export function parseBehaviorOpinion(text) {
  const opinions = {};
  const re = /\[(\d학년)\][\s\n]*(.{50,1000}?)(?=\[\d학년\]|독서|진로|행동특성|$)/gs;
  let m;
  while ((m = re.exec(text)) !== null) {
    opinions[`${m[1]}`] = m[2].trim().slice(0, 500);
  }
  return opinions;
}

/* ── 메인 export ── */
export async function parseStudentRecord(b64) {
  const { text, pages } = await extractPdfText(b64);
  if (!text || text.length < 300) return null;

  const studentInfo = parseStudentInfo(text);
  const { grades, achievementSubjects } = parseGradesWithContext(pages);
  const activities = parseActivities(text);
  const subjectDetails = parseSubjectDetails(text);
  const behaviorOpinion = parseBehaviorOpinion(text);

  // 평균 등급
  let gradeAvg = "0";
  if (grades.length > 0) {
    const validGrades = grades.filter(g => g.level >= 1 && g.level <= 9);
    if (validGrades.length > 0) {
      const sum = validGrades.reduce((s, g) => s + g.level, 0);
      gradeAvg = (sum / validGrades.length).toFixed(2);
    }
  }

  return {
    rawText: text,
    pageCount: pages.length,
    studentInfo,
    grades,
    achievementSubjects,
    activities,
    subjectDetails,
    behaviorOpinion,
    gradeAvg
  };
}
