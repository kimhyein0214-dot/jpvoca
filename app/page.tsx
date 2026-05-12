"use client";

import { useEffect, useMemo, useState } from "react";

type DetailFilter = "all" | "missing_reading" | "missing_meaning";
type MemoryMode =
  | "word_only"
  | "word_reading"
  | "word_meaning"
  | "show_all"
  | "hide_all";

type Kanji = {
  id: number;
  character: string;
  korean_name: string | null;
  word_count: number;
};

type Word = {
  id: number;
  word: string;
  reading_hiragana: string | null;
  meaning_ko: string | null;
  level: string | null;
  source_sheet: string | null;
  kanji: {
    id: number;
    character: string;
    korean_name: string | null;
    position: number;
  }[];
};

type VocabResponse = {
  kanji: Kanji[];
  words: Word[];
  selectedKanji: Kanji | null;
  totalWords: number;
  totalShown: number;
  limit: number;
  offset: number;
  detailFilter?: DetailFilter;
};

const PAGE_SIZE = 100;
const GROUP_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_WORD_VISIBLE = true;

const initialData: VocabResponse = {
  kanji: [],
  words: [],
  selectedKanji: null,
  totalWords: 0,
  totalShown: 0,
  limit: PAGE_SIZE,
  offset: 0,
};

const filterOptions: { label: string; value: DetailFilter }[] = [
  { label: "전체", value: "all" },
  { label: "읽기 미등록", value: "missing_reading" },
  { label: "뜻 미등록", value: "missing_meaning" },
];

const memoryModeOptions: { label: string; value: MemoryMode }[] = [
  { label: "단어만", value: "word_only" },
  { label: "단어+히라가나", value: "word_reading" },
  { label: "단어+뜻", value: "word_meaning" },
  { label: "전체 보기", value: "show_all" },
  { label: "전체 숨기기", value: "hide_all" },
];

