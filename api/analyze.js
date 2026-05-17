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

  /* ── Claude 우선 ── */
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
          // ⚡ Sonnet 4.6 (최신, 같은 가격, 더 똑똑함, 1M 컨텍스트)
          model: 'claude-sonnet-4-5',
          // ⚡ 16000으로 늘림 (응답 잘림 방지)
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

  /* ── GPT-4o 폴백 ── */
  if (openaiKey) {
    try {
      console.log('GPT-4o 호출 시작...');
      const trimText = (pdfText||'').length > 38000
        ? pdfText.slice(0, 38000) + '\n...(이하 생략)'
        : (pdfText||'');

      // ⚡ 텍스트 추출 실패해도 GPT한테 prompt만이라도 보내기 (이미지 PDF 대응)
      // 단, GPT는 PDF base64 직접 못 받으니 텍스트 없으면 안내만
      if (!trimText || trimText.length < 200) {
        return res.status(400).json({
          error: 'PDF 텍스트 추출 실패 — 스캔본이거나 보안 설정된 PDF입니다. 한글파일(.hwp)을 PDF로 다시 출력하거나, NEIS에서 텍스트 추출 가능한 형식으로 받아주세요.'
        });
      }

      const fullPrompt = `=== 학생부 원문 (PDF 추출) ===\n${trimText}\n\n=== 분析 지시 ===\n${prompt}`;

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 16000,
          temperature: 0.2,
          messages: [
            { role: 'system', content: '당신은 대한민국 최상위 입학사정관이자 생기부 전문컨설턴트입니다. 제공된 학생부 원문을 빠짐없이 분析하세요. JSON만 반환. 마크다운 금지.' },
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

      // ⚡ 변경: 로컬파서 덮어쓰기 제거 (GPT가 추출한 게 더 정확함)
      // 보조 필드만 채우기 (학교명, 평균등급)
      if (localParsed) {
        try {
          let json = JSON.parse(text);
          // GPT가 비워둔 경우에만 보강
          if (!json.gradeAvg || json.gradeAvg === '0' || json.gradeAvg === '') {
            if (localParsed.gradeAvg) json.gradeAvg = localParsed.gradeAvg;
          }
          if (!json.schoolName && localParsed.studentInfo?.school) {
            json.schoolName = localParsed.studentInfo.school;
          }
          // ⚠️ grades, achievementSubjects는 더 이상 덮어쓰지 않음
          //    GPT가 PDF 원문 보고 직접 추출한 게 정확하므로
          text = JSON.stringify(json);
        } catch(e) { console.warn('JSON 보강 실패:', e.message); }
      }

      console.log('GPT 성공');
      return res.status(200).json({ content: [{ type: 'text', text }] });
    } catch(e) {
      console.error('GPT 예외:', e.message);
      return res.status(500).json({ error: `GPT 예외: ${e.message}` });
    }
  }
}
