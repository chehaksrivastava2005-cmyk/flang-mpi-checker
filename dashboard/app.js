/* ================================================================
   mpicheck Dashboard — Interactive App
   Page navigation + Workspace + Create/Edit + Auto-Fix + Charts
   ================================================================ */

// ── DOM refs ──────────────────────────────────────────────────────
const statsGrid       = document.getElementById('statsGrid');
const rulesGrid       = document.getElementById('rulesGrid');
const resultsBody     = document.getElementById('resultsBody');
const workflowGrid    = document.getElementById('workflowGrid');
const evaluationGrid  = document.getElementById('evaluationGrid');
const diagnosticsList = document.getElementById('diagnosticsList');
const themeToggle     = document.getElementById('themeToggle');

// Workspace DOM
const fileTree        = document.getElementById('fileTree');
const codeArea        = document.getElementById('codeArea');
const editArea        = document.getElementById('editArea');
const editorFileName  = document.getElementById('editorFileName');
const editorFileInfo  = document.getElementById('editorFileInfo');
const terminalOutput  = document.getElementById('terminalOutput');
const terminalStatus  = document.getElementById('terminalStatus');
const btnRunFile      = document.getElementById('btnRunFile');
const btnRunTests     = document.getElementById('btnRunTests');
const btnClearTerminal = document.getElementById('btnClearTerminal');
const btnRefreshFiles = document.getElementById('btnRefreshFiles');
const btnNewFile      = document.getElementById('btnNewFile');
const btnEditMode     = document.getElementById('btnEditMode');
const btnSaveFile     = document.getElementById('btnSaveFile');
const btnAutoFix      = document.getElementById('btnAutoFix');
const fixPanel        = document.getElementById('fixPanel');
const fixList         = document.getElementById('fixList');
const fixCount        = document.getElementById('fixCount');

// Dialog DOM
const newFileDialog   = document.getElementById('newFileDialog');
const newFileName     = document.getElementById('newFileName');
const newFileTemplate = document.getElementById('newFileTemplate');
const btnCreateFile   = document.getElementById('btnCreateFile');
const btnCancelNewFile = document.getElementById('btnCancelNewFile');

let chartInstances = {};
let currentFilePath = null;
let currentFileContent = '';
let currentFileEditable = false;
let isRunning = false;
let isEditing = false;
let chartsRendered = false;
let pendingFixes = [];


// ================================================================
// PAGE NAVIGATION
// ================================================================

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });
  document.getElementById('mainContent').scrollTop = 0;
  if (pageId === 'reports' && !chartsRendered) {
    chartsRendered = true;
    loadDashboard();
  }
}

document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
  link.addEventListener('click', (e) => { e.preventDefault(); navigateTo(link.dataset.page); });
});

document.querySelectorAll('[data-navigate]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.navigate));
});


// ================================================================
// THEME TOGGLE
// ================================================================

function bindThemeToggle() {
  const stored = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(stored);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  themeToggle.querySelector('i').className = 'fa-solid ' + (theme === 'dark' ? 'fa-sun' : 'fa-moon');
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
});


// ================================================================
// FORTRAN SYNTAX PATTERNS
// ================================================================

const FORTRAN_KEYWORDS = [
  'program','end','subroutine','function','module','use','implicit',
  'none','call','if','then','else','elseif','endif','do','enddo',
  'while','return','stop','contains','interface','type','class',
  'allocate','deallocate','allocatable','intent','in','out','inout',
  'optional','present','select','case','default','where','forall',
  'associate','block','critical','include','only','bind',
];

const FORTRAN_TYPES = [
  'integer','real','double','precision','complex','character',
  'logical','dimension','parameter','save','data','pointer',
  'target','contiguous','kind','len',
];

const MPI_NAMES = [
  'mpi_init','mpi_finalize','mpi_comm_rank','mpi_comm_size',
  'mpi_send','mpi_recv','mpi_isend','mpi_irecv','mpi_wait',
  'mpi_bcast','mpi_reduce','mpi_allreduce','mpi_gather',
  'mpi_scatter','mpi_barrier','mpi_type_create_struct',
  'mpi_type_commit','mpi_type_free','mpi_comm_split',
  'mpi_comm_free','mpi_group_free','mpi_win_create',
  'mpi_win_free','mpi_ssend','mpi_sendrecv','mpi_allgather',
  'mpi_alltoall','mpi_waitall','mpi_probe','mpi_get_count',
  'mpi_comm_world','mpi_integer','mpi_real','mpi_double_precision',
  'mpi_character','mpi_logical','mpi_byte','mpi_complex',
  'mpi_status_size','mpi_any_source','mpi_any_tag','mpi_success',
  'mpi_err','mpi_request','mpi_status','mpi_datatype','mpi_int',
  'mpi_sum','mpi_max','mpi_min','mpi_prod','mpi_info_null',
];


// ================================================================
// FILE TEMPLATES
// ================================================================

const TEMPLATES = {
  blank: '',
  mpi_basic: `program mpi_hello
  use mpi
  implicit none
  integer :: ierr, rank, size

  call MPI_Init(ierr)
  call MPI_Comm_rank(MPI_COMM_WORLD, rank, ierr)
  call MPI_Comm_size(MPI_COMM_WORLD, size, ierr)

  ! Your code here

  call MPI_Finalize(ierr)
end program
`,
  mpi_sendrecv: `program mpi_sendrecv
  use mpi
  implicit none
  integer :: ierr, rank, size
  real(8) :: buf(100)
  integer :: status(MPI_STATUS_SIZE)

  call MPI_Init(ierr)
  call MPI_Comm_rank(MPI_COMM_WORLD, rank, ierr)
  call MPI_Comm_size(MPI_COMM_WORLD, size, ierr)

  if (rank == 0) then
    buf = 42.0d0
    call MPI_Send(buf, 100, MPI_DOUBLE_PRECISION, 1, 0, MPI_COMM_WORLD, ierr)
  else if (rank == 1) then
    call MPI_Recv(buf, 100, MPI_DOUBLE_PRECISION, 0, 0, MPI_COMM_WORLD, status, ierr)
  end if

  call MPI_Finalize(ierr)
end program
`,
  mpi_collective: `program mpi_collective
  use mpi
  implicit none
  integer :: ierr, rank, size
  real(8) :: data(50), result(50)

  call MPI_Init(ierr)
  call MPI_Comm_rank(MPI_COMM_WORLD, rank, ierr)
  call MPI_Comm_size(MPI_COMM_WORLD, size, ierr)

  data = rank * 1.0d0

  call MPI_Bcast(data, 50, MPI_DOUBLE_PRECISION, 0, MPI_COMM_WORLD, ierr)
  call MPI_Allreduce(data, result, 50, MPI_DOUBLE_PRECISION, MPI_SUM, MPI_COMM_WORLD, ierr)

  call MPI_Finalize(ierr)
end program
`,
};


