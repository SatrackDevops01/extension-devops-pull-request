import * as tl from "azure-pipelines-task-lib/task";
import { Configuration, OpenAIApi } from 'openai';
import { deleteExistingComments } from './pr';
import { reviewFile, reviewCompletePR } from './review';
import { consumeApi } from './review';
import { getTargetBranchName } from './utils';
import { getChangedFiles, getFullPRDiff } from './git';
import * as https from 'https';
import * as http from 'http';
import { Repository } from './repository';
import minimatch from 'minimatch';

async function run() {
  try {
    if (tl.getVariable('Build.Reason') !== 'PullRequest') {
      tl.setResult(tl.TaskResult.Skipped, "Esta tarea debe ejecutarse solo cuando la compilación sea activada a través de una solicitud de PR.");
      return;
    }
    
    const analysisMode = tl.getInput('analysis_mode', true) as 'file' | 'global';
    const _repository = new Repository();
    const pr_1 = require("./pr");
    const reviewTs = require("./review");
    const supportSelfSignedCertificate = tl.getBoolInput('support_self_signed_certificate');
    const apiKey = tl.getInput('api_key', true);
    const aoiEndpoint = tl.getInput('aoi_endpoint', true);
    const tokenMax = tl.getInput('aoi_tokenMax', true);
    const temperature = tl.getInput('aoi_temperature', true);
    const prompt = tl.getInput('prompt', false);
    const additionalPrompts = tl.getInput('additional_prompts', false)?.split(',')
    const fileExtensions = tl.getInput('file_extensions', false);
    const filesToExclude = tl.getInput('file_excludes', false);
    const openaiModel = tl.getInput('model') || 'gpt-4-32k';
    const useHttps = tl.getBoolInput('use_https', true);

    if (apiKey == undefined) {
      tl.setResult(tl.TaskResult.Failed, 'No Api Key provided!');
      return;
    }

    if (aoiEndpoint == undefined) {
      tl.setResult(tl.TaskResult.Failed, 'No Endpoint AzureOpenAi provided!');
      return;
    }
    
    let Agent: http.Agent | https.Agent;

    if(useHttps) {
      Agent = new https.Agent({rejectUnauthorized: !supportSelfSignedCertificate});
    }
    else
    {
      Agent = new http.Agent();
    }

    let targetBranch = getTargetBranchName();

    if (!targetBranch) {
      tl.setResult(tl.TaskResult.Failed, 'No target branch found!');
      return;
    }

    await deleteExistingComments(Agent);

    console.log('Iniciando Code Review');

    let filesToReview = await _repository.GetChangedFiles(fileExtensions, filesToExclude);
    if (filesToReview.length === 0 || filesToReview.length == 0) {
      let message = `No se encontró código sujeto a revisión. Sin comentarios para revisión de código o revise los parámetros de entrada de la tarea.`
      console.log(message);
      tl.setResult(tl.TaskResult.SucceededWithIssues, message);
      return
    }

    console.log(`Se detectaron cambios en ${filesToReview.length} archivo(s)`);

    if(analysisMode === 'global') {
      const prNumber = tl.getVariable('System.PullRequest.PullRequestNumber') || '';
      const fullPRDiff = await getFullPRDiff(prNumber);
      let review = await reviewCompletePR(fullPRDiff, prNumber, Agent, apiKey, aoiEndpoint, tokenMax, temperature, prompt, additionalPrompts)



      console.log(`Revision finalizada del pr ${prNumber}`)
      // Generar un console.log con el consumo de tokens. El consumo está en la variable consumeApi generada en el archivo review.ts
      console.log(`----------------------------------`)
      console.log(`Consumo de Tokens: ${consumeApi}`)
      console.log(`----------------------------------`)
    } else if (analysisMode === 'file') {
      for (const element of filesToReview) {

        const fileToReview = element;
        let diff = await _repository.GetDiff(fileToReview);
        let review = await reviewFile(diff, fileToReview, Agent, apiKey, aoiEndpoint, tokenMax, temperature, prompt, additionalPrompts)

        if (diff.indexOf('Sin retroalimentación') < 0) {
          await pr_1.addCommentToPR(fileToReview, review, Agent);
        }

        console.log(`Revision finalizada del archivo ${fileToReview}`)
        // Generar un console.log con el consumo de tokens. El consumo está en la variable consumeApi generada en el archivo review.ts
        console.log(`----------------------------------`)
        console.log(`Consumo de Tokens: ${consumeApi}`)
        console.log(`----------------------------------`)
      }
    } else {
      tl.setResult(tl.TaskResult.Failed, `Modo de análisis desconocido: ${analysisMode}`);
    }
    console.log("Task de Pull Request finalizada.");
  }
  catch (err: any) {
    console.log("Error encontrado", err.message);
    console.log(tl.TaskResult.Failed, err.message);
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();