// ══════════════════════════════════════════════
// 생기부 로컬 파서 v21
// 표 구조 인식: 학기 열, 페이지 넘어감 대응
// ══════════════════════════════════════════════

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

const GROUP_MAP = {
  '국어': '국어', '문학': '국어', '독서': '국어', '화법': '국어', '언어': '국어', '매체': '국어', '작문': '국어',
  '수학': '수학', '미적분': '수학', '확률': '수학', '기하': '수학', '경제수학': '수학', '실용수학': '수학',
  '영어': '영어', '영문': '영어',
  '한국사': '사회', '통합사회': '사회', '세계사': '사회', '동아시아사': '사회',
  '세계지리': '사회', '한국지리': '사회', '정치': '사회', '법': '사회', '경제': '사회',
  '사회문화': '사회', '생활과윤리': '사회', '윤리와사상': '사회', '한문': '사회', '윤리': '사회',
  '통합과학': '과학', '물리': '과학', '화학': '과학', '생명과학': '과학', '지구과학': '과학',
  '과학탐구실험': '과학', '생활과과학': '과학', '융합과학': '과학',
  '기술': '기술가정', '가정': '기술가정', '정보': '기술가정', '인공지능': '기술가정', '환경': '기술가정',
  '체육': '예체능', '음악': '예체능', '미술': '예체능', '운동': '예체능', '연극': '예체능',
};

function getGroup(subject) {
  const s = subject.replace(/\s/g,'');
  for (const [key, val] of Object.entries(GROUP_MAP)) {
    if (s.startsWith(key) || s.includes(key)) return val;
  }
  return '기타';
}

export function parseGrades(text) {
  const grades = [];
  const achievementSubjects = [];
  const gradeLineReg = /([가-힣A-Za-z·\s\-Ⅰ-Ⅹ]{2,20})\s+(\d+)\s+(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)\s+[A-E]\((\d+)\)\s+(\d)/g;
  let m;
  while ((m = gradeLineReg.exec(text)) !== null) {
    const subject = m[1].trim().replace(/\s+/g, '');
    const credit = m[2], rawScore = m[3], avg = m[4], sd = m[5], students = m[6], level = m[7];
    if (parseInt(level) >= 1 && parseInt(level) <= 9 && subject.length >= 2) {
      grades.push({ subject, credit, rawScore, avg, sd, students, level: parseInt(level) });
    }
  }
  const achvReg = /([가-힣A-Za-z·\s\-Ⅰ-Ⅹ]{2,20})\s+(\d+)\s+(\d{2,3})\/[\d.]+\s+([A-E])\((\d+)\)\s+([A-E])\([\d.]+\)\s+[A-E]\([\d.]+\)/g;
  while ((m = achvReg.exec(text)) !== null) {
    const subject = m[1].trim();
    achievementSubjects.push({ subject, credit: m[2], rawScore: m[3], achievement: m[4], students: m[5] });
  }
  return { grades, achievementSubjects };
}

/* ══════════════════════════════════════════
   v21 핵심: 표 구조 인식 파싱
   ══════════════════════════════════════════ */