// ================================================================
// FILE EXPLORER
// ================================================================

async function loadFileTree() {
  fileTree.innerHTML = '<div class="ws-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
  try {
    const res = await fetch('/api/files');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderFileTree(await res.json());
  } catch (err) {
    fileTree.innerHTML = '<div class="ws-loading" style="color:var(--ws-error)"><i class="fa-solid fa-circle-xmark"></i> Failed to load</div>';
  }
}

function renderFileTree(tree) {
  fileTree.innerHTML = '';
  tree.forEach(folder => {
    const el = document.createElement('div');
    el.className = 'ws-folder ws-fade-in';

    const isWorkspace = folder.name === 'workspace';

    const header = document.createElement('div');
    header.className = 'ws-folder-header';
    header.innerHTML = `
      <span class="ws-chevron"><i class="fa-solid fa-chevron-down"></i></span>
      <i class="fa-solid ${isWorkspace ? 'fa-folder-open' : 'fa-folder'}" style="color:var(--ws-accent)"></i>
      <span>${folder.name}</span>
      ${isWorkspace ? '<span class="ws-editable-badge" style="margin-left:0.3rem;font-size:0.58rem;background:rgba(52,211,153,0.15);color:#34d399;padding:0.05rem 0.3rem;border-radius:3px;font-weight:700">EDITABLE</span>' : ''}
      <span class="ws-folder-count">${folder.children.length}</span>
    `;

    const children = document.createElement('div');
    children.className = 'ws-folder-children';

    folder.children.forEach(file => {
      const f = document.createElement('div');
      f.className = 'ws-file-item';
      f.dataset.path = file.path;
      f.innerHTML = `<i class="fa-solid fa-file-code"></i><span>${file.name}</span><span class="ws-file-size">${fmtBytes(file.size)}</span>`;
      f.addEventListener('click', () => openFile(file.path));
      children.appendChild(f);
    });

    header.addEventListener('click', () => {
      const collapsed = children.classList.contains('collapsed');
      if (collapsed) {
        children.classList.remove('collapsed');
        children.style.maxHeight = children.scrollHeight + 'px';
        header.classList.remove('collapsed');
      } else {
        children.style.maxHeight = children.scrollHeight + 'px';
        children.offsetHeight;
        children.classList.add('collapsed');
        header.classList.add('collapsed');
      }
    });

    el.appendChild(header);
    el.appendChild(children);
    fileTree.appendChild(el);
    requestAnimationFrame(() => { children.style.maxHeight = children.scrollHeight + 'px'; });
  });
}

function fmtBytes(b) { return b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB'; }


// ================================================================
// CODE VIEWER / EDITOR
// ================================================================

async function openFile(filePath) {
  // Exit edit mode if switching files
  if (isEditing) exitEditMode();
  hideFixes();

  document.querySelectorAll('.ws-file-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.ws-file-item[data-path="${CSS.escape(filePath)}"]`);
  if (active) active.classList.add('active');

  editorFileName.innerHTML = `<i class="fa-solid fa-code"></i> ${filePath.split('/').pop()}`;
  editorFileInfo.textContent = 'Loading...';
  codeArea.innerHTML = '<div class="ws-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
  codeArea.style.display = '';
  editArea.style.display = 'none';

  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentFilePath = filePath;
    currentFileContent = data.content;
    currentFileEditable = data.editable === true || data.editable === 'True';
    btnRunFile.disabled = false;
    btnEditMode.disabled = !currentFileEditable;
    editorFileInfo.textContent = data.path + (currentFileEditable ? ' (editable)' : '');
    renderCode(data.content);
  } catch (err) {
    codeArea.innerHTML = '<div class="ws-loading" style="color:var(--ws-error)"><i class="fa-solid fa-circle-xmark"></i> Failed to load</div>';
  }
}

function renderCode(source, annotations = []) {
  const lines = source.split('\n');
  const annMap = {};
  annotations.forEach(a => { if (!annMap[a.line]) annMap[a.line] = []; annMap[a.line].push(a); });

  let html = '<table class="ws-code-table">';
  lines.forEach((line, i) => {
    const n = i + 1;
    const hasError = annMap[n] && annMap[n].some(a => a.severity === 'error');
    const hasWarn = annMap[n] && annMap[n].some(a => a.severity === 'warning');
    const hlClass = hasError ? 'ws-line-highlighted' : (hasWarn ? 'ws-line-warn' : '');
    html += `<tr class="${hlClass}" id="ws-line-${n}">`;
    html += `<td class="ws-line-num">${n}</td>`;
    html += `<td class="ws-line-content">${highlightFortran(esc(line)) || ' '}</td></tr>`;

    // Inline error annotations
    if (annMap[n]) {
      annMap[n].forEach(a => {
        const cls = a.severity === 'error' ? 'error-ann' : 'warning-ann';
        const icon = a.severity === 'error' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation';
        html += `<tr><td></td><td><div class="ws-error-annotation ${cls}"><i class="fa-solid ${icon}"></i> [${a.rule}] ${esc(a.message)}</div></td></tr>`;
      });
    }
  });
  html += '</table>';
  codeArea.innerHTML = html;
  codeArea.classList.add('ws-fade-in');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlightFortran(line) {
  let ci = -1, inStr = false, sc = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!inStr && (c === "'" || c === '"')) { inStr = true; sc = c; }
    else if (inStr && c === sc) { inStr = false; }
    else if (!inStr && c === '!') { ci = i; break; }
  }
  let code = ci >= 0 ? line.substring(0, ci) : line;
  let comment = ci >= 0 ? `<span class="syn-comment">${line.substring(ci)}</span>` : '';

  // Tokenize the code part safely to avoid matching inside HTML tags
  const tokenRegex = /("[^"]*"|'[^']*'|\b\d+\.?\d*(?:[eEdD][+-]?\d+)?\b|\b[a-zA-Z_]\w*\b|[^\w\s"'\d]+|\s+)/g;
  let result = '';
  let match;
  while ((match = tokenRegex.exec(code)) !== null) {
    let token = match[0];
    let lower = token.toLowerCase();

    if (token.startsWith('"') || token.startsWith("'")) {
      result += `<span class="syn-string">${token}</span>`;
    } else if (/^\d/.test(token)) {
      result += `<span class="syn-number">${token}</span>`;
    } else if (MPI_NAMES.includes(lower)) {
      result += `<span class="syn-mpi">${token}</span>`;
    } else if (FORTRAN_KEYWORDS.includes(lower)) {
      result += `<span class="syn-keyword">${token}</span>`;
    } else if (FORTRAN_TYPES.includes(lower)) {
      result += `<span class="syn-type">${token}</span>`;
    } else {
      result += token;
    }
  }

  return result + comment;
}


