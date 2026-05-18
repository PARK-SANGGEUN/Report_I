export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  const keyInfo = `Anthropic:${anthropicKey?'있음':'없음'}, OpenAI:${openaiKey?'있음':'없음'}`;
  console.log('API 키 상태:', keyInfo);

  if (!anthropicKey && !openaiKey) {
    return res.status(500).json({
      error: `API 키 없음 (${keyInfo}): Vercel 환경변수에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 추가하세요.`
    });
  }

  const { pdfB64, prompt, pdfText, parsed: localParsed } = req.body;

  if (!pdfB64) return res.status(400).json({ error: 'pdfB64가 없습니다.' });
  if (!prompt) return res.status(400).json({ error: 'prompt가 없습니다.' });

  console.log(`요청 크기: pdfB64=${Math.round(pdfB64.length/1024)}KB, pdfText=${Math.round((pdfText||'').length/1024)}KB`);

  /* ── Claude 우선 (키 있으면) ── */
  if (anthropicKey) {
    try {
      console.log('Claude API 호출 시작...');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 16000,
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
      if (r.ok) { console.log('Claude 성공'); return res.status(200).json(d); }
      console.warn('Claude 실패:', d.error?.type, d.error?.message);
      if (!openaiKey) return res.status(r.status).json({ error: `Claude 오류: ${d.error?.message}` });
    } catch(e) {
      console.warn('Claude 예외:', e.message);
      if (!openaiKey) return res.status(500).json({ error: `Claude 예외: ${e.message}` });
    }
  }

  /* ── GPT-4o 본 호출 ── */
  if (openaiKey) {
    try {
      console.log('GPT-4o 호출 시작...');
      // ⚡ 텍스트 15000자로 제한 → 입력 토큰 ~18K + 출력 12K = 30K (Tier 1 한도 안)
      const trimText = (pdfText||'').length > 15000
        ? pdfText.slice(0, 15000) + '\n...(이하 생략)'
        : (pdfText||'');

      if (!trimText || trimText.length < 200) {
        return res.status(400).json({
          error: 'PDF 텍스트 추출 실패 — 스캔본이거나 보안 설정된 PDF입니다. 한글파일(.hwp)을 PDF로 다시 출력하거나, NEIS에서 텍스트 추출 가능한 형식으로 받아주세요.'
        });
      }

      const fullPrompt = `=== 학생부 원문 (PDF 추출) ===\n${trimText}\n\n=== 분석 지시 ===\n${prompt}`;

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          // ⚡ 12000으로 늘림 (답변 잘림 방지) — 분량 강제 프롬프트와 짝
          max_tokens: 12000,
          temperature: 0.3,
          messages: [
            { 
              role: 'system', 
              content: '당신은 대한민국 최상위 입학사정관이자 생기부 전문컨설턴트입니다. ⚠️ 모든 필드를 빠짐없이 풍부하게 작성하세요. 빈 배열이나 짧은 답변은 절대 금지. 각 필드의 최소 분량 지시를 반드시 지키세요. JSON만 반환. 마크다운 금지.' 
            },
            { role: 'user', content: fullPrompt }
          ],
          response_format: { type: 'json_object' }
        })
      });
      const d = await r.json();
      if (!r.ok) {
        console.error('GPT 실패:', d.error?.message);
        return res.status(r.status).json({ error: `GPT 오류: ${d.error?.message}` });
      }

      let text = d.choices?.[0]?.message?.content || '{}';

      // 보조 필드만 비어있을 때 채움 (학교명, 평균등급)
      if (localParsed) {
        try {
          let json = JSON.parse(text);
          if (!json.gradeAvg || json.gradeAvg === '0' || json.gradeAvg === '') {
            if (localParsed.gradeAvg) json.gradeAvg = localParsed.gradeAvg;
          }
          if (!json.schoolName && localParsed.studentInfo?.school) {
            json.schoolName = localParsed.studentInfo.school;
          }
          // grades/activities가 너무 적으면 로컬 파서로 보강
          if ((!json.grades || json.grades.length < 4) && localParsed.grades?.length > 0) {
            json.grades = localParsed.grades;
          }
          if ((!json.achievementSubjects || json.achievementSubjects.length === 0) && localParsed.achievementSubjects?.length > 0) {
            json.achievementSubjects = localParsed.achievementSubjects;
          }
          text = JSON.stringify(json);
        } catch(e) { console.warn('JSON 보강 실패:', e.message); }
      }

      // 로그: 응답 분량 확인 (디버깅용)
      try {
        const j = JSON.parse(text);
        console.log(`응답 분량: grades=${j.grades?.length||0}, activities=${j.activities?.length||0}, reportLetter=${j.reportLetter?.length||0}자`);
      } catch(e){}

      console.log('GPT 성공');
      return res.status(200).json({ content: [{ type: 'text', text }] });
    } catch(e) {
      console.error('GPT 예외:', e.message);
      return res.status(500).json({ error: `GPT 예외: ${e.message}` });
    }
  }
}
