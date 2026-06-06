# SYMPLE — 랜딩 페이지

데이터 기반 멘탈헬스테크 기업 **SYMPLE**의 랜딩 페이지 리디자인.
[symple.kr](https://symple.kr)의 콘텐츠·에셋을 기반으로, **보더리스 · 섀도우리스 플랫 모던** 디자인으로 새로 구성했습니다.

## 구성

탭으로 전환되는 3개의 제품/회사 뷰:

- **KKEBI** — 음성 기반 멘탈케어 (accent: coral)
- **오리의 꿈 (Duck's Dream)** — 게임형 멘탈케어 앱 (accent: sage)
- **팀 소개** — 회사·근거·채용 (accent: brand green `#00BF7F`)

각 뷰는 선택된 제품에 따라 accent 컬러가 바뀝니다.

## 디자인 원칙

- **보더리스 / 섀도우리스** — 테두리·그림자 대신 면(fill)·색·여백으로 위계를 만듭니다.
- 브랜드 그린 `#00BF7F` + 제품별 accent.
- Wanted Sans (본문) + Instrument Serif (수치·디스플레이 강조).
- 스크롤 리빌, 카운트업, 탭 쇼케이스, 캐릭터 영상(webm), 데모 영상.

## 스택

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 (CSS-first `@theme`)
- motion (framer-motion) · lucide-react

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드
```

## 에셋

`public/` 의 이미지·영상·로고는 symple.kr 에서 가져온 원본입니다
(`/images/*`, `/characters/*.webm`, `/solution.mp4`, `/symple-logo.svg`, `/favicon.png`).
콘텐츠 문구는 [`components/content.ts`](components/content.ts) 한 곳에서 관리합니다.
