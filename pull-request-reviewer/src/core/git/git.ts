import { SimpleGitOptions, SimpleGit, simpleGit } from 'simple-git';
import * as tl from "azure-pipelines-task-lib/task";
import binaryExtensions from 'binary-extensions';
import { getFileExtension } from '../../utils';

const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
  binary: 'git'
};

export const git: SimpleGit = simpleGit(gitOptions);

export async function getChangedFiles(targetBranch: string): Promise<string[]> {
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
    // Validar que prNumber sea válido
    if (!prNumber || prNumber.trim() === '') {
      throw new Error('Número de PR no proporcionado o vacío');
    }
    
    // Obtener el diff completo del PR usando git
    const { execSync } = require('child_process');
    
    console.log(`Obteniendo diff completo para PR #${prNumber}...`);
    
    // Para Azure DevOps, el formato puede ser diferente al de GitHub
    let diffCommand: string;
    
    // Obtener variables de Azure DevOps
    const targetBranch = tl.getVariable('System.PullRequest.TargetBranch');
    const sourceBranch = tl.getVariable('System.PullRequest.SourceBranch');
    
    if (targetBranch && sourceBranch) {
      // Para Azure DevOps PR - usar las ramas directamente
      const targetBranchName = targetBranch.replace('refs/heads/', '');
      const sourceBranchName = sourceBranch.replace('refs/heads/', '');
      diffCommand = `git fetch origin ${targetBranchName} ${sourceBranchName} && git diff origin/${targetBranchName}...origin/${sourceBranchName}`;
    } else if (targetBranch) {
      // Fallback: comparar con la rama target
      const targetBranchName = targetBranch.replace('refs/heads/', '');
      diffCommand = `git fetch origin ${targetBranchName} && git diff origin/${targetBranchName}..HEAD`;
    } else {
      // Último fallback: usar formato GitHub (probablemente no funcionará en Azure DevOps)
      diffCommand = `git fetch origin pull/${prNumber}/head && git diff HEAD..FETCH_HEAD`;
    }
    
    console.log(`Ejecutando comando: ${diffCommand}`);
    const fullDiff = execSync(diffCommand, { 
      encoding: 'utf-8', 
      cwd: tl.getVariable('System.DefaultWorkingDirectory') 
    });
    
    if (!fullDiff || fullDiff.trim() === '') {
      console.log(`No se encontraron cambios en el PR #${prNumber}`);
      return '';
    }
    
    console.log(`Diff obtenido exitosamente para PR #${prNumber}`);
    return fullDiff;
  } catch (error: any) {
    console.log(`Error obteniendo diff completo del PR #${prNumber}: ${error.message}`);
    console.log(`Detalles del error: ${error.toString()}`);
    return '';
  }
}