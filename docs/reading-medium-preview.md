# JLPT N1 단문·중문 독해

기존 단문12 section을 보존하고 중문12지문·24문항·각4선지·주석16개를 추가했다. 원본 사진 390–413쪽과 대조해 전사하고 한국어 해석·후리가나·어휘·동사·문형·독해 포인트를 작성했다.

## 공개 게시 확인

2026-11-02 사용자가 교재 원문·문제·선지·번역 등을 공개 GitHub 저장소와 GitHub Pages에 게시할 수 있는 권리자 허가 또는 이용 조건에 대해 ‘공개 게시 허용을 확인했음’이라고 답변하고 배포를 요청했다. 그 확인을 근거로 중문 데이터를 배포에 포함한다. 원본 사진과 로컬 캡처는 배포하지 않는다.

## 구조

- data/reading/medium/01.json–12.json: 원문·문장별 해석·문제·선지·주석·학습 해설·잠정 답안.
- data/reading/medium/instruction.json: 공통 문제 지시문.
- public/reading/data/medium.js: 후리가나와 함께 생성한 배포 데이터.
- public/reading/collections.js: 유형 전환·지문 링크·렌더링.
- tools/build-reading-preview.cjs: 배포 데이터와 로컬 검수 화면 생성.
- tools/test-reading.cjs: 단문 회귀·데이터·학습 기능·모바일 크기 검사.

기존 Pages workflow의 Next 정적 내보내기로 public/reading이 /jpvoca/reading/에 배포된다. 생성 데이터도 저장소에 포함하여 CI에서 형태소 사전을 설치할 필요가 없다. 브라우저 런타임 의존성을 추가하지 않았다.

## 답안과 원문 검수

공식 정답표가 제공되지 않았으므로 24문항 모두 ‘잠정 추론 답안’이다. UI에도 표시하고 초기에는 숨긴다. 문항6(선지1/3), 문항14(선지2/4), 문항17(선지1/2)은 유사 선택지가 있어 공식 정답표로 재확인이 필요하다. 제목·해석·학습 해설은 교재 공식 해설과 구분하여 새로 작성했다.

사진에서 판독 불가로 남긴 글자는 없다. 원문 줄바꿈과 괄호 폭은 웹 표시로 정리했고 주석과 밑줄을 보존했다. p407 ‘固定観念から放される’, p408 ‘業務に熟知した担当者’, p411 ‘問題に踏まえ’ 등의 표기는 임의 교정하지 않았다. 건강·의료 관련 내용은 독해 자료의 번역이다.

## 생성·검사

PowerShell에서 npm install --prefix .tools/reading-qa kuromoji playwright --no-audit --no-fund 후 node tools/build-reading-preview.cjs를 실행한다. python -m http.server 8765 --bind 127.0.0.1 --directory .private-preview로 로컬 서버를 열고 별도 터미널에서 node tools/test-reading.cjs를 실행한다. 설치된 Chrome headless 모드를 사용한다.

READING_TEST_URL 환경변수로 검사 대상 독해 경로를 지정할 수 있다. GITHUB_PAGES=true에서 npm run build:pages로 Pages 산출물을 생성한다. .tools/, .private-source/, .private-preview/는 Git 제외 대상이다.

검사 범위: 기존 단문12 section 비교, 중문12/24문항/96선지/16주석과 참조, 전사 대비 렌더링 일치, 유형·지문 직접 링크, 후리가나·해석 토글, 다크모드, 글자 크기와 설정 유지, 답안 개별·전체 펼치기/숨기기, 자료 누락 안내 및 단문 유지, 320–1280px 및 140% 글자에서 가로 넘침. 물리적 휴대폰 Safari/터치 검사는 포함하지 않는다.
