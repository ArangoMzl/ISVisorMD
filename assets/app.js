/* ============================================================
 * ISVisorMD — aplicación principal
 * Visor estático de Markdown para InSoft. Vanilla JS, sin deps.
 * ============================================================ */
(() => {
  'use strict';

  // ============================================================
  // Configuración (constantes editables)
  // ============================================================
  const CONFIG = Object.freeze({
    allowedH2:   ['Catálogos', 'Configuraciones', 'Funciones', 'Operaciones', 'Componentes'],
    prefixH1:    'Acerca del módulo',
    prefixCampo: 'Campo:',
    initialExpandLevel: 1, // H1 desplegados por defecto
  });

  // ============================================================
  // Estado
  // ============================================================
  const state = {
    files: new Map(),   // name -> FileData
    active: null,       // nombre del archivo activo
  };

  // ============================================================
  // Utilidades
  // ============================================================
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlight(text, term) {
    const safe = escapeHtml(text);
    if (!term) return safe;
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(safeTerm, 'gi'), m => `<mark>${m}</mark>`);
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    const decimals = n >= 100 || i === 0 ? 0 : 1;
    return `${n.toFixed(decimals)} ${units[i]}`;
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  const $  = (sel, root = document) => root.querySelector(sel);

  // ============================================================
  // Parser
  // ------------------------------------------------------------
  // Reconoce encabezados ATX (# … ######) y reporta (sin
  // incluirlos en el árbol) encabezados Setext (=, -) que no
  // sean delimitadores de tabla. Ignora contenido dentro de
  // bloques de código delimitados por ``` o ~~~.
  // ============================================================
  function parseMarkdown(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r?\n/);
    const headings = [];
    const setextIssues = [];
    let inCodeBlock = false;
    let codeFence = null;
    let prevNonEmpty = null; // { line, text }
    let idCounter = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      // Toggle de bloque de código
      const fence = trimmed.match(/^(`{3,}|~{3,})/);
      if (fence) {
        const ch = fence[1][0];
        if (!inCodeBlock) { inCodeBlock = true; codeFence = ch; }
        else if (ch === codeFence) { inCodeBlock = false; codeFence = null; }
        prevNonEmpty = null;
        continue;
      }
      if (inCodeBlock) continue;

      // Setext: línea anterior no vacía + esta línea es solo = o -
      if (prevNonEmpty !== null) {
        if (/^ {0,3}={2,}\s*$/.test(trimmed)) {
          if (!trimmed.includes('|')) {
            setextIssues.push({
              line: i + 1,
              textLine: prevNonEmpty.line,
              text: prevNonEmpty.text,
              type: 'h1',
            });
          }
          prevNonEmpty = null;
          continue;
        }
        if (/^ {0,3}-{2,}\s*$/.test(trimmed)) {
          if (!trimmed.includes('|')) {
            setextIssues.push({
              line: i + 1,
              textLine: prevNonEmpty.line,
              text: prevNonEmpty.text,
              type: 'h2',
            });
          }
          prevNonEmpty = null;
          continue;
        }
      }

      // ATX (# … ######)
      const atx = raw.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
      if (atx) {
        headings.push({
          id: 'n' + (idCounter++),
          level: atx[1].length,
          text: atx[2].trim(),
          line: i + 1,
        });
        prevNonEmpty = null;
        continue;
      }

      // Texto normal (para tracking de Setext)
      if (trimmed !== '') {
        prevNonEmpty = { line: i + 1, text: trimmed };
      } else {
        prevNonEmpty = null;
      }
    }

    return { lines, headings, setextIssues, lineCount: lines.length };
  }

  // Construye árbol a partir de encabezados planos (algoritmo de pila).
  function buildTree(headings) {
    const root = { id: '__root__', level: 0, text: '', line: 0, children: [] };
    const stack = [root];

    for (const h of headings) {
      while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      const node = { ...h, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    return root.children;
  }

  // ============================================================
  // Validaciones
  // ============================================================
  function validate(parsed) {
    const { lines, headings, setextIssues, lineCount } = parsed;
    const tree = buildTree(headings);
    const results = [];

    // Regla 1 — primer encabezado es # "Acerca del módulo"
    const first = headings[0];
    const r1 = !headings.length
      ? { status: 'skip', detail: 'No hay encabezados en el archivo.' }
      : (first.level === 1 && first.text.startsWith(CONFIG.prefixH1)
          ? { status: 'pass', detail: `Línea ${first.line}: "${first.text}"` }
          : { status: 'fail', detail: `Primer encabezado (L${first.line}): "${first.text}"` });
    results.push({ id: 'starts-with-modulo', label: 'Inicia con # "Acerca del módulo"', ...r1 });

    // Regla 2 — todos los H1 inician con el prefijo
    const h1s = headings.filter(h => h.level === 1);
    const badH1 = h1s.filter(h => !h.text.startsWith(CONFIG.prefixH1));
    results.push({
      id: 'all-h1-prefix',
      label: 'Todos los # inician con "Acerca del módulo"',
      status: !h1s.length ? 'skip' : (badH1.length === 0 ? 'pass' : 'fail'),
      detail: !h1s.length
        ? 'No hay encabezados H1.'
        : (badH1.length === 0
            ? `${h1s.length} encabezado(s) H1 verificado(s).`
            : `${badH1.length} fuera de patrón: ${badH1.slice(0, 3).map(h => `"${truncate(h.text, 40)}" (L${h.line})`).join('; ')}${badH1.length > 3 ? '…' : ''}`),
    });

    // Regla 3 — 0 encabezados Setext
    results.push({
      id: 'no-setext',
      label: '0 encabezados Setext (no son delimitadores de tabla)',
      status: setextIssues.length === 0 ? 'pass' : 'fail',
      detail: setextIssues.length === 0
        ? 'No se detectaron encabezados Setext.'
        : `${setextIssues.length} detectado(s): ${setextIssues.slice(0, 3).map(s => `L${s.line}`).join(', ')}${setextIssues.length > 3 ? '…' : ''}`,
    });

    // Regla 4 — H2 dentro del set permitido (advertencia, no error)
    const h2s = headings.filter(h => h.level === 2);
    const badH2 = h2s.filter(h => !CONFIG.allowedH2.some(name => h.text.trim().startsWith(name)));
    results.push({
      id: 'h2-allowed',
      label: 'H2 dentro del set permitido (advertencia)',
      status: !h2s.length ? 'skip' : (badH2.length === 0 ? 'pass' : 'warn'),
      detail: !h2s.length
        ? 'No hay encabezados H2.'
        : (badH2.length === 0
            ? `${h2s.length} H2 verificado(s).`
            : `${badH2.length} H2 fuera: ${badH2.slice(0, 3).map(h => `"${truncate(h.text, 30)}" (L${h.line})`).join('; ')}${badH2.length > 3 ? '…' : ''}`),
    });

    // Regla 5 — 0 "##### Campo:" huérfanos
    const orphans = [];
    (function walk(nodes, parentLevel) {
      for (const n of nodes) {
        if (n.level === 5 && n.text.startsWith(CONFIG.prefixCampo) && parentLevel === 0) {
          orphans.push(n);
        }
        walk(n.children, n.level);
      }
    })(tree, 0);
    results.push({
      id: 'campo-orphan',
      label: '0 "##### Campo:" sin ancestros',
      status: orphans.length === 0 ? 'pass' : 'fail',
      detail: orphans.length === 0
        ? 'Sin "Campo:" huérfanos.'
        : `${orphans.length} huérfano(s): ${orphans.slice(0, 3).map(h => `L${h.line}`).join(', ')}${orphans.length > 3 ? '…' : ''}`,
    });

    // Regla 6 — hojas sin contenido bajo ellas
    const emptyLeaves = findEmptyLeaves(headings, lines);
    results.push({
      id: 'empty-leaves',
      label: 'Hojas sin contenido (revisar manualmente)',
      status: emptyLeaves.length === 0 ? 'pass' : 'warn',
      detail: emptyLeaves.length === 0
        ? 'Todas las hojas tienen contenido bajo ellas.'
        : `${emptyLeaves.length} hoja(s) posiblemente vacía(s): ${emptyLeaves.slice(0, 3).map(h => `"${truncate(h.text, 30)}" (L${h.line})`).join('; ')}${emptyLeaves.length > 3 ? '…' : ''}`,
    });

    return { results, tree };
  }

  function findEmptyLeaves(headings, lines) {
    const empties = [];
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const hasChildren = i < headings.length - 1 && headings[i + 1].level > h.level;
      if (hasChildren) continue; // no es hoja

      // Encuentra el siguiente encabezado de nivel <= h.level
      let endLine = lines.length;
      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= h.level) {
          endLine = headings[j].line - 1;
          break;
        }
      }
      // ¿Hay contenido no vacío entre la línea del encabezado y endLine?
      let hasContent = false;
      for (let l = h.line; l <= endLine && l < lines.length; l++) {
        if (lines[l].trim() !== '') { hasContent = true; break; }
      }
      if (!hasContent) empties.push(h);
    }
    return empties;
  }

  // ============================================================
  // Datos de archivo
  // ============================================================
  function createFileData(name, size, text) {
    const parsed = parseMarkdown(text);
    const { results, tree } = validate(parsed);
    return {
      name, size, text, parsed,
      validations: results,
      tree,
      expanded: new Set(collectIds(tree, CONFIG.initialExpandLevel)),
      searchTerm: '',
    };
  }

  function collectIds(nodes, maxLevel) {
    const ids = [];
    for (const n of nodes) {
      if (n.level <= maxLevel) ids.push(n.id);
      if (n.children.length) ids.push(...collectIds(n.children, maxLevel));
    }
    return ids;
  }

  // ============================================================
  // Renderers
  // ============================================================
  function getActive() {
    return state.active ? state.files.get(state.active) : null;
  }

  function renderTabs() {
    const list = $('#file-tabs');
    const card = $('#file-tabs-card');
    if (state.files.size === 0) { card.hidden = true; return; }
    card.hidden = false;
    const parts = [];
    for (const [name, fd] of state.files) {
      const active = name === state.active ? ' active' : '';
      parts.push(
        `<li class="file-tab${active}" data-name="${escapeHtml(name)}" role="tab" aria-selected="${active ? 'true' : 'false'}">
           <span class="file-tab-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
           <button class="file-tab-close" data-close="${escapeHtml(name)}" type="button" title="Cerrar" aria-label="Cerrar ${escapeHtml(name)}">×</button>
         </li>`
      );
    }
    list.innerHTML = parts.join('');
  }

  function renderTree() {
    const container = $('#tree');
    const fd = getActive();
    if (!fd) {
      container.innerHTML = '<p class="empty-state">Carga uno o varios archivos <code>.md</code> para ver el árbol de encabezados.</p>';
      return;
    }
    if (fd.parsed.headings.length === 0) {
      container.innerHTML = '<p class="empty-state">El archivo no contiene encabezados.</p>';
      return;
    }
    const term = fd.searchTerm.trim();
    const html = renderNodes(fd.tree, term, fd);
    container.innerHTML = html || '<p class="empty-state">Sin coincidencias para la búsqueda actual.</p>';
  }

  function renderNodes(nodes, term, fd) {
    const lowerTerm = term.toLowerCase();
    const hasTerm = lowerTerm.length > 0;
    let html = '';

    for (const n of nodes) {
      if (hasTerm) {
        // Modo búsqueda: filtrar y mostrar siempre expandido
        const filteredChildren = n.children.length
          ? filterTree(n.children, lowerTerm)
          : [];
        const selfMatch = n.text.toLowerCase().includes(lowerTerm);
        if (!selfMatch && filteredChildren.length === 0) continue;

        html += renderNodeHtml(n, term, true, true);
        if (filteredChildren.length) {
          html += `<div class="tree-children">${renderNodes(filteredChildren, term, fd)}</div>`;
        }
      } else {
        // Modo normal: respetar expand/collapse
        const isExpanded = fd.expanded.has(n.id);
        html += renderNodeHtml(n, '', isExpanded, false);
        if (n.children.length && isExpanded) {
          html += `<div class="tree-children">${renderNodes(n.children, term, fd)}</div>`;
        }
      }
    }
    return html;
  }

  function renderNodeHtml(n, term, isExpanded, isInSearch) {
    const hasChildren = n.children.length > 0;
    const toggleChar = !hasChildren ? '' : (isExpanded ? '▾' : '▸');
    const toggleClass = hasChildren ? 'tree-toggle' : 'tree-toggle empty';
    const textHtml = isInSearch
      ? highlight(n.text, n.text.toLowerCase().includes(term.toLowerCase()) ? term : '')
      : escapeHtml(n.text);
    return `
      <div class="tree-node" data-id="${n.id}">
        <div class="tree-row level-${n.level}">
          <span class="${toggleClass}" data-toggle="${n.id}" role="button" aria-label="Expandir/colapsar" tabindex="0">${toggleChar}</span>
          <span class="tree-level">H${n.level}</span>
          <span class="tree-text" title="${escapeHtml(n.text)}">${textHtml}</span>
          <span class="tree-line">L${n.line}</span>
        </div>
      </div>
    `;
  }

  function filterTree(nodes, lowerTerm) {
    const out = [];
    for (const n of nodes) {
      const selfMatch = n.text.toLowerCase().includes(lowerTerm);
      const filteredChildren = n.children.length ? filterTree(n.children, lowerTerm) : [];
      if (selfMatch || filteredChildren.length) {
        out.push({ ...n, children: filteredChildren });
      }
    }
    return out;
  }

  function renderValidations() {
    const list = $('#validations');
    const fd = getActive();
    if (!fd) {
      list.innerHTML = '<li class="muted validations-empty">Carga un archivo para ejecutar las validaciones.</li>';
      return;
    }
    const icons = { pass: '✓', fail: '✗', warn: '!', skip: '–' };
    list.innerHTML = fd.validations.map(v => `
      <li class="validation ${v.status}">
        <span class="validation-icon" aria-label="${v.status}">${icons[v.status] || '–'}</span>
        <div class="validation-body">
          <div class="validation-label">${escapeHtml(v.label)}</div>
          <div class="validation-detail">${escapeHtml(v.detail)}</div>
        </div>
      </li>
    `).join('');
  }

  function renderStats() {
    const fd = getActive();
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const $file = $('#stat-file');
    const $size = $('#stat-size');
    if (fd) {
      $file.textContent = fd.name;
      $file.classList.remove('muted');
      $size.textContent = formatBytes(fd.size);
      $size.classList.remove('muted');
      for (const h of fd.parsed.headings) counts[h.level] = (counts[h.level] || 0) + 1;
    } else {
      $file.textContent = '—';
      $file.classList.add('muted');
      $size.textContent = '—';
      $size.classList.add('muted');
    }
    $('#stat-total').textContent = fd ? fd.parsed.headings.length : 0;
    for (let i = 1; i <= 6; i++) $('#stat-h' + i).textContent = counts[i];
  }

  function renderAll() {
    renderTabs();
    renderTree();
    renderValidations();
    renderStats();
  }

  // ============================================================
  // Acciones
  // ============================================================
  function setActive(name) {
    if (!state.files.has(name)) return;
    state.active = name;
    $('#search').value = state.files.get(name).searchTerm;
    renderAll();
  }

  function closeFile(name) {
    if (!state.files.has(name)) return;
    state.files.delete(name);
    if (state.active === name) {
      state.active = state.files.size > 0 ? state.files.keys().next().value : null;
      $('#search').value = state.active ? state.files.get(state.active).searchTerm : '';
    }
    renderAll();
  }

  function clearAll() {
    if (state.files.size === 0) return;
    if (!confirm('¿Cerrar todos los archivos cargados?')) return;
    state.files.clear();
    state.active = null;
    $('#search').value = '';
    renderAll();
  }

  async function loadFiles(fileList) {
    const files = Array.from(fileList).filter(f =>
      /\.(md|markdown|txt)$/i.test(f.name) ||
      /text\/(markdown|plain)/.test(f.type)
    );
    if (files.length === 0) {
      alert('Por favor selecciona archivos .md, .markdown o .txt.');
      return;
    }
    const errors = [];
    for (const f of files) {
      try {
        const text = await f.text();
        const fd = createFileData(f.name, f.size, text);
        state.files.set(f.name, fd);
      } catch (err) {
        errors.push(`${f.name}: ${err.message || err}`);
      }
    }
    if (errors.length) alert('Algunos archivos no se pudieron leer:\n' + errors.join('\n'));
    if (!state.active && state.files.size > 0) {
      state.active = state.files.keys().next().value;
    }
    $('#search').value = state.active ? state.files.get(state.active).searchTerm : '';
    renderAll();
  }

  function exportTree() {
    const fd = getActive();
    const hint = $('#export-hint');
    if (!fd || fd.parsed.headings.length === 0) {
      hint.textContent = 'No hay árbol para exportar.';
      return;
    }
    const lines = [];
    function walk(nodes, depth) {
      for (const n of nodes) {
        lines.push(`${'  '.repeat(depth)}${n.text} (L${n.line})`);
        walk(n.children, depth + 1);
      }
    }
    walk(fd.tree, 0);
    const text = lines.join('\n');

    const onOk  = () => { hint.textContent = `Copiado: ${lines.length} líneas al portapapeles.`; };
    const onErr = () => { hint.textContent = 'No se pudo copiar. Revisa los permisos del navegador.'; };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onOk, onErr);
    } else {
      // Fallback para contextos sin Clipboard API (file:// en algunos navegadores)
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? onOk() : onErr();
      } catch (e) { onErr(); }
    }
  }

  // ============================================================
  // Inicialización y eventos
  // ============================================================
  function init() {
    // Input de archivos
    $('#file-input').addEventListener('change', e => {
      loadFiles(e.target.files);
      e.target.value = '';
    });

    // Drag & drop
    const dz = $('#drop-zone');
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
      dz.addEventListener(ev, stop);
    });
    ['dragenter', 'dragover'].forEach(ev => {
      dz.addEventListener(ev, () => dz.classList.add('dragover'));
    });
    ['dragleave', 'drop'].forEach(ev => {
      dz.addEventListener(ev, () => dz.classList.remove('dragover'));
    });
    dz.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        loadFiles(e.dataTransfer.files);
      }
    });
    // Evitar que el navegador abra el archivo al soltarlo fuera de la zona
    ['dragover', 'drop'].forEach(ev => {
      window.addEventListener(ev, e => { e.preventDefault(); }, false);
    });

    // Click en el drop-zone abre el selector
    dz.addEventListener('click', e => {
      if (e.target.closest('label')) return; // el label ya abre el picker
      $('#file-input').click();
    });
    dz.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $('#file-input').click();
      }
    });

    // Tabs: cambio de archivo y cierre
    $('#file-tabs').addEventListener('click', e => {
      const closeBtn = e.target.closest('.file-tab-close');
      if (closeBtn) {
        e.stopPropagation();
        closeFile(closeBtn.dataset.close);
        return;
      }
      const tab = e.target.closest('.file-tab');
      if (tab) setActive(tab.dataset.name);
    });

    // Cerrar todo
    $('#btn-clear-all').addEventListener('click', clearAll);

    // Buscador en vivo (debounced)
    const onSearch = debounce(() => {
      const fd = getActive();
      if (!fd) return;
      fd.searchTerm = $('#search').value;
      renderTree();
    }, 120);
    $('#search').addEventListener('input', onSearch);

    // Expandir / colapsar todo
    $('#btn-expand-all').addEventListener('click', () => {
      const fd = getActive();
      if (!fd) return;
      fd.expanded = new Set(collectIds(fd.tree, 6));
      fd.searchTerm = '';
      $('#search').value = '';
      renderTree();
    });
    $('#btn-collapse-all').addEventListener('click', () => {
      const fd = getActive();
      if (!fd) return;
      fd.expanded = new Set();
      renderTree();
    });

    // Toggle de expand/collapse (delegado)
    $('#tree').addEventListener('click', e => {
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      const fd = getActive();
      if (!fd) return;
      const id = t.dataset.toggle;
      if (fd.expanded.has(id)) fd.expanded.delete(id);
      else fd.expanded.add(id);
      renderTree();
    });
    $('#tree').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      e.preventDefault();
      const fd = getActive();
      if (!fd) return;
      const id = t.dataset.toggle;
      if (fd.expanded.has(id)) fd.expanded.delete(id);
      else fd.expanded.add(id);
      renderTree();
    });

    // Exportar
    $('#btn-export').addEventListener('click', exportTree);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
