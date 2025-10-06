import { SimpleGit, SimpleGitOptions } from 'simple-git';

export interface RepositoryConfig {
  fileExtensions?: string;
  filesToExclude?: string;
}

export interface RepositoryOptions {
  gitOptions: Partial<SimpleGitOptions>;
}

export interface ChangedFilesResult {
  files: string[];
  filteredFiles: string[];
  totalCount: number;
}