function shuffleWords(words: Word[]) {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export default function Home() {
  const [data, setData] = useState<VocabResponse>(initialData);
  const [search, setSearch] = useState("");
  const [kanjiSearch, setKanjiSearch] = useState("");
  const [selectedKanji, setSelectedKanji] = useState("");
  const [detailFilter, setDetailFilter] = useState<DetailFilter>("all");
  const [offset, setOffset] = useState(0);
  const [groupSize, setGroupSize] = useState(PAGE_SIZE);
  const [shuffleSeed, setShuffleSeed] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memoryMode, setMemoryMode] = useState<MemoryMode>("word_only");
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());
  const [completedWords, setCompletedWords] = useState<Set<number>>(new Set());
  const [hideCompleted, setHideCompleted] = useState(false);
  const [kanjiPopup, setKanjiPopup] = useState<Word["kanji"][number] | null>(null);

  useEffect(() => {
    setOffset(0);
    setData(initialData);
    setRevealedCells(new Set());
  }, [search, selectedKanji, detailFilter, groupSize, shuffleSeed]);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    const requestTimeout = window.setTimeout(() => {
      controller.abort();
    }, 12000);
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("limit", String(groupSize));
      params.set("offset", String(offset));
      params.set("detail", detailFilter);
      if (shuffleSeed) params.set("shuffleSeed", shuffleSeed);
      if (search.trim()) params.set("search", search.trim());
      if (selectedKanji) params.set("kanji", selectedKanji);

      try {
        const response = await fetch(`/api/vocab?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const apiMessage =
            payload?.detail || payload?.error || `API 오류 (${response.status})`;
          throw new Error(apiMessage);
        }

        if (!ignore) {
          setData(payload);
        }
      } catch (err) {
        if (ignore) return;

        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "API 응답 시간이 초과되었습니다. 개발 서버를 재시작하거나 DB 연결을 확인해 주세요."
            : err instanceof Error
              ? err.message
              : "알 수 없는 오류가 발생했습니다.";

        setError(message);
      } finally {
        if (!ignore) setLoading(false);
        window.clearTimeout(requestTimeout);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      window.clearTimeout(requestTimeout);
      ignore = true;
      controller.abort();
    };
  }, [search, selectedKanji, detailFilter, groupSize, shuffleSeed, offset]);

  const selectedLabel = useMemo(() => {
    if (!data.selectedKanji) return "전체 한자";
    return `${data.selectedKanji.character} ${data.selectedKanji.korean_name ?? "이름 미등록"}`;
  }, [data.selectedKanji]);

  const filterLabel =
    filterOptions.find((option) => option.value === detailFilter)?.label ?? "전체";
  const memoryModeLabel =
    memoryModeOptions.find((option) => option.value === memoryMode)?.label ?? "단어만";

  const filteredKanji = useMemo(() => {
    const keyword = kanjiSearch.trim();
    if (!keyword) return data.kanji;

    return data.kanji.filter((item) => {
      const name = item.korean_name ?? "";
      return item.character.includes(keyword) || name.includes(keyword);
    });
  }, [data.kanji, kanjiSearch]);

  const visibleWords = useMemo(() => {
    if (!hideCompleted) return data.words;
    return data.words.filter((word) => !completedWords.has(word.id));
  }, [completedWords, data.words, hideCompleted]);

  const kanjiProgress = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of data.words) {
      if (!completedWords.has(word.id)) continue;
      for (const kanji of word.kanji) {
        counts.set(kanji.character, (counts.get(kanji.character) ?? 0) + 1);
      }
    }
    return counts;
  }, [completedWords, data.words]);

  const completedShownCount = data.words.filter((word) =>
    completedWords.has(word.id),
  ).length;
  const hasPreviousGroup = offset > 0;
  const hasNextGroup = offset + data.words.length < data.totalWords;
  const groupIndex = Math.floor(offset / groupSize) + 1;
  const totalGroups = Math.max(1, Math.ceil(data.totalWords / groupSize));
  const groupStart = data.totalWords === 0 ? 0 : offset + 1;
  const groupEnd = Math.min(offset + data.words.length, data.totalWords);
  const countLabel =
    loading && data.words.length === 0
      ? "조회 중"
      : `${groupStart.toLocaleString()}-${groupEnd.toLocaleString()} / ${data.totalWords.toLocaleString()}개`;
  const visibleCountLabel = hideCompleted
    ? `${visibleWords.length.toLocaleString()}개 학습 중`
    : countLabel;

  function resetView() {
    setSearch("");
    setKanjiSearch("");
    setSelectedKanji("");
    setDetailFilter("all");
    setOffset(0);
    setGroupSize(PAGE_SIZE);
    setShuffleSeed("");
    setRevealedCells(new Set());
    setMemoryMode("word_only");
    setHideCompleted(false);
    setKanjiPopup(null);
  }

  function moveGroup(direction: "previous" | "next") {
    setKanjiPopup(null);
    setRevealedCells(new Set());
    setOffset((current) => {
      const next = direction === "next" ? current + groupSize : current - groupSize;
      return Math.max(0, Math.min(next, Math.max(0, data.totalWords - 1)));
    });
  }

  function shuffleAllGroups() {
    setShuffleSeed(String(Date.now()));
    setOffset(0);
    setKanjiPopup(null);
  }

  function shuffleCurrentGroup() {
    setData((current) => ({
      ...current,
      words: shuffleWords(current.words),
    }));
    setKanjiPopup(null);
  }

  function selectKanjiFromPopup() {
    if (!kanjiPopup) return;
    setSelectedKanji(kanjiPopup.character);
    setKanjiPopup(null);
  }

  function applyMemoryMode(mode: MemoryMode) {
    const next = new Set<string>();

    for (const word of data.words) {
      if (!DEFAULT_WORD_VISIBLE || mode === "hide_all") {
        if (mode !== "hide_all") next.add(`${word.id}:word`);
      }
      if (mode === "word_reading" || mode === "show_all") {
        next.add(`${word.id}:reading`);
      }
      if (mode === "word_meaning" || mode === "show_all") {
        next.add(`${word.id}:meaning`);
      }
    }

    setMemoryMode(mode);
    setRevealedCells(next);
  }

  function toggleCell(wordId: number, field: "word" | "reading" | "meaning") {
    const key = `${wordId}:${field}`;
    setRevealedCells((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function isVisible(wordId: number, field: "word" | "reading" | "meaning") {
    if (field === "word" && DEFAULT_WORD_VISIBLE) return true;
    return revealedCells.has(`${wordId}:${field}`);
  }

  function toggleComplete(wordId: number) {
    setCompletedWords((current) => {
      const next = new Set(current);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  }

  function speakJapanese(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="shell">
      <section className="appHeader">
        <div className="titleBlock">
          <p className="eyebrow">Neon PostgreSQL / JLPT N1</p>
          <h1>한자 기반 일본어 단어장</h1>
          <p className="subtitle">JLPT N1 / 한자별 단어 학습</p>
        </div>

        <label className="searchBox primarySearch">
          <span>통합 검색</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="단어, 한자, 히라가나, 한국어 뜻"
          />
        </label>
      </section>

      <section className="controlPanel" aria-label="학습 컨트롤">
        <div className="controlGroup">
          <span className="groupLabel">필터</span>
          <div className="segmentedControl">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                className={detailFilter === option.value ? "active" : ""}
                type="button"
                onClick={() => setDetailFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="controlGroup memoryGroup">
          <span className="groupLabel">암기 모드</span>
          <div className="segmentedControl wide">
            {memoryModeOptions.map((option) => (
              <button
                key={option.value}
                className={memoryMode === option.value ? "active" : ""}
                type="button"
                onClick={() => applyMemoryMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="controlGroup toolsGroup">
          <span className="groupLabel">보조 기능</span>
          <div className="toolRow">
            <button
              className="toolButton secondary"
              type="button"
              onClick={shuffleAllGroups}
            >
              전체 셔플
            </button>
            <button
              className="toolButton secondary"
              type="button"
              onClick={shuffleCurrentGroup}
            >
              현재 조 셔플
            </button>
            <button className="toolButton secondary" type="button" onClick={resetView}>
              초기화
            </button>
            <button
              className={`toolButton secondary ${hideCompleted ? "active" : ""}`}
              type="button"
              onClick={() => setHideCompleted((current) => !current)}
            >
              완료 숨기기
            </button>
          </div>
        </div>
      </section>

      <section className="batchPanel" aria-label="조별 학습 설정">
        <div className="batchControl">
          <span className="groupLabel">조별 보기</span>
          <div className="batchSizeRow">
            {GROUP_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                className={groupSize === size ? "active" : ""}
                type="button"
                onClick={() => setGroupSize(size)}
              >
                {size}개
              </button>
            ))}
            <label>
              직접
              <input
                min={10}
                max={200}
                step={10}
                type="number"
                value={groupSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) {
                    setGroupSize(Math.max(10, Math.min(200, next)));
                  }
                }}
              />
            </label>
          </div>
        </div>
        <div className="batchPager">
          <button
            className="toolButton secondary"
            disabled={!hasPreviousGroup || loading}
            type="button"
            onClick={() => moveGroup("previous")}
          >
            이전 조
          </button>
          <strong>
            {groupIndex.toLocaleString()} / {totalGroups.toLocaleString()}조
          </strong>
          <button
            className="toolButton secondary"
            disabled={!hasNextGroup || loading}
            type="button"
            onClick={() => moveGroup("next")}
          >
            다음 조
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="kanjiPanel" aria-label="한자 리스트">
          <div className="panelHeader compact">
            <div>
              <p className="eyebrow">Kanji</p>
              <h2>한자 리스트</h2>
            </div>
            <button
              className={!selectedKanji ? "ghostButton active" : "ghostButton"}
              type="button"
              onClick={() => setSelectedKanji("")}
            >
              전체 단어
            </button>
          </div>

          <div className="sidebarTools">
            <label className="kanjiSearchBox">
              <span>한자 검색</span>
              <input
                value={kanjiSearch}
                onChange={(event) => setKanjiSearch(event.target.value)}
                placeholder="一 또는 한 일"
              />
            </label>

            <div className="selectedKanjiCard">
              <span>선택 한자</span>
              {data.selectedKanji ? (
                <strong>
                  {data.selectedKanji.character} /{" "}
                  {data.selectedKanji.korean_name ?? "이름 미등록"} /{" "}
                  {data.selectedKanji.word_count.toLocaleString()}개
                </strong>
              ) : (
                <strong>없음 / 전체 단어 보기</strong>
              )}
            </div>
          </div>

          <div className="kanjiList">
            {filteredKanji.map((item) => {
              const completedCount = kanjiProgress.get(item.character) ?? 0;
              const percent =
                item.word_count > 0
                  ? Math.min(100, Math.round((completedCount / item.word_count) * 100))
                  : 0;

              return (
                <button
                  key={item.id}
                  className={`kanjiItem ${selectedKanji === item.character ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedKanji(item.character)}
                  title={item.korean_name ?? "이름 미등록"}
                >
                  <span className="kanjiChar">{item.character}</span>
                  <span className="kanjiMeta">
                    <strong>{item.korean_name ?? "이름 미등록"}</strong>
                    <small>
                      {completedCount}/{item.word_count}개 완료 · {percent}%
                    </small>
                    <span className="kanjiProgressTrack">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="wordPanel studyPanel" aria-live="polite">
          <div className="panelHeader wordHeader">
            <div>
              <p className="eyebrow">Words</p>
              <h2>{selectedLabel}</h2>
            </div>
            <div className="countBadge">{visibleCountLabel}</div>
          </div>

          <div className="stateBar" aria-label="현재 학습 상태">
            <span className="stateChip strong">{selectedLabel}</span>
            <span className="stateChip">{countLabel}</span>
            <span className="stateChip">
              조: {groupIndex.toLocaleString()} / {totalGroups.toLocaleString()}
            </span>
            <span className="stateChip">암기 모드: {memoryModeLabel}</span>
            <span className="stateChip">필터: {filterLabel}</span>
            <span className="stateChip">
              셔플: {shuffleSeed ? "전체 셔플" : "기본 순서"}
            </span>
            <span className="stateChip">
              완료: {completedShownCount.toLocaleString()}개
              {hideCompleted ? " 숨김" : ""}
            </span>
          </div>

          {error ? <div className="notice error">{error}</div> : null}
          {!error && !loading && data.words.length === 0 ? (
            <div className="notice">검색 결과가 없습니다.</div>
          ) : null}
          {!error && !loading && data.words.length > 0 && visibleWords.length === 0 ? (
            <div className="notice">완료 숨기기 상태에서 표시할 단어가 없습니다.</div>
          ) : null}

          <div className="studyTableWrap">
            <table className="studyTable">
              <thead>
                <tr>
                  <th className="completeCol">완료</th>
                  <th className="wordCol">단어</th>
                  <th>읽기</th>
                  <th>뜻</th>
                  <th>한자</th>
                  <th className="audioCol">오디오</th>
                </tr>
              </thead>
              <tbody>
                {visibleWords.map((word) => {
                  const isDone = completedWords.has(word.id);
                  const readingVisible = isVisible(word.id, "reading");
                  const meaningVisible = isVisible(word.id, "meaning");
                  const wordVisible = isVisible(word.id, "word");
                  const reading = word.reading_hiragana ?? "읽기 미등록";
                  const meaning = word.meaning_ko ?? "뜻 미등록";

                  return (
                    <tr className={isDone ? "completed" : ""} key={word.id}>
                      <td className="completeCol">
                        <input
                          aria-label={`${word.word} 완료`}
                          checked={isDone}
                          onChange={() => toggleComplete(word.id)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <button
                          className="memoryCell wordCell"
                          type="button"
                          onClick={() => toggleCell(word.id, "word")}
                        >
                          {wordVisible ? (
                            word.word
                          ) : (
                            <span className="hiddenPrompt">단어 보기</span>
                          )}
                        </button>
                      </td>
                      <td>
                        <button
                          className="memoryCell readingCell"
                          type="button"
                          onClick={() => toggleCell(word.id, "reading")}
                        >
                          {readingVisible ? (
                            reading
                          ) : (
                            <span className="hiddenPrompt">읽기 보기</span>
                          )}
                        </button>
                      </td>
                      <td>
                        <button
                          className="memoryCell meaningCell"
                          type="button"
                          onClick={() => toggleCell(word.id, "meaning")}
                        >
                          {meaningVisible ? (
                            meaning
                          ) : (
                            <span className="hiddenPrompt">뜻 보기</span>
                          )}
                        </button>
                      </td>
                      <td>
                        <div className="inlineKanji">
                          {word.kanji.map((kanji, index) => (
                            <span key={`${word.id}-${kanji.id}-${kanji.position}`}>
                              {index > 0 ? <span className="slash">/</span> : null}
                              <button
                                className={
                                  selectedKanji === kanji.character ? "active" : ""
                                }
                                type="button"
                                onClick={() => setKanjiPopup(kanji)}
                                title={`${kanji.korean_name ?? "이름 미등록"} 보기`}
                              >
                                {kanji.character}
                              </button>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="audioCol">
                        <button
                          className="audioButton"
                          type="button"
                          onClick={() => speakJapanese(word.reading_hiragana ?? word.word)}
                          title="일본어 발음 듣기"
                          aria-label={`${word.word} 발음 듣기`}
                        >
                          ▶
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="tableFooter">
            <span>
              {countLabel} · {groupSize}개씩 조별 보기
            </span>
            <div className="footerPager">
              <button
                className="toolButton secondary"
                type="button"
                onClick={() => moveGroup("previous")}
                disabled={loading || !hasPreviousGroup}
              >
                이전 조
              </button>
              <button
                className="loadMoreButton"
                type="button"
                onClick={() => moveGroup("next")}
                disabled={loading || !hasNextGroup}
              >
                다음 조
              </button>
            </div>
          </div>
        </section>
      </section>

      {kanjiPopup ? (
        <div className="kanjiPopup" role="dialog" aria-label="한자 정보">
          <button className="kanjiPopupMain" type="button" onClick={selectKanjiFromPopup}>
            <span className="kanjiPopupChar">{kanjiPopup.character}</span>
            <span>
              <strong>{kanjiPopup.korean_name ?? "이름 미등록"}</strong>
              <small>한 번 더 누르면 이 한자가 포함된 단어로 이동합니다.</small>
            </span>
          </button>
          <button className="kanjiPopupClose" type="button" onClick={() => setKanjiPopup(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </main>
  );
}
