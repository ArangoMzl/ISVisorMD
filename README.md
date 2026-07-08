# ISVisorMD

Visor de Markdown estático para InSoft, pensado para revisar la estructura de archivos `.md` grandes (hasta ~5 MB / ~1.500 encabezados) generados al convertir la ayuda en línea de ContaPyme® de HTML a Markdown.

## Características

- **100 % client-side**: el archivo se procesa en tu navegador. Nunca se sube a un servidor.
- **Cero dependencias**: HTML5 + CSS3 + JavaScript vanilla. Sin frameworks, sin `npm`, sin build.
- **Multi-archivo**: carga varios `.md` y cambia entre ellos con pestañas, conservando el estado de cada árbol.
- **Árbol colapsable**: jerarquía H1–H6 con número de línea.
- **Búsqueda en vivo**: filtra por texto del encabezado, resalta coincidencias y expande automáticamente los ancestros necesarios.
- **Validaciones automáticas** con badges verde/rojo/naranja:
  - El archivo inicia con `#` "Acerca del módulo".
  - Todos los H1 inician con "Acerca del módulo".
  - 0 encabezados Setext (no confundidos con delimitadores de tabla).
  - H2 dentro del set permitido (Catálogos, Configuraciones, Funciones, Operaciones, Componentes) — **advertencia**, no error.
  - 0 `##### Campo:` huérfanos (sin ancestro).
  - Hojas sin contenido bajo ellas — **advertencia** para revisión manual.
- **Estadísticas** por nivel (H1–H6) + nombre y tamaño del archivo.
- **Exportar** el árbol como texto plano indentado al portapapeles.

## Uso local

1. Clonar o descargar este repositorio.
2. Abrir `index.html` en cualquier navegador moderno (Chrome, Edge, Firefox, Safari).
3. Arrastrar uno o varios archivos `.md` al área de carga, o hacer clic en **Seleccionar archivos**.

No requiere servidor. Funciona desde el sistema de archivos local (`file://`).

## Despliegue en GitHub Pages

1. Empujar el repositorio a la organización de InSoft en GitHub.
2. **Settings → Pages → Deploy from a branch → Branch: `main` / Folder: `/ (root)`**.
3. Esperar ~1 minuto. La URL pública quedará en `https://<organizacion>.github.io/ISVisorMD/`.

> **Importante:** GitHub Pages sobre repositorios **privados** requiere plan **GitHub Team o Enterprise**. Si la organización no tiene ese plan, el repositorio deberá ser público. La herramienta en sí no incluye archivos de ayuda de ContaPyme® — el usuario carga sus propios `.md` localmente y nada sale del navegador, por lo que el riesgo de公開 es bajo. Confirmar con el equipo de TI antes de elegir visibilidad.

Sin pipeline de build, sin GitHub Actions, sin configuración adicional.

## Stack

- HTML5
- CSS3 (sin preprocesadores, sin Tailwind)
- JavaScript ES2020+ (sin frameworks, sin TypeScript)
- Sin dependencias externas (cero `npm install`)

## Estructura

```
ISVisorMD/
├── index.html
├── assets/
│   ├── estilos.css
│   └── app.js
└── README.md
```

## Privacidad

ISVisorMD no envía datos a ningún servidor. Todo el procesamiento — parseo, validación, render, exportación — ocurre en el navegador del usuario. Los archivos `.md` cargados nunca abandonan tu equipo.

## Reglas de validación implementadas

| # | Regla | Severidad |
|---|---|---|
| 1 | El archivo inicia con `#` cuyo texto comienza con "Acerca del módulo" | Pass / Fail |
| 2 | Todos los `#` de nivel 1 inician con "Acerca del módulo" | Pass / Fail |
| 3 | 0 encabezados Setext (no son delimitadores de tabla) | Pass / Fail |
| 4 | H2 dentro del set permitido (Catálogos, Configuraciones, Funciones, Operaciones, Componentes) | Pass / **Warn** |
| 5 | 0 `##### Campo:` sin ancestro | Pass / Fail |
| 6 | Hojas sin contenido (revisar manualmente) | Pass / **Warn** |

## Configuración

Las constantes editables están al inicio de `assets/app.js` (`CONFIG`):

```js
const CONFIG = Object.freeze({
  allowedH2:   ['Catálogos', 'Configuraciones', 'Funciones', 'Operaciones', 'Componentes'],
  prefixH1:    'Acerca del módulo',
  prefixCampo: 'Campo:',
  initialExpandLevel: 1, // H1 desplegados al cargar
});
```

## Licencia

Uso interno de InSoft.
