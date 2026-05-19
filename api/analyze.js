// ══════════════════════════════════════════════
// 리포트아이 — 백엔드 API v19
// Gemini 1.5 Flash 1순위 (텍스트만, 빠름)
// 텍스트 한도 50K (2학년 데이터까지)
// Phase 디버깅 강화
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
    return res.status(500).json({
      error: 'API 키 없음: Vercel 환경변수에 GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY 중 하나를 추가하세요.'
    });
  }

  const { pdfB64, prompt, pdfText, parsed: localParsed, phase } = req.body;

  if (!prompt) return res.status(400).json({ error: 'prompt가 없습니다.' });

  const phaseLbl = phase || 'main';
  console.log(`[v19 ${phaseLbl}] 텍스트 길이: ${(pdfText||'').length}자, prompt 길이: ${prompt.length}자`);

  // ⚡ 텍스트 50,000자까지 (2학년 데이터 들어가게)
  const trimText = (pdfText||'').length > 50000
    ? pdfText.slice(0, 50000) + '\n...(생략)'
    : (pdfText||'');

  if (!trimText || trimText.length < 200) {
    return res.status(400).json({
      error: 'PDF 텍스트 추출 실패 — 스캔본이거나 보안 설정된 PDF입니다.'
    });
  }

  try {
    const result = await callAI({
      geminiKey, anthropicKey, openaiKey,
      pdfText: trimText, prompt,
      maxTokens: 8000,
      phaseLbl,
      systemMsg: phase === 'phase2'
        ? 'Phase 2: 학과 적합도 5개+ / 탐구주제 5개+ / 면접 7개+ / 종합리포트 2000자+. 빈 배열 절대 금지. JSON만 반환.'
        : '학생부 정밀 분석. 모든 배열의 최소 개수와 각 필드 최소 분량을 반드시 지키세요. JSON만 반환.'
    });

    if (phase !== 'phase2' && localParsed) {
      if (!result.gradeAvg || result.gradeAvg === '0') {
        if (localParsed.gradeAvg) result.gradeAvg = localParsed.gradeAvg;
      }
      if (!result.schoolName && localParsed.studentInfo?.school) {
        result.schoolName = localParsed.studentInfo.school;
      }
      if ((!result.grades || result.grades.length < 4) && localParsed.grades?.length > 0) {
        result.grades = localParsed.grades;
      }
      if ((!result.achievementSubjects || result.achievementSubjects.length === 0) && localParsed.achievementSubjects?.length > 0) {
        result.achievementSubjects = localParsed.achievementSubjects;
      }
    }

    const keys = Object.keys(result);
    console.log(`[${phaseLbl}] 완료 — 응답 키 ${keys.length}개: ${keys.join(',')}`);

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
      console.log(`[${phaseLbl}] Gemini 1.5 Flash 호출`);
      const fullPrompt = `${systemMsg}\n\n=== 학생부 원문 ===\n${pdfText}\n\n=== 분석 지시 ===\n${prompt}`;

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
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
        const finishReason = d.candidates?.[0]?.finishReason || 'UNKNOWN';
        console.log(`[${phaseLbl}] Gemini 성공 (finish: ${finishReason}, ${text.length}자)`);
        return parseJSON(text);
      }
      const errMsg = d.error?.message || JSON.stringify(d).slice(0,300);
      console.warn(`[${phaseLbl}] Gemini 실패:`, errMsg);
      if (!anthropicKey && !openaiKey) throw new Error(`Gemini: ${errMsg}`);
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
      if (!openaiKey) throw new Error(d.error?.message || 'Claude 호출 실패');
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
    if (!r.ok) throw new Error(d.error?.message || 'GPT 호출 실패');
    const text = d.choices?.[0]?.message?.content || '{}';
    return parseJSON(text);
  }

  throw new Error('호출 가능한 API 키 없음');
}

function parseJSON(text) {
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return {};
  }
}
