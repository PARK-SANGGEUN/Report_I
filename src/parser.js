// ══════════════════════════════════════════════
// 생기부 로컬 파서 — pdf.js 텍스트 기반
// 성적·활동·학생정보 최대 추출
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

/* ── 성적 파싱 (핵심) ── */
export function parseGrades(text) {
  const grades = [];
  const achievementSubjects = [];

  // 패턴1: 일반 등급 과목
  // "국어 4 93/78.2(12.7) A(251) 2" 형태
  const gradeLineReg = /([가-힣A-Za-z·\s\-Ⅰ-Ⅹ]{2,20})\s+(\d+)\s+(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)\s+[A-E]\((\d+)\)\s+(\d)/g;
  let m;
  while ((m = gradeLineReg.exec(text)) !== null) {
    const subject = m[1].trim().replace(/\s+/g, '');
    const credit = m[2], rawScore = m[3], avg = m[4], sd = m[5], students = m[6], level = m[7];
    if (parseInt(level) >= 1 && parseInt(level) <= 9 && subject.length >= 2) {
      grades.push({ subject, credit, rawScore, avg, sd, students, level: parseInt(level) });
    }
  }

  // 패턴2: 성취도만 (진로선택) - "A(245) A(20.8) B(44.9) C(34.3)" 형태
  const achvReg = /([가-힣A-Za-z·\s\-Ⅰ-Ⅹ]{2,20})\s+(\d+)\s+(\d{2,3})\/[\d.]+\s+([A-E])\((\d+)\)\s+([A-E])\([\d.]+\)\s+[A-E]\([\d.]+\)/g;
  while ((m = achvReg.exec(text)) !== null) {
    const subject = m[1].trim();
    achievementSubjects.push({ subject, credit: m[2], rawScore: m[3], achievement: m[4], students: m[5] });
  }

  return { grades, achievementSubjects };
}

