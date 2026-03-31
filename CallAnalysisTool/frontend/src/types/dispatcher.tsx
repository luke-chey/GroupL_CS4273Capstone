import { Question } from "@/lib/api";

// Add this interface for the grade object structure
export interface FileGrade {
  grade_percentage: number;
  detected_nature_code?: string;
  grades?: {
    [questionId: string]: {
      code: string;
      label: string;
      status: string;
    };
  };
  per_question?: {
    [questionId: string]: {
      code: string;
      label: string;
      status: string;
    };
  };
}

export interface DispatcherRecord {
  name: string;
  audioFile?: string;
  cdrFile?: string;
  transcriptFile?: string;
  gradeFile?: string;
  otherFiles?: string[];
}

export interface Dispatcher {
  id: string;
  name: string;
  overallGrade?: number;
  numRecords?: number;
  numTranscripts?: number;
  numGrades?: number;
  files?: {
    transcriptFiles: string[]; // Transcripted Json Files
    audioFiles: string[]; // Audio Files to be Used when listening to the call
  };
  records?: DispatcherRecord[];
  grades?: {
    [filename: string]: FileGrade; // Changed from string | number to FileGrade
  };
  notAskedQuestions?: Question[];
  questionsAskedIncorrectly?: Question[];
}
