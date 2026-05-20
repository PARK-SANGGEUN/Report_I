// ══════════════════════════════════════════════
// 리포트아이 — 백엔드 API v22
// Vercel Pro 활용: max_tokens 16000, 텍스트 50K
// Gemini 2.5 Flash 1순위 + Flash-Lite 폴백
// JSON 파싱 4단계 복구 (잘린 응답도 살림)
// ══════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if (!geminiKey && !anthropicKey && !openaiKey) {
    return res.status(500).json({ error: 'API 키 없음' });
  }

  const { pdfB64, prompt, pdfText, parsed: localParsed, phase } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt 없음' });

  const phaseLbl = phase || 'main';
  console.log(`[v21 ${phaseLbl}] 텍스트: ${(pdfText||'').length}자`);

  // 텍스트 한도: 50K (GPT 폴백 시 TPM 한도 30000 고려)
  const trimText = (pdfText||'').length > 50000
    ? pdfText.slice(0, 50000) + '\n...(생략)'
    : (pdfText||'');

  if (!trimText || trimText.length < 200) {
    return res.status(400).json({ error: 'PDF 텍스트 추출 실패' });
  }

  try {
    const result = await callAI({
      geminiKey, anthropicKey, openaiKey,
      pdfText: trimText, prompt,
      maxTokens: 16000,
      phaseLbl,
      systemMsg: phase === 'phase2'
        ? '최상위 입학사정관. 학과 적합도 5개+/탐구 5개+/면접 7개+/리포트 3500자+. 각 항목 근거 4~5개. JSON만.'
        : '최상위 입학사정관. 모든 분석에 원문 근거 4~5개 필수. activities 15개+, strengths 5개+, keywords 25개+. JSON만.'
    });

    if (phase !== 'phase2' && localParsed) {
      if (!result.gradeAvg || result.gradeAvg === '0') {
        if (localParsed.gradeAvg) result.gradeAvg = localParsed.gradeAvg;
      }
      if (!result.schoolName && localParsed.studentInfo?.school) {
        result.schoolName = localParsed.studentInfo.school;
      }
      // AI 결과 비어있을 때만 로컬 폴백
      if ((!result.grades || result.grades.length === 0) && localParsed.grades?.length > 0) {
        result.grades = localParsed.grades;
      }
      if ((!result.achievementSubjects || result.achievementSubjects.length === 0) && localParsed.achievementSubjects?.length > 0) {
        result.achievementSubjects = localParsed.achievementSubjects;
      }
    }

    const keys = Object.keys(result);
    console.log(`[${phaseLbl}] 완료 — ${keys.length}개 키`);

    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(result) }],
      _debug: { phase: phaseLbl, keys, keyCount: keys.length }
    });
  } catch(e) {
    console.error(`[${phaseLbl}] 실패:`, e.message);
    return res.status(500).json({ error: `${phaseLbl} 오류: ${e.message}` });
  }
}

