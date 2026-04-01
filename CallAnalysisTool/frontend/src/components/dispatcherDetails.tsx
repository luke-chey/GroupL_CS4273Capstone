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
}: DispatcherDetailsProps) => {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioKey, setAudioKey] = useState(0);

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
          </CardHeader>

          <CardContent>
            {currentGrade ? (
              <div className="space-y-2">
                <p className="font-medium">{currentTranscriptFile}</p>
                <p className="text-blue-600">
                  {currentGrade.grade_percentage}%
                </p>

                {currentGrade.detected_nature_code && (
                  <p className="text-sm">
                    Detected Nature Code: {currentGrade.detected_nature_code}
                  </p>
                )}

                {Object.entries(questionGrades).map(([k, q]: [string, any]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span>{q.label}</span>
                    <span className={getQuestionStatusClassName(q.status)}>
                      {q.status}
                    </span>
                  </div>
                ))}
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