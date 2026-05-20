// ══════════════════════════════════════════════
// 리포트아이 — 백엔드 API v23 (Final)
// 핵심 변경:
// 1. responseMimeType 제거 (한국어 JSON 깨짐 방지)
// 2. JSON_START/JSON_END 마커로 응답 영역 명확화
// 3. 다단계 sanitizer (한글, 줄바꿈, escape 처리)
// 4. maxTokens 32000 (Gemini 2.5 Flash 한도 = 65K)
// 5. 상세 디버그 로그 (응답 직접 출력)
// ══════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !anthropicKey) {
    return res.status(500).json({ error: 'API 키 없음 (Gemini 또는 Claude 필요)' });
  }

  const { pdfB64, prompt, pdfText, parsed: localParsed, phase } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt 없음' });

  const phaseLbl = phase || 'main';
  console.log(`[v23 ${phaseLbl}] === 분석 시작 ===`);
  console.log(`[v23 ${phaseLbl}] 입력 텍스트: ${(pdfText||'').length}자`);

  // 텍스트 한도: 50K (입력 토큰 25K 정도, 출력에 충분한 여유)
  const trimText = (pdfText||'').length > 50000
    ? pdfText.slice(0, 50000) + '\n...(생략)'
    : (pdfText||'');

  if (!trimText || trimText.length < 200) {
    return res.status(400).json({ error: 'PDF 텍스트 추출 실패' });
  }

  // 프롬프트에 JSON 마커 추가 — 응답 구간을 명확하게 식별
  const systemMsg = phase === 'phase2'
    ? `당신은 최상위 입학사정관입니다. 학과 적합도 5개+/탐구 5개+/면접 7개+/리포트 3500자+. 각 항목 근거 4~5개.

【응답 형식 — 매우 중요】
반드시 다음과 같은 형식으로 답하세요:
JSON_START
{여기에 JSON 데이터}
JSON_END

JSON 안에 따옴표는 반드시 \\" 로 escape하세요.
JSON 안에 줄바꿈은 \\n 으로 표시하세요.
JSON 외 다른 설명/마크다운/주석은 절대 출력하지 마세요.`
    : `당신은 최상위 입학사정관입니다. 모든 분석에 원문 근거 4~5개 필수. activities 15개+, strengths 5개+, keywords 25개+.

【응답 형식 — 매우 중요】
반드시 다음과 같은 형식으로 답하세요:
JSON_START
{여기에 JSON 데이터}
JSON_END

JSON 안에 따옴표는 반드시 \\" 로 escape하세요.
JSON 안에 줄바꿈은 \\n 으로 표시하세요.
JSON 외 다른 설명/마크다운/주석은 절대 출력하지 마세요.`;

  try {
    const result = await callAI({
      geminiKey, anthropicKey,
      pdfText: trimText, prompt,
      maxTokens: 32000,
      phaseLbl,
      systemMsg
    });

    // 로컬 파서 폴백 (AI 결과 비어있을 때)
    if (phase !== 'phase2' && localParsed) {
      if (!result.gradeAvg || result.gradeAvg === '0') {
        if (localParsed.gradeAvg) result.gradeAvg = localParsed.gradeAvg;
      }
      if (!result.schoolName && localParsed.studentInfo?.school) {
        result.schoolName = localParsed.studentInfo.school;
      }
      if ((!result.grades || result.grades.length === 0) && localParsed.grades?.length > 0) {
        result.grades = localParsed.grades;
      }
      if ((!result.achievementSubjects || result.achievementSubjects.length === 0) && localParsed.achievementSubjects?.length > 0) {
        result.achievementSubjects = localParsed.achievementSubjects;
      }
    }

    const keys = Object.keys(result);
    console.log(`[v23 ${phaseLbl}] ✅ 완료 — ${keys.length}개 키: ${keys.slice(0,10).join(', ')}`);

    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(result) }],
      _debug: { phase: phaseLbl, keys, keyCount: keys.length }
    });
  } catch(e) {
    console.error(`[v23 ${phaseLbl}] ❌ 실패:`, e.message);
    return res.status(500).json({ error: `${phaseLbl} 오류: ${e.message}` });
  }
}

