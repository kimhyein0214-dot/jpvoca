# N1 중문 독해 로컬 미리보기

작업 기준: `origin/main`의 `bd19f21` (2026-11-02 확인).

기존 `public/reading/index.html`의 단문 12개 section을 보존하고, `collections.js`로 유형 전환과 중문 렌더링을 추가했다. 중문은 지문별 데이터로 분리되어 있으며, 브라우저에서 사용하는 새 외부 의존성은 없다. 해석·학습 해설·독해 포인트·답안 근거는 추가 작성한 학습 자료이고, 교재의 공식 해설이 아니다.

## 공개 배포 상태

제공된 CODEX_PROMPT.md는 공개 사용 허용 범위가 확인되지 않으면 콘텐츠를 공개 배포하지 말고 로컬/비공개 미리보기까지 완성하도록 명시한다. 제공된 두 Markdown 파일과 이미지에서 해당 허용 근거는 확인되지 않았다. 따라서 중문 원문·번역·이미지·생성된 미리보기는 GitHub에 올리지 않았다. 공개 Pages 배포도 수행하지 않았다.

이는 배포 실패가 아닌 지시서의 배포 조건에 따른 보류이다. 향후 배포하려면 권리자가 허용한 웹 공개·번역·후리가나·해설 제공의 범위를 확인하고, 그 확인 내용을 바탕으로 공개할 데이터 경로와 빌드를 정해야 한다. 현재의 미리보기 폴더를 Pages 산출물로 그대로 업로드하지 않는다.

## 로컬 파일

- `.private-source/01.json` ~ `12.json`: 전사 원문, 문장별 한국어 해석, 문항·선지, 주석, 어휘·동사·문형·독해 포인트, 잠정 추론 답안.
- `.private-source/p390.jpg` ~ `p413.jpg`: Drive에서 실제로 다운로드한 원본 대조용 24장.
- `.private-source/QA.md`: 페이지별 검수 상태, 표기 유의점, 미확정 답안 목록.
- `.private-source/readings.tsv`: 후리가나 검토용 독음 목록.
- `.private-preview/jpvoca/reading/`: 생성된 로컬 독해 페이지. 단문 12 + 중문 12, 중문 24문항.

`.private-source/`, `.private-preview/`는 이 저장소의 Git exclude에 등록되어 있다. 데이터가 포함된 결과물은 `public/`에 생성하지 않는다. `public/reading`의 코드만으로는 중문 교재를 제공하지 않으며, 자료가 없으면 미리보기 전용 안내를 표시한다.

## 재생성 및 확인

PowerShell에서 이 저장소를 작업 디렉터리로 사용한다.

```powershell
npm install --prefix .tools/reading-qa kuromoji playwright --no-audit --no-fund
node tools/build-reading-preview.cjs
python -m http.server 8765 --bind 127.0.0.1 --directory .private-preview
```

다른 터미널에서 `node tools/test-reading.cjs`를 실행한다. 테스트는 설치된 Chrome의 headless 모드를 사용한다. `.tools/`는 기존 `.gitignore`의 제외 대상이다. 어휘 분석기는 미리보기 생성 시에만 사용하고, 사전이나 실행 코드를 웹페이지에 포함하지 않는다.

미리보기: `http://127.0.0.1:8765/jpvoca/reading/#medium`. 서버 없이 `.private-preview/jpvoca/reading/index.html`을 로컬 브라우저로 열어도 상대 경로의 스크립트로 중문 자료를 읽을 수 있다.

## 검증 범위

- 기존 단문 12개 section 문자열을 기준 커밋과 비교: 일치.
- 중문 12지문, 24문항, 각 4선지(96개), 원본 주석 16개.
- 렌더링 후 후리가나·주석 참조용 마크업을 제외한 본문/주석/문제/선지가 전사 데이터와 일치.
- 단문·중문 전환과 24개 지문 링크, 중문/문항 딥 링크.
- 후리가나·해석 ON/OFF, 다크모드, 글자 크기, 새로고침 후 설정 유지.
- 개별 답안, 현재 유형의 답안 전체 펼치기/숨기기, 초기 답안 숨김.
- 320/375/390/768/1280px, 글자 100% 및 140%에서 가로 넘침 없음.
- `/jpvoca/reading/` 경로의 상대 스크립트 로딩.
- Chrome 모바일 크기 캡처의 밝은/어두운 화면, 본문·문항 시각 검수.
- 중문 데이터가 없는 새 페이지에서 전용 안내 표시 및 단문12 학습 유지.

물리적 휴대폰의 Safari/터치 검사는 수행하지 않았다. 공개 배포를 보류했으므로 변경된 페이지의 실제 GitHub Pages 동작 검증이나 배포 커밋은 없다.
