import fetch from 'node-fetch';
import { git } from '../git';
import { addCommentToPR } from '../../services/pr';
import * as https from 'https';
import * as http from 'http';

export let consumeApi: string;

// Función helper para esperar
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para dividir el diff en chunks manejables
function splitDiffIntoChunks(diff: string, maxChunkSize: number = 30000): string[] {
  const chunks: string[] = [];
  const lines = diff.split('\n');
  let currentChunk = '';
  let currentFileBlock = '';
  
  for (const line of lines) {
    // Si encontramos el inicio de un nuevo archivo
    if (line.startsWith('diff --git')) {
      // Si tenemos un bloque de archivo anterior, lo procesamos
      if (currentFileBlock && (currentChunk + currentFileBlock).length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      
      // Si el chunk actual + nuevo archivo es muy grande, guardamos el chunk
      if (currentChunk && (currentChunk + currentFileBlock + line).length > maxChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = currentFileBlock;
        currentFileBlock = line + '\n';
      } else {
        currentChunk += currentFileBlock;
        currentFileBlock = line + '\n';
      }
    } else {
      currentFileBlock += line + '\n';
    }
  }
  
  // Agregar los últimos bloques
  if (currentFileBlock) {
    currentChunk += currentFileBlock;
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

// Función para hacer requests con retry y delay
async function makeRequestWithRetryAndDelay(
  aoiEndpoint: string,
  apiKey: string,
  body: any,
  agent: http.Agent | https.Agent,
  delayMs: number = 5000
): Promise<any> {
  try {
    // Esperar antes de hacer la request para evitar rate limits
    if (delayMs > 0) {
      console.log(`Esperando ${delayMs/1000}s antes de la siguiente petición...`);
      await sleep(delayMs);
    }
    
    console.log(`Enviando request a Azure OpenAI...`);
    const request = await fetch(aoiEndpoint, {
      method: 'POST',
      headers: { 
        'api-key': `${apiKey}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(body),
      agent: agent
    });

    console.log(`Status respuesta: ${request.status} ${request.statusText}`);

    if (request.status === 429) {
      const errorResponse = await request.json();
      console.log(`Rate limit excedido: ${JSON.stringify(errorResponse)}`);
      throw new Error(`Rate limit exceeded: ${JSON.stringify(errorResponse)}`);
    }

    if (!request.ok) {
      const errorText = await request.text();
      throw new Error(`HTTP ${request.status}: ${errorText}`);
    }

    const response = await request.json();
    return response;

  } catch (error: any) {
    console.log(`Error en request: ${error.message}`);
    throw error;
  }
}

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

  let instructions: string;
  if (prompt === null || prompt === '' || prompt === undefined) {
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
  } else {
    instructions = prompt;
  }

  try {
    let choices: any;
    let response: any;

    // Fix: Parse temperature as float, not int
    let parsedTokenMax = 100;
    let parsedTemperature = 0.0;

    if (tokenMax !== undefined && tokenMax !== '') {
      parsedTokenMax = parseInt(tokenMax);
    } else {
      console.log(`tokenMax fuera de los parámetros, para proseguir con la tarea fue establecido en 100.`);
    }

    if (temperature !== undefined && temperature !== '' && parseFloat(temperature) <= 2) {
      parsedTemperature = parseFloat(temperature);
    } else {
      console.log(`temperatura fuera de los parámetros, para proseguir con la tarea fue establecida en 0.`);
    }

    const requestBody = {
      max_tokens: parsedTokenMax,
      temperature: parsedTemperature,
      messages: [
        {
          role: 'user',
          content: `${instructions}\n, patch : ${gitDiff}`,
        },
      ],
    };

    // Usar la nueva función con retry
    response = await makeRequestWithRetryAndDelay(aoiEndpoint, apiKey, requestBody, agent, 0);
    
    console.log("Model Response: ", JSON.stringify(response, null, 2));

    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`Respuesta inválida de Azure OpenAI para ${fileName}: ${JSON.stringify(response)}`);
      return;
    }

    choices = response.choices;

    if (choices && choices.length > 0) {
      const reviewOK = choices[0].message?.content as string;
      if (reviewOK && reviewOK.trim() !== 'Sin retroalimentación') {
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
    console.log(`Error final en revisión del archivo ${fileName}: ${error.message}`);
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

  // Verificar tamaño del diff
  const diffSizeKB = Buffer.byteLength(fullPRDiff, 'utf8') / 1024;
  console.log(`Tamaño del diff del PR #${prNumber}: ${diffSizeKB.toFixed(2)} KB`);

  // Determinar si necesitamos particionar
  const needsPartitioning = diffSizeKB > 50; // 50KB como límite
  let reviewResults: string[] = [];
  let totalTokenUsage = {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0
  };

  let baseInstructions: string;
  if (prompt === null || prompt === '' || prompt === undefined) {
    // Usar instrucciones por defecto
    baseInstructions = `
    Eres un asistente especializado en ingeniería de software, actuando como revisor de código para Pull Requests (PRs).

    **Objetivo Principal:**
    Tu misión es analizar los cambios de código proporcionados y brindar retroalimentación constructiva para **mejorar la salud general del código**, garantizando calidad, mantenibilidad, rendimiento y seguridad. La retroalimentación debe ser técnica, didáctica, enfocada en el código (no en el autor) y explicar claramente el *razonamiento* detrás de cada punto planteado.

    **Instrucciones Detalladas para la Revisión:**
    1. **Diseño y Arquitectura**
    2. **Funcionalidad y Corrección**
    3. **Legibilidad y Mantenibilidad**
    4. **Rendimiento**
    5. **Seguridad**
    6. **Pruebas**
    7. **Documentación**

    **Instrucciones Adicionales:**
    ${
      additionalPrompts && additionalPrompts.length > 0 ? additionalPrompts
            .map((str) => `- ${str.trim()}`)
            .filter(Boolean)
            .join('\n')
        : ''
    }

    **Formato de la Salida:**
    * Presenta la retroalimentación de forma clara y estructurada
    * Para cada punto, indica el archivo y la línea relevante, si es aplicable
    * Agrupa problemas por tipo: Crítico, Importante, Sugerencias
    * Si no se identifica ningún problema significativo, responde: Sin retroalimentación
    `;
  } else {
    // Usar prompt personalizado del usuario
    baseInstructions = prompt;
  }

  // Agregar contexto sobre si es un chunk o PR completo
  let instructions: string;
  if (needsPartitioning) {
    instructions = `${baseInstructions}

**CONTEXTO IMPORTANTE:** Estás analizando una SECCIÓN de un Pull Request más grande que fue dividido en partes debido a su tamaño. Enfócate en los problemas específicos de esta sección, pero ten en cuenta que es parte de un cambio más amplio. Si no encuentras problemas significativos en esta sección, responde: "Sin problemas en esta sección"`;
  } else {
    instructions = `${baseInstructions}

**CONTEXTO:** Estás analizando el Pull Request completo en una sola revisión. Considera el impacto general de todos los cambios en conjunto.`;
  }

  try {
    let parsedTokenMax = parseInt(tokenMax || '500');
    let parsedTemperature = parseFloat(temperature || '0');

    if (tokenMax === undefined || tokenMax === '') {
      parsedTokenMax = 500;
      console.log(`tokenMax establecido en 500 para revisión completa.`);
    }
    
    if (temperature === undefined || temperature === '' || parsedTemperature > 2) {
      parsedTemperature = 0;
      console.log(`temperatura establecida en 0.`);
    }

    if (needsPartitioning) {
      console.log(`PR demasiado grande (${diffSizeKB.toFixed(2)} KB). Particionando en chunks...`);
      
      // Dividir el diff en chunks
      const chunks = splitDiffIntoChunks(fullPRDiff, 30000); // 30KB por chunk
      console.log(`Diff dividido en ${chunks.length} chunks`);

      // Procesar cada chunk con delay
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkSizeKB = Buffer.byteLength(chunk, 'utf8') / 1024;
        
        console.log(`Procesando chunk ${i + 1}/${chunks.length} (${chunkSizeKB.toFixed(2)} KB)...`);

        try {
          const requestBody = {
            max_tokens: Math.floor(parsedTokenMax / chunks.length) + 100, // Distribuir tokens
            temperature: parsedTemperature,
            messages: [
              {
                role: 'user',
                content: `${instructions}

**INFORMACIÓN DE LA SECCIÓN:**
- Sección: ${i + 1} de ${chunks.length}
- PR: #${prNumber}
- Tamaño de esta sección: ${chunkSizeKB.toFixed(2)} KB
- Tamaño total del PR: ${diffSizeKB.toFixed(2)} KB

**CÓDIGO A REVISAR:**
\`\`\`diff
${chunk}
\`\`\``,
              },
            ],
          };

          // Delay progresivo para evitar rate limits (5s, 8s, 12s, etc.)
          const delay = i === 0 ? 0 : 5000 + (i * 3000);
          const response = await makeRequestWithRetryAndDelay(aoiEndpoint, apiKey, requestBody, agent, delay);

          if (response && response.choices && response.choices.length > 0) {
            const chunkReview = response.choices[0].message?.content as string;
            if (chunkReview && !chunkReview.includes('Sin problemas en esta sección') && chunkReview.trim() !== 'Sin retroalimentación') {
              reviewResults.push(`**Sección ${i + 1}/${chunks.length}:**\n${chunkReview}`);
            }

            // Acumular uso de tokens
            if (response.usage) {
              totalTokenUsage.completion_tokens += response.usage.completion_tokens || 0;
              totalTokenUsage.prompt_tokens += response.usage.prompt_tokens || 0;
              totalTokenUsage.total_tokens += response.usage.total_tokens || 0;
            }
          }

          console.log(`Chunk ${i + 1}/${chunks.length} procesado exitosamente`);

        } catch (chunkError: any) {
          console.log(`Error procesando chunk ${i + 1}: ${chunkError.message}`);
          if (chunkError.message.includes('Rate limit exceeded')) {
            console.log(`Rate limit en chunk ${i + 1}. Saltando este chunk...`);
            continue;
          }
        }
      }

      // Consolidar resultados
      if (reviewResults.length > 0) {
        const consolidatedReview = `**Revisión Completa del PR #${prNumber} (Análisis por Secciones)**

**Información del Análisis:**
- **Tamaño del PR:** ${diffSizeKB.toFixed(2)} KB
- **Secciones analizadas:** ${chunks.length}
- **Secciones con comentarios:** ${reviewResults.length}

---

${reviewResults.join('\n\n---\n\n')}

---

**Nota:** Este PR fue dividido automáticamente en ${chunks.length} secciones para su análisis debido a su gran tamaño. Cada sección fue revisada independientemente para proporcionar retroalimentación detallada.`;

        await addCommentToPR(`**Revisión Completa del PR #${prNumber}**`, consolidatedReview, agent);
        console.log(`Revisión completa particionada del PR #${prNumber} finalizada con ${reviewResults.length} secciones con comentarios.`);
      } else {
        const noIssuesReview = `**Revisión Completa del PR #${prNumber} (Análisis por Secciones)**

**Información del Análisis:**
- **Tamaño del PR:** ${diffSizeKB.toFixed(2)} KB
- **Secciones analizadas:** ${chunks.length}
- **Resultado:** Sin problemas significativos encontrados

**Resultado:** No se identificaron problemas significativos en ninguna de las ${chunks.length} secciones analizadas.

**Nota:** Este PR fue dividido automáticamente en secciones para su análisis debido a su gran tamaño.`;

        await addCommentToPR(`**Revisión Completa del PR #${prNumber}**`, noIssuesReview, agent);
        console.log(`No se encontraron problemas significativos en ninguna sección del PR #${prNumber}.`);
      }

    } else {
      // Proceso normal para PRs pequeños
      console.log(`PR de tamaño normal (${diffSizeKB.toFixed(2)} KB). Procesando como un solo bloque...`);
      
      const requestBody = {
        max_tokens: parsedTokenMax,
        temperature: parsedTemperature,
        messages: [
          {
            role: 'user',
            content: `${instructions}

**INFORMACIÓN DEL PULL REQUEST:**
- PR: #${prNumber}
- Tamaño total: ${diffSizeKB.toFixed(2)} KB
- Análisis: Revisión completa en una sola operación

**CÓDIGO A REVISAR:**
\`\`\`diff
${fullPRDiff}
\`\`\``,
          },
        ],
      };

      const response = await makeRequestWithRetryAndDelay(aoiEndpoint, apiKey, requestBody, agent, 0);

      if (response && response.choices && response.choices.length > 0) {
        const reviewOK = response.choices[0].message?.content as string;
        if (reviewOK && reviewOK.trim() !== 'Sin retroalimentación') {
          await addCommentToPR(`**Revisión Completa del PR #${prNumber}**`, reviewOK, agent);
        }
        console.log(`Revisión completa del PR #${prNumber} finalizada.`);

        // Capturar uso de tokens
        if (response.usage) {
          totalTokenUsage = response.usage;
        }
      } else {
        console.log(`Ninguna retroalimentación encontrada para el PR #${prNumber} completo.`);
      }
    }

    // Logging de consumo total de tokens
    if (totalTokenUsage.total_tokens > 0) {
      const prConsumeApi = `PR #${prNumber} - Uso Total: Completaciones: ${totalTokenUsage.completion_tokens}, Prompts: ${totalTokenUsage.prompt_tokens}, Total: ${totalTokenUsage.total_tokens}`;
      console.log(prConsumeApi);

      if (consumeApi) {
        consumeApi += `\n${prConsumeApi}`;
      } else {
        consumeApi = prConsumeApi;
      }
    }

  } catch (error: any) {
    console.log(`Error en revisión completa del PR #${prNumber}: ${error.message}`);
    if (error.response) {
      console.log(`Error response status: ${error.response.status}`);
      console.log(`Error response data: ${JSON.stringify(error.response.data)}`);
    }
  }
}