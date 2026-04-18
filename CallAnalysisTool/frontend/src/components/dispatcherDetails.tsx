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
import exportRecord, { PrintCallRecord, TranscriptData } from "./PrintRecord";
import {
  fetchDispatcherRecordDetails,
  fetchGradeFile,
  fetchNatureCodeGradeTemplate,
  fetchNatureCodeOptions,
  putBackendFile,
  regradeRecord,
} from "@/lib/api";
import ProgressModal from "./ProgressModal";

/* =========================
  Types
========================= */

interface DispatcherDetailsProps {
  dispatcher: Dispatcher;
  onDispatcherChange: React.Dispatch<React.SetStateAction<Dispatcher | null>>;
  initialRecordName?: string;
  startDate?: string;
  endDate?: string;
}

interface DispatcherPageEntry {
  dispatcherId: string;
  transcriptFilename: string;
  uploadOrder: number;
}

interface EditableQuestionGrade {
  code: string;
  label: string;
  status: string;
  reasoning?: string;
}

interface EditableGradeData {
  grade_percentage: number;
  detected_nature_code: string;
  nature_code_name?: string;
  grades: Record<string, EditableQuestionGrade>;
}

interface GradeSaveResponse {
  new_grade?: number;
  filename?: string;
  record_dir?: string;
  renamed_files?: Record<string, string>;
}

interface PersistedGradeResult {
  response: GradeSaveResponse;
  transcriptFilename: string;
}

type IdNameLike = {
  id?: unknown;
  name?: unknown;
};

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

const buildFallbackPages = (dispatcher: Dispatcher): DispatcherPageEntry[] => {
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
  "5": "Not Applicable",
  "6": "Obvious",
  RC: "Recorded Correctly",
};

const paginationButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer";

const printButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-sky-300 bg-sky-100 px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition-colors hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer";

const regradeButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-green-300 bg-green-100 px-4 py-2 text-sm font-medium text-green-800 shadow-sm transition-colors hover:bg-green-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer";

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

const formatElapsedTime = (ms: number | null) => {
  if (!ms || ms < 0) return "00:00";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

const cloneGradeData = (
  grade: EditableGradeData | null
): EditableGradeData | null => {
  if (!grade) {
    return null;
  }

  return {
    ...grade,
    grades: Object.fromEntries(
      Object.entries(grade.grades || {}).map(([key, question]) => [
        key,
        { ...question },
      ])
    ),
  };
};

const normalizeTextValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const maybeIdName = value as IdNameLike;
    if (typeof maybeIdName.id === "string") {
      return maybeIdName.id;
    }
    if (typeof maybeIdName.name === "string") {
      return maybeIdName.name;
    }
  }

  return "";
};

const normalizeGradeCode = (value: unknown): string => {
  const code = String(value ?? "").trim();
  return GRADE_KEY[code] ? code : "2";
};

const getDisplayStatus = (question: EditableQuestionGrade | undefined): string => {
  if (!question) {
    return "";
  }

  const normalizedStatus = normalizeTextValue(question.status);
  if (normalizedStatus) {
    return normalizedStatus;
  }

  return GRADE_KEY[normalizeGradeCode(question.code)] || "";
};


const getRecordNameFromOutputDestination = (outputDestination?: string): string => {
  if (!outputDestination) {
    return "";
  }

  const pathParts = outputDestination
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  return pathParts[pathParts.length - 1] || "";
};

/* =========================
   Component
========================= */

