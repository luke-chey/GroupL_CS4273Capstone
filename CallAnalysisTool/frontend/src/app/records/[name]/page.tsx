"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import DispatcherDetails from "@/components/dispatcherDetails";
import {
  fetchDispatcherRecords,
  fetchDispatcherRecordDetails,
  fetchGradeFile,
} from "@/lib/api";

export default function DispatcherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchMode = searchParams.get("batch") === "1";

  const [dispatcher, setDispatcher] = useState<Dispatcher | null>(null);
  const [loading, setLoading] = useState(true);

  const [transcriptData, setTranscriptData] = useState<any>(null);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [currentTranscriptFilename, setCurrentTranscriptFilename] = useState<string | null>(null);

  const handleEditSegment = (index: number, speaker: string, text: string) => {
    setTranscriptData((prev: any) => {
      if (!prev?.segments) return prev;

      const updatedSegments = [...prev.segments];
      updatedSegments[index] = {
        ...updatedSegments[index],
        speaker,
        text,
      };

      return { ...prev, segments: updatedSegments };
    });
  };

  const handleSaveTranscript = async () => {
    if (!transcriptData || !currentTranscriptFilename) {
      setSaveMessage("No transcript loaded to save.");
      return;
    }

    try {
      setSavingTranscript(true);
      setSaveMessage("");

      const filenameKey = currentTranscriptFilename.replace(/\.json$/, "");

      const response = await fetch(
        `http://localhost:5001/api/transcriptions/${filenameKey}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transcriptData),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save transcript");
      }

      const data = await response.json();
      setTranscriptData(data.transcript);
      setSaveMessage("Transcript saved successfully.");
    } catch (error: any) {
      console.error(error);
      setSaveMessage(`Failed to save transcript: ${error.message}`);
    } finally {
      setSavingTranscript(false);
    }
  };

  // This function allows the DispatcherDetails component to update the grades in the parent state when a grade is edited or added
  const handleUpdateGrades = (filename: string, gradeData: any) => {
    setDispatcher((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        grades: {
          ...prev.grades,
          [filename]: gradeData,
        },
      };
    });
  };

  useEffect(() => {
    const dispatcherName = params.name as string;

    const loadDispatcher = async () => {
      setLoading(true);
      try {
        const recordNames = await fetchDispatcherRecords(dispatcherName);

        const records = (
          await Promise.all(
            recordNames.map(async (recordName) => {
              try {
                return await fetchDispatcherRecordDetails(
                  dispatcherName,
                  recordName
                );
              } catch (error) {
                console.warn(
                  `Failed to load record ${recordName} for dispatcher ${dispatcherName}:`,
                  error
                );
                return null;
              }
            })
          )
        ).filter((record): record is NonNullable<typeof record> => record !== null);

        const transcriptFiles = records
          .map((record) => record.transcriptFile)
          .filter((file): file is string => Boolean(file));

        const audioFiles = records
          .map((record) => record.audioFile)
          .filter((file): file is string => Boolean(file));

        const gradeFiles = records
          .map((record) => record.gradeFile)
          .filter((file): file is string => Boolean(file));

        const grades: Dispatcher["grades"] = {};
        await Promise.all(
          records.map(async (record) => {
            if (!record.gradeFile || !record.transcriptFile) return;

            try {
              grades[record.transcriptFile] = await fetchGradeFile(record.gradeFile);
            } catch (error) {
              console.warn(`Failed to load grade file ${record.gradeFile}:`, error);
            }
          })
        );

        const gradedTranscripts = transcriptFiles.filter(
          (filename) => grades?.[filename]
        );

        const totalGrade = gradedTranscripts.reduce((sum, filename) => {
          return sum + (grades?.[filename]?.grade_percentage || 0);
        }, 0);

        const overallGrade =
          gradedTranscripts.length > 0
            ? totalGrade / gradedTranscripts.length
            : 0;

        setDispatcher({
          id: dispatcherName,
          name: dispatcherName,
          overallGrade,
          numRecords: recordNames.length,
          numTranscripts: transcriptFiles.length,
          numGrades: gradeFiles.length,
          files: {
            transcriptFiles,
            audioFiles,
          },
          records,
          grades,
        });
      } catch (error) {
        console.error("Failed loading dispatcher details:", error);
        router.push("/records");
      } finally {
        setLoading(false);
      }
    };

    loadDispatcher();
  }, [params.name, router]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!dispatcher) {
    return (
      <div className="container mx-auto p-6">
        <p>Dispatcher not found.</p>
        <Link href="/records" className="text-blue-500 hover:underline">
          Back to Records
        </Link>
      </div>
    );
  }

  return (
    <DispatcherDetails
      dispatcher={dispatcher}
      batchMode={batchMode}
      transcriptData={transcriptData}
      setTranscriptData={setTranscriptData}
      onEditSegment={handleEditSegment}
      onSaveTranscript={handleSaveTranscript}
      savingTranscript={savingTranscript}
      saveMessage={saveMessage}
      onTranscriptFileChange={setCurrentTranscriptFilename}
      onUpdateGrades={handleUpdateGrades}
    />
  );
}