// ================================================================
// EDIT MODE
// ================================================================

function enterEditMode() {
  if (!currentFilePath || !currentFileEditable) return;
  isEditing = true;
  codeArea.style.display = 'none';
  editArea.style.display = '';
  editArea.value = currentFileContent;
  editArea.focus();
  btnEditMode.style.display = 'none';
  btnSaveFile.style.display = '';
  editorFileName.innerHTML = `<i class="fa-solid fa-pen"></i> ${currentFilePath.split('/').pop()} <small style="opacity:0.5">(editing)</small>`;
}

function exitEditMode() {
  isEditing = false;
  editArea.style.display = 'none';
  codeArea.style.display = '';
  btnEditMode.style.display = '';
  btnSaveFile.style.display = 'none';
  if (currentFilePath) {
    editorFileName.innerHTML = `<i class="fa-solid fa-code"></i> ${currentFilePath.split('/').pop()}`;
  }
}

async function saveFile() {
  if (!currentFilePath) return;
  const content = editArea.value;
  try {
    const res = await fetch('/api/save-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFilePath, content })
    });
    const data = await res.json();
    if (data.ok) {
      currentFileContent = content;
      termWriteLine(`<span class="term-success"><i class="fa-solid fa-check"></i> Saved ${currentFilePath}</span>`);
      exitEditMode();
      renderCode(content);
    } else {
      termWriteLine(`<span class="term-error">Save failed: ${esc(data.error || 'Unknown error')}</span>`);
    }
  } catch (err) {
    termWriteLine(`<span class="term-error">Save error: ${esc(err.message)}</span>`);
  }
}


// ================================================================
// NEW FILE
// ================================================================

function showNewFileDialog() {
  newFileDialog.style.display = '';
  newFileName.value = '';
  newFileName.focus();
}

function hideNewFileDialog() {
  newFileDialog.style.display = 'none';
}

async function createFile() {
  const name = newFileName.value.trim();
  if (!name) { newFileName.focus(); return; }

  const template = TEMPLATES[newFileTemplate.value] || '';

  try {
    const res = await fetch('/api/create-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: template })
    });
    const data = await res.json();
    if (data.ok) {
      hideNewFileDialog();
      termWriteLine(`<span class="term-success"><i class="fa-solid fa-check"></i> Created ${data.path}</span>`);
      await loadFileTree();
      await openFile(data.path);
      // Auto-enter edit mode for new files
      enterEditMode();
    } else {
      termWriteLine(`<span class="term-error">Create failed: ${esc(data.error || 'Unknown error')}</span>`);
    }
  } catch (err) {
    termWriteLine(`<span class="term-error">Create error: ${esc(err.message)}</span>`);
  }
}


// ================================================================
// AUTO-FIX ENGINE
// ================================================================

function parseAnalysisOutput(output) {
  const annotations = [];
  const regex = /:(\d+): (error|warning): \[([^\]]+)\]\s*(.+)/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    annotations.push({
      line: parseInt(match[1]),
      severity: match[2],
      rule: match[3],
      message: match[4],
    });
  }
  return annotations;
}

