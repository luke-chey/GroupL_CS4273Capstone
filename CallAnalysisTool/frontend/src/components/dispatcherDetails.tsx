"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import PlayerController from "./PlayerController/PlayerController";

interface DispatcherDetailsProps {
  dispatcher: Dispatcher;
  batchMode?: boolean;
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
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as Dispatcher[];
  } catch {
    // Favor an empty state over a crash if local data is malformed.
    return [];
  }
};

const parseStoredBatchPages = (raw: string | null): BatchPage[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StoredBatchData;
    return Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch {
    // Ignore invalid batch payloads so details view remains usable.
    return [];
  }
};

const buildFallbackPages = (dispatcher: Dispatcher): BatchPage[] => {
  const transcriptFiles = dispatcher.files?.transcriptFiles || [];
  const grades = dispatcher.grades || {};

  return transcriptFiles
    .filter((filename) => Boolean(grades[filename]))
    .map((filename, index) => ({
      dispatcherId: dispatcher.id,
      transcriptFilename: filename,
      uploadOrder: index,
    }));
};

const baseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");

const calculateOverallGrade = (
  transcriptFiles: string[],
  grades: Dispatcher["grades"]
): number | null => {
  const safeGrades = grades || {};
  const gradedCount = transcriptFiles.filter((filename) =>
    Boolean(safeGrades[filename])
  ).length;

  // Only return a score when at least one graded file exists.
  if (gradedCount === 0) {
    return null;
  }

  const total = transcriptFiles.reduce((sum, filename) => {
    const fileGrade = safeGrades[filename];
    return fileGrade ? sum + fileGrade.grade_percentage : sum;
  }, 0);

  return total / gradedCount;
};