/* ── 성적표 컨텍스트 파싱 (학년/학기 매핑) ── */
export function parseGradesWithContext(pages) {
  const result = [];
  const achieveResult = [];
  let currentGrade = 1, currentSem = 1;

  const GROUP_MAP = {
    '국어': '국어', '문학': '국어', '독서': '국어', '화법': '국어', '언어': '국어', '매체': '국어',
    '수학': '수학', '수학Ⅰ': '수학', '수학Ⅱ': '수학', '미적분': '수학', '확률': '수학', '기하': '수학',
    '영어': '영어', '영어Ⅰ': '영어', '영어Ⅱ': '영어', '영어독해': '영어',
    '한국사': '사회', '통합사회': '사회', '세계사': '사회', '동아시아사': '사회',
    '세계지리': '사회', '한국지리': '사회', '정치': '사회', '법': '사회', '경제': '사회',
    '사회문화': '사회', '생활과윤리': '사회', '윤리와사상': '사회', '한문': '사회',
    '통합과학': '과학', '물리': '과학', '화학': '과학', '생명과학': '과학', '지구과학': '과학',
    '과학탐구실험': '과학', '물리학': '과학', '화학Ⅰ': '과학', '생명과학Ⅰ': '과학', '지구과학Ⅰ': '과학',
    '기술': '기술가정', '가정': '기술가정', '정보': '기술가정', '인공지능': '기술가정', '환경': '기술가정',
    '체육': '예체능', '음악': '예체능', '미술': '예체능', '운동': '예체능',
  };

  function getGroup(subject) {
    const s = subject.replace(/\s/g,'');
    for (const [key, val] of Object.entries(GROUP_MAP)) {
      if (s.startsWith(key) || s.includes(key)) return val;
    }
    return '기타';
  }

  const allText = pages.map(p => p.join('\n')).join('\n');
  const lines = allText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── 학년/학기 감지 (대폭 강화) ──
    // 패턴 다양화: [1학년], 1학년, 2학년 1학기, [2학년] [1학기], (2)학년, 2 학년 등
    let gradeMatched = false;

    // 패턴 1: "[2학년]" 또는 "[2학년] [1학기]" 같이 묶음
    const bracketM = line.match(/\[\s*(\d)\s*학년\s*\](?:.*?\[\s*(\d)\s*학기\s*\])?/);
    if (bracketM) {
      currentGrade = parseInt(bracketM[1]);
      if (bracketM[2]) currentSem = parseInt(bracketM[2]);
      else currentSem = 1;
      gradeMatched = true;
      continue;
    }

    // 패턴 2: "2학년 1학기" 한 줄로 (가장 흔한 형태!)
    const inlineM = line.match(/(?:^|\s)(\d)\s*학년\s+(\d)\s*학기/);
    if (inlineM) {
      currentGrade = parseInt(inlineM[1]);
      currentSem = parseInt(inlineM[2]);
      gradeMatched = true;
      continue;
    }

    // 패턴 3: "2학년" 단독 또는 줄 시작
    const gradeOnlyM = line.match(/^(\d)\s*학년(?:\s|$)/) || line.match(/^\s*(\d)\s*학년$/);
    if (gradeOnlyM) {
      currentGrade = parseInt(gradeOnlyM[1]);
      currentSem = 1;
      gradeMatched = true;
      continue;
    }

    // 패턴 4: 표 헤더의 학년 표시 (예: "학년 1학년 2학년 3학년")는 무시하기 위한 필터
    // 단, 줄에 "학년"이 여러 번 나오면 헤더로 보고 스킵
    const gradeCount = (line.match(/학년/g) || []).length;
    if (gradeCount >= 2) continue;

    // 패턴 5: "1학기" 또는 "2학기" 단독 (학년은 유지)
    const semM = line.match(/(?:^|\s)(\d)\s*학기(?:\s|$)/);
    if (semM && !line.includes('수강') && !line.includes('단위') && line.length < 30) {
      currentSem = parseInt(semM[1]);
    }

    // ── 성적 행 파싱 ──
    // 패턴A: "국어 4 93/78.2(12.7) A(251) 2"
    const patA = line.match(/^([가-힣A-Za-z·Ⅰ-Ⅹ\s\-]+?)\s+(\d{1,2})\s+(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)\s+[A-E]\(\d+\)\s+(\d)$/);
    if (patA) {
      const subj = patA[1].trim().replace(/\s+/g, '');
      if (subj.length >= 2 && subj.length <= 15) {
        result.push({
          grade: `${currentGrade}학년`, semester: `${currentSem}학기`,
          gN: currentGrade, sN: currentSem,
          subject: subj, credit: patA[2], rawScore: patA[3],
          avg: patA[4], sd: patA[5], level: parseInt(patA[6]),
          group: getGroup(subj)
        });
      }
    }

    // 패턴B: 성취도 과목 "음악감상과비평 1 100/65.0 A(245) A(20.8) B(44.9) C(34.3)"
    const patB = line.match(/^([가-힣A-Za-z·Ⅰ-Ⅹ\s\-]+?)\s+(\d{1,2})\s+(\d{2,3})\/[\d.]+\s+([A-E])\((\d+)\)\s+([A-E])\(([\d.]+)\)\s+[A-E]\(([\d.]+)\)\s+[A-E]\(([\d.]+)\)/);
    if (patB) {
      const subj = patB[1].trim().replace(/\s+/g, '');
      if (subj.length >= 2) {
        const aRate = parseFloat(patB[7]);
        achieveResult.push({
          grade: `${currentGrade}학년`, semester: `${currentSem}학기`,
          gN: currentGrade, sN: currentSem,
          subject: subj, credit: patB[2], rawScore: patB[3],
          achievement: patB[4], students: patB[5],
          distribution: `A:${patB[7]}% B:${patB[8]}% C:${patB[9]}%`,
          group: getGroup(subj),
          note: aRate <= 25 ? `A구간 ${aRate}%로 실질 최우수` : aRate <= 50 ? `A구간 ${aRate}%로 상위권` : `A구간 ${aRate}%`
        });
      }
    }
  }

  // 디버깅: 콘솔에 학년 분포 출력
  const distribution = {};
  result.forEach(r => {
    const key = `${r.gN}학년 ${r.sN}학기`;
    distribution[key] = (distribution[key] || 0) + 1;
  });
  console.log('[parser] 학년별 과목 분포:', distribution);
  console.log('[parser] 진로선택 과목:', achieveResult.length, '개');

  // 중복 제거
  const seen = new Set();
  const deduped = result.filter(r => {
    const key = `${r.gN}-${r.sN}-${r.subject}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  return { grades: deduped, achievementSubjects: achieveResult };
}

/* ── 창체·세특 활동 파싱 ── */
export function parseActivities(pages) {
  const activities = [];
  const allText = pages.map(p => p.join('\n')).join('\n');
  const lines = allText.split('\n');

  let currentGrade = 1, currentSem = 1;
  let currentType = '';
  let buffer = [];
  let inActivity = false;

  const TYPE_MAP = {
    '자율활동': '자율', '동아리활동': '동아리', '진로활동': '진로',
    '봉사활동': '봉사', '세부능력': '세특', '행동특성': '종합의견'
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const gM = line.match(/\[(\d)학년\]/);
    if (gM) { currentGrade = parseInt(gM[1]); currentSem = 1; }
    const sM = line.match(/^(\d)학기$/);
    if (sM) currentSem = parseInt(sM[1]);

    for (const [k, v] of Object.entries(TYPE_MAP)) {
      if (line.includes(k)) {
        if (buffer.length > 30 && currentType) {
          activities.push({
            year: `${currentGrade}학년`, semester: `${currentSem}학기`,
            gN: currentGrade, sN: currentSem,
            type: currentType, title: currentType,
            content: buffer.join(' ').slice(0, 400)
          });
        }
        currentType = v; buffer = []; inActivity = true; break;
      }
    }

    if (inActivity && line.length > 10 && !Object.keys(TYPE_MAP).some(k => line.includes(k))) {
      buffer.push(line);
      if (buffer.join(' ').length > 500) {
        activities.push({
          year: `${currentGrade}학년`, semester: `${currentSem}학기`,
          gN: currentGrade, sN: currentSem,
          type: currentType, title: currentType,
          content: buffer.join(' ').slice(0, 400)
        });
        buffer = []; inActivity = false;
      }
    }
  }

  return activities.slice(0, 20);
}

/* ── 세특 과목별 파싱 ── */
export function parseSubjectDetails(pages) {
  const details = {};
  const allText = pages.map(p => p.join('\n')).join('\n');

  // 과목명 + 세특 내용 패턴
  const subjDetailReg = /\((\d)학기\)([가-힣A-Za-z·Ⅰ-Ⅹ\s]+?):\s*(.{50,500}?)(?=\(|\n\n|$)/gs;
  let m;
  while ((m = subjDetailReg.exec(allText)) !== null) {
    const sem = m[1], subj = m[2].trim(), content = m[3].trim();
    if (content.length > 30) {
      details[`${subj}_${sem}학기`] = content.slice(0, 300);
    }
  }
  return details;
}

/* ── 행동특성 종합의견 파싱 ── */
export function parseBehaviorOpinion(pages) {
  const opinions = {};
  const allText = pages.map(p => p.join('\n')).join('\n');
  const reg = /(\d)학년[\s\S]{0,20}행동특성\s*및\s*종합의견([\s\S]{100,600}?)(?=\d학년|$)/g;
  let m;
  while ((m = reg.exec(allText)) !== null) {
    opinions[`${m[1]}학년`] = m[2].trim().slice(0, 500);
  }
  return opinions;
}

/* ── 전체 파싱 메인 함수 ── */
export async function parseStudentRecord(b64) {
  const { text, pages } = await extractPdfText(b64);
  if (!text || text.length < 300) return null;

  const studentInfo = parseStudentInfo(text);
  const { grades, achievementSubjects } = parseGradesWithContext(pages);
  const activities = parseActivities(pages);
  const behaviorOpinion = parseBehaviorOpinion(pages);

  // 평균 등급 계산
  const validGrades = grades.filter(g => g.level > 0);
  const gradeAvg = validGrades.length
    ? (validGrades.reduce((s,g) => s + g.level, 0) / validGrades.length).toFixed(2)
    : "0";

  return {
    studentInfo,
    grades,
    achievementSubjects,
    activities,
    behaviorOpinion,
    gradeAvg,
    rawText: text,
    pageCount: pages.length
  };
}