export function parseGradesWithContext(pages) {
  const result = [];
  const achieveResult = [];
  let currentGrade = 1, currentSem = 1;

  const allLines = [];
  pages.forEach((pageLines, pIdx) => {
    pageLines.forEach(l => allLines.push({ line: l, page: pIdx + 1 }));
  });

  for (let i = 0; i < allLines.length; i++) {
    const { line, page } = allLines[i];

    // 학년 헤더 [1학년], [2학년], [3학년]
    const bracketGradeM = line.match(/^\s*\[\s*(\d)\s*학년\s*\]\s*$/);
    if (bracketGradeM) {
      currentGrade = parseInt(bracketGradeM[1]);
      currentSem = 1;
      console.log(`[parser v21] ${currentGrade}학년 시작 (p${page})`);
      continue;
    }

    // "1학년" 단독, "2학년 1학기" 형태
    const inlineM = line.match(/^(\d)\s*학년(?:\s+(\d)\s*학기)?\s*$/);
    if (inlineM) {
      currentGrade = parseInt(inlineM[1]);
      currentSem = inlineM[2] ? parseInt(inlineM[2]) : 1;
      console.log(`[parser v21] ${currentGrade}학년 ${currentSem}학기 시작 (p${page})`);
      continue;
    }

    // 표 헤더 스킵
    if (line.match(/학기.*교과.*과목/) || line.match(/원점수.*평균/) || line.match(/석차등급/) || line.match(/성취도.*수강자/)) {
      continue;
    }

    // 학년 표시가 여러 번 (예: "1학년 2학년 3학년" 헤더)
    if ((line.match(/학년/g) || []).length >= 2) continue;

    // 성적 행 파싱
    const parsed = parseGradeRow(line);
    if (parsed) {
      if (parsed.semChanged) currentSem = parsed.newSem;

      if (parsed.type === 'level') {
        result.push({
          grade: `${currentGrade}학년`, semester: `${currentSem}학기`,
          gN: currentGrade, sN: currentSem,
          subject: parsed.subject, credit: parsed.credit, rawScore: parsed.rawScore,
          avg: parsed.avg, sd: parsed.sd, level: parsed.level,
          group: getGroup(parsed.subject)
        });
      } else if (parsed.type === 'achievement') {
        achieveResult.push({
          grade: `${currentGrade}학년`, semester: `${currentSem}학기`,
          gN: currentGrade, sN: currentSem,
          subject: parsed.subject, credit: parsed.credit, rawScore: parsed.rawScore,
          achievement: parsed.achievement, students: parsed.students,
          distribution: parsed.distribution,
          group: getGroup(parsed.subject),
          note: parsed.note
        });
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

  const achSeen = new Set();
  const achDeduped = achieveResult.filter(r => {
    const key = `${r.gN}-${r.sN}-${r.subject}`;
    if (achSeen.has(key)) return false;
    achSeen.add(key); return true;
  });

  const distribution = {};
  deduped.forEach(r => {
    const key = `${r.gN}-${r.sN}`;
    distribution[key] = (distribution[key] || 0) + 1;
  });
  console.log(`[parser v21] 일반선택 학기별:`, distribution);
  console.log(`[parser v21] 진로선택 ${achDeduped.length}개`);

  return { grades: deduped, achievementSubjects: achDeduped };
}

/* 행 단위 파싱 — 학기 열 인식 */
function parseGradeRow(line) {
  const patterns = [
    // 학기열 있음: "1[\s\t]교과[\s\t]과목[\s\t]학점..."
    {
      re: /^([12])[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()/]{1,30}?)[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()\s]{1,20}?)[\s\t]+(\d{1,2})[\s\t]+(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)[\s\t]+[A-E]\((\d+)\)[\s\t]+(\d)$/,
      semIdx: 1, subjIdx: 3, creditIdx: 4, scoreIdx: 5, avgIdx: 6, sdIdx: 7, lvlIdx: 9, hasSem: true
    },
    // 학기열 없음 (앞이 공백/탭으로 시작)
    {
      re: /^[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()/]{1,30}?)[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()\s]{1,20}?)[\s\t]+(\d{1,2})[\s\t]+(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)[\s\t]+[A-E]\((\d+)\)[\s\t]+(\d)$/,
      subjIdx: 2, creditIdx: 3, scoreIdx: 4, avgIdx: 5, sdIdx: 6, lvlIdx: 8, hasSem: false
    },
    // 학기/교과 합쳐진 형태 (기존 v15 호환)
    {
      re: /^([가-힣A-Za-z·\s\-Ⅰ-Ⅹ]{2,20}?)\s+(\d{1,2})\s+(\d{2,3})\/(\d{1,3}\.?\d*)\((\d{1,2}\.?\d*)\)\s+[A-E]\(\d+\)\s+(\d)$/,
      subjIdx: 1, creditIdx: 2, scoreIdx: 3, avgIdx: 4, sdIdx: 5, lvlIdx: 6, hasSem: false, combined: true
    },
  ];

  for (const p of patterns) {
    const m = line.match(p.re);
    if (!m) continue;
    const subject = (m[p.subjIdx] || '').trim().replace(/\s+/g,'');
    const credit = m[p.creditIdx];
    const rawScore = m[p.scoreIdx];
    const avg = m[p.avgIdx];
    const sd = m[p.sdIdx];
    const level = parseInt(m[p.lvlIdx]);
    if (level >= 1 && level <= 9 && subject.length >= 2 && subject.length <= 20) {
      return {
        type: 'level',
        subject, credit, rawScore, avg, sd, level,
        semChanged: p.hasSem, newSem: p.hasSem ? parseInt(m[p.semIdx]) : null
      };
    }
  }

  // 진로선택(성취도)
  const achPatterns = [
    {
      re: /^([12])[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()/]{1,30}?)[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()\s]{1,20}?)[\s\t]+(\d{1,2})[\s\t]+(\d{2,3})\/[\d.]+[\s\t]+([A-E])\((\d+)\)[\s\t]+([A-E])\(([\d.]+)\)[\s\t]+[A-E]\(([\d.]+)\)[\s\t]+[A-E]\(([\d.]+)\)/,
      hasSem: true, semIdx: 1, subjIdx: 3, creditIdx: 4, scoreIdx: 5, achIdx: 6, stuIdx: 7, aRateIdx: 9, bRateIdx: 10, cRateIdx: 11
    },
    {
      re: /^[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()/]{1,30}?)[\s\t]+([가-힣A-Za-z·\-Ⅰ-Ⅹ()\s]{1,20}?)[\s\t]+(\d{1,2})[\s\t]+(\d{2,3})\/[\d.]+[\s\t]+([A-E])\((\d+)\)[\s\t]+([A-E])\(([\d.]+)\)[\s\t]+[A-E]\(([\d.]+)\)[\s\t]+[A-E]\(([\d.]+)\)/,
      hasSem: false, subjIdx: 2, creditIdx: 3, scoreIdx: 4, achIdx: 5, stuIdx: 6, aRateIdx: 8, bRateIdx: 9, cRateIdx: 10
    },
    {
      re: /^([가-힣A-Za-z·\s\-Ⅰ-Ⅹ]{2,20}?)\s+(\d{1,2})\s+(\d{2,3})\/[\d.]+\s+([A-E])\((\d+)\)\s+([A-E])\(([\d.]+)\)\s+[A-E]\(([\d.]+)\)\s+[A-E]\(([\d.]+)\)/,
      hasSem: false, subjIdx: 1, creditIdx: 2, scoreIdx: 3, achIdx: 4, stuIdx: 5, aRateIdx: 7, bRateIdx: 8, cRateIdx: 9
    },
  ];

  for (const p of achPatterns) {
    const m = line.match(p.re);
    if (!m) continue;
    const subject = (m[p.subjIdx] || '').trim().replace(/\s+/g,'');
    const credit = m[p.creditIdx];
    const rawScore = m[p.scoreIdx];
    const achievement = m[p.achIdx];
    const students = m[p.stuIdx];
    const aRate = m[p.aRateIdx];
    const bRate = m[p.bRateIdx];
    const cRate = m[p.cRateIdx];
    if (subject.length >= 2 && subject.length <= 20) {
      const aRateNum = parseFloat(aRate);
      return {
        type: 'achievement',
        subject, credit, rawScore, achievement, students,
        distribution: `A:${aRate}% B:${bRate}% C:${cRate}%`,
        note: aRateNum <= 25 ? `A구간 ${aRate}%로 실질 최우수` : aRateNum <= 50 ? `A구간 ${aRate}%로 상위권` : `A구간 ${aRate}%`,
        semChanged: p.hasSem, newSem: p.hasSem ? parseInt(m[p.semIdx]) : null
      };
    }
  }

  return null;
}

