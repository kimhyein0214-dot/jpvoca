"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DetailFilter = "all" | "missing_reading" | "missing_meaning";
type KeyboardScope = "words" | "kanji";
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

type StaticVocabData = {
  generated_at?: string;
  kanji: Kanji[];
  words: Word[];
};

const PAGE_SIZE = 100;
const GROUP_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_WORD_VISIBLE = true;
const STORAGE_KEY = "jp-vocab-study-state-v1";

type StoredStudyState = {
  completedWordIds?: number[];
  hideCompleted?: boolean;
  groupSize?: number;
  memoryMode?: MemoryMode;
  detailFilter?: DetailFilter;
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

const shortcutHelp = [
  { key: "/", label: "검색" },
  { key: "Tab", label: "단어/한자 전환" },
  { key: "↑/↓", label: "선택 이동" },
  { key: "J/K", label: "단어 이동" },
  { key: "R", label: "읽기 보기" },
  { key: "M", label: "뜻 보기" },
  { key: "Enter", label: "완료/한자 선택" },
  { key: "←/→", label: "이전/다음 조" },
  { key: "1-5", label: "암기 모드" },
  { key: "S", label: "현재 조 셔플" },
  { key: "A", label: "전체 셔플" },
  { key: "H", label: "완료 숨기기" },
  { key: "Esc", label: "닫기" },
];

const staticDataPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/vocab-static.json`;

function shuffleWords(words: Word[]) {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function seededHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function matchesSearch(word: Word, keyword: string) {
  if (!keyword) return true;
  const target = keyword.toLocaleLowerCase("ko-KR");
  const fields = [
    word.word,
    word.reading_hiragana ?? "",
    word.meaning_ko ?? "",
    ...word.kanji.flatMap((kanji) => [
      kanji.character,
      kanji.korean_name ?? "",
    ]),
  ];

  return fields.some((field) => field.toLocaleLowerCase("ko-KR").includes(target));
}

function matchesDetailFilter(word: Word, detailFilter: DetailFilter) {
  if (detailFilter === "missing_reading") return !word.reading_hiragana;
  if (detailFilter === "missing_meaning") return !word.meaning_ko;
  return true;
}

function matchesKanji(word: Word, selectedKanji: string) {
  if (!selectedKanji) return true;
  return word.kanji.some((kanji) => kanji.character === selectedKanji);
}

export default function Home() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [staticData, setStaticData] = useState<StaticVocabData>({
    kanji: [],
    words: [],
  });
  const [search, setSearch] = useState("");
  const [kanjiSearch, setKanjiSearch] = useState("");
  const [selectedKanji, setSelectedKanji] = useState("");
  const [detailFilter, setDetailFilter] = useState<DetailFilter>("all");
  const [offset, setOffset] = useState(0);
  const [groupSize, setGroupSize] = useState(PAGE_SIZE);
  const [shuffleSeed, setShuffleSeed] = useState("");
  const [currentGroupOrder, setCurrentGroupOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memoryMode, setMemoryMode] = useState<MemoryMode>("word_only");
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());
  const [completedWords, setCompletedWords] = useState<Set<number>>(new Set());
  const [hideCompleted, setHideCompleted] = useState(false);
  const [kanjiPopup, setKanjiPopup] = useState<Word["kanji"][number] | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [activeWordId, setActiveWordId] = useState<number | null>(null);
  const [activeKanjiCharacter, setActiveKanjiCharacter] = useState<string | null>(null);
  const [keyboardScope, setKeyboardScope] = useState<KeyboardScope>("words");

  useEffect(() => {
    const controller = new AbortController();

    async function loadStaticData() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(staticDataPath, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`정적 단어장 JSON을 불러오지 못했습니다. (${response.status})`);
        }

        const payload = (await response.json()) as StaticVocabData;
        setStaticData({
          generated_at: payload.generated_at,
          kanji: payload.kanji ?? [],
          words: payload.words ?? [],
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }

    loadStaticData();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawState = window.localStorage.getItem(STORAGE_KEY);
      if (rawState) {
        const savedState = JSON.parse(rawState) as StoredStudyState;

        if (Array.isArray(savedState.completedWordIds)) {
          setCompletedWords(
            new Set(
              savedState.completedWordIds.filter((id) => Number.isInteger(id)),
            ),
          );
        }
        if (typeof savedState.hideCompleted === "boolean") {
          setHideCompleted(savedState.hideCompleted);
        }
        if (
          typeof savedState.groupSize === "number" &&
          Number.isFinite(savedState.groupSize)
        ) {
          setGroupSize(Math.max(10, Math.min(200, savedState.groupSize)));
        }
        if (
          savedState.memoryMode === "word_only" ||
          savedState.memoryMode === "word_reading" ||
          savedState.memoryMode === "word_meaning" ||
          savedState.memoryMode === "show_all" ||
          savedState.memoryMode === "hide_all"
        ) {
          setMemoryMode(savedState.memoryMode);
        }
        if (
          savedState.detailFilter === "all" ||
          savedState.detailFilter === "missing_reading" ||
          savedState.detailFilter === "missing_meaning"
        ) {
          setDetailFilter(savedState.detailFilter);
        }
      }
    } catch (err) {
      console.warn("학습 기록을 불러오지 못했습니다.", err);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady || typeof window === "undefined") return;

    const savedState: StoredStudyState = {
      completedWordIds: [...completedWords],
      hideCompleted,
      groupSize,
      memoryMode,
      detailFilter,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    } catch (err) {
      console.warn("학습 기록을 저장하지 못했습니다.", err);
    }
  }, [completedWords, detailFilter, groupSize, hideCompleted, memoryMode, storageReady]);

  useEffect(() => {
    setOffset(0);
    setRevealedCells(new Set());
    setCurrentGroupOrder([]);
  }, [search, selectedKanji, detailFilter, groupSize, shuffleSeed]);

  const filteredWords = useMemo(() => {
    const keyword = search.trim();
    let words = staticData.words.filter(
      (word) =>
        matchesSearch(word, keyword) &&
        matchesKanji(word, selectedKanji) &&
        matchesDetailFilter(word, detailFilter),
    );

    if (shuffleSeed) {
      words = [...words].sort((left, right) => {
        const leftHash = seededHash(`${left.id}:${shuffleSeed}`);
        const rightHash = seededHash(`${right.id}:${shuffleSeed}`);
        return leftHash - rightHash || left.word.localeCompare(right.word, "ja");
      });
    }

    return words;
  }, [detailFilter, search, selectedKanji, shuffleSeed, staticData.words]);

  const pageWordsRaw = useMemo(
    () => filteredWords.slice(offset, offset + groupSize),
    [filteredWords, groupSize, offset],
  );

  const pageWords = useMemo(() => {
    if (currentGroupOrder.length === 0) return pageWordsRaw;

    const wordById = new Map(pageWordsRaw.map((word) => [word.id, word]));
    const ordered = currentGroupOrder
      .map((id) => wordById.get(id))
      .filter((word): word is Word => Boolean(word));
    const orderedIds = new Set(ordered.map((word) => word.id));
    const missing = pageWordsRaw.filter((word) => !orderedIds.has(word.id));

    return [...ordered, ...missing];
  }, [currentGroupOrder, pageWordsRaw]);

  const selectedKanjiInfo = useMemo(() => {
    if (!selectedKanji) return null;
    return (
      staticData.kanji.find((kanji) => kanji.character === selectedKanji) ?? null
    );
  }, [selectedKanji, staticData.kanji]);

  const selectedLabel = selectedKanjiInfo
    ? `${selectedKanjiInfo.character} ${
        selectedKanjiInfo.korean_name ?? "이름 미등록"
      }`
    : "전체 한자";

  const filterLabel =
    filterOptions.find((option) => option.value === detailFilter)?.label ?? "전체";
  const memoryModeLabel =
    memoryModeOptions.find((option) => option.value === memoryMode)?.label ?? "단어만";

  const filteredKanji = useMemo(() => {
    const keyword = kanjiSearch.trim();
    if (!keyword) return staticData.kanji;

    return staticData.kanji.filter((item) => {
      const name = item.korean_name ?? "";
      return item.character.includes(keyword) || name.includes(keyword);
    });
  }, [kanjiSearch, staticData.kanji]);

  const visibleWords = useMemo(() => {
    if (!hideCompleted) return pageWords;
    return pageWords.filter((word) => !completedWords.has(word.id));
  }, [completedWords, hideCompleted, pageWords]);

  const kanjiProgress = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of staticData.words) {
      if (!completedWords.has(word.id)) continue;
      for (const kanji of word.kanji) {
        counts.set(kanji.character, (counts.get(kanji.character) ?? 0) + 1);
      }
    }
    return counts;
  }, [completedWords, staticData.words]);

  const completedShownCount = pageWords.filter((word) =>
    completedWords.has(word.id),
  ).length;
  const totalWords = filteredWords.length;
  const hasPreviousGroup = offset > 0;
  const hasNextGroup = offset + pageWords.length < totalWords;
  const groupIndex = Math.floor(offset / groupSize) + 1;
  const totalGroups = Math.max(1, Math.ceil(totalWords / groupSize));
  const groupStart = totalWords === 0 ? 0 : offset + 1;
  const groupEnd = Math.min(offset + pageWords.length, totalWords);
  const countLabel =
    loading && pageWords.length === 0
      ? "조회 중"
      : `${groupStart.toLocaleString()}-${groupEnd.toLocaleString()} / ${totalWords.toLocaleString()}개`;
  const visibleCountLabel = hideCompleted
    ? `${visibleWords.length.toLocaleString()}개 학습 중`
    : countLabel;

  useEffect(() => {
    if (visibleWords.length === 0) {
      setActiveWordId(null);
      return;
    }

    if (!activeWordId || !visibleWords.some((word) => word.id === activeWordId)) {
      setActiveWordId(visibleWords[0].id);
    }
  }, [activeWordId, visibleWords]);

  useEffect(() => {
    if (filteredKanji.length === 0) {
      setActiveKanjiCharacter(null);
      return;
    }

    if (
      selectedKanji &&
      filteredKanji.some((kanji) => kanji.character === selectedKanji)
    ) {
      setActiveKanjiCharacter(selectedKanji);
      return;
    }

    if (
      !activeKanjiCharacter ||
      !filteredKanji.some((kanji) => kanji.character === activeKanjiCharacter)
    ) {
      setActiveKanjiCharacter(filteredKanji[0].character);
    }
  }, [activeKanjiCharacter, filteredKanji, selectedKanji]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      );
    }

    function handleShortcut(event: KeyboardEvent) {
      const typing = isTypingTarget(event.target);

      function toggleActiveCell(field: "word" | "reading" | "meaning") {
        if (!activeWordId) return;
        const cellKey = `${activeWordId}:${field}`;
        setRevealedCells((current) => {
          const next = new Set(current);
          if (next.has(cellKey)) {
            next.delete(cellKey);
          } else {
            next.add(cellKey);
          }
          return next;
        });
      }

      function applyShortcutMemoryMode(mode: MemoryMode) {
        const next = new Set<string>();

        for (const word of pageWords) {
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

      if (typing) {
        if (event.key === "Escape") {
          (event.target as HTMLElement).blur();
          setKanjiPopup(null);
        }
        return;
      }

      const key = event.key.toLowerCase();

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        setKeyboardScope((current) => (current === "words" ? "kanji" : "words"));
        setKanjiPopup(null);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setKanjiPopup(null);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (keyboardScope === "kanji") {
          if (filteredKanji.length === 0) return;
          const currentIndex = Math.max(
            0,
            filteredKanji.findIndex(
              (kanji) => kanji.character === activeKanjiCharacter,
            ),
          );
          const nextIndex = Math.min(filteredKanji.length - 1, currentIndex + 1);
          setActiveKanjiCharacter(filteredKanji[nextIndex].character);
          return;
        }
        if (visibleWords.length === 0) return;
        const currentIndex = Math.max(
          0,
          visibleWords.findIndex((word) => word.id === activeWordId),
        );
        const nextIndex = Math.min(visibleWords.length - 1, currentIndex + 1);
        setActiveWordId(visibleWords[nextIndex].id);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (keyboardScope === "kanji") {
          if (filteredKanji.length === 0) return;
          const currentIndex = Math.max(
            0,
            filteredKanji.findIndex(
              (kanji) => kanji.character === activeKanjiCharacter,
            ),
          );
          const nextIndex = Math.max(0, currentIndex - 1);
          setActiveKanjiCharacter(filteredKanji[nextIndex].character);
          return;
        }
        if (visibleWords.length === 0) return;
        const currentIndex = Math.max(
          0,
          visibleWords.findIndex((word) => word.id === activeWordId),
        );
        const nextIndex = Math.max(0, currentIndex - 1);
        setActiveWordId(visibleWords[nextIndex].id);
        return;
      }

      if (key === "j") {
        event.preventDefault();
        setKeyboardScope("words");
        if (visibleWords.length === 0) return;
        const currentIndex = Math.max(
          0,
          visibleWords.findIndex((word) => word.id === activeWordId),
        );
        const nextIndex = Math.min(visibleWords.length - 1, currentIndex + 1);
        setActiveWordId(visibleWords[nextIndex].id);
        return;
      }

      if (key === "k") {
        event.preventDefault();
        setKeyboardScope("words");
        if (visibleWords.length === 0) return;
        const currentIndex = Math.max(
          0,
          visibleWords.findIndex((word) => word.id === activeWordId),
        );
        const nextIndex = Math.max(0, currentIndex - 1);
        setActiveWordId(visibleWords[nextIndex].id);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (hasNextGroup && !loading) {
          setKanjiPopup(null);
          setRevealedCells(new Set());
          setCurrentGroupOrder([]);
          setOffset((current) => {
            const next = current + groupSize;
            const maxOffset = Math.max(0, (totalGroups - 1) * groupSize);
            return Math.max(0, Math.min(next, maxOffset));
          });
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (hasPreviousGroup && !loading) {
          setKanjiPopup(null);
          setRevealedCells(new Set());
          setCurrentGroupOrder([]);
          setOffset((current) => {
            const next = current - groupSize;
            const maxOffset = Math.max(0, (totalGroups - 1) * groupSize);
            return Math.max(0, Math.min(next, maxOffset));
          });
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (keyboardScope === "kanji") {
          if (!activeKanjiCharacter) return;
          setSelectedKanji(activeKanjiCharacter);
          setKanjiPopup(null);
          return;
        }
        if (!activeWordId) return;
        setCompletedWords((current) => {
          const next = new Set(current);
          if (next.has(activeWordId)) {
            next.delete(activeWordId);
          } else {
            next.add(activeWordId);
          }
          return next;
        });
        return;
      }

      if (key === "r") {
        event.preventDefault();
        toggleActiveCell("reading");
        return;
      }

      if (key === "m") {
        event.preventDefault();
        toggleActiveCell("meaning");
        return;
      }

      if (key === "w") {
        event.preventDefault();
        toggleActiveCell("word");
        return;
      }

      if (key === "s") {
        event.preventDefault();
        setCurrentGroupOrder(shuffleWords(pageWords).map((word) => word.id));
        setKanjiPopup(null);
        return;
      }

      if (key === "a") {
        event.preventDefault();
        setShuffleSeed(String(Date.now()));
        setOffset(0);
        setKanjiPopup(null);
        return;
      }

      if (key === "h") {
        event.preventDefault();
        setHideCompleted((current) => !current);
        return;
      }

      if (key === "0") {
        event.preventDefault();
        setSearch("");
        setKanjiSearch("");
        setSelectedKanji("");
        setDetailFilter("all");
        setOffset(0);
        setGroupSize(PAGE_SIZE);
        setShuffleSeed("");
        setCurrentGroupOrder([]);
        setRevealedCells(new Set());
        setMemoryMode("word_only");
        setHideCompleted(false);
        setKanjiPopup(null);
        setKeyboardScope("words");
        return;
      }

      const memoryIndex = Number(event.key) - 1;
      if (memoryIndex >= 0 && memoryIndex < memoryModeOptions.length) {
        event.preventDefault();
        applyShortcutMemoryMode(memoryModeOptions[memoryIndex].value);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    activeWordId,
    activeKanjiCharacter,
    filteredKanji,
    groupSize,
    hasNextGroup,
    hasPreviousGroup,
    keyboardScope,
    loading,
    pageWords,
    totalGroups,
    visibleWords,
  ]);

  function resetView() {
    setSearch("");
    setKanjiSearch("");
    setSelectedKanji("");
    setDetailFilter("all");
    setOffset(0);
    setGroupSize(PAGE_SIZE);
    setShuffleSeed("");
    setCurrentGroupOrder([]);
    setRevealedCells(new Set());
    setMemoryMode("word_only");
    setHideCompleted(false);
    setKanjiPopup(null);
  }

  function moveGroup(direction: "previous" | "next") {
    setKanjiPopup(null);
    setRevealedCells(new Set());
    setCurrentGroupOrder([]);
    setOffset((current) => {
      const next = direction === "next" ? current + groupSize : current - groupSize;
      const maxOffset = Math.max(0, (totalGroups - 1) * groupSize);
      return Math.max(0, Math.min(next, maxOffset));
    });
  }

  function shuffleAllGroups() {
    setShuffleSeed(String(Date.now()));
    setOffset(0);
    setKanjiPopup(null);
  }

  function shuffleCurrentGroup() {
    setCurrentGroupOrder(shuffleWords(pageWords).map((word) => word.id));
    setKanjiPopup(null);
  }

  function selectKanjiFromPopup() {
    if (!kanjiPopup) return;
    setSelectedKanji(kanjiPopup.character);
    setKanjiPopup(null);
  }

  function applyMemoryMode(mode: MemoryMode) {
    const next = new Set<string>();

    for (const word of pageWords) {
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
          <p className="eyebrow">GitHub Pages / JLPT N1</p>
          <h1>한자 기반 일본어 단어장</h1>
          <p className="subtitle">정적 JSON / 한자별 단어 학습</p>
        </div>

        <label className="searchBox primarySearch">
          <span>통합 검색</span>
          <input
            ref={searchInputRef}
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
              {selectedKanjiInfo ? (
                <strong>
                  {selectedKanjiInfo.character} /{" "}
                  {selectedKanjiInfo.korean_name ?? "이름 미등록"} /{" "}
                  {selectedKanjiInfo.word_count.toLocaleString()}개
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
                  className={`kanjiItem ${
                    selectedKanji === item.character ? "active" : ""
                  } ${
                    activeKanjiCharacter === item.character ? "keyboardActive" : ""
                  }`}
                  type="button"
                  onClick={() => {
                    setActiveKanjiCharacter(item.character);
                    setKeyboardScope("kanji");
                    setSelectedKanji(item.character);
                  }}
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
            <span className={`stateChip ${keyboardScope === "kanji" ? "strong" : ""}`}>
              키보드: {keyboardScope === "kanji" ? "한자" : "단어"}
            </span>
          </div>

          {error ? <div className="notice error">{error}</div> : null}
          {!error && !loading && pageWords.length === 0 ? (
            <div className="notice">검색 결과가 없습니다.</div>
          ) : null}
          {!error && !loading && pageWords.length > 0 && visibleWords.length === 0 ? (
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
                  const isActive = activeWordId === word.id;

                  return (
                    <tr
                      className={`${isDone ? "completed" : ""} ${
                        isActive ? "activeRow" : ""
                      }`}
                      key={word.id}
                      onClick={() => {
                        setActiveWordId(word.id);
                        setKeyboardScope("words");
                      }}
                    >
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

          <div className="shortcutPanel" aria-label="데스크탑 단축키 안내">
            <div>
              <p className="eyebrow">Keyboard</p>
              <h3>데스크탑 단축키</h3>
            </div>
            <div className="shortcutGrid">
              {shortcutHelp.map((shortcut) => (
                <span className="shortcutItem" key={shortcut.key}>
                  <kbd>{shortcut.key}</kbd>
                  {shortcut.label}
                </span>
              ))}
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
