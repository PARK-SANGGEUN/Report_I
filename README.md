# 리포트아이 (Report-I)

> 학생부 PDF → Claude AI가 성적·활동·역량·대학별 진단 → 종합 리포트

## 기능
- 학생부 PDF 업로드 → Claude가 원문 직접 분석 (파싱 오류 없음)
- 합격생 빅데이터 기준 내장 (유니브클래스 2026)
- Why-How-So 5단계 역량 채점
- 15개 대학 학종 평가기준 내장 (서울대~경기대)
- 1~3순위 지원 대학별 개별 진단
- 성적 그래프 (등급 과목) + 성취도 별도 표 (A/B/C 과목)
- 종합 리포트 편지 (1000자+)

## Vercel 배포 방법

### 1. 환경변수 설정
Vercel 대시보드 → Settings → Environment Variables
```
VITE_ANTHROPIC_API_KEY=sk-ant-xxxxxxx
```

### 2. 배포
```bash
npm install
npm run build
```
또는 GitHub 연동 후 자동 배포

## 로컬 실행
```bash
npm install
npm run dev
```

## 기술 스택
- React 18 + Vite
- Chart.js (성적 그래프)
- Claude claude-sonnet-4-20250514 API (PDF 직접 분석)
- Vercel (배포)

## 분析 기준
- 2025학년도 합격생 생기부 빅데이터 (유니브클래스 2026)
- 5개교 공동연구 학종 공통 평가요소 (건국대·경희대·연세대·중앙대·한국외대)
- 서울대·연세대·고려대·서강대·동국대·서울과기대·숭실대·국민대·광운대·경기대 공식 가이드북
