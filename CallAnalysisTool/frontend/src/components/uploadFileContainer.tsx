"use client";
import React, { useEffect, useRef, useState } from "react";
import { uploadFileForAnalysis, uploadTranscriptForAnalysis } from "@/lib/api";
import ProgressModal from "./ProgressModal";
import { useRouter } from "next/navigation";

interface BatchPageEntry {
  dispatcherId: string;
  transcriptFilename: string;
  uploadOrder: number;
}

const UploadFileContainer = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [totalStartTime, setTotalStartTime] = useState<number | null>(null);
  const [currentFileStartTime, setCurrentFileStartTime] = useState<number | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [elapsedNow, setElapsedNow] = useState<number>(Date.now());
  const router = useRouter();
  // Define allowed file types
  const allowedTypes = [".zip", ".json"];

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach((file) => {
      const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
      if (allowedTypes.includes(fileExtension)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      alert(
        `The following files are not supported: ${invalidFiles.join(
          ", "
        )}\n\nOnly ${allowedTypes.join(", ")} files are allowed.`
      );
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  useEffect(() => {
    if (!isUploading) return;

    const intervalId = window.setInterval(() => {
      setElapsedNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isUploading]);

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

  const totalElapsedTime = formatElapsedTime(
    totalStartTime ? elapsedNow - totalStartTime : null
  );

  const currentFileElapsedTime = formatElapsedTime(
    currentFileStartTime ? elapsedNow - currentFileStartTime : null
  );


  const orderBatchPages = (batchPages: BatchPageEntry[]) => {
    // Group by dispatcher first so multi-file dispatchers stay contiguous.
    const groupedByDispatcher = new Map<string, BatchPageEntry[]>();
    const dispatcherOrder: string[] = [];

    for (const page of batchPages) {
      if (!groupedByDispatcher.has(page.dispatcherId)) {
        groupedByDispatcher.set(page.dispatcherId, []);
        dispatcherOrder.push(page.dispatcherId);
      }
      groupedByDispatcher.get(page.dispatcherId)?.push(page);
    }

    // Flatten in dispatcher first-seen order while preserving each group's upload order.
    return dispatcherOrder.flatMap(
      (dispatcherId) => groupedByDispatcher.get(dispatcherId) || []
    );
  };

  // Handle one file end-to-end: transcribe (if zip), grade, and persist all in one call.
  const uploadAndGradeFile = async (
    file: File,
    index: number,
    total: number
  ): Promise<BatchPageEntry> => {
    setCurrentFileName(file.name);
    setCurrentFileStartTime(Date.now());

    const isZip = file.name.endsWith(".zip");
    const isJson = file.name.endsWith(".json");

    if (isZip) {
      setUploadProgress(
        `Transcribing and grading ${file.name} (${index + 1}/${total})...`
      );
      const result = await uploadFileForAnalysis(file);
      const { dispatcherName } = result;

      // Extract folder structure to build foldername
      // Format: output/{dispatcherName}/{date}_{time}_{nature_code}/
      // We need the last two path components for foldername
      const pathParts = result.outputDestination
        .replace(/\\/g, "/")
        .split("/")
        .filter((p: string) => p);
      const folderName = pathParts[pathParts.length - 1]; // date_time_code
      const transcriptFilename = `${folderName}.json`;

      setProgressPercentage(Math.round(((index + 1) / total) * 100));
      return {
        dispatcherId: dispatcherName,
        transcriptFilename,
        uploadOrder: index,
      };
    } else if (isJson) {
      setUploadProgress(
        `Grading ${file.name} (${index + 1}/${total})...`
      );

      // Read JSON file and send as request body
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);

      const result = await uploadTranscriptForAnalysis(jsonData);
      const { dispatcherName } = result;

      // Extract folder structure to build foldername
      // Format: output/{dispatcherName}/{date}_{time}_{nature_code}/
      // We need the last two path components for foldername
      const pathParts = result.outputDestination
        .replace(/\\/g, "/")
        .split("/")
        .filter((p: string) => p);
      const folderName = pathParts[pathParts.length - 1]; // date_time_code
      const transcriptFilename = `${folderName}.json`;

      setProgressPercentage(Math.round(((index + 1) / total) * 100));
      return {
        dispatcherId: dispatcherName,
        transcriptFilename,
        uploadOrder: index,
      };
    } else {
      throw new Error(`Unsupported file type: ${file.name}`);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select at least one zip or json file to upload.");
      return;
    }

    setIsUploading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setUploadProgress("Processing files...");
    const startedAt = Date.now();
    setElapsedNow(startedAt);
    setTotalStartTime(startedAt);
    setCurrentFileStartTime(startedAt);
    setCurrentFileName(selectedFiles[0]?.name || "");

    try {
      // Single unified upload + transcription + grading pipeline
      const batchPages: BatchPageEntry[] = [];
      for (const [index, file] of selectedFiles.entries()) {
        batchPages.push(
          await uploadAndGradeFile(file, index, selectedFiles.length)
        );
      }

      const orderedBatchPages = orderBatchPages(batchPages);

      setUploadProgress("Processing complete!");
      setCurrentFileStartTime(null);
      setCurrentFileName("");

      const firstPage = orderedBatchPages[0];
      setTimeout(() => {
        setShowProgressModal(false);
        if (firstPage) {
          router.push(`/records/${firstPage.dispatcherId}?batch=1`);
        }
      }, 1000);
    } catch (error) {
      console.error("Upload error:", error);
      alert(
        `Error uploading files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setShowProgressModal(false);
    } finally {
      setIsUploading(false);
      setUploadProgress("");
      setTotalStartTime(null);
      setCurrentFileStartTime(null);
      setCurrentFileName("");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">
          Upload Zip and JSON Files
        </h2>
      </div>

      {/* Drag and Drop Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="space-y-2">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-lg font-medium text-gray-700">
            Drop zip and json files here, or click to browse
          </p>
          <p className="text-sm text-gray-500">Zip files (with transcription) or JSON files (pre-transcribed)</p>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".zip,.json"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">
            Selected Files ({selectedFiles.length})
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700 font-medium">{uploadProgress}</p>

        </div>
      )}

      {/* Upload Button */}
      <div className="mt-6">
        <button
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || isUploading}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            selectedFiles.length === 0 || isUploading
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {isUploading
            ? "Processing Files..."
            : `Upload${
                selectedFiles.length > 0
                  ? ` ${selectedFiles.length} file(s)`
                  : ""
              }`}
        </button>
      </div>
      <ProgressModal
        oneFile={selectedFiles.length==1}
        isOpen={isUploading}
        progress={progressPercentage}
        currentStep={uploadProgress}
        elapsedTime={totalElapsedTime}
        currentFileElapsedTime={currentFileElapsedTime}
      />
    </div>
  );
};

export default UploadFileContainer;