async function callAI({ geminiKey, anthropicKey, pdfText, prompt, maxTokens, systemMsg, phaseLbl }) {

  const fullPrompt = `${systemMsg}\n\n=== 학생부 원문 ===\n${pdfText}\n\n=== 분석 지시 ===\n${prompt}`;

  // ──────────────────────────────────────
  // 1순위: Gemini 2.5 Flash (무료 일 250회)
  // ──────────────────────────────────────
  if (geminiKey) {
    try {
      console.log(`[${phaseLbl}] → Gemini 2.5 Flash 호출 (max ${maxTokens} tokens)`);
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.3
              // responseMimeType 제거 — 한국어 JSON 깨짐 방지
            }
          })
        }
      );
      const d = await r.json();
      if (r.ok && d.candidates?.[0]) {
        const cand = d.candidates[0];
        const text = cand.content?.parts?.[0]?.text || '';
        const finishReason = cand.finishReason || 'unknown';
        const usage = d.usageMetadata || {};
        console.log(`[${phaseLbl}] Gemini 2.5 Flash 응답:`);
        console.log(`  - 길이: ${text.length}자`);
        console.log(`  - finishReason: ${finishReason}`);
        console.log(`  - 토큰: in=${usage.promptTokenCount||'?'} out=${usage.candidatesTokenCount||'?'}`);
        if (finishReason !== 'STOP') {
          console.warn(`  ⚠️ 비정상 종료: ${finishReason}`);
        }
        if (text.length > 100) {
          return parseResponse(text, phaseLbl);
        }
        console.warn(`  ⚠️ 응답 너무 짧음 (${text.length}자), 폴백 시도`);
      } else {
        console.warn(`[${phaseLbl}] Gemini Flash 실패:`, d.error?.message || JSON.stringify(d).slice(0,200));
      }

      // 폴백: Gemini 2.5 Pro
      console.log(`[${phaseLbl}] → Gemini 2.5 Pro 폴백 시도`);
      const r2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.3
            }
          })
        }
      );
      const d2 = await r2.json();
      if (r2.ok && d2.candidates?.[0]) {
        const text = d2.candidates[0].content?.parts?.[0]?.text || '';
        const usage = d2.usageMetadata || {};
        console.log(`[${phaseLbl}] Gemini Pro 응답: ${text.length}자, 출력 토큰 ${usage.candidatesTokenCount||'?'}`);
        if (text.length > 100) {
          return parseResponse(text, phaseLbl);
        }
      } else {
        console.warn(`[${phaseLbl}] Gemini Pro 실패:`, d2.error?.message?.slice(0,200));
      }

      // 폴백: Gemini 2.5 Flash-Lite (최후 무료 폴백)
      console.log(`[${phaseLbl}] → Gemini 2.5 Flash-Lite 최후 폴백`);
      const r3 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 }
          })
        }
      );
      const d3 = await r3.json();
      if (r3.ok && d3.candidates?.[0]) {
        const text = d3.candidates[0].content?.parts?.[0]?.text || '';
        console.log(`[${phaseLbl}] Flash-Lite 응답: ${text.length}자`);
        if (text.length > 100) return parseResponse(text, phaseLbl);
      }
    } catch(e) {
      console.error(`[${phaseLbl}] Gemini 예외:`, e.message);
    }
  }

  // ──────────────────────────────────────
  // 2순위: Claude (있을 때만)
  // ──────────────────────────────────────
  if (anthropicKey) {
    try {
      console.log(`[${phaseLbl}] → Claude Sonnet 호출`);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: fullPrompt }]
        })
      });
      const d = await r.json();
      if (r.ok) {
        const text = d.content?.find(b=>b.type==='text')?.text || '';
        console.log(`[${phaseLbl}] Claude 응답: ${text.length}자`);
        if (text.length > 100) return parseResponse(text, phaseLbl);
        console.warn(`[${phaseLbl}] Claude 응답 너무 짧음`);
      } else {
        console.warn(`[${phaseLbl}] Claude 실패:`, d.error?.message?.slice(0,200));
      }
    } catch(e) {
      console.error(`[${phaseLbl}] Claude 예외:`, e.message);
    }
  }

  throw new Error('Gemini와 Claude 모두 실패. Vercel Logs를 확인하세요.');
}

