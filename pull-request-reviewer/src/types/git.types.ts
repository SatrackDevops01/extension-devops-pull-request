import * as http from 'http';
import * as https from 'https';

export interface GitOptions {
  baseDir: string;
  binary: string;
}

export interface DiffOptions {
  targetBranch: string;
  fileName?: string;
  nameOnly?: boolean;
  diffFilter?: string;
}

export interface PRDiffResult {
  prNumber: string;
  diff: string;
  success: boolean;
  error?: string;
}