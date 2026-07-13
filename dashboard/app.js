/* ================================================================
   mpicheck Dashboard — Interactive App
   Page-based navigation + Workspace + Charts
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
const editorFileName  = document.getElementById('editorFileName');
const editorFileInfo  = document.getElementById('editorFileInfo');
const terminalOutput  = document.getElementById('terminalOutput');
const terminalStatus  = document.getElementById('terminalStatus');
const btnRunFile      = document.getElementById('btnRunFile');
const btnRunTests     = document.getElementById('btnRunTests');
const btnClearTerminal = document.getElementById('btnClearTerminal');
const btnRefreshFiles = document.getElementById('btnRefreshFiles');

let chartInstances = {};
let currentFilePath = null;
let isRunning = false;
let chartsRendered = false;


// ================================================================
// PAGE NAVIGATION
// ================================================================

function navigateTo(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });

  // Scroll main content to top
  document.getElementById('mainContent').scrollTop = 0;

  // Lazy-render charts when reports page is first shown
  if (pageId === 'reports' && !chartsRendered) {
    chartsRendered = true;
    loadDashboard(); // re-trigger to ensure charts render in visible canvas
  }
}

// Sidebar navigation clicks
document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

// Hero button navigation
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
  const icon = theme === 'dark' ? 'fa-sun' : 'fa-moon';
  themeToggle.querySelector('i').className = 'fa-solid ' + icon;
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

    const header = document.createElement('div');
    header.className = 'ws-folder-header';
    header.innerHTML = `
      <span class="ws-chevron"><i class="fa-solid fa-chevron-down"></i></span>
      <i class="fa-solid fa-folder" style="color:var(--ws-accent)"></i>
      <span>${folder.name}</span>
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
        children.offsetHeight; // reflow
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
// CODE VIEWER
// ================================================================

async function openFile(filePath) {
  document.querySelectorAll('.ws-file-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.ws-file-item[data-path="${CSS.escape(filePath)}"]`);
  if (active) active.classList.add('active');

  editorFileName.innerHTML = `<i class="fa-solid fa-code"></i> ${filePath.split('/').pop()}`;
  editorFileInfo.textContent = 'Loading...';
  codeArea.innerHTML = '<div class="ws-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentFilePath = filePath;
    btnRunFile.disabled = false;
    editorFileInfo.textContent = data.path;
    renderCode(data.content);
  } catch (err) {
    codeArea.innerHTML = '<div class="ws-loading" style="color:var(--ws-error)"><i class="fa-solid fa-circle-xmark"></i> Failed to load</div>';
  }
}

function renderCode(source, highlightLines = []) {
  const lines = source.split('\n');
  const hl = new Set(highlightLines);
  let html = '<table class="ws-code-table">';
  lines.forEach((line, i) => {
    const n = i + 1;
    html += `<tr class="${hl.has(n) ? 'ws-line-highlighted' : ''}" id="ws-line-${n}">`;
    html += `<td class="ws-line-num">${n}</td>`;
    html += `<td class="ws-line-content">${highlightFortran(esc(line)) || ' '}</td></tr>`;
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

  // strings
  code = code.replace(/(["'])(?:(?!\1).)*\1/g, '<span class="syn-string">$&</span>');
  // numbers
  code = code.replace(/\b(\d+\.?\d*(?:[eEdD][+-]?\d+)?)\b/g, '<span class="syn-number">$1</span>');
  // MPI
  code = code.replace(new RegExp('\\b(' + MPI_NAMES.join('|') + ')\\b', 'gi'), '<span class="syn-mpi">$&</span>');
  // keywords
  code = code.replace(new RegExp('\\b(' + FORTRAN_KEYWORDS.join('|') + ')\\b', 'gi'), '<span class="syn-keyword">$&</span>');
  // types
  code = code.replace(new RegExp('\\b(' + FORTRAN_TYPES.join('|') + ')\\b', 'gi'), '<span class="syn-type">$&</span>');

  return code + comment;
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
      const lines = [...out.matchAll(/:(\d+): (error|warning):/g)].map(m => parseInt(m[1]));
      if (lines.length && currentFilePath === data.file) {
        const fr = await fetch(`/api/file?path=${encodeURIComponent(currentFilePath)}`);
        renderCode((await fr.json()).content, lines);
        const el = document.getElementById(`ws-line-${lines[0]}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (data.exitCode === 0) {
        termWriteLine(`<span class="term-success">No issues found</span>`);
        setStatus('Clean', 'done');
      } else {
        setStatus(`${lines.length} issue(s)`, 'error');
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

btnRunFile.addEventListener('click', runAnalysis);
btnRunTests.addEventListener('click', runAllTests);
btnClearTerminal.addEventListener('click', () => { termClear(); setStatus('', ''); });
btnRefreshFiles.addEventListener('click', loadFileTree);

bindThemeToggle();
loadDashboard();
loadFileTree();
