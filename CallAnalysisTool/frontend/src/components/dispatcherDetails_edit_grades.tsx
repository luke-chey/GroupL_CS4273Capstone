"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Dispatcher, DispatcherRecord } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import PlayerController from "./PlayerController/PlayerController";
import { TranscriptPlayer } from "./TranscriptPlayer/TranscriptPlayer";
import { updateGradeFile } from "@/lib/api";

interface DispatcherDetailsProps {
  dispatcher: Dispatcher;
  batchMode?: boolean;
  transcriptData: any;
  setTranscriptData: React.Dispatch<React.SetStateAction<any>>;
  onEditSegment: (index: number, speaker: string, text: string) => void;
  onSaveTranscript: () => Promise<void>;
  savingTranscript: boolean;
  saveMessage: string;
  onTranscriptFileChange?: (filename: string | null) => void;
  onUpdateGrades?: (filename: string, gradeData: any) => void;
}

interface BatchPage {
  dispatcherId: string;
  transcriptFilename: string;
  uploadOrder: number;
}

interface StoredBatchData {
  pages?: BatchPage[];
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

const baseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");

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
    case "asked correctly":
      return "text-green-600 font-semibold";
    case "not asked":
    case "not as scripted":
      return "text-red-600 font-semibold";
    case "obvious":
      return "text-blue-600 font-semibold";
    case "unknown":
    case "n/a":
      return "text-yellow-600 font-semibold";
    default:
      return "text-gray-600 font-medium";
  }
};