async function callAI({ geminiKey, anthropicKey, openaiKey, pdfText, prompt, maxTokens, systemMsg, phaseLbl }) {

  if (geminiKey) {
    try {
      console.log(`[${phaseLbl}] Gemini 2.5 Flash 호출 (무료 등급 사용 가능 모델)`);
      const fullPrompt = `${systemMsg}\n\n=== 학생부 원문 ===\n${pdfText}\n\n=== 분석 지시 ===\n${prompt}`;

      // 1순위: 2.5 Flash (무료 10 RPM, 250 RPD)
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.3,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      const d = await r.json();
      if (r.ok) {
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log(`[${phaseLbl}] Gemini 2.5 Flash 성공 (${text.length}자)`);
        return parseJSON(text);
      }
      console.warn(`[${phaseLbl}] 2.5 Flash 실패, Flash-Lite 폴백`);
      console.warn('Flash 에러:', d.error?.message || JSON.stringify(d).slice(0, 300));

      // 폴백: 2.5 Flash-Lite (무료 15 RPM, 1000 RPD — 가장 큰 한도)
      const r2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.3,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      const d2 = await r2.json();
      if (r2.ok) {
        const text = d2.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log(`[${phaseLbl}] Flash-Lite 성공 (폴백)`);
        return parseJSON(text);
      }
      console.warn(`[${phaseLbl}] Flash-Lite도 실패:`, d2.error?.message);
      if (!anthropicKey && !openaiKey) throw new Error(d.error?.message || 'Gemini 실패');
    } catch(e) {
      console.warn(`[${phaseLbl}] Gemini 예외:`, e.message);
      if (!anthropicKey && !openaiKey) throw e;
    }
  }

  if (anthropicKey) {
    try {
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
          messages: [{
            role: 'user',
            content: `${systemMsg}\n\n=== 학생부 원문 ===\n${pdfText}\n\n=== 분석 지시 ===\n${prompt}`
          }]
        })
      });
      const d = await r.json();
      if (r.ok) {
        const text = d.content?.find(b=>b.type==='text')?.text || '{}';
        return parseJSON(text);
      }
      if (!openaiKey) throw new Error(d.error?.message || 'Claude 실패');
    } catch(e) {
      if (!openaiKey) throw e;
    }
  }

  if (openaiKey) {
    const fullPrompt = `=== 학생부 원문 ===\n${pdfText}\n\n=== 분석 지시 ===\n${prompt}`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: fullPrompt }
        ],
        response_format: { type: 'json_object' }
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'GPT 실패');
    const text = d.choices?.[0]?.message?.content || '{}';
    return parseJSON(text);
  }

  throw new Error('호출 가능한 키 없음');
}

function parseJSON(text) {
  if (!text || typeof text !== 'string') return {};
  
  // 1단계: 마크다운 제거
  let cleaned = String(text).replace(/```json|```/g, '').trim();
  
  // 2단계: 정상 파싱 시도
  try {
    const result = JSON.parse(cleaned);
    console.log('[parseJSON] 1차 성공:', Object.keys(result).length, '개 키');
    return result;
  } catch (e1) {
    console.warn('[parseJSON] 1차 실패:', e1.message?.slice(0, 100));
  }
  
  // 3단계: { } 구간만 추출
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const result = JSON.parse(m[0]);
      console.log('[parseJSON] 2차 성공:', Object.keys(result).length, '개 키');
      return result;
    } catch (e2) {
      console.warn('[parseJSON] 2차 실패:', e2.message?.slice(0, 100));
    }
  }
  
  // 4단계: 잘린 JSON 복구 시도 (Gemini가 출력 한도로 끊긴 경우)
  try {
    let json = cleaned;
    // 마지막 완성된 } 위치 찾기
    let depth = 0, lastValid = -1, inString = false, escape = false;
    for (let i = 0; i < json.length; i++) {
      const c = json[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) lastValid = i;
      }
    }
    
    // 끊긴 경우 — 마지막 valid 위치까지 + 닫는 괄호 추가
    if (depth > 0) {
      // 마지막 ", "} 등 깨진 부분 찾아 정리
      let truncated = json;
      // 마지막 쉼표 뒤 미완성 부분 제거
      const lastComma = truncated.lastIndexOf(',');
      const lastBrace = truncated.lastIndexOf('}');
      const lastBracket = truncated.lastIndexOf(']');
      const cutPoint = Math.max(lastBrace, lastBracket);
      if (cutPoint > 0) {
        truncated = truncated.slice(0, cutPoint + 1);
        // 깊이만큼 닫는 괄호 추가
        // (실제로는 stack 추적이 더 정확하지만 일단 단순화)
        while (depth > 0) { truncated += '}'; depth--; }
        try {
          const result = JSON.parse(truncated);
          console.log('[parseJSON] 잘린 JSON 복구 성공:', Object.keys(result).length, '개 키');
          return result;
        } catch (e3) {
          console.warn('[parseJSON] 복구 실패:', e3.message?.slice(0, 100));
        }
      }
    }
  } catch (eFix) {
    console.warn('[parseJSON] 복구 시도 예외:', eFix.message?.slice(0, 100));
  }
  
  // 5단계: 모든 시도 실패 — 텍스트 일부 출력 후 빈 객체
  console.error('[parseJSON] 모든 파싱 실패. 응답 첫 500자:', cleaned.slice(0, 500));
  console.error('[parseJSON] 응답 마지막 300자:', cleaned.slice(-300));
  return {};
}
