
export enum Role {
  TRAINER = 'TRAINER',
  TRAINEE = 'TRAINEE',
  HR = 'HR'
}

export interface Employee {
  id: string;
  name: string;
  role: Role;
  password?: string;
  otpSecret?: string;
  lastActive?: string;
  department?: string;
  position?: string;
  requiredTrainings?: string[]; // Training IDs that are required
  challengeTrainings?: string[]; // Training IDs that are optional
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdBy: string;
  priority: 'high' | 'normal' | 'low';
  active: boolean;
}

export interface TrainingMaterial {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface TestPattern {
  id: string;
  name: string;
  questions: Question[];
  createdAt: string;
}

export interface Training {
  id: string;
  title: string;
  date: string;
  description: string;
  patterns: TestPattern[];
  activePatternId: string;
  materials?: TrainingMaterial[];
  targetEmployees?: string[]; // Employee IDs
  targetDepartments?: string[]; // Department names
  targetPositions?: string[]; // Position names
  isRequiredForAll?: boolean; // 全員必須フラグ
  studyLinks?: { label: string; url: string }[]; // 勉強資料リンク（最大5つ）
  fiscalYear?: number; // 年度 (e.g., 2025, 2026)
}

export interface TestResult {
  trainingId: string;
  trainingTitle?: string;
  patternId?: string;
  employeeName: string;
  employeeId: string;
  preScore: number;
  postScore: number;
  userAnswers?: number[];
  completedAt: string;
  analysis: string;
  advice?: string;
  deviation?: number;
  traits?: string[];
  competencies?: string[];
  totalQuestions?: number;
  postAnswerTimeSec?: number; // 事後テストの回答所要時間（秒）
}

export interface DeepAnalysisRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  content: string;
  instructionUsed?: string;
}

export interface PsychApplication {
  employeeId: string;
  employeeName: string;
  appliedAt: string;
}

export interface AuthSession {
  name: string;
  employeeId: string;
  role: Role;
}

export interface WrongAnswerAnalysis {
  id: string;
  trainingId: string;
  trainingTitle: string;
  questionIndex: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  wrongCount: number;
  wrongEmployees: {
    employeeId: string;
    employeeName: string;
    selectedAnswer: number;
  }[];
  totalAttempts: number;
  wrongRate: number;
  analyzedAt: string;
}
