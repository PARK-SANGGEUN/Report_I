# 리포트아이 (Report-I) v22

생기부(학생부) 정밀 분석 웹앱

## 주요 기능
- PDF 생기부 자동 파싱 (학년/학기/표 구조 인식)
- 학기별 성적 추이 + 교과별 탭 그래프
- 강점·보완점 (원문 근거 3~4개)
- 활동 타임라인 (동기/과정/성장)
- 키워드 분석 (TOP 5 + 종합 해석)
- 5개 역량 채점 (각 역량 근거 4~5개)
- 학과 적합도 (Top 5+, 액션 플랜)
- 탐구 주제 + 추천도서 1371권 자동 매칭
- 종합 리포트 (3500자+ 12단락)
- 지역→대학→학과 드롭다운 (41개 대학)
- 가이드북 기반 합격 사례 6개 통합 분석

## 환경변수 (Vercel)
- `GEMINI_API_KEY` — Google AI Studio API 키 (필수)
- `ANTHROPIC_API_KEY` — Claude API 키 (선택, 폴백)
- `OPENAI_API_KEY` — GPT API 키 (선택, 폴백)

## AI 호출 순서
1. Gemini 2.5 Flash (무료 250 RPD)
2. Gemini 2.5 Flash-Lite (무료 1000 RPD, 폴백)
3. Claude Sonnet 4.5 (있을 때만)
4. GPT-4o (최후 폴백)

## 배포
- Vercel Pro 플랜 (maxDuration 300s)
- 자동 배포 (main 브랜치 push 시)
