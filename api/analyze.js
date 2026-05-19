// ══════════════════════════════════════════════
// 리포트아이 — 백엔드 API v20
// Vercel Pro 플랜 활용 (maxDuration 300s)
// Gemini 2.5 Pro 1순위 (고품질 분석)
// 텍스트 한도 90K (생기부 전체)
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
  console.log(`[v20 ${phaseLbl}] 텍스트 길이: ${(pdfText||'').length}자, prompt 길이: ${prompt.length}자`);

  // ⚡ 텍스트 90K (생기부 전체 들어감)
  const trimText = (pdfText||'').length > 90000
    ? pdfText.slice(0, 90000) + '\n...(생략)'
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
      maxTokens: 12000,  // 풍부한 분석
      phaseLbl,
      systemMsg: phase === 'phase2'
        ? '당신은 최상위 입학사정관입니다. 학과 적합도 5개+ / 탐구주제 5개+ / 면접 7개+ / 종합리포트 2500자+. 모든 배열 최소 개수 준수, 빈 배열 절대 금지. 원문 인용 충분. JSON만 반환.'
        : '당신은 최상위 입학사정관입니다. 학생부 정밀 분석. grades 학기별 모든 과목 / activities 15개+ / strengths 5개+ / weaknesses 3개+ / keywords 25개+. 모든 필드 풍부하게 채우세요. 원문 인용 필수. JSON만 반환.'
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

  // ── Gemini 2.5 Pro 1순위 (고품질, Pro 플랜이라 시간 여유)
  if (geminiKey) {
    try {
      console.log(`[${phaseLbl}] Gemini 2.5 Pro 호출`);
      const fullPrompt = `${systemMsg}\n\n=== 학생부 원문 ===\n${pdfText}\n\n=== 분석 지시 ===\n${prompt}`;

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
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
        console.log(`[${phaseLbl}] Gemini Pro 성공 (finish: ${finishReason}, ${text.length}자)`);
        return parseJSON(text);
      }
      const errMsg = d.error?.message || JSON.stringify(d).slice(0,300);
      console.warn(`[${phaseLbl}] Gemini Pro 실패:`, errMsg);
      // Pro 실패 시 Flash로 폴백
      console.log(`[${phaseLbl}] Gemini 1.5 Flash 폴백 시도`);
      const r2 = await fetch(
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
      const d2 = await r2.json();
      if (r2.ok) {
        const text = d2.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log(`[${phaseLbl}] Gemini Flash 성공`);
        return parseJSON(text);
      }
      if (!anthropicKey && !openaiKey) throw new Error(`Gemini: ${errMsg}`);
    } catch(e) {
      console.warn(`[${phaseLbl}] Gemini 예외:`, e.message);
      if (!anthropicKey && !openaiKey) throw e;
    }
  }

  // ── Claude (있으면 사용)
  if (anthropicKey) {
    try {
      console.log(`[${phaseLbl}] Claude 호출`);
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
        console.log(`[${phaseLbl}] Claude 성공`);
        return parseJSON(text);
      }
      if (!openaiKey) throw new Error(d.error?.message || 'Claude 호출 실패');
    } catch(e) {
      if (!openaiKey) throw e;
    }
  }

  // ── GPT-4o 폴백
  if (openaiKey) {
    console.log(`[${phaseLbl}] GPT-4o 호출`);
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
    console.log(`[${phaseLbl}] GPT 성공`);
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