function generateFixes(annotations, sourceCode) {
  const lines = sourceCode.split('\n');
  const fixes = [];

  for (const ann of annotations) {
    const lineIdx = ann.line - 1;
    const codeLine = lines[lineIdx] || '';

    switch (ann.rule) {
      case 'datatype-mismatch': {
        // REAL(8) with MPI_REAL -> MPI_DOUBLE_PRECISION
        if (/REAL\(8\)/i.test(ann.message) && /MPI_REAL\b/i.test(ann.message) && /MPI_REAL\b/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_REAL to MPI_DOUBLE_PRECISION', find: /\bMPI_REAL\b/i, replace: 'MPI_DOUBLE_PRECISION', lineIdx });
        }
        // REAL(4) with MPI_DOUBLE_PRECISION -> MPI_REAL
        else if (/REAL\(4\)/i.test(ann.message) && /MPI_DOUBLE_PRECISION/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_DOUBLE_PRECISION to MPI_REAL', find: /\bMPI_DOUBLE_PRECISION\b/i, replace: 'MPI_REAL', lineIdx });
        }
        // INTEGER(8) with MPI_INTEGER -> use correct type
        else if (/INTEGER\(8\)/i.test(ann.message) && /MPI_INTEGER\b/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_INTEGER to MPI_INTEGER8', find: /\bMPI_INTEGER\b/i, replace: 'MPI_INTEGER8', lineIdx });
        }
        // INTEGER(2) with MPI_INTEGER
        else if (/INTEGER\(2\)/i.test(ann.message) && /MPI_INTEGER\b/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_INTEGER to MPI_INTEGER2', find: /\bMPI_INTEGER\b/i, replace: 'MPI_INTEGER2', lineIdx });
        }
        // COMPLEX kind mismatch
        else if (/COMPLEX\(8\)/i.test(ann.message) && /MPI_COMPLEX\b/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_COMPLEX to MPI_DOUBLE_COMPLEX', find: /\bMPI_COMPLEX\b/i, replace: 'MPI_DOUBLE_COMPLEX', lineIdx });
        }
        // LOGICAL kind mismatch
        else if (/LOGICAL/i.test(ann.message) && /MPI_LOGICAL\b/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_LOGICAL to MPI_BYTE', find: /\bMPI_LOGICAL\b/i, replace: 'MPI_BYTE', lineIdx });
        }
        // Generic fallback
        else {
          fixes.push({ ...ann, fixDesc: 'Fix MPI datatype to match buffer kind', find: null, replace: null, lineIdx });
        }
        break;
      }

      case 'derived-type-layout': {
        // Need to add BIND(C) to the type definition
        if (/not BIND\(C\)/i.test(ann.message)) {
          // Find the TYPE definition line above
          const typeMatch = ann.message.match(/TYPE\((\w+)\)/i);
          if (typeMatch) {
            const typeName = typeMatch[1];
            for (let i = 0; i < lines.length; i++) {
              if (new RegExp(`^\\s*type\\s+${typeName}\\s*$`, 'i').test(lines[i])) {
                fixes.push({ ...ann, fixDesc: `Add BIND(C) to TYPE(${typeName})`, find: new RegExp(`(type\\s+)(${typeName})`, 'i'), replace: `$1${typeName}, BIND(C)`, lineIdx: i, line: i + 1 });
                break;
              }
            }
          }
        }
        break;
      }

      case 'collective-ordering': {
        // Move the collective outside the IF block
        fixes.push({ ...ann, fixDesc: 'Move collective call outside rank-conditional IF block', find: null, replace: null, lineIdx, isBlockFix: true });
        break;
      }

      case 'contiguity': {
        // Two sub-cases:
        // 1) Strided array section like a(1:99:2) -> use a temp copy
        // 2) Assumed-shape buf(:) -> add CONTIGUOUS attribute
        if (/non-unit stride/i.test(ann.message) || /array section/i.test(ann.message)) {
          // Parse the argument name and the section from the code line
          const callMatch = codeLine.match(/call\s+\w+\(([^,]+)/i);
          const argExpr = callMatch ? callMatch[1].trim() : null;
          if (argExpr && /\(.*:.*:/.test(argExpr)) {
            // e.g. a(1:99:2) -> replace with a contiguous temp
            const argName = argExpr.match(/^(\w+)/)[1];
            fixes.push({
              ...ann,
              fixDesc: `Replace strided section with contiguous copy via PACK()`,
              lineIdx,
              isStrideFix: true,
              origExpr: argExpr,
              argName: argName,
            });
          } else {
            fixes.push({ ...ann, fixDesc: 'Replace strided array section with contiguous copy', find: null, replace: null, lineIdx });
          }
        } else if (/assumed.shape/i.test(ann.message)) {
          // Find the declaration of the buffer and add CONTIGUOUS
          const bufMatch = ann.message.match(/argument '(\w+)'/i) || ann.message.match(/'(\w+)'/i);
          if (bufMatch) {
            const bufName = bufMatch[1];
            for (let i = 0; i < lines.length; i++) {
              // Match declaration like: real, intent(in) :: buf(:)
              const declRe = new RegExp(`^(\\s*\\w[\\w()*,\\s]*::\\s*)${bufName}\\b`, 'i');
              if (declRe.test(lines[i]) && !(/contiguous/i.test(lines[i]))) {
                fixes.push({
                  ...ann,
                  fixDesc: `Add CONTIGUOUS attribute to '${bufName}' declaration`,
                  lineIdx: i, line: i + 1,
                  isContiguousFix: true,
                  bufName: bufName,
                });
                break;
              }
            }
          }
        } else {
          fixes.push({ ...ann, fixDesc: 'Use contiguous array section or add CONTIGUOUS', find: null, replace: null, lineIdx });
        }
        break;
      }

      case 'optional-arg': {
        // Wrap in IF (PRESENT(...)) THEN
        const argMatch = ann.message.match(/buffer '(\w+)'/i) || ann.message.match(/'(\w+)'/i);
        if (argMatch) {
          fixes.push({ ...ann, fixDesc: `Wrap in IF (PRESENT(${argMatch[1]})) guard`, find: null, replace: null, lineIdx, isWrapFix: true, argName: argMatch[1] });
        }
        break;
      }

      case 'buffer-size': {
        // Try to parse count > extent from message
        const countMatch = ann.message.match(/count\s*\((\d+)\)\s*>\s*.*extent\s*\((\d+)\)/i);
        if (countMatch) {
          fixes.push({ ...ann, fixDesc: `Change count from ${countMatch[1]} to ${countMatch[2]}`, find: new RegExp(`\\b${countMatch[1]}\\b`), replace: countMatch[2], lineIdx });
        } else {
          // Fallback: try to find the count number on the line
          const msgCount = ann.message.match(/count\s*[\(=]\s*(\d+)/i);
          const msgExtent = ann.message.match(/extent\s*[\(=]\s*(\d+)/i);
          if (msgCount && msgExtent) {
            fixes.push({ ...ann, fixDesc: `Change count from ${msgCount[1]} to ${msgExtent[1]}`, find: new RegExp(`\\b${msgCount[1]}\\b`), replace: msgExtent[1], lineIdx });
          } else {
            fixes.push({ ...ann, fixDesc: 'Fix buffer count to match array extent', find: null, replace: null, lineIdx });
          }
        }
        break;
      }

      case 'handle-leak': {
        const handleMatch = ann.message.match(/MPI_(\w+)\b/i);
        const nameMatch = ann.message.match(/'(\w+)'/);
        if (handleMatch && nameMatch) {
          const hType = handleMatch[1].toLowerCase();
          let freeCall = '';
          if (hType.includes('datatype') || hType.includes('type')) freeCall = `call MPI_Type_free(${nameMatch[1]}, ierr)`;
          else if (hType.includes('comm')) freeCall = `call MPI_Comm_free(${nameMatch[1]}, ierr)`;
          else if (hType.includes('group')) freeCall = `call MPI_Group_free(${nameMatch[1]}, ierr)`;
          else if (hType.includes('win')) freeCall = `call MPI_Win_free(${nameMatch[1]}, ierr)`;
          else freeCall = `! TODO: Free handle '${nameMatch[1]}'`;
          fixes.push({ ...ann, fixDesc: `Add ${freeCall}`, find: null, replace: null, lineIdx, isInsertFix: true, insertCode: '  ' + freeCall });
        }
        break;
      }

      case 'isend-aliasing': {
        // Add a buffer copy to avoid aliasing
        const bufMatch = ann.message.match(/buffer '(\w+)'/i) || ann.message.match(/'(\w+)'/i);
        if (bufMatch) {
          fixes.push({
            ...ann,
            fixDesc: `Use a separate send buffer copy to avoid aliasing '${bufMatch[1]}'`,
            lineIdx,
            isAliasFix: true,
            bufName: bufMatch[1],
          });
        } else {
          fixes.push({ ...ann, fixDesc: 'Use separate buffer copy between MPI_Isend and MPI_Wait', find: null, replace: null, lineIdx });
        }
        break;
      }

      case 'datatype-state': {
        if (/without commit/i.test(ann.message)) {
          const dtMatch = ann.message.match(/'(\w+)'/);
          if (dtMatch) {
            fixes.push({ ...ann, fixDesc: `Add MPI_Type_commit(${dtMatch[1]}) before use`, find: null, replace: null, lineIdx, isInsertFix: true, insertCode: `  call MPI_Type_commit(${dtMatch[1]}, ierr)` });
          }
        } else if (/after free/i.test(ann.message)) {
          fixes.push({ ...ann, fixDesc: 'Remove usage of datatype after MPI_Type_free', find: null, replace: null, lineIdx });
        }
        break;
      }

      case 'deadlock-pattern': {
        // Change matching Send/Recv ordering — swap one MPI_Send to MPI_Sendrecv or reorder
        if (/MPI_Send/i.test(codeLine)) {
          fixes.push({ ...ann, fixDesc: 'Change MPI_Send to MPI_Ssend to make deadlock explicit (then reorder)', find: /\bMPI_Send\b/i, replace: 'MPI_Ssend', lineIdx });
        } else {
          fixes.push({ ...ann, fixDesc: 'Reorder Send/Recv to break deadlock cycle', find: null, replace: null, lineIdx });
        }
        break;
      }

      default:
        fixes.push({ ...ann, fixDesc: `Review and fix [${ann.rule}]`, find: null, replace: null, lineIdx });
    }
  }

  return fixes;
}

function showFixes(fixes) {
  if (fixes.length === 0) { hideFixes(); return; }
  pendingFixes = fixes;
  fixPanel.style.display = '';
  fixCount.textContent = `${fixes.length} fix${fixes.length > 1 ? 'es' : ''}`;
  btnAutoFix.style.display = '';

  fixList.innerHTML = fixes.map((f, i) => `
    <div class="ws-fix-item">
      <span class="fix-icon ${f.severity}"><i class="fa-solid ${f.severity === 'error' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}"></i></span>
      <span class="fix-line">L${f.line}</span>
      <span class="fix-desc">
        <strong>[${f.rule}]</strong> ${esc(f.fixDesc)}
        ${f.find && f.replace !== null ? `<br><span class="fix-old">${esc(String(f.find).replace(/^\/|\/[gi]*$/g,''))}</span> <span class="fix-arrow"><i class="fa-solid fa-arrow-right"></i></span> <span class="fix-new">${esc(typeof f.replace === 'string' ? f.replace : '')}</span>` : ''}
      </span>
    </div>
  `).join('');
}

function hideFixes() {
  fixPanel.style.display = 'none';
  btnAutoFix.style.display = 'none';
  pendingFixes = [];
}

async function applyFixes() {
  if (pendingFixes.length === 0) return;

  let lines = currentFileContent.split('\n');
  let applied = 0;
  const insertions = []; // {afterLineIdx, code}

  // Sort fixes by line number descending so insertions don't shift indices
  const sorted = [...pendingFixes].sort((a, b) => (b.lineIdx || 0) - (a.lineIdx || 0));

  for (const fix of sorted) {
    const lineIdx = fix.lineIdx;

    if (fix.isBlockFix) {
      // Collective ordering: move the call outside the IF block
      // Find the IF line above and END IF below
      let ifLine = -1, endIfLine = -1;
      for (let i = lineIdx - 1; i >= 0; i--) {
        if (/^\s*if\s*\(.+\)\s*then\s*$/i.test(lines[i])) { ifLine = i; break; }
      }
      for (let i = lineIdx + 1; i < lines.length; i++) {
        if (/^\s*end\s*if\s*$/i.test(lines[i])) { endIfLine = i; break; }
      }
      if (ifLine >= 0 && endIfLine >= 0) {
        const callLine = lines[lineIdx];
        // Remove the call, IF, and END IF
        lines.splice(endIfLine, 1);
        lines.splice(lineIdx, 1);
        lines.splice(ifLine, 1);
        // Re-insert the call at the ifLine position (outside the block)
        lines.splice(ifLine, 0, callLine);
        applied++;
      }
      continue;
    }

    if (fix.isWrapFix && fix.argName) {
      // Wrap line in IF (PRESENT(arg)) THEN ... END IF
      const indent = lines[lineIdx].match(/^(\s*)/)[1];
      lines[lineIdx] = `${indent}if (present(${fix.argName})) then\n${indent}  ${lines[lineIdx].trim()}\n${indent}end if`;
      applied++;
      continue;
    }

    if (fix.isInsertFix && fix.insertCode) {
      // Insert a line before the current line (e.g., MPI_Type_commit before use)
      // For handle-leak: insert before MPI_Finalize
      let insertIdx = lineIdx;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (/MPI_Finalize/i.test(lines[i])) { insertIdx = i; break; }
      }
      lines.splice(insertIdx, 0, fix.insertCode);
      applied++;
      continue;
    }

    if (fix.isStrideFix && fix.origExpr) {
      // Replace strided section with PACK(): a(1:99:2) -> pack(a(1:99:2), .true.)
      const indent = lines[lineIdx].match(/^(\s*)/)[1];
      const tempName = fix.argName + '_contig';
      // Replace the strided expression with the temp variable in the MPI call
      const newCall = lines[lineIdx].replace(fix.origExpr, tempName);
      // Insert allocation + pack before the call
      lines.splice(lineIdx, 1,
        `${indent}${tempName} = pack(${fix.origExpr}, .true.)`,
        newCall
      );
      applied++;
      continue;
    }

    if (fix.isContiguousFix && fix.bufName) {
      // Add CONTIGUOUS to declaration: "real, intent(in) :: buf(:)" -> "real, intent(in), contiguous :: buf(:)"
      const declLine = lines[lineIdx];
      const newDecl = declLine.replace(/::/i, ', contiguous ::');
      if (newDecl !== declLine) {
        lines[lineIdx] = newDecl;
        applied++;
      }
      continue;
    }

    if (fix.isAliasFix && fix.bufName) {
      // Add a buffer copy before the Isend: sendbuf = buf; call MPI_Isend(sendbuf, ...)
      const indent = lines[lineIdx].match(/^(\s*)/)[1];
      const copyName = fix.bufName + '_sendbuf';
      const newCall = lines[lineIdx].replace(new RegExp(`\\b${fix.bufName}\\b`, 'i'), copyName);
      lines.splice(lineIdx, 1,
        `${indent}${copyName} = ${fix.bufName}  ! contiguous copy for non-blocking send`,
        newCall
      );
      applied++;
      continue;
    }

    if (fix.find && fix.replace !== null) {
      const oldLine = lines[lineIdx];
      const newLine = oldLine.replace(fix.find, fix.replace);
      if (newLine !== oldLine) {
        lines[lineIdx] = newLine;
        applied++;
      }
    }
  }

  if (applied === 0) {
    termWriteLine(`<span class="term-warning">No automatic fixes could be applied. Manual review needed.</span>`);
    return;
  }

  const fixedContent = lines.join('\n');
  currentFileContent = fixedContent;

  if (currentFileEditable) {
    // Editable workspace file — save in-place
    try {
      await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFilePath, content: fixedContent })
      });
      termWriteLine(`<span class="term-success"><i class="fa-solid fa-wand-magic-sparkles"></i> Applied ${applied} fix${applied > 1 ? 'es' : ''}! Re-run analysis to verify.</span>`);
    } catch (e) {
      termWriteLine(`<span class="term-warning">Fixes applied in preview but save failed.</span>`);
    }
  } else {
    // Read-only file (tests/bugs/, tests/clean/, eval/) — copy fixed version to workspace/
    const origName = currentFilePath.split('/').pop();
    const fixedName = origName.replace('.f90', '_fixed.f90');
    try {
      const res = await fetch('/api/create-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fixedName, content: fixedContent })
      });
      const data = await res.json();
      if (data.ok) {
        termWriteLine(`<span class="term-success"><i class="fa-solid fa-wand-magic-sparkles"></i> Applied ${applied} fix${applied > 1 ? 'es' : ''}! Saved as <strong>${data.path}</strong></span>`);
        termWriteLine(`<span class="term-info">Switching to fixed file — click Run Analysis to verify the fix.</span>`);
        await loadFileTree();
        await openFile(data.path);
      } else if (res.status === 409) {
        // File already exists — overwrite via save
        const savePath = 'workspace/' + fixedName;
        await fetch('/api/save-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: savePath, content: fixedContent })
        });
        termWriteLine(`<span class="term-success"><i class="fa-solid fa-wand-magic-sparkles"></i> Applied ${applied} fix${applied > 1 ? 'es' : ''}! Updated <strong>${savePath}</strong></span>`);
        termWriteLine(`<span class="term-info">Switching to fixed file — click Run Analysis to verify the fix.</span>`);
        await loadFileTree();
        await openFile(savePath);
      } else {
        termWriteLine(`<span class="term-warning">Fixes applied in preview. Could not save: ${esc(data.error || 'Unknown error')}</span>`);
      }
    } catch (e) {
      termWriteLine(`<span class="term-warning">Fixes applied in preview only (file is read-only).</span>`);
    }
  }

  hideFixes();
  renderCode(fixedContent);

  // Scroll to first fix
  const firstLine = sorted[sorted.length - 1]?.line;
  if (firstLine) {
    const el = document.getElementById(`ws-line-${firstLine}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}


// ================================================================
// TERMINAL
// ================================================================

function termWrite(html) { terminalOutput.innerHTML += html; terminalOutput.scrollTop = terminalOutput.scrollHeight; }
function termWriteLine(html) { termWrite(html + '\n'); }
function termClear() { terminalOutput.innerHTML = ''; }
function setStatus(text, cls) { terminalStatus.textContent = text; terminalStatus.className = 'ws-terminal-status ' + (cls || ''); }

async function runAnalysis() {
  if (!currentFilePath || isRunning) return;
  isRunning = true;
  btnRunFile.disabled = btnRunTests.disabled = true;
  hideFixes();

  termWriteLine(`<span class="term-prompt">$ </span><span class="term-bold">mpicheck ${currentFilePath}</span>`);
  setStatus('Running...', 'running ws-running-indicator');

  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: currentFilePath }) });
    const data = await res.json();
    if (data.error) {
      termWriteLine(`<span class="term-error">Error: ${esc(data.error)}</span>`);
      setStatus('Error', 'error');
    } else {
      const out = data.stdout || data.stderr || '';
      if (out.trim()) termWrite(colorize(esc(out)));

      // Parse annotations from output
      const annotations = parseAnalysisOutput(out);

      // Re-render code with inline annotations
      if (currentFilePath) {
        // Re-fetch latest content (in case auto-fix changed it)
        try {
          const fr = await fetch(`/api/file?path=${encodeURIComponent(currentFilePath)}`);
          const fd = await fr.json();
          currentFileContent = fd.content;
        } catch (e) { /* use cached */ }

        renderCode(currentFileContent, annotations);

        // Scroll to first error
        if (annotations.length > 0) {
          const el = document.getElementById(`ws-line-${annotations[0].line}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      if (data.exitCode === 0) {
        termWriteLine(`<span class="term-success"><i class="fa-solid fa-circle-check"></i> No issues found - clean code!</span>`);
        setStatus('Clean', 'done');
      } else {
        setStatus(`${annotations.length} issue(s)`, 'error');

        // Generate fix suggestions
        const fixes = generateFixes(annotations, currentFileContent);
        showFixes(fixes);
      }
    }
  } catch (err) {
    termWriteLine(`<span class="term-error">Network error: ${esc(err.message)}</span>`);
    setStatus('Error', 'error');
  }
  termWriteLine('');
  isRunning = false;
  btnRunFile.disabled = btnRunTests.disabled = false;
}

