const themeToggle = document.getElementById('themeToggle');
const statsGrid = document.getElementById('statsGrid');
const rulesGrid = document.getElementById('rulesGrid');
const resultsBody = document.getElementById('resultsBody');
const workflowGrid = document.getElementById('workflowGrid');
const evaluationGrid = document.getElementById('evaluationGrid');
const diagnosticsList = document.getElementById('diagnosticsList');

let chartInstances = {};

async function loadDashboard() {
  try {
    const response = await fetch('./data.json');
    const data = await response.json();
    renderDashboard(data);
  } catch (error) {
    console.error('Failed to load dashboard data', error);
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
  bindThemeToggle();
  animateCounters();
}

function renderStats(stats) {
  statsGrid.innerHTML = stats
    .map(
      (item) => `
        <div class="col-md-6 col-xl-4">
          <div class="stat-card glass-panel">
            <div class="stat-icon"><i class="${item.icon}"></i></div>
            <div class="stat-label">${item.label}</div>
            <div class="stat-value" data-counter="${item.value}" data-suffix="${item.suffix || ''}" data-decimals="${item.decimals || 0}">0${item.suffix || ''}</div>
          </div>
        </div>
      `
    )
    .join('');
}

function renderRules(rules) {
  rulesGrid.innerHTML = rules
    .map(
      (rule) => `
        <div class="col-md-6 col-lg-4">
          <div class="rule-card glass-panel">
            <div class="rule-header">
              <span class="rule-name">${rule.name}</span>
              <span class="status-icon ${rule.statusClass}"><i class="${rule.statusIcon}"></i></span>
            </div>
            <p class="rule-desc">${rule.description}</p>
            <div class="rule-footer">
              <span>${rule.category}</span>
              <strong>${rule.detections} detections</strong>
            </div>
          </div>
        </div>
      `
    )
    .join('');
}

function renderResults(diagnostics) {
  resultsBody.innerHTML = diagnostics
    .map(
      (item) => `
        <tr>
          <td>${item.file}</td>
          <td>${item.line}</td>
          <td>${item.mpiFunction}</td>
          <td>${item.rule}</td>
          <td><span class="badge-sev ${getSeverityClass(item.severity)}">${item.severity}</span></td>
          <td>${item.description}</td>
        </tr>
      `
    )
    .join('');
}

function renderWorkflow(items) {
  workflowGrid.innerHTML = items
    .map(
      (item, index) => `
        <div class="workflow-card">
          <div class="icon"><i class="${item.icon}"></i></div>
          <h5>${item.title}</h5>
          <p>${item.description}</p>
        </div>
        ${index < items.length - 1 ? '<div class="workflow-arrow"><i class="fa-solid fa-arrow-down"></i></div>' : ''}
      `
    )
    .join('');
}

function renderEvaluation(items) {
  evaluationGrid.innerHTML = items
    .map(
      (item) => `
        <div class="evaluation-item">
          <strong>${item.value}</strong>
          <span>${item.label}</span>
        </div>
      `
    )
    .join('');
}

function renderDiagnostics(items) {
  diagnosticsList.innerHTML = items
    .map(
      (item) => `
        <div class="diagnostic-item">
          <div>${item.message}</div>
          <div class="meta">${item.file}:${item.line} • ${item.rule}</div>
        </div>
      `
    )
    .join('');
}

function renderCharts(charts) {
  const chartColors = ['#1f6fb2', '#1fb6b6', '#4ea6ff', '#39d1c8'];

  if (chartInstances.errors) chartInstances.errors.destroy();
  if (chartInstances.rules) chartInstances.rules.destroy();
  if (chartInstances.line) chartInstances.line.destroy();
  if (chartInstances.doughnut) chartInstances.doughnut.destroy();

  chartInstances.errors = new Chart(document.getElementById('errorsChart'), {
    type: 'pie',
    data: {
      labels: charts.errors.labels,
      datasets: [{
        data: charts.errors.data,
        backgroundColor: [chartColors[0], chartColors[1]],
        borderWidth: 0
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  chartInstances.rules = new Chart(document.getElementById('rulesChart'), {
    type: 'bar',
    data: {
      labels: charts.rules.labels,
      datasets: [{
        data: charts.rules.data,
        backgroundColor: chartColors,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { display: false } }
    }
  });

  chartInstances.line = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels: charts.timeline.labels,
      datasets: [{
        label: 'Seconds',
        data: charts.timeline.data,
        borderColor: chartColors[1],
        backgroundColor: 'rgba(31, 182, 182, 0.18)',
        fill: true,
        tension: 0.35,
        pointRadius: 4
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });

  chartInstances.doughnut = new Chart(document.getElementById('doughnutChart'), {
    type: 'doughnut',
    data: {
      labels: charts.mpicalls.labels,
      datasets: [{
        data: charts.mpicalls.data,
        backgroundColor: chartColors,
        borderWidth: 0
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function animateCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  counters.forEach((counter) => {
    const target = parseFloat(counter.dataset.counter);
    const decimals = parseInt(counter.dataset.decimals || '0', 10);
    const suffix = counter.dataset.suffix || '';
    let start = 0;
    const duration = 1200;
    const startTime = performance.now();

    const step = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      counter.textContent = `${current.toFixed(decimals)}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
      else counter.textContent = `${target.toFixed(decimals)}${suffix}`;
    };

    requestAnimationFrame(step);
  });
}

function bindThemeToggle() {
  const storedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(storedTheme);
  themeToggle.innerHTML = storedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  themeToggle.onclick = () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  };
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  themeToggle.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

function getSeverityClass(severity) {
  if (severity.toLowerCase() === 'error') return 'badge-error';
  if (severity.toLowerCase() === 'warning') return 'badge-warning';
  return 'badge-pass';
}

function getFallbackData() {
  return {
    project: {
      title: 'mpicheck',
      subtitle: 'Static Analysis Tool for MPI Correctness in Fortran'
    },
    stats: [
      { label: 'Files Scanned', value: 38, icon: 'fa-solid fa-file-lines' },
      { label: 'MPI Calls Detected', value: 142, icon: 'fa-solid fa-network-wired' },
      { label: 'Errors Found', value: 14, icon: 'fa-solid fa-circle-exclamation' },
      { label: 'Warnings Found', value: 6, icon: 'fa-solid fa-triangle-exclamation' },
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
      { title: 'Flang Semantic Analysis', description: 'Fortran-aware AST pass', icon: 'fa-solid fa-magnifying-glass' },
      { title: 'Metadata Extraction', description: 'Type, shape, and layout data', icon: 'fa-solid fa-database' },
      { title: 'Python Rule Engine', description: 'Modular correctness checks', icon: 'fa-solid fa-gears' },
      { title: 'Diagnostics', description: 'Compiler-style findings', icon: 'fa-solid fa-bug' },
      { title: 'Reports', description: 'Charts and summaries', icon: 'fa-solid fa-chart-column' }
    ],
    evaluation: [
      { label: 'Test Cases Passed', value: '50/50' },
      { label: 'False Positives', value: '0' },
      { label: 'Diagnostics on NPB', value: '17' },
      { label: 'Static Analysis Rules', value: '10' }
    ],
    recentDiagnostics: [
      { message: 'src/solver.f90:42: error: [datatype-mismatch] MPI_Send uses MPI_REAL with REAL(8) buffer', file: 'src/solver.f90', line: 42, rule: 'datatype-mismatch' },
      { message: 'src/solver.f90:51: warning: [handle-leak] MPI_Datatype not freed before scope exit', file: 'src/solver.f90', line: 51, rule: 'handle-leak' },
      { message: 'src/mesh.f90:19: error: [contiguity] non-unit stride section passed to MPI_Bcast', file: 'src/mesh.f90', line: 19, rule: 'contiguity' }
    ]
  };
}

loadDashboard();
