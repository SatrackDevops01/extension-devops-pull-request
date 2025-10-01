import { SimpleGitOptions, SimpleGit, simpleGit } from 'simple-git';
import * as tl from "azure-pipelines-task-lib/task";
import binaryExtensions from 'binary-extensions';
import { getFileExtension } from './utils';

const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
  binary: 'git'
};

export const git: SimpleGit = simpleGit(gitOptions);

export async function getChangedFiles(targetBranch: string) {
  await git.addConfig('core.pager', 'cat');
  await git.addConfig('core.quotepath', 'false');
  await git.fetch();

  const diffs = await git.diff([targetBranch, '--name-only', '--diff-filter=AM']);
  const files = diffs.split('\n').filter(line => line.trim().length > 0);
  const nonBinaryFiles = files.filter(file => !binaryExtensions.includes(getFileExtension(file)));

  console.log(`Changed Files (excluding binary files) : \n ${nonBinaryFiles.join('\n')}`);

  return nonBinaryFiles;
}

export async function getFullPRDiff(prNumber: string): Promise<string> {
  try {
    // Obtener el diff completo del PR usando git
    // Esto puede variar dependiendo de cómo manejes los PRs en tu sistema
    const { execSync } = require('child_process');
    
    // Ejemplo para GitHub PR (ajusta según tu plataforma)
    const diffCommand = `git fetch origin pull/${prNumber}/head && git diff HEAD..FETCH_HEAD`;
    const fullDiff = execSync(diffCommand, { encoding: 'utf-8' });
    
    return fullDiff;
  } catch (error: any) {
    console.log(`Error obteniendo diff completo del PR #${prNumber}: ${error.message}`);
    return '';
  }
}