const DispatcherDetails = ({
  dispatcher,
  onDispatcherChange,
  initialRecordName,
  startDate,
  endDate,
}: DispatcherDetailsProps) => {
  /* -------- State -------- */
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingGrades, setIsEditingGrades] = useState(false);
  const [gradeData, setGradeData] = useState<EditableGradeData | null>(null);
  const [originalGradeData, setOriginalGradeData] = useState<EditableGradeData | null>(null);
  const [gradeSaveMessage, setGradeSaveMessage] = useState("");
  const [isGradeSaving, setIsGradeSaving] = useState(false);
  const [isNatureCodesLoading, setIsNatureCodesLoading] = useState(false);
  const [isNatureCodeTemplateLoading, setIsNatureCodeTemplateLoading] = useState(false);
  const [natureCodeOptions, setNatureCodeOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcriptSaveMessage, setTranscriptSaveMessage] = useState("");
  const [isTranscriptSaving, setIsTranscriptSaving] = useState(false);
  const [isRegrading, setIsRegrading] = useState(false);
  const [regradeProgress, setRegradeProgress] = useState(0);
  const [regradeStep, setRegradeStep] = useState("");
  const [regradeStartedAt, setRegradeStartedAt] = useState<number | null>(null);
  const [regradeElapsedNow, setRegradeElapsedNow] = useState<number>(Date.now());
  const playerControllerRef = useRef<PlayerControllerHandle | null>(null);

  useEffect(() => {
    if (!isRegrading) return;

    const intervalId = window.setInterval(() => {
      setRegradeElapsedNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRegrading]);

  /* -------- Derived Data -------- */
  const activePages = useMemo(
    () => buildFallbackPages(dispatcher),
    [dispatcher]
  );

  useEffect(() => {
    if (!activePages.length) return setCurrentIndex(0);

    if (!initialRecordName) {
      setCurrentIndex(0);
      return;
    }

    const idx = activePages.findIndex((page) => {
      const record = dispatcher.records?.find(
        (candidate) => candidate.transcriptFile === page.transcriptFilename
      );
      return record?.name === initialRecordName;
    });

    setCurrentIndex(idx >= 0 ? idx : 0);
  }, [activePages, dispatcher.records, initialRecordName]);

  const safeIndex = Math.min(currentIndex, activePages.length - 1);
  const currentPage = activePages[safeIndex];
  const activeDispatcher = dispatcher;
  const records = dispatcher.records || [];
  const transcripts = dispatcher.files?.transcriptFiles || [];
  const grades = dispatcher.grades || {};
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
  const detectedNatureCodeValue =
    normalizeTextValue(
      gradeData?.detected_nature_code ?? currentGrade?.detected_nature_code ?? ""
    );
  const hasDetectedNatureCodeOption = natureCodeOptions.some(
    (protocol) => protocol.id === detectedNatureCodeValue
  );
  const activeDispatcherName = normalizeTextValue(activeDispatcher.name) || activeDispatcher.id;

  const currentRecord = currentTranscript
    ? recordByTranscript.get(currentTranscript)
    : undefined;
  const matchedAudio = currentRecord?.audioFile;
  const regradeElapsedTime = formatElapsedTime(
    regradeStartedAt ? regradeElapsedNow - regradeStartedAt : null
  );

  const overallGrade = calculateOverallGrade(transcripts, grades);
  const formattedStartDate = formatDateRangePart(startDate);
  const formattedEndDate = formatDateRangePart(endDate);
  const headerTitle =
    formattedStartDate && formattedEndDate
      ? `${activeDispatcherName} (${formattedStartDate} - ${formattedEndDate})`
      : activeDispatcherName;
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

  const persistCurrentGrades = async (
    options?: {
      showMessage?: boolean;
      closeEditor?: boolean;
      refreshAfterSave?: boolean;
    }
  ): Promise<PersistedGradeResult> => {
    if (!currentTranscript || !currentGrade || !gradeData) {
      throw new Error("No current grade is available to save.");
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

    const response = await putBackendFile<GradeSaveResponse>(
      gradeFilename,
      replacementPayload
    );
    const renamedFiles = response.renamed_files || {};
    const nextTranscript = renamedFiles[currentTranscript] || currentTranscript;

    if (options?.showMessage ?? true) {
      setGradeSaveMessage("Grades saved.");
    }

    if (options?.closeEditor ?? true) {
      setIsEditingGrades(false);
    }

    if (options?.refreshAfterSave ?? true) {
      const refreshedRecordName =
        getRecordNameFromOutputDestination(response.record_dir) ||
        currentRecord?.name ||
        "";

      if (refreshedRecordName) {
        await refreshRecordState(
          refreshedRecordName,
          options?.showMessage ?? true ? "Grades saved." : undefined
        );
      }
    }

    return {
      response,
      transcriptFilename: nextTranscript,
    };
  };

  const refreshRecordState = async (
    recordName: string,
    successMessage?: string
  ) => {
    const refreshedRecord = await fetchDispatcherRecordDetails(
      activeDispatcher.id,
      recordName
    );

    if (!refreshedRecord.transcriptFile || !refreshedRecord.gradeFile) {
      throw new Error("Refreshed record is missing transcript or grade file.");
    }

    const refreshedTranscriptFile = refreshedRecord.transcriptFile;
    const refreshedGrade = await fetchGradeFile(refreshedRecord.gradeFile);
    const previousRecordName = currentRecord?.name;
    const previousTranscript = currentTranscript;
    const nextRecords = (dispatcher.records || []).map((record) => {
      if (
        record.name === previousRecordName ||
        record.transcriptFile === previousTranscript
      ) {
        return refreshedRecord;
      }

      return record;
    });

    const nextTranscriptFiles = nextRecords
      .map((record) => record.transcriptFile)
      .filter((file): file is string => Boolean(file));
    const nextAudioFiles = nextRecords
      .map((record) => record.audioFile)
      .filter((file): file is string => Boolean(file));
    const nextGrades = { ...(dispatcher.grades || {}) };

    if (previousTranscript && previousTranscript !== refreshedRecord.transcriptFile) {
      delete nextGrades[previousTranscript];
    }

    nextGrades[refreshedTranscriptFile] = refreshedGrade;

    onDispatcherChange({
      ...dispatcher,
      overallGrade: calculateOverallGrade(nextTranscriptFiles, nextGrades) ?? 0,
      records: nextRecords,
      files: {
        transcriptFiles: nextTranscriptFiles,
        audioFiles: nextAudioFiles,
      },
      grades: nextGrades,
    });

    if (successMessage) {
      setGradeSaveMessage(successMessage);
    }
  };

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
      setOriginalGradeData(cloneGradeData(gradeData));
      setIsEditingGrades(true);
      return;
    }

    if (!currentTranscript || !currentGrade || !gradeData) {
      return;
    }

    setIsGradeSaving(true);
    setGradeSaveMessage("");

    try {
      await persistCurrentGrades({
        showMessage: true,
        closeEditor: true,
      });
    } catch (error) {
      console.error("Error saving grades:", error);
      setGradeSaveMessage("Failed to save grades.");
    } finally {
      setIsGradeSaving(false);
    }
  };

  const handleRegrade = async () => {
    if (!currentTranscript || !currentRecord?.name || !gradeData) {
      setGradeSaveMessage("No record is available to regrade.");
      return;
    }

    setIsRegrading(true);
    setRegradeProgress(10);
    setRegradeStep("Saving transcript...");
    const startedAt = Date.now();
    setRegradeStartedAt(startedAt);
    setRegradeElapsedNow(startedAt);
    setGradeSaveMessage("");
    setTranscriptSaveMessage("");

    try {
      const transcriptPayload = playerControllerRef.current?.getTranscriptData();
      if (transcriptPayload) {
        await putBackendFile(currentTranscript, transcriptPayload);
      }

      setRegradeProgress(30);
      setRegradeStep("Saving grades...");
      const saveResult = await persistCurrentGrades({
        showMessage: false,
        closeEditor: true,
        refreshAfterSave: false,
      });

      const recordName =
        getRecordNameFromOutputDestination(saveResult.response.record_dir) ||
        currentRecord.name;

      setRegradeProgress(60);
      setRegradeStep("Regrading call...");
      const regradeResponse = await regradeRecord(activeDispatcher.id, recordName);

      setRegradeProgress(85);
      setRegradeStep("Refreshing record...");
      const refreshedRecordName =
        getRecordNameFromOutputDestination(regradeResponse.outputDestination) ||
        recordName;
      await refreshRecordState(refreshedRecordName);

      setRegradeProgress(100);
      setRegradeStep("Regrade complete.");
    } catch (error) {
      console.error("Error regrading record:", error);
      setGradeSaveMessage("Failed to regrade call.");
    } finally {
      window.setTimeout(() => {
        setIsRegrading(false);
        setRegradeProgress(0);
        setRegradeStep("");
        setRegradeStartedAt(null);
      }, 400);
    }
  };

  const handleCancelGradesEdit = () => {
    setGradeData(cloneGradeData(originalGradeData));
    setGradeSaveMessage("");
    setIsEditingGrades(false);
  };

  useEffect(() => {
    if (!currentGrade) {
      setGradeData(null);
      setOriginalGradeData(null);
      setIsEditingGrades(false);
      return;
    }

    const sourceQuestions = currentGrade.grades || currentGrade.per_question || {};
    const initialGradeData = {
      grade_percentage: currentGrade.grade_percentage,
      detected_nature_code: normalizeTextValue(currentGrade.detected_nature_code),
      nature_code_name: normalizeTextValue(currentGrade.nature_code_name),
      grades: Object.fromEntries(
        Object.entries(sourceQuestions).map(([key, question]) => {
          const typedQuestion = question as EditableQuestionGrade;
          return [key, { ...typedQuestion }];
        })
      ),
    } satisfies EditableGradeData;

    setGradeData(cloneGradeData(initialGradeData));
    setOriginalGradeData(cloneGradeData(initialGradeData));
  }, [currentGrade, currentTranscript]);

  useEffect(() => {
    setGradeSaveMessage("");
    setTranscriptSaveMessage("");
  }, [currentTranscript]);

  useEffect(() => {
    let isMounted = true;

    const loadNatureCodes = async () => {
      setIsNatureCodesLoading(true);

      try {
        const options = await fetchNatureCodeOptions();
        if (isMounted) {
          setNatureCodeOptions(options);
        }
      } catch (error) {
        console.error("Error loading nature codes:", error);
        if (isMounted) {
          setGradeSaveMessage("Failed to load nature codes.");
        }
      } finally {
        if (isMounted) {
          setIsNatureCodesLoading(false);
        }
      }
    };

    loadNatureCodes();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGradeChange = (field: string, value: string | number) => {
    setGradeData((previous) => {
      if (!previous) {
        return previous;
      }

      if (field === "grade_percentage") {
        const numericValue =
          typeof value === "number" ? value : Number(value);
        return {
          ...previous,
          grade_percentage: Number.isFinite(numericValue)
            ? numericValue
            : previous.grade_percentage,
        };
      }

      if (field === "detected_nature_code") {
        return { ...previous, detected_nature_code: String(value) };
      }

      if (field.startsWith("question_")) {
        const questionId = field.replace("question_", "");
        const nextGrades = { ...(previous.grades || {}) };
        const gradeCode = String(value);

        if (nextGrades[questionId]) {
          const normalizedCode = normalizeGradeCode(gradeCode);
          nextGrades[questionId] = {
            ...nextGrades[questionId],
            code: normalizedCode,
            status: GRADE_KEY[normalizedCode] || nextGrades[questionId].status,
          };
        }

        return { ...previous, grades: nextGrades };
      }

      return previous;
    });
  };

  const handleDetectedNatureCodeChange = async (natureCodeId: string) => {
    if (!gradeData) {
      return;
    }

    setGradeSaveMessage("");

    if (!natureCodeId) {
      setGradeData((previous) =>
        previous
          ? {
              ...previous,
              detected_nature_code: "",
              nature_code_name: "",
            }
          : previous
      );
      return;
    }

    if (
      gradeData.detected_nature_code === natureCodeId &&
      Object.keys(gradeData.grades || {}).length > 0
    ) {
      return;
    }

    setIsNatureCodeTemplateLoading(true);

    try {
      const template = await fetchNatureCodeGradeTemplate(natureCodeId);
      setGradeData((previous) =>
        previous
          ? {
              ...previous,
              detected_nature_code: template.detected_nature_code,
              nature_code_name: template.nature_code_name || "",
              grades: Object.fromEntries(
                Object.entries(template.grades || {}).map(([key, question]) => [
                  key,
                  { ...question },
                ])
              ),
            }
          : previous
      );
    } catch (error) {
      console.error("Error loading nature code template:", error);
      setGradeSaveMessage("Failed to load questions for that nature code.");
    } finally {
      setIsNatureCodeTemplateLoading(false);
    }
  };

  const handleQuestionLabelChange = (questionId: string, value: string) => {
    setGradeData((previous) => {
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
    setGradeData((previous) => {
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
            reasoning: "",
          },
        },
      };
    });
  };

  const handleDeleteQuestion = (questionId: string) => {
    setGradeData((previous) => {
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

  let transcriptData: TranscriptData | null = null;
  try {
    const { fetchBackendFile } = await import("@/lib/api");
    transcriptData = await fetchBackendFile<TranscriptData>(transcriptFilename);
  } catch {
    console.warn("Could not load transcript for print:", transcriptFilename);
  }

  return {
    transcriptFilename,
    gradeFilename: record?.gradeFile,
    audioFilename: record?.audioFile,
    dispatcherName: activeDispatcherName,
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
              <CardDescription>
                {/* dumb workaround */}
                {currentRecord?.gradeFile ||
                  (currentTranscript
                    ? currentTranscript.replace(/_transcript\.json$/i, "_grades.json")
                    : "")}
              </CardDescription>
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
                          void handleDetectedNatureCodeChange(e.target.value)
                        }
                        disabled={isNatureCodesLoading || isNatureCodeTemplateLoading}
                        className="w-full rounded-md border border-gray-300 px-3 py-2"
                      >
                        <option value="">Select a nature code</option>
                        {!hasDetectedNatureCodeOption && detectedNatureCodeValue && (
                          <option value={detectedNatureCodeValue}>
                            Current: {detectedNatureCodeValue}
                          </option>
                        )}
                        {natureCodeOptions.map((protocol) => (
                          <option key={protocol.id} value={protocol.id}>
                            {protocol.id}: {protocol.name}
                          </option>
                        ))}
                      </select>
                      {isNatureCodeTemplateLoading ? (
                        <p className="text-sm text-gray-500">
                          Loading question set...
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-1 min-h-0 max-h-[32rem] flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium">
                          Questions
                        </label>
                        <button
                          type="button"
                          onClick={handleAddQuestion}
                          disabled={isNatureCodeTemplateLoading}
                          className="rounded bg-blue-500 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-600"
                        >
                          Add Question
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
                        {Object.entries(gradeData?.grades || {}).map(
                          ([key, question]) => (
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
                                disabled={isNatureCodeTemplateLoading}
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
                                disabled={isNatureCodeTemplateLoading}
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
                                <option value="5">Not Applicable</option>
                                <option value="6">Obvious</option>
                                <option value="RC">Recorded Correctly</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(key)}
                                disabled={isNatureCodeTemplateLoading}
                                className="rounded bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleCancelGradesEdit}
                        disabled={isGradeSaving || isNatureCodeTemplateLoading}
                        className={paginationButtonClassName}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-blue-600">
                        Grade: {currentGrade.grade_percentage}%
                      </p>
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-gray-500">
                          Re-run AI grading using the current nature code and transcript
                        </p>
                        <button
                          type="button"
                          onClick={handleRegrade}
                          disabled={isRegrading || isGradeSaving || isTranscriptSaving}
                          className={regradeButtonClassName}
                        >
                          {isRegrading ? "Regrading..." : "Regrade"}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {Object.entries(questionGrades).map(
                        ([key, question]) => {
                          const typedQuestion = question as EditableQuestionGrade;
                          const displayStatus = getDisplayStatus(typedQuestion);
                          const reasoning = (typedQuestion.reasoning || "").trim();

                          return (
                            <details
                              key={key}
                              className="group"
                            >
                              <summary className="cursor-pointer list-none">
                                <div className="flex items-start justify-between gap-3 text-sm">
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span
                                      aria-hidden="true"
                                      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rotate-[-45deg] border-r-2 border-b-2 border-gray-400 transition-transform group-open:rotate-45"
                                    />
                                    <span>{typedQuestion.label}</span>
                                  </div>
                                  <span
                                    className={getQuestionStatusClassName(
                                      displayStatus
                                    )}
                                  >
                                    {displayStatus}
                                  </span>
                                </div>
                              </summary>
                              <div className="ml-5 mt-1 whitespace-pre-line text-sm text-gray-600">
                                {reasoning ? `Reasoning: ${reasoning}` : "No reasoning provided for this question."}
                              </div>
                            </details>
                          );
                        }
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
              <CardDescription>{currentTranscript}</CardDescription>
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
                  dispatcherName={activeDispatcherName}
                />
              </div>
            ) : (
              <p className="text-gray-500">No audio available</p>
            )}
          </CardContent>
        </Card>

      </div>
      <ProgressModal
        oneFile={true}
        isOpen={isRegrading}
        progress={regradeProgress}
        currentStep={regradeStep}
        elapsedTime={regradeElapsedTime}
      />
    </div>
  );
};

export default DispatcherDetails;