const DispatcherDetails = ({
  dispatcher,
  batchMode = false,
  transcriptData,
  setTranscriptData,
  onEditSegment,
  onSaveTranscript,
  savingTranscript,
  saveMessage,
  onTranscriptFileChange,
  onUpdateGrades,
}: DispatcherDetailsProps) => {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioKey, setAudioKey] = useState(0);
  const [editingGrade, setEditingGrade] = useState(false);
  const [gradeData, setGradeData] = useState<any>(null);
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeSaveMessage, setGradeSaveMessage] = useState("");

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

  const dispatcherMap = useMemo(() => {
    const map = new Map<string, Dispatcher>();
    for (const d of dispatchers) {
      map.set(d.id, d);
    }
    map.set(dispatcher.id, dispatcher);
    return map;
  }, [dispatchers, dispatcher]);

  const pagesFromBatch = useMemo(
    () =>
      batchPages.filter((p) =>
        Boolean(dispatcherMap.get(p.dispatcherId)?.grades?.[p.transcriptFilename])
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
    if (!activePages.length) {
      setCurrentIndex(0);
      return;
    }

    const idx = activePages.findIndex((p) => p.dispatcherId === dispatcher.id);
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

  const currentTranscriptFile = currentPage?.transcriptFilename;
  const currentGrade = currentTranscriptFile
    ? grades[currentTranscriptFile]
    : undefined;

  const questionGrades =
    currentGrade?.grades || currentGrade?.per_question || {};

  const currentRecord = currentTranscriptFile
    ? recordByTranscript.get(currentTranscriptFile)
    : undefined;

  const matchedAudioFile = currentRecord?.audioFile;

  const overallGrade = calculateOverallGrade(transcripts, grades);

  useEffect(() => {
    onTranscriptFileChange?.(currentTranscriptFile ?? null);
  }, [currentTranscriptFile, onTranscriptFileChange]);

  useEffect(() => {
    const loadTranscript = async () => {
      if (!currentTranscriptFile) return;

      try {
        const key = baseName(currentTranscriptFile);
        const res = await fetch(
          `http://localhost:5001/api/transcriptions/${key}`
        );

        if (!res.ok) {
          throw new Error("Failed to load transcript");
        }

        const data = await res.json();
        setTranscriptData(data.data ?? data);
      } catch (err) {
        console.error("Error loading transcript:", err);
        setTranscriptData(null);
      }
    };

    loadTranscript();
  }, [currentTranscriptFile, setTranscriptData]);

  useEffect(() => {
    const loadGrade = async () => {
      if (!currentTranscriptFile) {
        setGradeData(null);
        return;
      }

      try {
        const gradeFileName = currentTranscriptFile.replace('transcript.json', 'grades.json');
        const res = await fetch(
          `http://localhost:5001/api/files/${gradeFileName}`
        );

        if (!res.ok) {
          throw new Error("Failed to load grade");
        }

        const data = await res.json();
        setGradeData(data);
      } catch (err) {
        console.error("Error loading grade:", err);
        // Initialize with current grade data if file doesn't exist
        if (currentGrade) {
          setGradeData({
            grade_percentage: currentGrade.grade_percentage,
            detected_nature_code: currentGrade.detected_nature_code,
            grades: currentGrade.grades || currentGrade.per_question || {},
          });
        } else {
          setGradeData(null);
        }
      }
    };

    loadGrade();
  }, [currentTranscriptFile, currentGrade]);

  const dispatcherNameFromFile = useMemo(() => {
    if (!currentTranscriptFile) {
      return activeDispatcher?.name || dispatcher.name;
    }

    const parts = baseName(currentTranscriptFile).split("_");
    return parts.length >= 3
      ? parts.slice(2).join("_")
      : activeDispatcher?.name || dispatcher.name;
  }, [currentTranscriptFile, activeDispatcher, dispatcher.name]);

  const handleSaveAndRegrade = useCallback(async () => {
    await onSaveTranscript();
    setAudioKey((k) => k + 1);
  }, [onSaveTranscript]);

  const handleSaveGrade = useCallback(async () => {
    if (!currentTranscriptFile || !gradeData) return;

    setSavingGrade(true);
    setGradeSaveMessage("");

    try {
      const gradeFileName = currentTranscriptFile.replace('transcript.json', 'grades.json');
      await updateGradeFile(gradeFileName, gradeData);
      setGradeSaveMessage("Grade saved successfully!");
      setEditingGrade(false);
      
      // Update the dispatcher grades in parent component
      if (onUpdateGrades) {
        onUpdateGrades(currentTranscriptFile, gradeData);
      }
      
      // Trigger a regrade by saving transcript (this will recalculate grades)
      await onSaveTranscript();
      setAudioKey((k) => k + 1);
    } catch (err) {
      console.error("Error saving grade:", err);
      setGradeSaveMessage("Failed to save grade");
    } finally {
      setSavingGrade(false);
    }
  }, [currentTranscriptFile, gradeData, onSaveTranscript, onUpdateGrades]);

  const handleGradeChange = useCallback((field: string, value: any) => {
    setGradeData((prev: any) => {
      if (!prev) return prev;
      
      if (field === 'grade_percentage') {
        return { ...prev, grade_percentage: value };
      } else if (field === 'detected_nature_code') {
        return { ...prev, detected_nature_code: value };
      } else if (field.startsWith('question_')) {
        const questionId = field.replace('question_', '');
        const grades = { ...(prev.grades || {}) };
        if (grades[questionId]) {
          grades[questionId] = { ...grades[questionId], status: value };
        }
        return { ...prev, grades };
      }
      
      return prev;
    });
  }, []);

  const handleAddQuestion = useCallback(() => {
    const newQuestionId = `custom_${Date.now()}`;
    setGradeData((prev: any) => {
      if (!prev) return prev;
      const grades = { ...(prev.grades || {}) };
      grades[newQuestionId] = {
        code: newQuestionId,
        label: "New Question",
        status: "Not Asked"
      };
      return { ...prev, grades };
    });
  }, []);

  const handleDeleteQuestion = useCallback((questionId: string) => {
    setGradeData((prev: any) => {
      if (!prev) return prev;
      const grades = { ...(prev.grades || {}) };
      delete grades[questionId];
      return { ...prev, grades };
    });
  }, []);

  const isBusy = savingTranscript;
  const statusMessage = saveMessage || "";
  const isError =
    statusMessage.toLowerCase().includes("fail") ||
    statusMessage.toLowerCase().includes("error");

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link href="/records" className="text-blue-500 hover:underline">
          ← Back to Records
        </Link>

        <h1 className="text-3xl font-bold mt-4">{activeDispatcher.name}</h1>

        {overallGrade !== null && (
          <p className="text-blue-600 font-semibold">
            Overall Grade: {overallGrade.toFixed(1)}%
          </p>
        )}

        <p className="text-gray-500">Dispatcher ID: {activeDispatcher.id}</p>

        {activePages.length > 1 && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={safeIndex === 0}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Previous
            </button>

            <span className="text-sm text-gray-600">
              {safeIndex + 1} / {activePages.length}
            </span>

            <button
              type="button"
              onClick={() =>
                setCurrentIndex((i) => Math.min(i + 1, activePages.length - 1))
              }
              disabled={safeIndex === activePages.length - 1}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Question Grades</CardTitle>
            <CardDescription>
              {editingGrade ? "Edit grades and question statuses" : "View auto-generated grades"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {currentGrade ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{currentTranscriptFile}</p>
                  <button
                    onClick={() => setEditingGrade(!editingGrade)}
                    className="px-3 py-1 rounded-md border border-gray-300 text-sm hover:bg-gray-100"
                  >
                    {editingGrade ? "Cancel Edit" : "Edit Grades"}
                  </button>
                </div>

                {editingGrade ? (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Overall Grade (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={gradeData?.grade_percentage || currentGrade.grade_percentage}
                        onChange={(e) => handleGradeChange('grade_percentage', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Detected Nature Code</label>
                      <input
                        type="text"
                        value={gradeData?.detected_nature_code || currentGrade.detected_nature_code || ''}
                        onChange={(e) => handleGradeChange('detected_nature_code', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium">Questions</label>
                        <button
                          onClick={handleAddQuestion}
                          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Add Question
                        </button>
                      </div>

                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {Object.entries(gradeData?.grades || questionGrades).map(([k, q]: [string, any]) => (
                          <div key={k} className="flex items-center gap-2 p-2 border border-gray-200 rounded">
                            <input
                              type="text"
                              value={q.label}
                              onChange={(e) => {
                                setGradeData((prev: any) => {
                                  if (!prev) return prev;
                                  const grades = { ...(prev.grades || {}) };
                                  if (grades[k]) {
                                    grades[k] = { ...grades[k], label: e.target.value };
                                  }
                                  return { ...prev, grades };
                                });
                              }}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                              placeholder="Question label"
                            />
                            <select
                              value={q.status}
                              onChange={(e) => handleGradeChange(`question_${k}`, e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-300 rounded"
                            >
                              <option value="Asked Correctly">Asked Correctly</option>
                              <option value="Not Asked">Not Asked</option>
                              <option value="Not as Scripted">Not as Scripted</option>
                              <option value="Obvious">Obvious</option>
                              <option value="Unknown">Unknown</option>
                              <option value="N/A">N/A</option>
                            </select>
                            <button
                              onClick={() => handleDeleteQuestion(k)}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleSaveGrade}
                        disabled={savingGrade}
                        className="rounded bg-green-600 px-5 py-2 text-white font-medium disabled:opacity-50 hover:bg-green-700 transition-colors"
                      >
                        {savingGrade ? "Saving..." : "Save Grades"}
                      </button>

                      {gradeSaveMessage && (
                        <p
                          className={`text-sm font-medium ${
                            gradeSaveMessage.includes("success") ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {gradeSaveMessage}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-blue-600">
                      {currentGrade.grade_percentage}%
                    </p>

                    {currentGrade.detected_nature_code && (
                      <p className="text-sm">
                        Detected Nature Code: {currentGrade.detected_nature_code}
                      </p>
                    )}

                    <div className="space-y-1">
                      {Object.entries(questionGrades).map(([k, q]: [string, any]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span>{q.label}</span>
                          <span className={getQuestionStatusClassName(q.status)}>
                            {q.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No transcript/grade available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audio and Transcript</CardTitle>
            <CardDescription>
              {matchedAudioFile
                ? "Synced to current graded file"
                : "No audio available"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {matchedAudioFile ? (
              <>
                <p className="font-medium mb-2">{matchedAudioFile}</p>
                <PlayerController
                  key={audioKey}
                  transcriptionId={baseName(matchedAudioFile)}
                />
              </>
            ) : (
              <p className="text-gray-500">No audio available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Transcript Editor</CardTitle>
            <CardDescription>
              Edit transcript text and speaker labels
            </CardDescription>
          </CardHeader>

          <CardContent>
            {currentTranscriptFile ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSaveAndRegrade}
                    disabled={isBusy || !transcriptData}
                    className="rounded bg-blue-600 px-5 py-2 text-white font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
                  >
                    {savingTranscript ? "Saving..." : "Save Transcript"}
                  </button>

                  {statusMessage && (
                    <p
                      className={`text-sm font-medium ${
                        isError ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {statusMessage}
                    </p>
                  )}
                </div>

                {transcriptData ? (
                  <div
                    className="border border-gray-200 rounded-xl overflow-hidden"
                    style={{ height: "500px" }}
                  >
                    <TranscriptPlayer
                      transcriptData={transcriptData}
                      currentTime={0}
                      onEditSegment={onEditSegment}
                      dispatcherName={dispatcherNameFromFile}
                    />
                  </div>
                ) : (
                  <p className="text-gray-500">Loading transcript...</p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No transcript selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DispatcherDetails;