const DispatcherDetails = ({
  dispatcher,
  batchMode = false,
}: DispatcherDetailsProps) => {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentGradeIndex, setCurrentGradeIndex] = useState(0);

  // Keep localStorage-driven dispatcher data in sync with in-app updates.
  const loadLocalData = () => {
    setDispatchers(parseStoredDispatchers(localStorage.getItem("dispatchers")));
    setBatchPages(parseStoredBatchPages(localStorage.getItem("latestUploadBatch")));
  };

  useEffect(() => {
    loadLocalData();
    const handleUpdate = () => loadLocalData();
    window.addEventListener("dispatchersUpdated", handleUpdate);
    return () => window.removeEventListener("dispatchersUpdated", handleUpdate);
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
      batchPages.filter((page) => {
        const pageDispatcher = dispatcherMap.get(page.dispatcherId);
        // Ignore stale batch entries if grade data was removed.
        return Boolean(pageDispatcher?.grades?.[page.transcriptFilename]);
      }),
    [batchPages, dispatcherMap]
  );

  const activePages = useMemo(() => {
    // Batch navigation only applies when explicitly entering details in batch mode.
    const batchContainsCurrentDispatcher =
      batchMode &&
      pagesFromBatch.some((page) => page.dispatcherId === dispatcher.id);
    if (batchContainsCurrentDispatcher) {
      return pagesFromBatch;
    }

    return buildFallbackPages(dispatcher);
  }, [pagesFromBatch, dispatcher, batchMode]);

  useEffect(() => {
    if (activePages.length === 0) {
      setCurrentGradeIndex(0);
      return;
    }

    const startIndex = activePages.findIndex(
      (page) => page.dispatcherId === dispatcher.id
    );
    setCurrentGradeIndex(startIndex >= 0 ? startIndex : 0);
  }, [dispatcher.id, activePages]);

  const safeCurrentGradeIndex =
    activePages.length > 0
      ? Math.min(currentGradeIndex, activePages.length - 1)
      : 0;
  const currentPage = activePages[safeCurrentGradeIndex];
  const activeDispatcher = currentPage
    ? dispatcherMap.get(currentPage.dispatcherId)
    : dispatcher;
  const activeTranscriptFiles = activeDispatcher?.files?.transcriptFiles || [];
  const activeAudioFiles = activeDispatcher?.files?.audioFiles || [];
  const activeGrades = activeDispatcher?.grades || {};
  const currentTranscriptFile = currentPage?.transcriptFilename;
  const currentFileGrade = currentTranscriptFile
    ? activeGrades[currentTranscriptFile]
    : undefined;

  const matchedAudioFile = currentTranscriptFile
    ? activeAudioFiles.find(
        (audioFile) => baseName(audioFile) === baseName(currentTranscriptFile)
      )
    : undefined;
  const activeDispatcherGradeCount = activeTranscriptFiles.filter((filename) =>
    Boolean(activeGrades[filename])
  ).length;
  const overallGrade = calculateOverallGrade(activeTranscriptFiles, activeGrades);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link
          href="/records"
          className="text-blue-500 hover:underline mb-4 inline-block"
        >
          ← Back to Records
        </Link>
        <h1 className="text-3xl font-bold mt-4">
          {activeDispatcher?.name || dispatcher.name}
        </h1>
        {overallGrade !== null && (
          <p className="text-lg font-semibold text-blue-600 mt-1">
            Overall Dispatcher Grade: {overallGrade.toFixed(1)}%
          </p>
        )}
        <p className="text-gray-500 mt-2">
          Dispatcher ID: {activeDispatcher?.id || dispatcher.id}
        </p>
        {activePages.length > 1 && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setCurrentGradeIndex((prev) => Math.max(prev - 1, 0))
              }
              disabled={safeCurrentGradeIndex === 0}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Previous
            </button>
            <p className="text-sm text-gray-600">
              File {safeCurrentGradeIndex + 1} / {activePages.length}
            </p>
            <button
              type="button"
              onClick={() =>
                setCurrentGradeIndex((prev) =>
                  Math.min(prev + 1, activePages.length - 1)
                )
              }
              disabled={safeCurrentGradeIndex === activePages.length - 1}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transcript Grading */}
        <Card>
          <CardHeader>
            <CardTitle>Transcript Grading</CardTitle>
          </CardHeader>
          <CardContent>
            {currentFileGrade && currentTranscriptFile ? (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium mb-2">{currentTranscriptFile}</p>
                  <p className="text-sm font-semibold mb-1 text-blue-600">
                    Current File Grade: {currentFileGrade.grade_percentage}%
                  </p>
                  {currentFileGrade.detected_nature_code && (
                    <p className="text-sm mb-2">
                      Detected Nature Code: {currentFileGrade.detected_nature_code}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {Object.entries(currentFileGrade.per_question || {}).map(
                      ([key, question]) => (
                        <li key={key} className="flex justify-between text-sm">
                          <span>{question.label}</span>
                          <span
                            className={
                              question.status === "Asked Correctly" ||
                              question.status === "Obvious"
                                ? "text-green-600 font-semibold"
                                : question.status === "Not As Scripted"
                                ? "text-yellow-500 font-semibold"
                                : "text-red-600 font-semibold"
                            }
                          >
                            {question.status}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            ) : activeTranscriptFiles.length > 0 ? (
              <p className="text-gray-500">No grade available.</p>
            ) : (
              <p className="text-gray-500">No transcript files available.</p>
            )}
          </CardContent>
        </Card>

        {/* Audio Files */}
        <Card>
          <CardHeader>
            <CardTitle>Audio File</CardTitle>
            <CardDescription>
              {currentTranscriptFile
                ? "Synced to current graded file"
                : `${activeAudioFiles.length} file(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {matchedAudioFile ? (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium">{matchedAudioFile}</p>
                <PlayerController transcriptionId={baseName(matchedAudioFile)} />
              </div>
            ) : currentTranscriptFile ? (
              <p className="text-gray-500">No matching audio file.</p>
            ) : activeAudioFiles.length > 0 ? (
              <p className="text-gray-500">
                No graded transcript selected for audio sync.
              </p>
            ) : (
              <p className="text-gray-500">No audio files available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DispatcherDetails;
