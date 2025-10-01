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

export async function reviewCompletePR(
  fullPRDiff: string,
  prNumber: string,
  agent: http.Agent | https.Agent,
  apiKey: string,
  aoiEndpoint: string,
  tokenMax: string | undefined,
  temperature: string | undefined,
  prompt: string | undefined,
  additionalPrompts: string[] = [],
) {
  console.log(`Iniciando revisión completa del PR #${prNumber} ...`);

  // Obtener todos los cambios del PR
  if (!fullPRDiff || fullPRDiff.trim() === '') {
    console.log(`No se encontraron cambios en el PR #${prNumber}.`);
    return;
  }

  let instructions: string;
  if (prompt === null || prompt === '' || prompt === undefined) {
    instructions = `
    Eres un asistente especializado en ingeniería de software, actuando como revisor de código para Pull Requests (PRs).

    **Objetivo Principal:**
    Tu misión es analizar TODOS los cambios del Pull Request completo y brindar retroalimentación constructiva holística para **mejorar la salud general del código**, garantizando calidad, mantenibilidad, rendimiento y seguridad. La retroalimentación debe ser técnica, didáctica, enfocada en el código (no en el autor) y explicar claramente el *razonamiento* detrás de cada punto planteado. Considera el impacto general de todos los cambios en conjunto, no solo archivos individuales.

    **Formato de Entrada:**
    Recibirás todos los cambios del PR en formato de patch unificado, incluyendo múltiples archivos y sus modificaciones.

    **Instrucciones Detalladas para la Revisión Completa:**
    Analiza el conjunto completo de cambios basándote en los siguientes criterios:

    1.  **Diseño y Arquitectura General:**
        * ¿La solución completa está bien diseñada y mantiene la coherencia arquitectónica?
        * ¿Los cambios en diferentes archivos trabajan bien en conjunto?
        * ¿Se mantiene la consistencia de patrones de diseño a través del PR?
        * ¿Evita complejidad innecesaria o funcionalidades no solicitadas?

    2.  **Funcionalidad y Corrección Integral:**
        * Identifica posibles bugs o inconsistencias entre archivos modificados
        * ¿Los cambios en conjunto cumplen el propósito general del PR?
        * ¿Hay dependencias entre archivos que puedan causar problemas?

    3.  **Coherencia y Consistencia:**
        * ¿La nomenclatura es consistente a través de todos los archivos?
        * ¿Se siguen las mismas convenciones de código en todo el PR?
        * ¿Los estilos de comentarios y documentación son coherentes?

    4.  **Impacto en Rendimiento General:**
        * ¿Los cambios en conjunto pueden afectar el rendimiento del sistema?
        * ¿Hay oportunidades de optimización que abarquen múltiples archivos?

    5.  **Seguridad del Sistema:**
        * ¿Los cambios introducen vulnerabilidades cuando se consideran en conjunto?
        * ¿Se mantienen las mejores prácticas de seguridad consistentemente?

    6.  **Cobertura y Estrategia de Pruebas:**
        * ¿La estrategia de pruebas es adecuada para el alcance completo del PR?
        * ¿Las pruebas cubren las interacciones entre componentes modificados?

    7.  **Documentación y Mantenibilidad:**
        * ¿La documentación refleja adecuadamente todos los cambios realizados?
        * ¿El PR mantiene o mejora la mantenibilidad general del código?

    **Instrucciones Adicionales Específicas:**
    ${
      additionalPrompts && additionalPrompts.length > 0 ? additionalPrompts
            .map((str) => `- ${str.trim()}`)
            .filter(Boolean)
            .join('\n')
        : ''
    }

    **Formato de la Salida:**
    * Presenta una revisión integral considerando el PR como un todo
    * Agrupa la retroalimentación por impacto: Crítico, Importante, Sugerencias
    * Para cada punto, menciona los archivos relevantes afectados
    * Si no se identifica ningún problema significativo, responde **únicamente** con: Sin retroalimentación
    `;
  } else {
    instructions = prompt;
  }

  try {
    let choices: any;
    let response: any;

    if (tokenMax === undefined || tokenMax === '') {
      tokenMax = '500'; // Mayor límite para PR completo
      console.log(`tokenMax fuera de los parámetros, para revisión completa fue establecido en 500.`);
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
              content: `${instructions}\n\nPR #${prNumber} - Cambios completos:\n${fullPRDiff}`,
            },
          ],
        }),
      });

      response = await request.json();
      choices = response.choices;
    } catch (responseError: any) {
      console.log(
        `Error encontrado en la revisión del PR completo, validar los parámetros de entrada. ${responseError.response?.status} ${responseError.response?.message}`,
      );
      return;
    }

    if (choices && choices.length > 0) {
      const reviewOK = choices[0].message?.content as string;
      if (reviewOK.trim() !== 'Sin retroalimentación') {
        // Agregar comentario general al PR (no a un archivo específico)
        await addCommentToPR(`**Revisión Completa del PR #${prNumber}**`, reviewOK, agent);
      }
      console.log(`Revisión completa del PR #${prNumber} finalizada.`);
    } else {
      console.log(`Ninguna retroalimentación encontrada para el PR #${prNumber} completo.`);
    }

    // Captura de tokens para revisión completa
    try {
      const completion_tokens_total = response.usage.completion_tokens;
      const prompt_tokens_total = response.usage.prompt_tokens;
      const total_tokens_total = response.usage.total_tokens;

      const prConsumeApi = `PR #${prNumber} - Uso: Completaciones: ${completion_tokens_total}, Prompts: ${prompt_tokens_total}, Total: ${total_tokens_total}`;
      console.log(prConsumeApi);
      
      // Agregar al consumo global si existe
      if (consumeApi) {
        consumeApi += `\n${prConsumeApi}`;
      } else {
        consumeApi = prConsumeApi;
      }
    } catch (error: any) {
      console.log(`Error al intentar capturar consumo de tokens del PR completo: ${error.message}`);
    }
  } catch (error: any) {
    if (error.response) {
      console.log(`Error en revisión completa del PR: ${error.response.status}`);
      console.log(error.response.data);
    } else {
      console.log(`Error en revisión completa del PR: ${error.message}`);
    }
  }
}