// ═══════════════════════════════════════════════
// 응답 파싱 — JSON_START/JSON_END 마커 + sanitizer
// ═══════════════════════════════════════════════
function parseResponse(text, phaseLbl = 'unknown') {
  if (!text || typeof text !== 'string') {
    console.error(`[parse ${phaseLbl}] ❌ 입력 없음`);
    return {};
  }

  const log = (msg) => console.log(`[parse ${phaseLbl}] ${msg}`);
  const warn = (msg) => console.warn(`[parse ${phaseLbl}] ${msg}`);

  // ── 1. JSON_START / JSON_END 마커 우선 추출 ──
  let jsonText = text;
  const startMarker = text.indexOf('JSON_START');
  const endMarker = text.lastIndexOf('JSON_END');
  if (startMarker >= 0 && endMarker > startMarker) {
    jsonText = text.slice(startMarker + 'JSON_START'.length, endMarker).trim();
    log(`마커 발견: ${jsonText.length}자 추출`);
  } else {
    log(`마커 없음, 전체 텍스트로 파싱 시도`);
  }

  // ── 2. 마크다운/BOM 제거 ──
  jsonText = jsonText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  if (jsonText.charCodeAt(0) === 0xFEFF) jsonText = jsonText.slice(1);

  // ── 3. 1차 파싱 시도 (원본) ──
  const tryParse = (s, label) => {
    try {
      const result = JSON.parse(s);
      log(`✅ ${label} 성공 — ${Object.keys(result).length}개 키: ${Object.keys(result).slice(0,8).join(', ')}`);
      return result;
    } catch (e) {
      warn(`${label} 실패: ${e.message?.slice(0, 150)}`);
      const m = e.message?.match(/position (\d+)/);
      if (m) {
        const pos = parseInt(m[1]);
        warn(`  위치 ${pos} 주변: ...${s.slice(Math.max(0,pos-60), pos+60)}...`);
      }
      return null;
    }
  };

  let result = tryParse(jsonText, '1차');
  if (result) return result;

  // ── 4. { } 구간 추출 후 재시도 ──
  const firstBrace = jsonText.indexOf('{');
  const lastBrace = jsonText.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const extracted = jsonText.slice(firstBrace, lastBrace + 1);
    result = tryParse(extracted, '2차(구간추출)');
    if (result) return result;

    // ── 5. Sanitize: 흔한 깨짐 패턴 수정 ──
    let sanitized = extracted
      // 잘못된 escape 정리
      .replace(/\\([^"\\/bfnrtu])/g, '$1')
      // 값 안의 raw 줄바꿈을 \n으로 치환
      .replace(/("(?:[^"\\]|\\.)*?")|[\r\n]+/g, (m, p1) => p1 ? p1 : ' ')
      // 후행 쉼표 제거
      .replace(/,(\s*[}\]])/g, '$1')
      // 키에 따옴표 없는 경우 (드물지만 발생)
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    result = tryParse(sanitized, '3차(sanitize)');
    if (result) return result;

    // ── 6. 잘린 JSON 복구 ──
    log('잘린 JSON 복구 시도');
    let depth = 0, inStr = false, esc = false;
    let lastValidComma = -1;
    for (let i = 0; i < extracted.length; i++) {
      const c = extracted[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      if (c === ',' && depth >= 1) lastValidComma = i;
    }
    if (depth > 0 && lastValidComma > 0) {
      let truncated = extracted.slice(0, lastValidComma);
      // 깊이 추적해서 닫는 괄호 추가
      let d = 0, inS = false, eS = false;
      let stack = [];
      for (let i = 0; i < truncated.length; i++) {
        const c = truncated[i];
        if (eS) { eS = false; continue; }
        if (c === '\\' && inS) { eS = true; continue; }
        if (c === '"') { inS = !inS; continue; }
        if (inS) continue;
        if (c === '{') stack.push('}');
        else if (c === '[') stack.push(']');
        else if (c === '}' || c === ']') stack.pop();
      }
      truncated += stack.reverse().join('');
      result = tryParse(truncated, '4차(잘림복구)');
      if (result) return result;
    }
  }

  // ── 7. 모두 실패 — 진단 정보 출력 ──
  console.error(`[parse ${phaseLbl}] ❌ 모든 파싱 실패`);
  console.error(`  - 원본 길이: ${text.length}자`);
  console.error(`  - 첫 800자: ${text.slice(0, 800)}`);
  console.error(`  - 마지막 400자: ${text.slice(-400)}`);
  return {};
}