async function runAllTests() {
  if (isRunning) return;
  isRunning = true;
  btnRunFile.disabled = btnRunTests.disabled = true;
  termWriteLine(`<span class="term-prompt">$ </span><span class="term-bold">python tests/run_tests.py</span>`);
  setStatus('Running tests...', 'running ws-running-indicator');

  try {
    const res = await fetch('/api/run-tests', { method: 'POST' });
    const data = await res.json();
    if (data.error) {
      termWriteLine(`<span class="term-error">Error: ${esc(data.error)}</span>`);
      setStatus('Error', 'error');
    } else {
      const out = data.stdout || data.stderr || '';
      if (out.trim()) termWrite(colorizeTests(esc(out)));
      setStatus(data.exitCode === 0 ? 'All passed' : 'Some failed', data.exitCode === 0 ? 'done' : 'error');
    }
  } catch (err) {
    termWriteLine(`<span class="term-error">Network error: ${esc(err.message)}</span>`);
    setStatus('Error', 'error');
  }
  termWriteLine('');
  isRunning = false;
  btnRunFile.disabled = btnRunTests.disabled = false;
}

function colorize(t) {
  return t
    .replace(/^(.*: error: .*)$/gm, '<span class="term-error">$1</span>')
    .replace(/^(.*: warning: .*)$/gm, '<span class="term-warning">$1</span>')
    .replace(/^(mpicheck: .*)$/gm, '<span class="term-bold">$1</span>');
}