export function parseActivities(text) {
  const activities = [];
  const lines = text.split('\n');
  const TYPE_MAP = {
    '창의적 체험활동': '체험', '자율활동': '자율', '동아리활동': '동아리',
    '봉사활동': '봉사', '진로활동': '진로', '독서활동': '독서',
    '행동특성 및 종합의견': '종합', '수상경력': '수상'
  };
  let currentType = null, buffer = [], inActivity = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let matched = false;
    for (const [key, label] of Object.entries(TYPE_MAP)) {
      if (line.includes(key) && line.length < 50) {
        if (buffer.length > 30 && currentType) {
          activities.push({ type: currentType, content: buffer.join(' ').slice(0, 400) });
        }
        currentType = label; buffer = []; inActivity = true; matched = true; break;
      }
    }
    if (matched) continue;
    if (inActivity && line.length > 10 && !Object.keys(TYPE_MAP).some(k => line.includes(k))) {
      buffer.push(line);
      if (buffer.join(' ').length > 500) {
        activities.push({ type: currentType, content: buffer.join(' ').slice(0, 400) });
        buffer = [];
      }
    }
  }
  return activities.slice(0, 20);
}

export function parseSubjectDetails(text) {
  const details = {};
  const reg = /([가-힣A-Za-z·\s]{2,15})\s*\((\d)학기?\)\s*[:：]\s*([^\n]{30,400})/g;
  let m;
  while ((m = reg.exec(text)) !== null) {
    const subj = m[1].trim(), sem = m[2], content = m[3].trim();
    if (content.length > 30) {
      details[`${subj}_${sem}학기`] = content.slice(0, 300);
    }
  }
  return details;
}

export function parseOpinions(text) {
  const opinions = {};
  const reg = /(\d)학년[^가-힣A-Za-z]*([가-힣A-Za-z\s,.()'"]{50,500})/g;
  let m;
  while ((m = reg.exec(text)) !== null) {
    opinions[`${m[1]}학년`] = m[2].trim().slice(0, 500);
  }
  return opinions;
}

export async function parseAll(b64) {
  const { text, pages } = await extractPdfText(b64);
  if (!text || text.length < 300) return null;
  const studentInfo = parseStudentInfo(text);
  const { grades, achievementSubjects } = parseGradesWithContext(pages);
  const activities = parseActivities(text);
  const details = parseSubjectDetails(text);
  const opinions = parseOpinions(text);
  const validGrades = grades.filter(r => parseInt(r.level||0) > 0);
  const gradeAvg = validGrades.length
    ? (validGrades.reduce((s,r)=>s+parseInt(r.level),0)/validGrades.length).toFixed(2)
    : null;
  return { text, pages, studentInfo, grades, achievementSubjects, activities, details, opinions, gradeAvg };
}
