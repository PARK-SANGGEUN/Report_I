// ══════════════════════════════════════════════
// 리포트아이 — 백엔드 API v21
// Vercel Pro 활용: max_tokens 16000, 텍스트 90K
// Gemini 2.5 Pro 1순위
// 로컬 파서 결과는 AI 비어있을 때만 폴백
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
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return {};
  }
}