function colorizeTests(t) {
  return t
    .replace(/^(PASS\s+.*)$/gm, '<span class="term-success">$1</span>')
    .replace(/^(FAIL\s+.*)$/gm, '<span class="term-error">$1</span>')
    .replace(/^(== .* ==)$/gm, '<span class="term-info term-bold">$1</span>');
}


// ================================================================
// DASHBOARD RENDERING
// ================================================================

async function loadDashboard() {
  try {
    const res = await fetch('./data.json');
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    renderDashboard(getFallbackData());
  }
}

function renderDashboard(data) {
  document.getElementById('projectTitle').textContent = data.project.title;
  document.getElementById('heroSubtitle').textContent = data.project.subtitle;
  renderStats(data.stats);
  renderRules(data.rules);
  renderResults(data.diagnostics);
  renderWorkflow(data.workflow);
  renderEvaluation(data.evaluation);
  renderDiagnostics(data.recentDiagnostics);
  renderCharts(data.charts);
  animateCounters();
}

function renderStats(stats) {
  statsGrid.innerHTML = stats.map(item => `
    <div class="stat-card">
      <div class="stat-icon"><i class="${item.icon}"></i></div>
      <div class="stat-label">${item.label}</div>
      <div class="stat-value" data-counter="${item.value}" data-suffix="${item.suffix || ''}" data-decimals="${item.decimals || 0}">0${item.suffix || ''}</div>
    </div>
  `).join('');
}

