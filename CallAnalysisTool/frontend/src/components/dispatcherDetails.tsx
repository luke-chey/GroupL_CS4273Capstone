"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { protocols } from "./ProtocolBook";
import { putBackendFile } from "@/lib/api";

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

const GRADE_KEY: Record<string, string> = {
  "1": "Asked Correctly",
  "2": "Not Asked",
  "3": "Asked Incorrectly",
  "4": "Not As Scripted",
  "5": "N/A",
  "6": "Obvious",
  RC: "Recorded Correctly",
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
  const [gradeOverrides, setGradeOverrides] = useState<Record<string, any>>({});
  const [overallGradeOverride, setOverallGradeOverride] = useState<number | null>(null);
  const [isEditingGrades, setIsEditingGrades] = useState(false);
  const [gradeData, setGradeData] = useState<any>(null);
  const [gradeSaveMessage, setGradeSaveMessage] = useState("");
  const [isGradeSaving, setIsGradeSaving] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcriptSaveMessage, setTranscriptSaveMessage] = useState("");
  const [isTranscriptSaving, setIsTranscriptSaving] = useState(false);
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

  const safeIndex = Math.min(currentIndex, activePages.length - 1);
  const currentPage = activePages[safeIndex];

  const activeDispatcher =
    dispatcherMap.get(currentPage?.dispatcherId || "") || dispatcher;

  const records = activeDispatcher.records || [];
  const transcripts = activeDispatcher.files?.transcriptFiles || [];
  const grades = activeDispatcher.grades || {};
  const effectiveGrades = {
    ...grades,
    ...gradeOverrides,
  };
  const recordByTranscript = new Map<string, DispatcherRecord>(
    records
      .filter((record): record is DispatcherRecord & { transcriptFile: string } =>
        Boolean(record.transcriptFile)
      )
      .map((record) => [record.transcriptFile, record])
  );

  const currentTranscript = currentPage?.transcriptFilename;
  const currentGrade = currentTranscript
    ? effectiveGrades[currentTranscript]
    : undefined;
  const questionGrades = currentGrade?.grades || currentGrade?.per_question || {};
  const detectedNatureCodeValue =
    gradeData?.detected_nature_code ?? currentGrade?.detected_nature_code ?? "";
  const natureCodeOptions = protocols.filter((protocol) => protocol.id !== "0");
  const hasDetectedNatureCodeOption = natureCodeOptions.some(
    (protocol) =>
      protocol.title === detectedNatureCodeValue ||
      protocol.id === detectedNatureCodeValue
  );

  const currentRecord = currentTranscript
    ? recordByTranscript.get(currentTranscript)
    : undefined;
  const matchedAudio = currentRecord?.audioFile;

  const computedOverallGrade = calculateOverallGrade(transcripts, effectiveGrades);
  const overallGrade = overallGradeOverride ?? computedOverallGrade;
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

  const handleGradesEditButtonClick = async () => {
    if (!isEditingGrades) {
      setGradeSaveMessage("");
      setIsEditingGrades(true);
      return;
    }

    if (!currentTranscript || !currentGrade || !gradeData) {
      return;
    }

    const gradeFilename =
      currentRecord?.gradeFile ||
      currentTranscript.replace(/_transcript\.json$/i, "_grades.json");
    const nextQuestions = gradeData.grades || questionGrades;
    const replacementPayload = {
      ...currentGrade,
      ...gradeData,
      grades: nextQuestions,
      ...(currentGrade?.per_question ? { per_question: nextQuestions } : {}),
    };

    setIsGradeSaving(true);
    setGradeSaveMessage("");

    try {
      const response = await putBackendFile<{ new_grade?: number }>(
        gradeFilename,
        replacementPayload
      );
      const savedGradePercentage =
        response.new_grade ?? replacementPayload.grade_percentage;
      const gradedFilesCount = transcripts.filter(
        (transcriptFilename) => effectiveGrades[transcriptFilename]
      ).length;
      const previousOverallGrade = overallGrade ?? 0;
      const previousCurrentGrade = Number(currentGrade.grade_percentage || 0);
      const nextOverallGrade =
        gradedFilesCount <= 1
          ? savedGradePercentage
          : (
              (previousOverallGrade * gradedFilesCount -
                previousCurrentGrade +
                savedGradePercentage) /
              gradedFilesCount
            );
      const savedPayload = {
        ...replacementPayload,
        grade_percentage: savedGradePercentage,
      };
      setGradeOverrides((previous) => ({
        ...previous,
        [currentTranscript]: savedPayload,
      }));

      const storedDispatchers = parseStoredDispatchers(
        localStorage.getItem("dispatchers")
      ).map((storedDispatcher) => {
        if (storedDispatcher.id !== activeDispatcher.id) {
          return storedDispatcher;
        }

        return {
          ...storedDispatcher,
          grades: {
            ...(storedDispatcher.grades || {}),
            [currentTranscript]: savedPayload,
          },
        };
      });

      localStorage.setItem("dispatchers", JSON.stringify(storedDispatchers));
      setDispatchers(storedDispatchers);
      setOverallGradeOverride(nextOverallGrade);
      setGradeData((previous: any) =>
        previous
          ? { ...previous, grade_percentage: savedGradePercentage }
          : previous
      );
      setGradeSaveMessage("Grades saved.");
      setIsEditingGrades(false);
    } catch (error) {
      console.error("Error saving grades:", error);
      setGradeSaveMessage("Failed to save grades.");
    } finally {
      setIsGradeSaving(false);
    }
  };

  useEffect(() => {
    if (!currentGrade) {
      setGradeData(null);
      setIsEditingGrades(false);
      return;
    }

    setGradeData({
      grade_percentage: currentGrade.grade_percentage,
      detected_nature_code: currentGrade.detected_nature_code || "",
      grades: Object.fromEntries(
        Object.entries(questionGrades).map(([key, question]: [string, any]) => [
          key,
          { ...question },
        ])
      ),
    });
  }, [currentGrade, currentTranscript]);

  useEffect(() => {
    setGradeSaveMessage("");
    setTranscriptSaveMessage("");
  }, [currentTranscript]);

  useEffect(() => {
    setOverallGradeOverride(null);
  }, [activeDispatcher.id]);

  const handleGradeChange = (field: string, value: string | number) => {
    setGradeData((previous: any) => {
      if (!previous) {
        return previous;
      }

      if (field === "grade_percentage") {
        return { ...previous, grade_percentage: value };
      }

      if (field === "detected_nature_code") {
        return { ...previous, detected_nature_code: value };
      }

      if (field.startsWith("question_")) {
        const questionId = field.replace("question_", "");
        const nextGrades = { ...(previous.grades || {}) };
        const gradeCode = String(value);

        if (nextGrades[questionId]) {
          nextGrades[questionId] = {
            ...nextGrades[questionId],
            code: gradeCode,
            status: GRADE_KEY[gradeCode] || nextGrades[questionId].status,
          };
        }

        return { ...previous, grades: nextGrades };
      }

      return previous;
    });
  };

  const handleQuestionLabelChange = (questionId: string, value: string) => {
    setGradeData((previous: any) => {
      if (!previous) {
        return previous;
      }

      const nextGrades = { ...(previous.grades || {}) };
      if (nextGrades[questionId]) {
        nextGrades[questionId] = {
          ...nextGrades[questionId],
          label: value,
        };
      }

      return { ...previous, grades: nextGrades };
    });
  };

  const handleAddQuestion = () => {
    setGradeData((previous: any) => {
      if (!previous) {
        return previous;
      }

      const questionId = `custom_${Date.now()}`;
      return {
        ...previous,
        grades: {
          ...(previous.grades || {}),
          [questionId]: {
            code: "2",
            label: "New Question",
            status: "Not Asked",
          },
        },
      };
    });
  };

  const handleDeleteQuestion = (questionId: string) => {
    setGradeData((previous: any) => {
      if (!previous) {
        return previous;
      }

      const nextGrades = { ...(previous.grades || {}) };
      delete nextGrades[questionId];
      return { ...previous, grades: nextGrades };
    });
  };


  const buildPrintRecord = async (transcriptFilename: string): Promise<PrintCallRecord | null> => {
  const grade = grades[transcriptFilename];
  if (!grade) return null;

  const fileParts = getFileParts(transcriptFilename);
  const qGrades = grade.grades || grade.per_question || {};
  const record = recordByTranscript.get(transcriptFilename);

  let transcriptData = null;
  try {
    const { fetchBackendFile } = await import("@/lib/api");
    transcriptData = await fetchBackendFile(transcriptFilename) as any;
  } catch (e) {
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
  const allTranscripts = transcripts.filter((t) => effectiveGrades[t]);
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={safeIndex === 0}
              className={paginationButtonClassName}
            >
              Previous Call
            </button>

            <span>
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
              disabled={safeIndex === activePages.length - 1}
              className={paginationButtonClassName}
            >
              Next Call
            </button>
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
        <Card className="flex h-full flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="min-w-0">
              <CardTitle>Question Grades</CardTitle>
              <div>Nature Code: {getFileParts(currentTranscript).nature}</div>
              <CardDescription>{currentTranscript}</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleGradesEditButtonClick}
                disabled={!currentGrade || isGradeSaving}
                className={paginationButtonClassName}
              >
                {isGradeSaving
                  ? "Saving..."
                  : isEditingGrades
                    ? "Save Edits"
                    : "Edit Grades"}
              </button>
              {gradeSaveMessage ? (
                <p
                  className={`text-sm ${
                    gradeSaveMessage.toLowerCase().includes("failed")
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {gradeSaveMessage}
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 min-h-0 flex-col">
            {currentGrade ? (
              <div className="flex flex-1 min-h-0 flex-col space-y-4">
                {isEditingGrades ? (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Detected Nature Code
                      </label>
                      <select
                        value={detectedNatureCodeValue}
                        onChange={(e) =>
                          handleGradeChange(
                            "detected_nature_code",
                            e.target.value
                          )
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2"
                      >
                        <option value="">Select a nature code</option>
                        {!hasDetectedNatureCodeOption && detectedNatureCodeValue && (
                          <option value={detectedNatureCodeValue}>
                            Current: {detectedNatureCodeValue}
                          </option>
                        )}
                        {natureCodeOptions.map((protocol) => (
                          <option key={protocol.id} value={protocol.title}>
                            {protocol.id}: {protocol.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-1 min-h-0 max-h-[32rem] flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium">
                          Questions
                        </label>
                        <button
                          type="button"
                          onClick={handleAddQuestion}
                          className="rounded bg-blue-500 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-600"
                        >
                          Add Question
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
                        {Object.entries(gradeData?.grades || {}).map(
                          ([key, question]: [string, any]) => (
                            <div
                              key={key}
                              className="flex items-center gap-2 rounded border border-gray-200 p-2"
                            >
                              <input
                                type="text"
                                value={question.label}
                                onChange={(e) =>
                                  handleQuestionLabelChange(
                                    key,
                                    e.target.value
                                  )
                                }
                                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                                placeholder="Question label"
                              />
                              <select
                                value={question.code || "2"}
                                onChange={(e) =>
                                  handleGradeChange(
                                    `question_${key}`,
                                    e.target.value
                                  )
                                }
                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                              >
                                <option value="1">
                                  Asked Correctly
                                </option>
                                <option value="2">Not Asked</option>
                                <option value="3">Asked Incorrectly</option>
                                <option value="4">
                                  Not as Scripted
                                </option>
                                <option value="5">N/A</option>
                                <option value="6">Obvious</option>
                                <option value="RC">Recorded Correctly</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(key)}
                                className="rounded bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-blue-600">
                      {currentGrade.grade_percentage}%
                    </p>

                    <div className="space-y-1">
                      {Object.entries(questionGrades).map(
                        ([key, question]: [string, any]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span>{question.label}</span>
                            <span className={getQuestionStatusClassName(question.status)}>
                              {question.status}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </>
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
        <Card className="flex h-full flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="min-w-0">
              <CardTitle>Audio and Transcript</CardTitle>
              <div>
                Timestamp: {`${getFileParts(matchedAudio).dateTime.toLocaleDateString()}, ${getFileParts(matchedAudio).dateTime.toLocaleTimeString()
                  }`}
              </div>
              <CardDescription>{matchedAudio}</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
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
              {transcriptSaveMessage ? (
                <p
                  className={`text-sm ${
                    transcriptSaveMessage.toLowerCase().includes("failed")
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {transcriptSaveMessage}
                </p>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 min-h-0 flex-col">

            {matchedAudio ? (
              <div className="flex flex-1 min-h-0 flex-col">
                <PlayerController
                  ref={playerControllerRef}
                  transcriptFile={currentTranscript}
                  audioFile={matchedAudio}
                  editable={isEditingTranscript}
                  dispatcherName={activeDispatcher.name}
                />
              </div>
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

