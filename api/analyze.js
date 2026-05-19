// ══════════════════════════════════════════════
// 리포트아이 — 백엔드 API v17
// Gemini 2.5 Flash 1순위 (빠른 응답, 60초 보장)
// GPT-4o 폴백 (Gemini 장애 시)
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

  if (!pdfB64) return res.status(400).json({ error: 'pdfB64가 없습니다.' });
  if (!prompt) return res.status(400).json({ error: 'prompt가 없습니다.' });

  const phaseLbl = phase || 'main';
  console.log(`[v17 ${phaseLbl}] 요청 크기: pdfB64=${Math.round(pdfB64.length/1024)}KB`);

  const trimText = (pdfText||'').length > 20000
    ? pdfText.slice(0, 20000) + '\n...(생략)'
    : (pdfText||'');

  try {
    const result = await callAI({
      geminiKey, anthropicKey, openaiKey,
      pdfB64, prompt, pdfText: trimText,
      maxTokens: 8000,  // 60초 안에 응답 보장
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

    console.log(`[${phaseLbl}] 완료 — keys: ${Object.keys(result).slice(0,10).join(',')}`);

    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(result) }]
    });
  } catch(e) {
    console.error(`[${phaseLbl}] 실패:`, e.message);
    return res.status(500).json({ error: `${phaseLbl} 오류: ${e.message}` });
  }
}

async function callAI({ geminiKey, anthropicKey, openaiKey, pdfB64, prompt, pdfText, maxTokens, systemMsg }) {

  // ── Gemini 2.5 Flash 1순위 (PDF 직접 처리, 빠름)
  if (geminiKey) {
    try {
      console.log('Gemini 2.5 Flash 호출 시작...');
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: pdfB64 } },
                { text: `${systemMsg}\n\n${prompt}` }
              ]
            }],
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
        console.log('Gemini 성공');
        return parseJSON(text);
      }
      console.warn('Gemini 실패:', d.error?.message || JSON.stringify(d).slice(0,200));
      if (!anthropicKey && !openaiKey) throw new Error(d.error?.message || 'Gemini 호출 실패');
    } catch(e) {
      console.warn('Gemini 예외:', e.message);
      if (!anthropicKey && !openaiKey) throw e;
    }
  }

  // ── Claude 2순위
  if (anthropicKey) {
    try {
      console.log('Claude 호출 시작...');
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
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });
      const d = await r.json();
      if (r.ok) {
        const text = d.content?.find(b=>b.type==='text')?.text || '{}';
        console.log('Claude 성공');
        return parseJSON(text);
      }
      console.warn('Claude 실패:', d.error?.message);
      if (!openaiKey) throw new Error(d.error?.message || 'Claude 호출 실패');
    } catch(e) {
      console.warn('Claude 예외:', e.message);
      if (!openaiKey) throw e;
    }
  }

  // ── GPT-4o 폴백
  if (openaiKey) {
    if (!pdfText || pdfText.length < 200) {
      throw new Error('PDF 텍스트 추출 실패 — GPT는 PDF 직접 못 받습니다.');
    }
    console.log('GPT-4o 호출 시작...');
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
    console.log('GPT 성공');
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
