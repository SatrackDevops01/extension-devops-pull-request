# Uso de modelo OpenAI GPT para revisar pull requests (PR) en Azure DevOps

Tarea de Azure DevOps que agrega comentarios a las solicitudes de Pull Request con la ayuda de GPT.

## Instalación

La instalación se puede realizar utilizando el [Visual Studio MarketPlace](https://marketplace.visualstudio.com/items?itemName=SatrackSAS.pull-request-reviewer).

## Servicio Azure Open AI

El formato del endpoint es el siguiente: https://{XXXXXXXX}.openai.azure.com/openai/deployments/{MODEL_NAME}/chat/completions?api-version={API_VERSION}

[Documentacion API REST](https://learn.microsoft.com/es-mx/azure/ai-foundry/openai/reference).

### Da permiso al agente de servicio de compilación

Antes de usar esta task, verifique de que el servicio de compilación tenga permisos para contribuir en su REPOSITORIO:

![contribute_to_pr](https://github.com/SatrackDevops01/extension-devops-pull-request/blob/main/images/contribute_to_pr.png?raw=true)

### Permitir que la tarea acceda al token del sistema

Agregue una sección de checkout con persistCredentials establecido en true.

#### Pipelines Yaml

Se debe crear un pipeline usando el siguiente yaml:

```yaml
jobs:
- job:
  displayName: "code review"
  pool:
    vmImage: ubuntu-latest 
 
  steps:
  - checkout: self
    persistCredentials: true

  - task: pull-request-reviewer@1
    displayName: GPTPullRequestReview
    inputs:
      api_key: 'TU_TOKEN'
      model: 'gpt-4o-mini' # Puede ser cualquier modelo
      aoi_endpoint: 'https://{XXXXXXXX}.azure.com/openai/deployments/{MODEL_NAME}/chat/completions?api-version={API_VERSION}'
      aoi_tokenMax: 1000
      aoi_temperature: 0
      use_https: true
      prompt: 'Opcional. Ahora, si lo deseas, puedes crear tu propio prompt, por ejemplo: Actúa como revisor de código de una solicitud de pull, proporcionando retroalimentación sobre posibles errores y problemas de buenas prácticas de código.\nRecibirás los cambios de la solicitud de pull en formato patch.\nCada entrada de patch tiene el mensaje de confirmación en la línea de asunto, seguido por los cambios de código (diffs) en formato unidiff.\n\nComo revisor de código, tu tarea es:\n- Revisar solo las líneas añadidas, editadas o eliminadas.\n- Si no hay errores y los cambios son correctos, escribe únicamente 'Sin comentarios'.\n- Si hay errores o cambios de código incorrectos, no escribas 'Sin comentarios'.'
      file_excludes: 'file1.js,file2.py,secret.txt,*.csproj,src/**/*.csproj'
      additional_prompts: 'Opcional. Prompt adicional separado por coma, ejemplo: corrige la nomenclatura de variables, garantiza indentación consistente, revisa el enfoque de manejo de errores',
      analysis_mode: 'file' o 'global' # Requerido, modo de analisis que genera un feedback por archivo o un feedback global respectivamente
```

Luego, en la rama donde se desea ejecutar la tarea, se debe agregar en la seccion de build validation, la ejecucion del pipeline creado, asi:

- En DevOps, editar politicas de rama
![rama](https://github.com/SatrackDevops01/extension-devops-pull-request/blob/main/images/branch_policies_1.png?raw=true)

- En la seccion build validation, agregar policie:
![build_validation](https://github.com/SatrackDevops01/extension-devops-pull-request/blob/main/images/branch_policies_2.png?raw=true)

- Seleccionar el pipeline creado:
![select_pipeline](https://github.com/SatrackDevops01/extension-devops-pull-request/blob/main/images/branch_policies_3.png?raw=true)

### Nota

Se deben solucionar primero conflictos en el repo si los hay para que se ejecute el pipeline.

## License

[MIT](https://raw.githubusercontent.com/mlarhrouch/azure-pipeline-gpt-pr-review/main/LICENSE)

## Plus

[Devops Publish](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops)
