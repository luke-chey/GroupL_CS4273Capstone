"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Search,
} from "lucide-react";
import { Dispatcher, DispatcherRecord, FileParts } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import PlayerController, { PlayerControllerHandle } from "./PlayerController/PlayerController";
import exportRecord, { PrintCallRecord } from "./PrintRecord";

/* =========================
  Types
========================= */

interface DispatcherDetailsProps {
  dispatcher: Dispatcher;
  batchMode?: boolean;
  startDate?: string;
  endDate?: string;
}

interface BatchPage {
  dispatcherId: string;
  transcriptFilename: string;
  uploadOrder: number;
}

interface StoredBatchData {
  pages?: BatchPage[];
}

interface CallListItem {
  index: number;
  dispatcherName: string;
  transcriptFilename: string;
  audioFilename?: string;
  gradePercentage?: number;
  detectedNatureCode?: string;
  nature: string;
  natureCodes: string[];
  formattedDateTime: string;
  searchText: string;
}

/* =========================
  Helpers
========================= */

const getFileParts = (filename: string | undefined): FileParts => {
  if (!filename) {
    return {
      name: "[name]",
      dateTime: new Date(2000, 0, 1, 0, 0, 0),
      nature: "[nature]",
      description: "[desc]",
      extension: "[ext]"
    } as FileParts;
  }

  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1) {
    throw new Error("Invalid filename: missing extension");
  }

  const namePart = filename.slice(0, lastDotIndex);
  const extension = filename.slice(lastDotIndex + 1);

  const parts = namePart.split("_");

  if (parts.length < 4) {
    throw new Error("Invalid filename: not enough parts");
  }

  const name = parts[0];
  const dateStr = parts[1];
  const timeStr = parts[2];
  const nature = parts[3];
  const description = parts.length > 4 ? parts.slice(4).join("_") : "";

  // Parse date (YYYYMMDD) and time (HHMMSS)
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6)) - 1; // JS months are 0-based
  const day = Number(dateStr.slice(6, 8));

  const hours = Number(timeStr.slice(0, 2));
  const minutes = Number(timeStr.slice(2, 4));
  const seconds = Number(timeStr.slice(4, 6));

  const dateTime = new Date(year, month, day, hours, minutes, seconds);

  return {
    name,
    dateTime,
    nature,
    description,
    extension
  } as FileParts;
}

const parseStoredDispatchers = (raw: string | null): Dispatcher[] => {
  try {
    return raw ? (JSON.parse(raw) as Dispatcher[]) : [];
  } catch {
    return [];
  }
};

const parseStoredBatchPages = (raw: string | null): BatchPage[] => {
  try {
    const parsed = raw ? (JSON.parse(raw) as StoredBatchData) : null;
    return Array.isArray(parsed?.pages) ? parsed.pages : [];
  } catch {
    return [];
  }
};

const buildFallbackPages = (dispatcher: Dispatcher): BatchPage[] => {
  const records = dispatcher.records || [];
  const grades = dispatcher.grades || {};

  return records
    .filter((record) => record.transcriptFile && grades[record.transcriptFile])
    .map((record, i) => ({
      dispatcherId: dispatcher.id,
      transcriptFilename: record.transcriptFile as string,
      uploadOrder: i,
    }));
};

const calculateOverallGrade = (
  files: string[],
  grades: Dispatcher["grades"]
): number | null => {
  const safeGrades = grades || {};
  const graded = files.filter((f) => safeGrades[f]);

  if (graded.length === 0) return null;

  const total = graded.reduce(
    (sum, f) => sum + safeGrades[f].grade_percentage,
    0
  );

  return total / graded.length;
};

const getQuestionStatusClassName = (status?: string): string => {
  switch ((status || "").trim().toLowerCase()) {
    // Grading Key:
    // 1 = Asked Correctly (100%)
    // 2 = Not Asked (0%)
    // 3 = Asked Incorrectly (0%)
    // 4 = Not As Scripted (50% - partial credit)
    // 5 = N/A (exclude from calculation)
    // 6 = Obvious (100% - full credit)
    // RC = Recorded Correctly (exclude from calculation)

    // Full credit
    case "asked correctly":
      return "text-green-600 font-semibold";
    case "obvious":
      return "text-blue-600 font-semibold";

    // No credit
    case "not asked":
    case "asked incorrectly":
      return "text-red-600 font-semibold";

    // Partial credit
    case "not as scripted":
      return "text-yellow-600 font-semibold";

    // Everything else exlcuded      
    default:
      return "text-gray-600 font-medium";
  }
};

const paginationButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer";

const printButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-sky-300 bg-sky-100 px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition-colors hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer";

const formatDateRangePart = (dateValue?: string): string | null => {
  if (!dateValue) {
    return null;
  }

  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) {
    return null;
  }

  return `${Number(month)}/${Number(day)}/${year}`;
};

const safeGetFileParts = (filename: string | undefined): FileParts | null => {
  if (!filename) {
    return null;
  }

  try {
    return getFileParts(filename);
  } catch {
    return null;
  }
};

const getNatureFromRecordName = (recordName?: string): string | null => {
  if (!recordName) {
    return null;
  }

  const parts = recordName.split("_");
  if (parts.length < 3) {
    return null;
  }

  return parts.slice(2).join("_");
};

const formatCallDateTime = (fileParts: FileParts | null): string => {
  if (!fileParts) {
    return "Unknown time";
  }

  return `${fileParts.dateTime.toLocaleDateString()}, ${fileParts.dateTime.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  )}`;
};

/* =========================
   Component
========================= */

const DispatcherDetails = ({
  dispatcher,
  batchMode = false,
  startDate,
  endDate,
}: DispatcherDetailsProps) => {
  /* -------- State -------- */
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcriptSaveMessage, setTranscriptSaveMessage] = useState("");
  const [isTranscriptSaving, setIsTranscriptSaving] = useState(false);
  const [isCallListOpen, setIsCallListOpen] = useState(false);
  const [callSearchQuery, setCallSearchQuery] = useState("");
  const [natureFilter, setNatureFilter] = useState("all");
  const playerControllerRef = useRef<PlayerControllerHandle | null>(null);
  


  /* -------- Load localStorage -------- */
  const loadLocalData = () => {
    setDispatchers(parseStoredDispatchers(localStorage.getItem("dispatchers")));
    setBatchPages(
      parseStoredBatchPages(localStorage.getItem("latestUploadBatch"))
    );
  };

  useEffect(() => {
    loadLocalData();
    const handler = () => loadLocalData();
    window.addEventListener("dispatchersUpdated", handler);
    return () => window.removeEventListener("dispatchersUpdated", handler);
  }, []);

  /* -------- Derived Data -------- */

  const dispatcherMap = useMemo(() => {
    const map = new Map(dispatchers.map((d) => [d.id, d]));
    map.set(dispatcher.id, dispatcher);
    return map;
  }, [dispatchers, dispatcher]);

  const pagesFromBatch = useMemo(
    () =>
      batchPages.filter((p) =>
        dispatcherMap.get(p.dispatcherId)?.grades?.[p.transcriptFilename]
      ),
    [batchPages, dispatcherMap]
  );

  const activePages = useMemo(() => {
    const inBatch =
      batchMode &&
      pagesFromBatch.some((p) => p.dispatcherId === dispatcher.id);

    return inBatch ? pagesFromBatch : buildFallbackPages(dispatcher);
  }, [batchMode, pagesFromBatch, dispatcher]);

  useEffect(() => {
    if (!activePages.length) return setCurrentIndex(0);

    const idx = activePages.findIndex(
      (p) => p.dispatcherId === dispatcher.id
    );

    setCurrentIndex(idx >= 0 ? idx : 0);
  }, [dispatcher.id, activePages]);

  const safeIndex =
    activePages.length > 0
      ? Math.min(currentIndex, activePages.length - 1)
      : 0;
  const currentPage = activePages[safeIndex];

  const activeDispatcher =
    dispatcherMap.get(currentPage?.dispatcherId || "") || dispatcher;

  const records = activeDispatcher.records || [];
  const transcripts = activeDispatcher.files?.transcriptFiles || [];
  const grades = activeDispatcher.grades || {};
  const recordByTranscript = new Map<string, DispatcherRecord>(
    records
      .filter((record): record is DispatcherRecord & { transcriptFile: string } =>
        Boolean(record.transcriptFile)
      )
      .map((record) => [record.transcriptFile, record])
  );

  const currentTranscript = currentPage?.transcriptFilename;
  const currentGrade = currentTranscript
    ? grades[currentTranscript]
    : undefined;
  const questionGrades = currentGrade?.grades || currentGrade?.per_question || {};

  const currentRecord = currentTranscript
    ? recordByTranscript.get(currentTranscript)
    : undefined;
  const matchedAudio = currentRecord?.audioFile;
  const currentFileParts = safeGetFileParts(currentTranscript);
  const matchedAudioFileParts = safeGetFileParts(matchedAudio);

  const callListItems = useMemo<CallListItem[]>(
    () =>
      activePages.map((page, index) => {
        const pageDispatcher = dispatcherMap.get(page.dispatcherId) || dispatcher;
        const pageRecords = pageDispatcher.records || [];
        const pageGrades = pageDispatcher.grades || {};
        const record = pageRecords.find(
          (dispatcherRecord) =>
            dispatcherRecord.transcriptFile === page.transcriptFilename
        );
        const grade = pageGrades[page.transcriptFilename];
        const transcriptParts = safeGetFileParts(page.transcriptFilename);
        const audioParts = safeGetFileParts(record?.audioFile);
        const natureCodes = Array.from(
          new Set(
            [
              transcriptParts?.nature,
              audioParts?.nature,
              grade?.detected_nature_code,
              getNatureFromRecordName(record?.name),
            ].filter((nature): nature is string => Boolean(nature))
          )
        );
        const nature = natureCodes[0] || "Unknown";
        const formattedDateTime = formatCallDateTime(transcriptParts || audioParts);
        const searchText = [
          pageDispatcher.name,
          page.transcriptFilename,
          record?.audioFile,
          record?.name,
          ...natureCodes,
          formattedDateTime,
          typeof grade?.grade_percentage === "number"
            ? `${grade.grade_percentage}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return {
          index,
          dispatcherName: pageDispatcher.name,
          transcriptFilename: page.transcriptFilename,
          audioFilename: record?.audioFile,
          gradePercentage: grade?.grade_percentage,
          detectedNatureCode: grade?.detected_nature_code,
          nature,
          natureCodes: natureCodes.length ? natureCodes : ["Unknown"],
          formattedDateTime,
          searchText,
        };
      }),
    [activePages, dispatcher, dispatcherMap]
  );

  const natureOptions = useMemo(
    () =>
      Array.from(new Set(callListItems.flatMap((item) => item.natureCodes)))
        .filter((nature) => nature !== "Unknown")
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [callListItems]
  );

  useEffect(() => {
    if (natureFilter !== "all" && !natureOptions.includes(natureFilter)) {
      setNatureFilter("all");
    }
  }, [natureFilter, natureOptions]);

  useEffect(() => {
    setCallSearchQuery("");
    setNatureFilter("all");
  }, [dispatcher.id, endDate, startDate]);

  const normalizedCallSearchQuery = callSearchQuery.trim().toLowerCase();
  const filteredCallListItems = callListItems.filter((item) => {
    const matchesNature =
      natureFilter === "all" || item.natureCodes.includes(natureFilter);
    const matchesSearch =
      !normalizedCallSearchQuery ||
      item.searchText.includes(normalizedCallSearchQuery);

    return matchesNature && matchesSearch;
  });

  const selectCall = (index: number) => {
    setCurrentIndex(index);
    setIsCallListOpen(false);
  };
  const canMovePrevious = activePages.length > 0 && safeIndex > 0;
  const canMoveNext =
    activePages.length > 0 && safeIndex < activePages.length - 1;

  const overallGrade = calculateOverallGrade(transcripts, grades);
  const formattedStartDate = formatDateRangePart(startDate);
  const formattedEndDate = formatDateRangePart(endDate);
  const headerTitle =
    formattedStartDate && formattedEndDate
      ? `${activeDispatcher.name} (${formattedStartDate} - ${formattedEndDate})`
      : activeDispatcher.name;
  const backQuery = new URLSearchParams();

  if (startDate) {
    backQuery.set("startDate", startDate);
  }

  if (endDate) {
    backQuery.set("endDate", endDate);
  }

  const backHref = backQuery.toString()
    ? `/records?${backQuery.toString()}`
    : "/records";

  const handleEditButtonClick = async () => {
    if (!isEditingTranscript) {
      setTranscriptSaveMessage("");
      setIsEditingTranscript(true);
      return;
    }

    setIsTranscriptSaving(true);
    setTranscriptSaveMessage("");

    try {
      const saved = await playerControllerRef.current?.saveTranscriptChanges();
      if (saved) {
        setTranscriptSaveMessage("Transcript saved.");
      } else {
        setTranscriptSaveMessage("Failed to save transcript.");
      }
    } catch (error) {
      console.error("Error saving transcript:", error);
      setTranscriptSaveMessage("Failed to save transcript.");
    } finally {
      setIsTranscriptSaving(false);
      setIsEditingTranscript(false);
    }
  };


  const buildPrintRecord = async (transcriptFilename: string): Promise<PrintCallRecord | null> => {
  const grade = grades[transcriptFilename];
  if (!grade) return null;

  const fileParts = getFileParts(transcriptFilename);
  const qGrades = grade.grades || grade.per_question || {};
  const record = recordByTranscript.get(transcriptFilename);

  let transcriptData: PrintCallRecord["transcriptData"] = null;
  try {
    const { fetchBackendFile } = await import("@/lib/api");
    transcriptData =
      await fetchBackendFile<NonNullable<PrintCallRecord["transcriptData"]>>(
        transcriptFilename
      );
  } catch {
    console.warn("Could not load transcript for print:", transcriptFilename);
  }

  return {
    transcriptFilename,
    gradeFilename: record?.gradeFile,
    audioFilename: record?.audioFile,
    dispatcherName: activeDispatcher.name,
    dateTime: fileParts.dateTime,
    nature: fileParts.nature,
    gradePercentage: grade.grade_percentage,
    detectedNatureCode: grade.detected_nature_code,
    questionGrades: qGrades,
    transcriptData,
  };
};

const handlePrintCurrent = async () => {
  if (!currentTranscript) return;
  const record = await buildPrintRecord(currentTranscript);
  if (record) exportRecord([record]);
};

const handlePrintAll = async () => {
  const allTranscripts = transcripts.filter((t) => grades[t]);
  const printRecords = (await Promise.all(allTranscripts.map(buildPrintRecord)))
    .filter((r): r is PrintCallRecord => r !== null);
  if (printRecords.length) exportRecord(printRecords);
};

  /* =========================
     UI
  ========================= */

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href={backHref} className="text-blue-500 hover:underline">
          ← Back to Dispatchers
        </Link>

        <h1 className="text-3xl font-bold mt-4">
          {headerTitle}
        </h1>

        {overallGrade !== null && (
          <p className="text-blue-600 font-semibold">
            Overall Grade: {overallGrade.toFixed(1)}%
          </p>
        )}

        <p className="text-gray-500">
          Dispatcher ID: {activeDispatcher.id}
        </p>

        <div className="mt-4 flex items-center justify-between gap-4 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={!canMovePrevious}
              className={paginationButtonClassName}
            >
              <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Previous Call
            </button>

            <span className="text-sm font-medium text-slate-700">
              {activePages.length === 0
                ? "0 / 0"
                : `${safeIndex + 1} / ${activePages.length}`}
            </span>

            <button
              onClick={() =>
                setCurrentIndex((i) =>
                  Math.min(i + 1, activePages.length - 1)
                )
              }
              disabled={!canMoveNext}
              className={paginationButtonClassName}
            >
              Next Call
              <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCallListOpen((open) => !open)}
                disabled={activePages.length === 0}
                className={paginationButtonClassName}
                aria-expanded={isCallListOpen}
                aria-controls="dispatcher-call-list"
              >
                <ListFilter className="mr-2 h-4 w-4" aria-hidden="true" />
                Calls
                <ChevronDown
                  className={`ml-2 h-4 w-4 transition-transform ${
                    isCallListOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {isCallListOpen && (
                <div
                  id="dispatcher-call-list"
                  className="absolute left-0 top-full z-20 mt-2 w-[min(88vw,32rem)] rounded-md border border-slate-200 bg-white shadow-lg"
                >
                  <div className="space-y-3 border-b border-slate-200 p-3">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={callSearchQuery}
                        onChange={(event) =>
                          setCallSearchQuery(event.target.value)
                        }
                        placeholder="Search calls..."
                        className="h-9 w-full rounded-md border border-slate-300 bg-white py-1 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="call-nature-filter"
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        Nature code
                      </label>
                      <select
                        id="call-nature-filter"
                        value={natureFilter}
                        onChange={(event) =>
                          setNatureFilter(event.target.value)
                        }
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="all">All nature codes</option>
                        {natureOptions.map((nature) => (
                          <option key={nature} value={nature}>
                            {nature}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2">
                    {filteredCallListItems.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-slate-500">
                        No calls match those filters.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filteredCallListItems.map((item) => {
                          const isSelected = item.index === safeIndex;

                          return (
                            <button
                              key={`${item.dispatcherName}-${item.transcriptFilename}-${item.index}`}
                              type="button"
                              onClick={() => selectCall(item.index)}
                              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                                isSelected
                                  ? "border-blue-500 bg-blue-50"
                                  : "border-transparent hover:bg-slate-50"
                              }`}
                              aria-current={isSelected ? "true" : undefined}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-900">
                                    {item.formattedDateTime}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {item.transcriptFilename}
                                  </p>
                                </div>
                                {typeof item.gradePercentage === "number" && (
                                  <span className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {item.gradePercentage.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                                  {item.nature}
                                </span>
                                {item.detectedNatureCode &&
                                  item.detectedNatureCode !== item.nature && (
                                    <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                                      {item.detectedNatureCode}
                                    </span>
                                  )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrintCurrent}
              disabled={!currentTranscript || !currentGrade}
              className={printButtonClassName}
            >
              Print This Call
            </button>
            {transcripts.filter((t) => grades[t]).length > 1 && (
              <button
                onClick={handlePrintAll}
                className={printButtonClassName}
              >
                Print All Calls
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Question Grades</CardTitle>
            Nature Code: {currentFileParts?.nature || currentGrade?.detected_nature_code || "Unknown"}
            <CardDescription>{currentTranscript}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentGrade ? (
              <div className="space-y-2">
                <p className="text-blue-600">
                  {currentGrade.grade_percentage}%
                </p>

                {Object.entries(questionGrades).map(
                  ([k, q]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span>{q.label}</span>
                      <span className={getQuestionStatusClassName(q.status)}>
                        {q.status}
                      </span>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-gray-500">
                No transcript/grade available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Audio */}
        <Card>
          <CardHeader>
            <CardTitle>Audio and Transcript</CardTitle>
            Timestamp: {formatCallDateTime(matchedAudioFileParts)}
            <CardDescription>{matchedAudio}</CardDescription>
          </CardHeader>

          <CardContent>              
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={handleEditButtonClick}
                disabled={!currentTranscript || isTranscriptSaving}
                className={paginationButtonClassName}
              >
                {isTranscriptSaving
                  ? "Saving..."
                  : isEditingTranscript
                    ? "Save Edits"
                    : "Edit Transcript"}
              </button>
            </div>

            {matchedAudio ? (
              <>
                <PlayerController
                  ref={playerControllerRef}
                  transcriptFile={currentTranscript}
                  audioFile={matchedAudio}
                  editable={isEditingTranscript}
                  dispatcherName={activeDispatcher.name}
                />
                {transcriptSaveMessage ? (
                  <p
                    className={`mt-3 text-sm ${
                      transcriptSaveMessage.toLowerCase().includes("failed")
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {transcriptSaveMessage}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-gray-500">No audio available</p>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default DispatcherDetails;
