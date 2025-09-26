import fetch from 'node-fetch';
import { git } from './git';
import { addCommentToPR } from './pr';
import * as https from 'https';
import * as http from 'http';

export let consumeApi: string;
export async function reviewFile(
  gitDiff: string,
  fileName: string,
  agent: http.Agent | https.Agent,
  apiKey: string,
  aoiEndpoint: string,
  tokenMax: string | undefined,
  temperature: string | undefined,
  prompt: string | undefined,
  additionalPrompts: string[] = [],
) {
  console.log(`Iniciando revision del archivo: ${fileName} ...`);

  let instructions : string;
if(prompt === null ||  prompt === '' || prompt === undefined) {
  instructions = `
  Eres un asistente especializado en ingeniería de software, actuando como revisor de código para Pull Requests (PRs).

  **Objetivo Principal:**
  Tu misión es analizar los cambios de código proporcionados y brindar retroalimentación constructiva para **mejorar la salud general del código**, garantizando calidad, mantenibilidad, rendimiento y seguridad. La retroalimentación debe ser técnica, didáctica, enfocada en el código (no en el autor) y explicar claramente el *razonamiento* detrás de cada punto planteado. Prioriza la identificación de problemas que realmente impacten la calidad y funcionalidad, diferenciando entre problemas críticos y sugerencias menores (nits).

  **Formato de Entrada:**
  Recibirás los cambios del PR en formato de patch. Cada entrada contiene el mensaje de commit seguido por los cambios de código (diffs) en formato unidiff.

  **Instrucciones Detalladas para la Revisión:**
  Analiza el código proporcionado basándote en los siguientes criterios. Para cada punto planteado, explica el problema y, siempre que sea posible, sugiere una solución o alternativa clara y accionable.

  1.  **Diseño y Arquitectura:**
      * ¿La solución está bien diseñada y se integra adecuadamente al sistema existente?
      * ¿La arquitectura del cambio es sólida y sigue principios como SOLID?
      * ¿Evita complejidad innecesaria o *over-engineering* (funcionalidades no solicitadas)?
      * ¿Considera la mantenibilidad y extensibilidad futuras?

  2.  **Funcionalidad y Corrección:**
      * Identifica posibles bugs, errores lógicos o comportamientos inesperados.
      * Verifica si todos los casos límite relevantes fueron considerados y tratados.
      * ¿La funcionalidad implementada corresponde al propósito original de la tarea/issue?

  3.  **Legibilidad y Mantenibilidad (Código Limpio):**
      * ¿El código sigue las buenas prácticas de código limpio? ¿Es fácil de leer, entender y modificar?
      * ¿La nomenclatura (variables, funciones, clases, etc.) es clara, significativa, consistente y sigue las convenciones establecidas?
      * ¿Los comentarios son útiles, claros y explican el *por qué* (la intención) en lugar del *qué* (que el código ya dice)? ¿Evita comentarios redundantes o desactualizados?
      * ¿Hay duplicación de código que pueda ser refactorizada hacia un componente reutilizable?

  4.  **Rendimiento:**
      * ¿Los cambios pueden introducir cuellos de botella o impactar negativamente el desempeño (latencia, uso de CPU/memoria)?
      * ¿Existen oportunidades claras y significativas para optimización de rendimiento (elección de algoritmos/estructuras de datos, optimización de consultas, reducción de I/O)? Sugiere optimizaciones específicas y justifícalas.

  5.  **Seguridad:**
      * Identifica vulnerabilidades conocidas o potenciales introducidas por el cambio (ej. SQL Injection, XSS, manejo inadecuado de datos sensibles).
      * ¿Se están siguiendo las mejores prácticas de seguridad (validación de entrada, sanitización de datos, control de acceso, manejo seguro de errores)?

  6.  **Pruebas:**
      * (Si la información sobre pruebas está disponible o puede inferirse del contexto o código) ¿Las pruebas automatizadas (unitarias, integración, etc.) son adecuadas, cubren las nuevas funcionalidades y casos límite?
      * ¿Las pruebas están bien escritas, son legibles y fáciles de mantener?

  7.  **Documentación:**
      * (Si es aplicable y la información está disponible) ¿La documentación relevante (READMEs, comentarios de documentación de API/funciones, etc.) fue agregada o actualizada para reflejar los cambios en el código?

  **Instrucciones Adicionales Específicas:**
  ${
    additionalPrompts && additionalPrompts.length > 0 ? additionalPrompts
          .map((str) => `- ${str.trim()}`)
          .filter(Boolean)
          .join('\n')
      : null
  }

  **Formato de la Salida:**
  * Presenta la retroalimentación de forma clara y estructurada, idealmente agrupada por los criterios anteriores (Diseño, Funcionalidad, etc.).
  * Para cada punto, indica el archivo y la línea relevante, si es aplicable.
  * Si no se identifica ningún problema o punto de mejora en *ninguno* de los criterios, responde **únicamente** con la frase: Sin retroalimentación
  `;
}
else {  
  instructions = prompt;
}

  try {
    let choices: any;
    let response: any;

    if (tokenMax === undefined || tokenMax === '') {
      tokenMax = '100';
      console.log(`tokenMax fuera de los parámetros, para proseguir con la tarea fue establecido en 100.`);
    }
    if (temperature === undefined || temperature === '' || parseInt(temperature) > 2) {
      temperature = '0';
      console.log(`temperatura fuera de los parámetros, para proseguir con la tarea fue establecida en 0.`);
    }

    try {
      const request = await fetch(aoiEndpoint, {
        method: 'POST',
        headers: { 'api-key': `${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: parseInt(`${tokenMax}`),
          temperature: parseInt(`${temperature}`),
          messages: [
            {
              role: 'user',
              content: `${instructions}\n, patch : ${gitDiff}}`,
            },
          ],
        }),
      });

      response = await request.json();

      choices = response.choices;
    } catch (responseError: any) {
      console.log(
        `Error encontrado, validar los parámetros de entrada. ${responseError.response.status} ${responseError.response.message}`,
      );
    }

    if (choices && choices.length > 0) {
        const reviewOK = choices[0].message?.content as string;
        if (reviewOK.trim() !== 'Sin retroalimentación') {
          await addCommentToPR(fileName, reviewOK, agent);
        }
        console.log(`Revision del archivo ${fileName} finalizada.`);
    } else {
      console.log(`Ninguna retroalimentación encontrada para el archivo ${fileName}.`);
    }
    // Captura o consumo de tokens

    try {
      const completion_tokens_total = response.usage.completion_tokens;
      const prompt_tokens_total = response.usage.prompt_tokens;
      const total_tokens_total = response.usage.total_tokens;

      consumeApi = `Uso: Completaciones: ${completion_tokens_total}, Prompts: ${prompt_tokens_total}, Total: ${total_tokens_total}`;
    } catch (error: any) {
      console.log(`Error al intentar capturar consumo de tokens: ${error.message}`);
    }
  } catch (error: any) {
    if (error.response) {
      console.log(error.response.status);
      console.log(error.response.data);
    } else {
      console.log(error.message);
    }
  }
}