function renderRules(rules) {
  rulesGrid.innerHTML = rules.map(r => `
    <div class="rule-card">
      <div class="rule-card-header">
        <span class="rule-name">${r.name}</span>
        <span class="status-icon ${r.statusClass}"><i class="${r.statusIcon}"></i></span>
      </div>
      <p class="rule-desc">${r.description}</p>
      <div class="rule-footer">
        <span class="rule-category">${r.category}</span>
        <span class="rule-detections">${r.detections} detections</span>
      </div>
    </div>
  `).join('');
}

function renderResults(diagnostics) {
  resultsBody.innerHTML = diagnostics.map(item => `
    <tr data-file="${item.file}" data-line="${item.line}" title="Click to open in Workspace">
      <td><code>${item.file}</code></td>
      <td>${item.line}</td>
      <td><code>${item.mpiFunction}</code></td>
      <td>${item.rule}</td>
      <td><span class="badge-sev ${sevClass(item.severity)}">${item.severity}</span></td>
      <td>${item.description}</td>
    </tr>
  `).join('');

  resultsBody.querySelectorAll('tr[data-file]').forEach(row => {
    row.addEventListener('click', () => {
      const fp = row.dataset.file;
      const ln = parseInt(row.dataset.line);
      navigateTo('workspace');
      openFile(fp).then(() => {
        setTimeout(() => {
          const el = document.getElementById(`ws-line-${ln}`);
          if (el) { el.classList.add('ws-line-highlighted'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 300);
      });
    });
  });
}

function renderWorkflow(items) {
  workflowGrid.innerHTML = items.map((item, i) => `
    <div class="workflow-step">
      <span class="step-num">${String(i + 1).padStart(2, '0')}</span>
      <div class="step-icon"><i class="${item.icon}"></i></div>
      <h5>${item.title}</h5>
      <p>${item.description}</p>
    </div>
  `).join('');
}

function renderEvaluation(items) {
  evaluationGrid.innerHTML = items.map(item => `
    <div class="eval-item">
      <strong>${item.value}</strong>
      <span>${item.label}</span>
    </div>
  `).join('');
}

function renderDiagnostics(items) {
  diagnosticsList.innerHTML = items.map(item => `
    <div class="diag-item">
      <div>${item.message}</div>
      <div class="meta">${item.file}:${item.line} &bull; ${item.rule}</div>
    </div>
  `).join('');
}

function renderCharts(charts) {
  const colors = ['#7a4330', '#a65f35', '#c9885a', '#e8a164', '#1cae72', '#60a5fa'];
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};

  const errEl = document.getElementById('errorsChart');
  const ruleEl = document.getElementById('rulesChart');
  const lineEl = document.getElementById('lineChart');
  const doughEl = document.getElementById('doughnutChart');

  if (!errEl || !ruleEl) return;

  chartInstances.errors = new Chart(errEl, {
    type: 'pie',
    data: { labels: charts.errors.labels, datasets: [{ data: charts.errors.data, backgroundColor: [colors[0], colors[2]], borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).getPropertyValue('--muted') } } } }
  });

  chartInstances.rules = new Chart(ruleEl, {
    type: 'bar',
    data: { labels: charts.rules.labels, datasets: [{ data: charts.rules.data, backgroundColor: colors, borderRadius: 6 }] },
    options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } }
  });

  chartInstances.line = new Chart(lineEl, {
    type: 'line',
    data: { labels: charts.timeline.labels, datasets: [{ label: 'Seconds', data: charts.timeline.data, borderColor: colors[2], backgroundColor: 'rgba(201,136,90,0.15)', fill: true, tension: 0.4, pointRadius: 4 }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });

  chartInstances.doughnut = new Chart(doughEl, {
    type: 'doughnut',
    data: { labels: charts.mpicalls.labels, datasets: [{ data: charts.mpicalls.data, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).getPropertyValue('--muted') } } } }
  });
}

function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(counter => {
    const target = parseFloat(counter.dataset.counter);
    const decimals = parseInt(counter.dataset.decimals || '0');
    const suffix = counter.dataset.suffix || '';
    const duration = 1200;
    const start = performance.now();
    const step = (time) => {
      const p = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      counter.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else counter.textContent = target.toFixed(decimals) + suffix;
    };
    requestAnimationFrame(step);
  });
}

function sevClass(s) {
  if (s.toLowerCase() === 'error') return 'badge-error';
  if (s.toLowerCase() === 'warning') return 'badge-warning';
  return 'badge-pass';
}

