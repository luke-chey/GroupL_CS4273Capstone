import type { DispatcherRecord, FileGrade } from "@/types/dispatcher";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export interface ApiResponse {
  filename: string;
  grader_type: string;
  grade_percentage: number;
  detected_nature_code: string;
  total_questions: number;
  case_entry_questions: number;
  nature_code_questions: number;
  questions_asked_correctly: number;
  questions_missed: number;
  timestamp: string;
  grades: {
    [questionId: string]: {
      code: string;
      label: string;
      status: string;
    };
  };
  metadata: {
    language: string;
    segment_count: number;
    grader_version: string;
    model: string;
    questions_source: string;
    nature_code_detection: string;
  };
}

export interface Question {
  questionId: string;
  label: string;
}

interface DispatcherSummaryResponse {
  dispatchers?: Array<{
    name?: string;
    overallGrade?: number;
    numRecords?: number;
    numTranscripts?: number;
    numGrades?: number;
  }>;
}

interface DispatcherRecordsResponse {
  records?: string[];
}

interface RecordDetailsResponse {
  audioFiles?: string[];
  cdrFiles?: string[];
  transcriptFiles?: string[];
  gradeFiles?: string[];
  otherFiles?: string[];
}

interface TranscriptionByFilenameResponse {
  success: boolean;
  filename: string;
  file_path: string;
  audio_file: string;
  data: {
    segments?: Array<{
      speaker?: string;
      text?: string;
      start: number;
      end: number;
    }>;
  };
}

/**
 * Upload a JSON file to the API and get analysis results
 */
export async function uploadFileForAnalysis(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `API error (${response.status}): ${errorText || response.statusText}`
      );
    }

    // Handle different response types
    const data = await response.json();

    // If the response is a string, try to parse it
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch (e) {
        throw new Error("Invalid response format from API");
      }
    }

    return data;
  } catch (error) {
    // Handle network errors specifically
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        `Failed to connect to API at ${API_BASE_URL}. Make sure the backend server is running on port 5000.`
      );
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Calculate a grade from the API response
 * Simply returns the grade_percentage that the backend already calculated
 */
export function calculateGrade(response: ApiResponse): number {
  return Math.round(response.grade_percentage ?? 0);
}

/**
 * Get questions that were not asked from the API response
 * Returns an array of objects containing questionId and label for questions that were not asked
 */

export function getNotAskedQuestions(response: ApiResponse): Question[] {
  if (!response.grades) {
    return [];
  }

  // Convert grades object to array and filter for "Not Asked" questions
  return Object.entries(response.grades)
    .filter(
      ([questionId, grade]) =>
        grade.status === "Not Asked" || grade.code === "2"
    )
    .map(([questionId, grade]) => ({
      questionId,
      label: grade.label,
    }));
}

//Get Questions that were asked incorrectly from the API response
export function getQuestionsAskedIncorrectly(
  response: ApiResponse
): Question[] {
  if (!response.grades) {
    return [];
  }

  return Object.entries(response.grades)
    .filter(
      ([questionId, grade]) =>
        grade.status === "Asked Incorrectly" || grade.code === "3"
    )
    .map(([questionId, grade]) => ({
      questionId,
      label: grade.label,
    }));
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API error (${response.status}): ${response.statusText}`);
  }

  return response.json();
}

export async function fetchDispatchers(): Promise<DispatcherSummaryResponse> {
  return fetchJson<DispatcherSummaryResponse>("/api/dispatchers");
}

export async function fetchDispatcherRecords(
  dispatcherName: string
): Promise<string[]> {
  const response = await fetchJson<DispatcherRecordsResponse>(
    `/api/dispatchers/${encodeURIComponent(dispatcherName)}`
  );

  return Array.isArray(response.records) ? response.records : [];
}

export async function fetchDispatcherRecordDetails(
  dispatcherName: string,
  recordName: string
): Promise<DispatcherRecord> {
  const response = await fetchJson<RecordDetailsResponse>(
    `/api/dispatchers/${encodeURIComponent(
      dispatcherName
    )}/${encodeURIComponent(recordName)}`
  );

  return {
    name: recordName,
    audioFile: response.audioFiles?.[0],
    cdrFile: response.cdrFiles?.[0],
    transcriptFile: response.transcriptFiles?.[0],
    gradeFile: response.gradeFiles?.[0],
    otherFiles: response.otherFiles || [],
  };
}

export async function fetchGradeFile(filename: string): Promise<FileGrade> {
  return fetchJson<FileGrade>(`/api/files/${encodeURIComponent(filename)}`);
}

export async function fetchBackendFile<T>(filename: string): Promise<T> {
  return fetchJson<T>(`/api/files/${encodeURIComponent(filename)}`);
}

export async function fetchTranscriptionByFilename(
  filename: string
): Promise<TranscriptionByFilenameResponse> {
  return fetchJson<TranscriptionByFilenameResponse>(
    `/api/transcriptions/${encodeURIComponent(filename)}`
  );
}

export function buildBackendFileUrl(filename: string): string {
  return `${API_BASE_URL}/api/files/${encodeURIComponent(filename)}`;
}
