"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import DispatcherDetails from "@/components/dispatcherDetails";

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


  // Track the *transcript* filename separately from the dispatcher

  // dispatcherDetails loads transcripts by calling setTranscriptData,
  // but we also need to know *which file* to PUT to on save.

  
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

      // Strip .json extension if present — the backend expects the bare filename
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

  useEffect(() => {
    const dispatcherId = params.id as string;

    const loadDispatcher = (isInitialLoad: boolean = false) => {
      if (isInitialLoad) setLoading(true);

      const storedDispatchers = localStorage.getItem("dispatchers");
      if (storedDispatchers) {
        const dispatchers: Dispatcher[] = JSON.parse(storedDispatchers);
        const foundDispatcher = dispatchers.find((d) => d.id === dispatcherId);
        if (foundDispatcher) {
          setDispatcher(foundDispatcher);
        } else {
          router.push("/records");
        }
      } else {
        router.push("/records");
      }

      if (isInitialLoad) setLoading(false);
    };

    loadDispatcher(true);

    const handleDispatchersUpdate = () => loadDispatcher(false);
    window.addEventListener("dispatchersUpdated", handleDispatchersUpdate);
    return () => window.removeEventListener("dispatchersUpdated", handleDispatchersUpdate);
  }, [params.id, router]);

  if (loading) {
    return <div className="container mx-auto p-6"><p>Loading...</p></div>;
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
      //lets dispatcherDetails tell this page which transcript is active
      onTranscriptFileChange={setCurrentTranscriptFilename}
    />
  );
}