function getFallbackData() {
  return {
    project: { title: 'mpicheck', subtitle: 'Static Analysis Tool for MPI Correctness in Fortran' },
    stats: [
      { label: 'Files Scanned', value: 38, icon: 'fa-solid fa-file-lines' },
      { label: 'MPI Calls', value: 142, icon: 'fa-solid fa-network-wired' },
      { label: 'Errors', value: 14, icon: 'fa-solid fa-circle-exclamation' },
      { label: 'Warnings', value: 6, icon: 'fa-solid fa-triangle-exclamation' },
      { label: 'Rules Triggered', value: 8, icon: 'fa-solid fa-list-check' },
      { label: 'Analysis Time', value: 0.27, decimals: 2, suffix: 's', icon: 'fa-solid fa-stopwatch' }
    ],
    rules: [
      { name: 'Buffer Size', description: 'Detects count mismatches and oversized buffers.', category: 'Core', detections: 5, statusIcon: 'fa-solid fa-circle-check', statusClass: 'status-ok' },
      { name: 'Contiguity', description: 'Flags non-contiguous array sections and assumed-shape access.', category: 'Safety', detections: 3, statusIcon: 'fa-solid fa-circle-exclamation', statusClass: 'status-error' },
      { name: 'Datatype Mismatch', description: 'Checks Fortran kind compatibility against MPI datatypes.', category: 'Type', detections: 4, statusIcon: 'fa-solid fa-circle-check', statusClass: 'status-ok' },
      { name: 'Derived Type Layout', description: 'Reports derived types without BIND(C) layout compatibility.', category: 'Layout', detections: 2, statusIcon: 'fa-solid fa-triangle-exclamation', statusClass: 'status-warn' },
      { name: 'Optional Argument', description: 'Catches optional args forwarded without PRESENT guards.', category: 'Semantics', detections: 1, statusIcon: 'fa-solid fa-circle-exclamation', statusClass: 'status-error' },
      { name: 'Collective Ordering', description: 'Finds collectives inside rank-dependent branches.', category: 'Concurrency', detections: 2, statusIcon: 'fa-solid fa-circle-check', statusClass: 'status-ok' },
      { name: 'Isend Aliasing', description: 'Detects overlapping buffers between MPI_Isend and MPI_Wait.', category: 'Race', detections: 1, statusIcon: 'fa-solid fa-circle-exclamation', statusClass: 'status-error' },
      { name: 'Handle Leak', description: 'Flags MPI handles not released before scope exit.', category: 'Resource', detections: 2, statusIcon: 'fa-solid fa-triangle-exclamation', statusClass: 'status-warn' },
      { name: 'Datatype State', description: 'Finds committed or freed datatype misuse.', category: 'State', detections: 1, statusIcon: 'fa-solid fa-circle-exclamation', statusClass: 'status-error' },
      { name: 'Deadlock Pattern', description: 'Highlights send-receive ordering hazards.', category: 'Deadlock', detections: 1, statusIcon: 'fa-solid fa-triangle-exclamation', statusClass: 'status-warn' }
    ],
    diagnostics: [
      { file: 'tests/bugs/20_combo.f90', line: 13, mpiFunction: 'MPI_Send', rule: 'datatype-mismatch', severity: 'Error', description: 'Buffer is REAL(8) but MPI datatype is MPI_REAL.' },
      { file: 'tests/bugs/01_count_overflow.f90', line: 8, mpiFunction: 'MPI_Recv', rule: 'buffer-size', severity: 'Warning', description: 'Count exceeds static extent of the receiving buffer.' },
      { file: 'tests/bugs/18_pointer_no_contiguous.f90', line: 11, mpiFunction: 'MPI_Bcast', rule: 'contiguity', severity: 'Error', description: 'Assumed-shape array lacks CONTIGUOUS attribute.' }
    ],
    charts: {
      errors: { labels: ['Errors', 'Warnings'], data: [14, 6] },
      rules: { labels: ['Buffer', 'Contig.', 'Datatype', 'Derived', 'Optional', 'Collective', 'Isend', 'Handle', 'State', 'Deadlock'], data: [5, 3, 4, 2, 1, 2, 1, 2, 1, 1] },
      timeline: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], data: [0.24, 0.22, 0.21, 0.23, 0.19, 0.18] },
      mpicalls: { labels: ['MPI_Send', 'MPI_Recv', 'MPI_Bcast', 'MPI_Isend', 'MPI_Wait', 'Others'], data: [22, 18, 14, 11, 9, 26] }
    },
    workflow: [
      { title: 'Fortran Source', description: 'Input .f90 files', icon: 'fa-solid fa-file-code' },
      { title: 'Flang Analysis', description: 'Fortran-aware AST pass', icon: 'fa-solid fa-magnifying-glass' },
      { title: 'Metadata', description: 'Type, shape, layout', icon: 'fa-solid fa-database' },
      { title: 'Rule Engine', description: 'Modular checks', icon: 'fa-solid fa-gears' },
      { title: 'Diagnostics', description: 'Compiler-style output', icon: 'fa-solid fa-bug' },
      { title: 'Reports', description: 'Charts & summaries', icon: 'fa-solid fa-chart-column' }
    ],
    evaluation: [
      { label: 'Test Cases Passed', value: '50/50' },
      { label: 'False Positives', value: '0' },
      { label: 'Diagnostics on NPB', value: '17' },
      { label: 'Static Analysis Rules', value: '10' }
    ],
    recentDiagnostics: [
      { message: 'solver.f90:42: error: [datatype-mismatch] MPI_Send uses MPI_REAL with REAL(8) buffer', file: 'src/solver.f90', line: 42, rule: 'datatype-mismatch' },
      { message: 'solver.f90:51: warning: [handle-leak] MPI_Datatype not freed before scope exit', file: 'src/solver.f90', line: 51, rule: 'handle-leak' },
      { message: 'mesh.f90:19: error: [contiguity] non-unit stride section passed to MPI_Bcast', file: 'src/mesh.f90', line: 19, rule: 'contiguity' }
    ]
  };
}


// ================================================================
// INIT
// ================================================================

// Workspace buttons
btnRunFile.addEventListener('click', runAnalysis);
btnRunTests.addEventListener('click', runAllTests);
btnClearTerminal.addEventListener('click', () => { termClear(); setStatus('', ''); });
btnRefreshFiles.addEventListener('click', loadFileTree);
btnEditMode.addEventListener('click', enterEditMode);
btnSaveFile.addEventListener('click', saveFile);
btnAutoFix.addEventListener('click', applyFixes);

// New file dialog
btnNewFile.addEventListener('click', () => { navigateTo('workspace'); showNewFileDialog(); });
btnCreateFile.addEventListener('click', createFile);
btnCancelNewFile.addEventListener('click', hideNewFileDialog);
newFileName.addEventListener('keydown', (e) => { if (e.key === 'Enter') createFile(); });
newFileDialog.addEventListener('click', (e) => { if (e.target === newFileDialog) hideNewFileDialog(); });

bindThemeToggle();
loadDashboard();
loadFileTree();
