/**
 * Resource Allocation Simulator using Banker's Algorithm & Deadlock Simulator
 * Complete interactive operating systems problem solver & lab tool
 */

const $ = (id) => document.getElementById(id);

// Predefined Problem Presets (Available on-demand, not forced on load)
const PRESETS = {
  test_case_6x4: {
    processes: 6,
    resources: 4,
    processNames: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'],
    resourceNames: ['A', 'B', 'C', 'D'],
    availMode: 'direct',
    matrixMode: 'max',
    allocation: [
      [1, 0, 1, 0],
      [1, 1, 0, 1],
      [1, 0, 1, 1],
      [0, 1, 1, 0],
      [1, 1, 0, 0],
      [0, 0, 1, 1]
    ],
    max: [
      [4, 1, 3, 2],
      [2, 1, 2, 2],
      [2, 2, 2, 2],
      [2, 1, 2, 2],
      [2, 2, 2, 1],
      [2, 1, 2, 2]
    ],
    available: [2, 1, 1, 2],
    total: [6, 4, 5, 5]
  },
  textbook: {
    processes: 5,
    resources: 3,
    processNames: ['P0', 'P1', 'P2', 'P3', 'P4'],
    resourceNames: ['A', 'B', 'C'],
    availMode: 'direct',
    matrixMode: 'max',
    allocation: [[0,1,0],[2,0,0],[3,0,2],[2,1,1],[0,0,2]],
    max:        [[7,5,3],[3,2,2],[9,0,2],[2,2,2],[4,3,3]],
    available:  [3,3,2],
    total:      [10,5,7]
  },
  deadlock: {
    processes: 3,
    resources: 3,
    processNames: ['P0', 'P1', 'P2'],
    resourceNames: ['R1', 'R2', 'R3'],
    availMode: 'direct',
    matrixMode: 'max',
    allocation: [[1,0,2],[1,1,0],[1,2,1]],
    max:        [[3,2,2],[2,1,2],[3,3,3]],
    available:  [0,0,0],
    total:      [3,3,3]
  },
  four_process: {
    processes: 4,
    resources: 4,
    processNames: ['P0', 'P1', 'P2', 'P3'],
    resourceNames: ['A', 'B', 'C', 'D'],
    availMode: 'total',
    matrixMode: 'max',
    allocation: [[1,0,1,1],[1,1,0,0],[0,0,1,0],[0,0,0,1]],
    max:        [[2,1,1,2],[1,2,0,1],[1,0,2,0],[1,1,0,2]],
    available:  [1,1,1,1],
    total:      [3,2,3,3]
  },
  multi_safe: {
    processes: 5,
    resources: 3,
    processNames: ['P0', 'P1', 'P2', 'P3', 'P4'],
    resourceNames: ['A', 'B', 'C'],
    availMode: 'direct',
    matrixMode: 'max',
    allocation: [[0,0,1],[1,0,0],[1,3,5],[0,6,3],[0,0,1]],
    max:        [[0,0,1],[1,7,5],[2,3,5],[0,6,5],[0,6,5]],
    available:  [1,5,2],
    total:      [2,14,12]
  }
};

// Initial State: Starts with an EMPTY, customizable 5x3 table (all 0s)
let state = createEmptyState(5, 3);
let safetyResult = null;
let allSafeSequences = [];
let selectedSeqIndex = 0;
let traceIndex = 0;
let autoPlayInterval = null;
let chart = null;
let activity = [];
let tentativeRequestState = null;
let customDeadlockRequests = null;

function clone(val) {
  return JSON.parse(JSON.stringify(val));
}

function createEmptyState(p = 5, r = 3) {
  return {
    processes: p,
    resources: r,
    processNames: Array.from({ length: p }, (_, i) => `P${i}`),
    resourceNames: Array.from({ length: r }, (_, j) => String.fromCharCode(65 + j)),
    availMode: 'direct', // 'direct' or 'total'
    matrixMode: 'max',   // 'max' or 'need'
    allocation: Array.from({ length: p }, () => Array(r).fill(0)),
    max:        Array.from({ length: p }, () => Array(r).fill(0)),
    need:       Array.from({ length: p }, () => Array(r).fill(0)),
    available:  Array(r).fill(0),
    total:      Array(r).fill(0)
  };
}

function pName(i) {
  return state.processNames[i] || `P${i}`;
}

function rName(j) {
  return state.resourceNames[j] || String.fromCharCode(65 + j);
}

function sumColumn(matrix, col) {
  return matrix.reduce((sum, row) => sum + (Number(row[col]) || 0), 0);
}

function getNeedMatrix() {
  const p = state.processes, r = state.resources;
  if (state.matrixMode === 'need') {
    return state.need.map((row, i) =>
      row.map((val, j) => Math.max(0, Number(val) || 0))
    );
  }
  return state.max.map((row, i) =>
    row.map((val, j) => {
      const m = Number(val) || 0;
      const a = Number(state.allocation[i][j]) || 0;
      return Math.max(0, m - a);
    })
  );
}

function getMaxMatrix() {
  const p = state.processes, r = state.resources;
  if (state.matrixMode === 'max') {
    return state.max.map(row => row.map(v => Number(v) || 0));
  }
  return state.need.map((row, i) =>
    row.map((val, j) => {
      const n = Number(val) || 0;
      const a = Number(state.allocation[i][j]) || 0;
      return a + n;
    })
  );
}

function getEffectiveAvailable() {
  const r = state.resources;
  if (state.availMode === 'total') {
    return Array.from({ length: r }, (_, j) => {
      const tot = Number(state.total[j]) || 0;
      const alloc = sumColumn(state.allocation, j);
      return tot - alloc;
    });
  }
  return state.available.map(v => Number(v) || 0);
}

function vectorText(v) {
  return `[${v.join(', ')}]`;
}

function formatProcessNamesList(seq) {
  return seq.map(pName).join(' → ');
}

// Validation logic
function validateState() {
  const p = state.processes, r = state.resources;
  if (p < 1 || p > 10 || r < 1 || r > 6) {
    return 'Simulator supports 1–10 processes and 1–6 resource types.';
  }

  for (let i = 0; i < p; i++) {
    for (let j = 0; j < r; j++) {
      const a = Number(state.allocation[i][j]);
      if (!Number.isInteger(a) || a < 0) {
        return `Allocation for ${pName(i)}, resource ${rName(j)} must be a non-negative integer.`;
      }

      if (state.matrixMode === 'max') {
        const m = Number(state.max[i][j]);
        if (!Number.isInteger(m) || m < 0) {
          return `Max claim for ${pName(i)}, resource ${rName(j)} must be a non-negative integer.`;
        }
        if (a > m) {
          return `Invalid state: ${pName(i)} Allocation (${a}) exceeds Max Claim (${m}) for resource ${rName(j)}.`;
        }
      } else {
        const n = Number(state.need[i][j]);
        if (!Number.isInteger(n) || n < 0) {
          return `Need for ${pName(i)}, resource ${rName(j)} must be a non-negative integer.`;
        }
      }
    }
  }

  const avail = getEffectiveAvailable();
  if (state.availMode === 'total') {
    for (let j = 0; j < r; j++) {
      const tot = Number(state.total[j]);
      if (!Number.isInteger(tot) || tot < 0) {
        return `Total instances for resource ${rName(j)} must be a non-negative integer.`;
      }
      if (avail[j] < 0) {
        return `Over-allocated: Total for ${rName(j)} is ${tot}, but total allocated is ${sumColumn(state.allocation, j)}. Available is ${avail[j]} (negative).`;
      }
    }
  } else {
    for (let j = 0; j < r; j++) {
      const av = Number(state.available[j]);
      if (!Number.isInteger(av) || av < 0) {
        return `Available instances for resource ${rName(j)} must be a non-negative integer.`;
      }
    }
  }

  return '';
}

// Banker's Algorithm: Find ALL Safe Sequences
function findAllSafeSequencesDFS(p, r, allocation, need, initialWork) {
  const allSeqs = [];

  function dfs(work, finish, currentSeq) {
    if (currentSeq.length === p) {
      allSeqs.push([...currentSeq]);
      return;
    }

    for (let i = 0; i < p; i++) {
      if (!finish[i]) {
        // Condition: Need[i] <= Work
        let canFinish = true;
        for (let j = 0; j < r; j++) {
          if (need[i][j] > work[j]) {
            canFinish = false;
            break;
          }
        }

        if (canFinish) {
          finish[i] = true;
          const nextWork = work.map((w, j) => w + allocation[i][j]);
          currentSeq.push(i);
          dfs(nextWork, finish, currentSeq);
          currentSeq.pop();
          finish[i] = false;
        }
      }
    }
  }

  dfs([...initialWork], Array(p).fill(false), []);
  return allSeqs;
}

// Build step-by-step trace for a specific safe sequence
function buildTraceForSequence(seq, p, r, allocation, need, initialWork) {
  const steps = [];
  const work = [...initialWork];
  for (let idx = 0; idx < seq.length; idx++) {
    const proc = seq[idx];
    const before = [...work];
    for (let j = 0; j < r; j++) {
      work[j] += allocation[proc][j];
    }
    steps.push({
      process: proc,
      need: [...need[proc]],
      allocation: [...allocation[proc]],
      before,
      after: [...work]
    });
  }
  return steps;
}

// Execute Banker's Safety Check
function runSafety() {
  const err = validateState();
  if (err) {
    showValidation(err, 'danger');
    return null;
  }
  showValidation('', '');

  const p = state.processes, r = state.resources;
  const need = getNeedMatrix();
  const allocation = state.allocation.map(row => row.map(v => Number(v) || 0));
  const work = getEffectiveAvailable();
  const initialWork = [...work];

  // 1. Find all safe sequences
  const sequences = findAllSafeSequencesDFS(p, r, allocation, need, initialWork);
  allSafeSequences = sequences;

  if (sequences.length > 0) {
    selectedSeqIndex = 0;
    const primarySeq = sequences[0];
    const steps = buildTraceForSequence(primarySeq, p, r, allocation, need, initialWork);
    return {
      safe: true,
      sequence: primarySeq,
      allSequences: sequences,
      steps,
      need,
      initialWork,
      finalWork: steps.length ? steps[steps.length - 1].after : initialWork
    };
  }

  // If unsafe, find partial progress
  const finish = Array(p).fill(false);
  const partialSteps = [];
  let tempWork = [...initialWork];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (let i = 0; i < p; i++) {
      if (!finish[i]) {
        let canFinish = true;
        for (let j = 0; j < r; j++) {
          if (need[i][j] > tempWork[j]) {
            canFinish = false;
            break;
          }
        }
        if (canFinish) {
          const before = [...tempWork];
          for (let j = 0; j < r; j++) tempWork[j] += allocation[i][j];
          finish[i] = true;
          partialSteps.push({
            process: i,
            need: [...need[i]],
            allocation: [...allocation[i]],
            before,
            after: [...tempWork]
          });
          progressed = true;
          break;
        }
      }
    }
  }

  return {
    safe: false,
    sequence: [],
    allSequences: [],
    steps: partialSteps,
    finish,
    need,
    initialWork,
    finalWork: tempWork
  };
}

function checkSafety() {
  const err = validateState();
  if (err) {
    showValidation(err, 'danger');
    safetyResult = null;
    allSafeSequences = [];
    selectedSeqIndex = 0;
    traceIndex = 0;
    pauseAutoPlay();

    $('statusValue').textContent = 'Invalid / Error';
    $('statusValue').style.color = '#b91c1c';
    $('statusFoot').textContent = err;
    $('safeSeqCount').textContent = '0';
    $('safeSeqCount').style.color = '#b91c1c';
    $('sequenceFoot').textContent = 'Resolve error to test';

    $('allSequencesContainer').classList.add('d-none');
    $('stepSummary').textContent = err;
    $('traceList').innerHTML = '';
    $('stepNextBtn').disabled = true;
    $('stepBackBtn').disabled = true;
    if ($('stepResetBtn')) $('stepResetBtn').disabled = true;
    $('autoPlayBtn').disabled = true;
    highlightActiveTableRow();
    renderChart();
    return;
  }

  const res = runSafety();
  if (!res) return;

  safetyResult = res;
  traceIndex = 0;
  pauseAutoPlay();

  if (res.safe) {
    $('statusValue').textContent = 'Safe State';
    $('statusValue').style.color = '#15803d';
    $('statusFoot').textContent = 'System is guaranteed deadlock-free';
    $('safeSeqCount').textContent = res.allSequences.length;
    $('safeSeqCount').style.color = '#15803d';
    $('sequenceFoot').textContent = res.allSequences.length === 1 ? '1 safe order found' : `${res.allSequences.length} safe orders found`;

    renderSafeSequencesBadges();
    renderTrace();
    renderChart();
    highlightActiveTableRow();

    const seqStr = formatProcessNamesList(res.sequence);
    showValidation(`Safe state confirmed! ${res.allSequences.length} valid safe sequence(s) found. One order: ${seqStr}.`, 'success');
    logAction(`Safety check PASSED (${res.allSequences.length} valid sequences). Sequence: ${seqStr}`, 'success');
  } else {
    $('statusValue').textContent = 'Unsafe State';
    $('statusValue').style.color = '#b91c1c';
    $('statusFoot').textContent = 'Deadlock avoidance cannot be guaranteed';
    $('safeSeqCount').textContent = '0';
    $('safeSeqCount').style.color = '#b91c1c';
    $('sequenceFoot').textContent = 'No complete safe sequence';

    $('allSequencesContainer').classList.add('d-none');
    renderTrace();
    renderChart();
    highlightActiveTableRow();

    const blocked = res.finish
      ? res.finish.map((done, i) => done ? null : pName(i)).filter(Boolean)
      : [];
    showValidation(`Unsafe state: No complete safe sequence could be found. Process(es) unable to finish: ${blocked.join(', ') || 'All'}.`, 'warning');
    logAction('Safety check FAILED: System is in an unsafe state.', 'warning');
  }
}

// Render badges for all safe sequences
function renderSafeSequencesBadges() {
  const container = $('allSequencesContainer');
  const badgeWrap = $('safeSequencesBadges');
  const countEl = $('seqFoundCount');

  if (!safetyResult || !safetyResult.safe || allSafeSequences.length === 0) {
    container.classList.add('d-none');
    return;
  }

  container.classList.remove('d-none');
  countEl.textContent = allSafeSequences.length;

  badgeWrap.innerHTML = allSafeSequences.map((seq, i) => {
    const active = i === selectedSeqIndex ? 'active' : '';
    return `<button class="seq-badge ${active}" data-seq-index="${i}">${formatProcessNamesList(seq)}</button>`;
  }).join('');

  badgeWrap.querySelectorAll('.seq-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const idx = Number(badge.dataset.seqIndex);
      switchSafeSequence(idx);
    });
  });
}

function switchSafeSequence(idx) {
  if (!safetyResult || !allSafeSequences[idx]) return;
  selectedSeqIndex = idx;
  const p = state.processes, r = state.resources;
  const need = getNeedMatrix();
  const allocation = state.allocation.map(row => row.map(v => Number(v) || 0));
  const initialWork = [...safetyResult.initialWork];

  safetyResult.sequence = allSafeSequences[idx];
  safetyResult.steps = buildTraceForSequence(allSafeSequences[idx], p, r, allocation, need, initialWork);
  traceIndex = 0;

  renderSafeSequencesBadges();
  renderTrace();
  highlightActiveTableRow();
  logAction(`Switched trace view to sequence: ${formatProcessNamesList(allSafeSequences[idx])}`);
}

function renderTrace() {
  if (!safetyResult) {
    $('traceList').innerHTML = '';
    $('stepSummary').textContent = 'Run the safety check to generate an execution trace.';
    $('stepNextBtn').disabled = true;
    $('stepBackBtn').disabled = true;
    if ($('stepResetBtn')) $('stepResetBtn').disabled = true;
    $('autoPlayBtn').disabled = true;
    return;
  }

  const { steps, safe, initialWork } = safetyResult;
  if (safe) {
    $('stepSummary').innerHTML = `
      <strong>Safe Sequence Active:</strong> <span class="badge bg-primary font-monospace">${formatProcessNamesList(safetyResult.sequence)}</span><br>
      <span class="text-secondary">Initial Work = <code>${vectorText(initialWork)}</code>. Step forward to inspect resource release.</span>
    `;
  } else {
    $('stepSummary').innerHTML = `
      <strong class="text-danger">Unsafe state detected:</strong> Only ${steps.length} of ${state.processes} process(es) could finish.<br>
      <span class="text-secondary">Work at standstill = <code>${vectorText(steps.length ? steps[steps.length - 1].after : initialWork)}</code>.</span>
    `;
  }

  if (steps.length === 0) {
    $('traceList').innerHTML = `<div class="text-secondary small p-3 bg-light rounded text-center">No process can satisfy <code>Need ≤ Work</code> with the initial Available vector.</div>`;
    $('stepNextBtn').disabled = true;
    $('stepBackBtn').disabled = true;
    if ($('stepResetBtn')) $('stepResetBtn').disabled = true;
    $('autoPlayBtn').disabled = true;
    return;
  }

  $('traceList').innerHTML = steps.map((s, i) => {
    const isActive = i === traceIndex;
    return `
      <div class="trace-step ${isActive ? 'active' : ''}" data-step="${i}">
        <div class="trace-index">${i + 1}</div>
        <div class="flex-grow-1">
          <div class="trace-title d-flex justify-content-between">
            <span><strong>${pName(s.process)}</strong> qualifies to finish</span>
            <span class="badge ${isActive ? 'bg-primary' : 'bg-light text-secondary border'}">Step ${i + 1} of ${steps.length}</span>
          </div>
          <div class="trace-detail mt-1">
            <span class="text-success"><i class="bi bi-check-circle me-1"></i>Need ${vectorText(s.need)} ≤ Work ${vectorText(s.before)}</span><br>
            <span>Work' = Work + Alloc = ${vectorText(s.before)} + ${vectorText(s.allocation)} = <strong>${vectorText(s.after)}</strong></span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click listener on trace steps
  $('traceList').querySelectorAll('.trace-step').forEach(stepEl => {
    stepEl.addEventListener('click', () => {
      traceIndex = Number(stepEl.dataset.step);
      renderTrace();
      highlightActiveTableRow();
    });
  });

  $('stepBackBtn').disabled = traceIndex <= 0;
  if ($('stepResetBtn')) $('stepResetBtn').disabled = traceIndex <= 0;
  $('stepNextBtn').disabled = traceIndex >= steps.length - 1;
  $('autoPlayBtn').disabled = steps.length <= 1;
}

// Table row highlight during trace
function highlightActiveTableRow() {
  const table = $('matrixTable');
  if (!table) return;

  table.querySelectorAll('tr').forEach(tr => {
    tr.classList.remove('highlight-process-row', 'process-finished');
  });

  if (!safetyResult || !safetyResult.steps || safetyResult.steps.length === 0) return;

  const currentStep = safetyResult.steps[traceIndex];
  if (!currentStep) return;

  const activeProcess = currentStep.process;
  const targetRow = table.querySelector(`tr[data-process-index="${activeProcess}"]`);
  if (targetRow) {
    targetRow.classList.add('highlight-process-row');
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Dim processes that finished before current step
  for (let s = 0; s < traceIndex; s++) {
    const pIdx = safetyResult.steps[s].process;
    const row = table.querySelector(`tr[data-process-index="${pIdx}"]`);
    if (row && pIdx !== activeProcess) {
      row.classList.add('process-finished');
    }
  }
}

// Invalidate results when data changes
function invalidateResult() {
  safetyResult = null;
  allSafeSequences = [];
  selectedSeqIndex = 0;
  traceIndex = 0;
  pauseAutoPlay();

  $('statusValue').textContent = 'Ready';
  $('statusValue').style.color = '#0f172a';
  $('statusFoot').textContent = 'Inputs updated. Run safety check';
  $('safeSeqCount').textContent = '0';
  $('safeSeqCount').style.color = '#0f172a';
  $('sequenceFoot').textContent = 'Awaiting check';

  $('allSequencesContainer').classList.add('d-none');
  $('stepSummary').textContent = 'Inputs changed. Run the safety check to refresh the execution trace.';
  $('traceList').innerHTML = '';
  $('stepNextBtn').disabled = true;
  $('stepBackBtn').disabled = true;
  $('autoPlayBtn').disabled = true;

  highlightActiveTableRow();
  renderChart();
  updateMetrics();
}

function showValidation(msg, type) {
  const el = $('validationMessage');
  if (!msg) {
    el.className = 'alert d-none mt-3 mb-0';
    el.textContent = '';
    return;
  }
  el.className = `alert alert-${type} mt-3 mb-0 py-2 small`;
  el.textContent = msg;
}

// Render dynamic Matrix Table
function renderMatrix() {
  const p = state.processes, r = state.resources;
  const need = getNeedMatrix();
  const maxMatrix = getMaxMatrix();
  const effAvailable = getEffectiveAvailable();
  const table = $('matrixTable');

  const secondColName = state.matrixMode === 'max' ? 'Max Claim' : 'Remaining Need';
  const thirdColName  = state.matrixMode === 'max' ? 'Need (Auto)' : 'Max (Auto)';

  let html = `
    <thead>
      <tr>
        <th rowspan="2">Process</th>
        <th class="group-head" colspan="${r}">Allocation</th>
        <th class="group-head" colspan="${r}">${secondColName}</th>
        <th class="group-head" colspan="${r}">${thirdColName}</th>
      </tr>
      <tr>
  `;

  for (let g = 0; g < 3; g++) {
    for (let j = 0; j < r; j++) {
      html += `<th>${rName(j)}</th>`;
    }
  }
  html += `</tr></thead><tbody>`;

  // Process rows
  for (let i = 0; i < p; i++) {
    html += `<tr data-process-index="${i}"><td class="process-label">${pName(i)}</td>`;

    // Allocation inputs
    for (let j = 0; j < r; j++) {
      const aVal = state.allocation[i][j];
      html += `
        <td>
          <input class="form-control matrix-input" type="number" min="0" step="1"
            data-kind="allocation" data-p="${i}" data-r="${j}" value="${aVal}"
            aria-label="${pName(i)} allocation ${rName(j)}">
        </td>
      `;
    }

    // Second group: Max or Need inputs
    if (state.matrixMode === 'max') {
      for (let j = 0; j < r; j++) {
        const mVal = state.max[i][j];
        const aVal = state.allocation[i][j];
        const isErr = aVal > mVal;
        html += `
          <td>
            <input class="form-control matrix-input ${isErr ? 'cell-error' : ''}" type="number" min="0" step="1"
              data-kind="max" data-p="${i}" data-r="${j}" value="${mVal}"
              title="${isErr ? 'Allocation cannot exceed Max' : ''}"
              aria-label="${pName(i)} max ${rName(j)}">
          </td>
        `;
      }
    } else {
      for (let j = 0; j < r; j++) {
        const nVal = state.need[i][j];
        html += `
          <td>
            <input class="form-control matrix-input" type="number" min="0" step="1"
              data-kind="need" data-p="${i}" data-r="${j}" value="${nVal}"
              aria-label="${pName(i)} need ${rName(j)}">
          </td>
        `;
      }
    }

    // Third group: Auto computed (Need or Max)
    if (state.matrixMode === 'max') {
      for (let j = 0; j < r; j++) {
        html += `<td><span class="need-cell" data-calc-p="${i}" data-calc-r="${j}">${need[i][j]}</span></td>`;
      }
    } else {
      for (let j = 0; j < r; j++) {
        html += `<td><span class="need-cell" data-calc-p="${i}" data-calc-r="${j}">${maxMatrix[i][j]}</span></td>`;
      }
    }

    html += `</tr>`;
  }

  // Summary Row: Total Allocated
  html += `<tr class="sum-row"><td class="process-label text-muted">Total Allocated</td>`;
  for (let j = 0; j < r; j++) {
    html += `<td><strong data-sum-r="${j}">${sumColumn(state.allocation, j)}</strong></td>`;
  }
  html += `<td colspan="${r * 2}" class="text-secondary small text-start ps-3">Sum of current allocations across processes</td></tr>`;

  // Row for Total System Instances (if Total mode active)
  if (state.availMode === 'total') {
    html += `<tr class="total-row"><td class="process-label text-purple">Total System Instances</td>`;
    for (let j = 0; j < r; j++) {
      html += `
        <td>
          <input class="form-control matrix-input" type="number" min="0" step="1"
            data-kind="total" data-r="${j}" value="${state.total[j]}"
            aria-label="Total ${rName(j)}">
        </td>
      `;
    }
    html += `<td colspan="${r * 2}" class="text-secondary small text-start ps-3">Total physical units in system (Auto Available = Total − Allocated)</td></tr>`;
  }

  // Row for Available
  html += `<tr class="available-row"><td class="process-label">Available</td>`;
  for (let j = 0; j < r; j++) {
    const av = effAvailable[j];
    if (state.availMode === 'total') {
      html += `<td><span class="available-badge ${av < 0 ? 'negative' : ''}" data-avail-r="${j}">${av}</span></td>`;
    } else {
      html += `
        <td>
          <input class="form-control matrix-input" type="number" min="0" step="1"
            data-kind="available" data-r="${j}" value="${state.available[j]}"
            aria-label="Available ${rName(j)}">
        </td>
      `;
    }
  }
  html += `<td colspan="${r * 2}" class="text-secondary small text-start ps-3">${state.availMode === 'total' ? 'Calculated free resources: Available = Total − Total Allocated' : 'Current free resource instances available to assign'}</td></tr>`;

  html += `</tbody>`;
  table.innerHTML = html;

  // Attach input event listeners
  table.querySelectorAll('input').forEach(inp => {
    const handleInput = () => {
      const val = Number(inp.value);
      const kind = inp.dataset.kind;
      const rIdx = Number(inp.dataset.r);
      const pIdx = Number(inp.dataset.p);

      if (isNaN(val) || val < 0) {
        inp.value = 0;
        showValidation('Please enter a non-negative whole integer.', 'danger');
        return;
      }

      if (kind === 'available') {
        state.available[rIdx] = val;
      } else if (kind === 'total') {
        state.total[rIdx] = val;
      } else if (kind === 'allocation') {
        state.allocation[pIdx][rIdx] = val;
      } else if (kind === 'max') {
        state.max[pIdx][rIdx] = val;
      } else if (kind === 'need') {
        state.need[pIdx][rIdx] = val;
      }

      updateTableCalculatedCells();
      populateRequestInputs();
      checkSafety();
    };

    inp.addEventListener('input', handleInput);
    inp.addEventListener('change', () => {
      renderMatrix();
      checkSafety();
    });
  });

  updateMetrics();
  populateRequestProcess();
}

function updateTableCalculatedCells() {
  const p = state.processes, r = state.resources;
  const need = getNeedMatrix();
  const maxMatrix = getMaxMatrix();
  const effAvailable = getEffectiveAvailable();
  const table = $('matrixTable');
  if (!table) return;

  for (let i = 0; i < p; i++) {
    for (let j = 0; j < r; j++) {
      const cell = table.querySelector(`[data-calc-p="${i}"][data-calc-r="${j}"]`);
      if (cell) {
        cell.textContent = state.matrixMode === 'max' ? need[i][j] : maxMatrix[i][j];
      }
      if (state.matrixMode === 'max') {
        const maxInp = table.querySelector(`input[data-kind="max"][data-p="${i}"][data-r="${j}"]`);
        if (maxInp) {
          const isErr = Number(state.allocation[i][j]) > Number(state.max[i][j]);
          maxInp.classList.toggle('cell-error', isErr);
        }
      }
    }
  }

  for (let j = 0; j < r; j++) {
    const sumEl = table.querySelector(`[data-sum-r="${j}"]`);
    if (sumEl) sumEl.textContent = sumColumn(state.allocation, j);

    const availEl = table.querySelector(`[data-avail-r="${j}"]`);
    if (availEl) {
      const av = effAvailable[j];
      availEl.textContent = av;
      availEl.classList.toggle('negative', av < 0);
    }
  }
}

function updateMetrics() {
  const p = state.processes, r = state.resources;
  $('processCount').textContent = p;
  $('resourceCount').textContent = r;
  $('processFoot').textContent = `${pName(0)} – ${pName(p - 1)}`;
  $('resourceFoot').textContent = state.resourceNames.join(', ');
}

function populateRequestProcess() {
  const sel = $('requestProcess');
  const prev = Number(sel.value) || 0;
  sel.innerHTML = state.processNames.map((name, i) =>
    `<option value="${i}">${name}</option>`
  ).join('');
  sel.value = String(Math.min(prev, state.processes - 1));
  updateRequestProcessInfo();
}

function updateRequestProcessInfo() {
  const p = Number($('requestProcess').value) || 0;
  const need = getNeedMatrix()[p] || [];
  const needStr = vectorText(need);
  $('requestProcessInfo').innerHTML = `Remaining Need for <strong>${pName(p)}</strong>: <code>${needStr}</code>`;
}

function populateRequestInputs() {
  const r = state.resources;
  $('requestInputs').innerHTML = Array.from({ length: r }, (_, j) => `
    <div class="request-field">
      <label for="req${j}">${rName(j)} units</label>
      <input id="req${j}" class="form-control" type="number" min="0" step="1" value="0" aria-label="Request ${rName(j)}">
    </div>
  `).join('');
}

// Chart.js Visualization
function renderChart() {
  const r = state.resources;
  const allocated = Array.from({ length: r }, (_, j) => sumColumn(state.allocation, j));
  const available = getEffectiveAvailable();
  const labels = state.resourceNames;

  const datasets = [
    {
      label: 'Allocated',
      data: allocated,
      backgroundColor: '#3b82f6',
      borderRadius: 6,
      maxBarThickness: 32
    },
    {
      label: 'Available',
      data: available.map(v => Math.max(0, v)),
      backgroundColor: '#10b981',
      borderRadius: 6,
      maxBarThickness: 32
    }
  ];

  if (state.availMode === 'total') {
    datasets.push({
      label: 'Total',
      data: state.total.map(v => Number(v) || 0),
      backgroundColor: '#8b5cf6',
      borderRadius: 6,
      maxBarThickness: 32
    });
    $('chartLegendTotal').classList.remove('d-none');
  } else {
    $('chartLegendTotal').classList.add('d-none');
  }

  const data = { labels, datasets };

  if (chart) {
    chart.data = data;
    chart.update();
  } else {
    const ctx = $('resourceChart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            titleFont: { family: 'DM Sans', weight: 'bold' }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { family: 'DM Sans' } }
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: '#64748b' },
            grid: { color: '#e2e8f0' }
          }
        }
      }
    });
  }
}

// Activity Logging
function logAction(msg, kind = 'info') {
  activity.unshift({
    msg,
    kind,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  activity = activity.slice(0, 15);
  renderLog();
}

function renderLog() {
  const container = $('activityLog');
  if (activity.length === 0) {
    container.innerHTML = '<div class="empty-log"><i class="bi bi-journal-text"></i><span>Actions will appear here.</span></div>';
    return;
  }
  container.innerHTML = activity.map(item => {
    let iconClass = 'bi-activity';
    if (item.kind === 'success') iconClass = 'bi-check-lg';
    else if (item.kind === 'warning') iconClass = 'bi-exclamation-triangle';
    else if (item.kind === 'danger') iconClass = 'bi-x-octagon';

    return `
      <div class="log-item ${item.kind}">
        <span class="log-icon"><i class="bi ${iconClass}"></i></span>
        <div>
          <div>${escapeHTML(item.msg)}</div>
          <div class="log-time">${item.time}</div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Resource Request Simulation
function simulateRequest() {
  const err = validateState();
  if (err) {
    showRequest(err, 'danger');
    return;
  }

  const p = Number($('requestProcess').value);
  const r = state.resources;
  const request = Array.from({ length: r }, (_, j) => Number($(`req${j}`).value) || 0);

  if (request.some(v => !Number.isInteger(v) || v < 0)) {
    showRequest('Requested values must be non-negative integers.', 'danger');
    return;
  }

  if (request.every(v => v === 0)) {
    showRequest('Request vector is all zeros [0, ...]. Please enter at least 1 unit to request.', 'warning');
    return;
  }

  const need = getNeedMatrix()[p];
  const avail = getEffectiveAvailable();

  // Condition 1: Request <= Need
  for (let j = 0; j < r; j++) {
    if (request[j] > need[j]) {
      const msg = `Condition 1 Failed (Request > Need): ${pName(p)} requested ${request[j]} unit(s) of ${rName(j)}, but remaining Need is ${need[j]}. Process exceeded declared maximum claim. Request DENIED.`;
      showRequest(msg, 'danger');
      $('commitRequestBtn').classList.add('d-none');
      logAction(`Request DENIED for ${pName(p)}: exceeds remaining Need.`, 'warning');
      return;
    }
  }

  // Condition 2: Request <= Available
  for (let j = 0; j < r; j++) {
    if (request[j] > avail[j]) {
      const msg = `Condition 2 Failed (Request > Available): ${pName(p)} requested ${request[j]} unit(s) of ${rName(j)}, but only ${avail[j]} unit(s) are currently Available. Process must WAIT.`;
      showRequest(msg, 'warning');
      $('commitRequestBtn').classList.add('d-none');
      logAction(`Request WAITING for ${pName(p)}: insufficient available resources.`, 'warning');
      return;
    }
  }

  // Condition 3: Tentative Allocation & Safety Check
  const backup = clone(state);
  for (let j = 0; j < r; j++) {
    if (state.availMode === 'direct') {
      state.available[j] -= request[j];
    }
    state.allocation[p][j] += request[j];
    if (state.matrixMode === 'need') {
      state.need[p][j] -= request[j];
    }
  }

  // Preserve current UI safety state so tentative safety check does not mutate it unless committed
  const savedSafetyResult = safetyResult;
  const savedAllSequences = allSafeSequences;
  const savedSelectedSeq = selectedSeqIndex;

  const res = runSafety();
  state = backup;
  safetyResult = savedSafetyResult;
  allSafeSequences = savedAllSequences;
  selectedSeqIndex = savedSelectedSeq;

  if (res && res.safe) {
    tentativeRequestState = clone(backup);
    for (let j = 0; j < r; j++) {
      if (tentativeRequestState.availMode === 'direct') {
        tentativeRequestState.available[j] -= request[j];
      }
      tentativeRequestState.allocation[p][j] += request[j];
      if (tentativeRequestState.matrixMode === 'need') {
        tentativeRequestState.need[p][j] -= request[j];
      }
    }

    const seqStr = formatProcessNamesList(res.sequence);
    const msg = `Conditions 1 & 2 Satisfied. Tentative allocation leaves system in a SAFE state. Request can be GRANTED immediately!<br>Safe Sequence: <strong>${seqStr}</strong> (${res.allSequences.length} safe sequence(s) found). Click 'Commit Changes' below to permanently apply this allocation.`;
    showRequest(msg, 'success');
    $('commitRequestBtn').classList.remove('d-none');
    logAction(`Request for ${pName(p)} ${vectorText(request)} validated as SAFE.`, 'success');
  } else {
    tentativeRequestState = null;
    const msg = `Condition 3 Failed: Granting request ${vectorText(request)} to ${pName(p)} would lead to an UNSAFE state (potential deadlock). Request is DENIED and resources are not allocated.`;
    showRequest(msg, 'danger');
    $('commitRequestBtn').classList.add('d-none');
    logAction(`Request for ${pName(p)} DENIED: resulting state would be unsafe.`, 'danger');
  }
}

function commitRequest() {
  if (!tentativeRequestState) return;
  state = clone(tentativeRequestState);
  tentativeRequestState = null;
  $('commitRequestBtn').classList.add('d-none');
  showRequest('Changes successfully committed to resource matrices!', 'success');
  renderMatrix();
  renderChart();
  checkSafety();
  logAction('Request allocation committed to main matrices.', 'success');
}

function showRequest(msg, type) {
  const el = $('requestResult');
  el.className = `request-result mt-3 ${type}`;
  el.innerHTML = msg;
  el.classList.remove('d-none');
}

function clearRequest() {
  populateRequestInputs();
  $('requestResult').classList.add('d-none');
  $('commitRequestBtn').classList.add('d-none');
  tentativeRequestState = null;
}

// Deadlock Detection Algorithm
function runDeadlockDetection() {
  const err = validateState();
  if (err) {
    showDeadlockResult(err, 'danger');
    return;
  }

  const p = state.processes, r = state.resources;
  const allocation = state.allocation.map(row => row.map(v => Number(v) || 0));
  const work = getEffectiveAvailable();
  const initialWork = [...work];

  // Outstanding request matrix: either from custom request table or from Need matrix
  let requestMatrix;
  if ($('useCustomDeadlockRequests').checked && customDeadlockRequests) {
    requestMatrix = customDeadlockRequests;
  } else {
    requestMatrix = getNeedMatrix();
  }

  // Detection Algorithm Initialization
  const finish = Array(p).fill(false);
  for (let i = 0; i < p; i++) {
    const isAllocZero = allocation[i].every(v => v === 0);
    if (isAllocZero) finish[i] = true;
  }

  const steps = [];
  let found = true;

  while (found) {
    found = false;
    for (let i = 0; i < p; i++) {
      if (!finish[i]) {
        // Condition: Request[i] <= Work
        let canSatisfy = true;
        for (let j = 0; j < r; j++) {
          if (requestMatrix[i][j] > work[j]) {
            canSatisfy = false;
            break;
          }
        }

        if (canSatisfy) {
          const before = [...work];
          for (let j = 0; j < r; j++) work[j] += allocation[i][j];
          finish[i] = true;
          steps.push({
            process: i,
            request: [...requestMatrix[i]],
            allocation: [...allocation[i]],
            before,
            after: [...work]
          });
          found = true;
          break;
        }
      }
    }
  }

  const deadlockedProcesses = [];
  for (let i = 0; i < p; i++) {
    if (!finish[i]) deadlockedProcesses.push(pName(i));
  }

  const resultEl = $('deadlockResult');
  const traceEl = $('deadlockTrace');

  if (deadlockedProcesses.length === 0) {
    showDeadlockResult(`<strong>No Deadlock Detected!</strong> All processes can eventually acquire requested resources and release their allocations.`, 'success');
    logAction('Deadlock Detection passed: No deadlocks found.', 'success');
  } else {
    showDeadlockResult(`<strong>DEADLOCK DETECTED!</strong> The following process(es) are in a deadlock state: <strong>${deadlockedProcesses.join(', ')}</strong>. None can proceed.`, 'danger');
    logAction(`DEADLOCK DETECTED for processes: ${deadlockedProcesses.join(', ')}`, 'danger');
  }

  traceEl.innerHTML = steps.map((s, idx) => `
    <div class="trace-step">
      <div class="trace-index">${idx + 1}</div>
      <div class="flex-grow-1">
        <div class="trace-title">${pName(s.process)} finishes &amp; releases resources</div>
        <div class="trace-detail">
          Request ${vectorText(s.request)} ≤ Work ${vectorText(s.before)} → Work' = Work + Alloc = ${vectorText(s.after)}
        </div>
      </div>
    </div>
  `).join('');
}

function showDeadlockResult(msg, type) {
  const el = $('deadlockResult');
  el.className = `request-result ${type}`;
  el.innerHTML = msg;
  el.classList.remove('d-none');
}

function renderDeadlockRequestTable() {
  const p = state.processes, r = state.resources;
  const table = $('deadlockRequestTable');
  if (!customDeadlockRequests) {
    customDeadlockRequests = Array.from({ length: p }, () => Array(r).fill(0));
  }

  let html = `<thead><tr><th>Process</th>`;
  for (let j = 0; j < r; j++) html += `<th>${rName(j)}</th>`;
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < p; i++) {
    html += `<tr><td class="process-label">${pName(i)}</td>`;
    for (let j = 0; j < r; j++) {
      html += `<td><input class="form-control matrix-input" type="number" min="0" data-dl-p="${i}" data-dl-r="${j}" value="${customDeadlockRequests[i][j]}"></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody>`;
  table.innerHTML = html;

  table.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const pIdx = Number(inp.dataset.dlP);
      const rIdx = Number(inp.dataset.dlR);
      customDeadlockRequests[pIdx][rIdx] = Math.max(0, Number(inp.value) || 0);
    });
  });
}

// Auto-play steps execution
function toggleAutoPlay() {
  if (autoPlayInterval) {
    pauseAutoPlay();
  } else {
    startAutoPlay();
  }
}

function startAutoPlay() {
  if (!safetyResult || safetyResult.steps.length === 0) return;
  $('autoPlayBtn').innerHTML = `<i class="bi bi-pause-fill"></i> Pause`;
  autoPlayInterval = setInterval(() => {
    if (traceIndex < safetyResult.steps.length - 1) {
      traceIndex++;
      renderTrace();
      highlightActiveTableRow();
    } else {
      pauseAutoPlay();
    }
  }, 1200);
}

function pauseAutoPlay() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = null;
  }
  if ($('autoPlayBtn')) {
    $('autoPlayBtn').innerHTML = `<i class="bi bi-play-fill"></i> Play`;
  }
}

// Custom Process & Resource Names
function saveCustomNames() {
  const pText = $('customProcessNames').value.trim();
  const rText = $('customResourceNames').value.trim();

  if (pText) {
    const list = pText.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === state.processes) {
      state.processNames = list;
    } else {
      alert(`Expected ${state.processes} process names, but found ${list.length}.`);
      return;
    }
  }

  if (rText) {
    const list = rText.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === state.resources) {
      state.resourceNames = list;
    } else {
      alert(`Expected ${state.resources} resource names, but found ${list.length}.`);
      return;
    }
  }

  renderMatrix();
  renderChart();
  invalidateResult();
  logAction('Custom labels updated.');
}

// Apply Dimensions
function applyDimensions() {
  const p = Number($('processesInput').value);
  const r = Number($('resourcesInput').value);

  if (!Number.isInteger(p) || p < 1 || p > 10 || !Number.isInteger(r) || r < 1 || r > 6) {
    showValidation('Please choose 1–10 processes and 1–6 resource types.', 'danger');
    return;
  }

  const old = clone(state);
  const oldP = old.processes;
  const oldR = old.resources;

  state.processes = p;
  state.resources = r;
  state.processNames = Array.from({ length: p }, (_, i) => i < oldP ? old.processNames[i] : `P${i}`);
  state.resourceNames = Array.from({ length: r }, (_, j) => j < oldR ? old.resourceNames[j] : String.fromCharCode(65 + j));

  state.allocation = Array.from({ length: p }, (_, i) =>
    Array.from({ length: r }, (_, j) => i < oldP && j < oldR ? old.allocation[i][j] : 0)
  );
  state.max = Array.from({ length: p }, (_, i) =>
    Array.from({ length: r }, (_, j) => i < oldP && j < oldR ? old.max[i][j] : 0)
  );
  state.need = Array.from({ length: p }, (_, i) =>
    Array.from({ length: r }, (_, j) => i < oldP && j < oldR ? (old.need ? old.need[i][j] : 0) : 0)
  );
  state.available = Array.from({ length: r }, (_, j) => j < oldR ? old.available[j] : 0);
  state.total = Array.from({ length: r }, (_, j) => j < oldR ? old.total[j] : 0);

  customDeadlockRequests = null;

  renderMatrix();
  populateRequestInputs();
  renderChart();
  invalidateResult();
  clearRequest();
  logAction(`Dimensions configured to ${p} process(es) and ${r} resource type(s).`);
}

// Quick Zero Out
function zeroAll() {
  state.allocation = state.allocation.map(row => row.map(() => 0));
  state.max = state.max.map(row => row.map(() => 0));
  state.need = state.need.map(row => row.map(() => 0));
  state.available = state.available.map(() => 0);
  state.total = state.total.map(() => 0);

  renderMatrix();
  populateRequestInputs();
  renderChart();
  invalidateResult();
  clearRequest();
  showValidation('All matrices cleared to 0. You can now enter your problem.', 'info');
  logAction('Cleared all matrix cells to 0.');
}

// Generate Solvable Random Problem
function generateRandomProblem() {
  const p = state.processes;
  const r = state.resources;

  const total = Array.from({ length: r }, () => Math.floor(Math.random() * 8) + 6);
  const alloc = Array.from({ length: p }, () => Array(r).fill(0));
  const max = Array.from({ length: p }, () => Array(r).fill(0));

  for (let j = 0; j < r; j++) {
    let budget = total[j] - Math.floor(Math.random() * 3) - 2;
    for (let i = 0; i < p; i++) {
      const take = Math.min(budget, Math.floor(Math.random() * 3));
      alloc[i][j] = take;
      budget -= take;
      max[i][j] = take + Math.floor(Math.random() * 4);
    }
  }

  state.total = total;
  state.allocation = alloc;
  state.max = max;
  state.available = Array.from({ length: r }, (_, j) => total[j] - sumColumn(alloc, j));
  state.need = getNeedMatrix();

  renderMatrix();
  populateRequestInputs();
  renderChart();
  checkSafety();
  logAction('Random problem generated and tested.', 'success');
}

// Load a Preset
function loadPreset(key) {
  if (!PRESETS[key]) return;
  const preset = PRESETS[key];
  state = clone(preset);
  $('processesInput').value = state.processes;
  $('resourcesInput').value = state.resources;

  if (state.availMode === 'total') {
    $('availModeTotal').checked = true;
  } else {
    $('availModeDirect').checked = true;
  }

  if (state.matrixMode === 'need') {
    $('matrixModeNeed').checked = true;
  } else {
    $('matrixModeMax').checked = true;
  }

  renderMatrix();
  populateRequestInputs();
  renderChart();
  checkSafety();
  logAction(`Loaded preset: ${key}`, 'info');
}

// JSON Import & Export
function updateJsonExportArea() {
  const exportData = {
    resourceFlowVersion: '2.0',
    timestamp: new Date().toISOString(),
    processes: state.processes,
    resources: state.resources,
    processNames: state.processNames,
    resourceNames: state.resourceNames,
    availMode: state.availMode,
    matrixMode: state.matrixMode,
    allocation: state.allocation,
    max: state.max,
    need: state.need,
    available: state.available,
    total: state.total
  };
  $('jsonProblemArea').value = JSON.stringify(exportData, null, 2);
}

function applyJsonImport() {
  const errEl = $('importErrorAlert');
  errEl.classList.add('d-none');
  try {
    const raw = $('jsonProblemArea').value.trim();
    if (!raw) throw new Error('Please paste problem JSON.');
    const parsed = JSON.parse(raw);

    if (!parsed.processes || !parsed.resources || !parsed.allocation) {
      throw new Error('Invalid format: missing processes, resources, or allocation fields.');
    }

    state.processes = parsed.processes;
    state.resources = parsed.resources;
    state.processNames = parsed.processNames || Array.from({ length: state.processes }, (_, i) => `P${i}`);
    state.resourceNames = parsed.resourceNames || Array.from({ length: state.resources }, (_, j) => String.fromCharCode(65 + j));
    state.availMode = parsed.availMode || 'direct';
    state.matrixMode = parsed.matrixMode || 'max';
    state.allocation = parsed.allocation;
    state.max = parsed.max || Array.from({ length: state.processes }, () => Array(state.resources).fill(0));
    state.need = parsed.need || Array.from({ length: state.processes }, () => Array(state.resources).fill(0));
    state.available = parsed.available || Array(state.resources).fill(0);
    state.total = parsed.total || Array(state.resources).fill(0);

    $('processesInput').value = state.processes;
    $('resourcesInput').value = state.resources;
    if (state.availMode === 'total') $('availModeTotal').checked = true;
    else $('availModeDirect').checked = true;
    if (state.matrixMode === 'need') $('matrixModeNeed').checked = true;
    else $('matrixModeMax').checked = true;

    renderMatrix();
    populateRequestInputs();
    renderChart();
    checkSafety();

    const modal = bootstrap.Modal.getInstance($('importExportModal'));
    if (modal) modal.hide();
    logAction('Problem successfully imported from JSON.', 'success');
  } catch (e) {
    errEl.textContent = `Import Failed: ${e.message}`;
    errEl.classList.remove('d-none');
  }
}

function downloadJsonFile() {
  updateJsonExportArea();
  const text = $('jsonProblemArea').value;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resource_flow_problem_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyJsonToClipboard() {
  updateJsonExportArea();
  navigator.clipboard.writeText($('jsonProblemArea').value).then(() => {
    alert('Problem JSON copied to clipboard!');
  });
}

// Generate Printable Solution Report
function generateSolutionReport() {
  const p = state.processes, r = state.resources;
  const need = getNeedMatrix();
  const avail = getEffectiveAvailable();
  const safeRes = safetyResult || runSafety();

  let reportHtml = `
    <div class="p-3">
      <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
        <div>
          <h3 class="fw-bold mb-1">Banker's Algorithm Problem Solution Report</h3>
          <p class="text-secondary small mb-0">Generated by Resource Allocation Simulator · ${new Date().toLocaleString()}</p>
        </div>
        <div class="text-end">
          <span class="badge ${safeRes && safeRes.safe ? 'bg-success' : 'bg-danger'} fs-6">
            ${safeRes && safeRes.safe ? 'SAFE STATE' : 'UNSAFE STATE'}
          </span>
        </div>
      </div>

      <h5 class="fw-bold mb-2">1. System Specifications</h5>
      <p class="small text-secondary mb-3">Processes: <strong>${state.processNames.join(', ')}</strong> | Resources: <strong>${state.resourceNames.join(', ')}</strong></p>

      <h5 class="fw-bold mb-2">2. Resource Matrices</h5>
      <table class="report-matrix-table mb-4">
        <thead>
          <tr>
            <th rowspan="2">Process</th>
            <th colspan="${r}">Allocation</th>
            <th colspan="${r}">Max Claim</th>
            <th colspan="${r}">Need (Max − Alloc)</th>
          </tr>
          <tr>
  `;

  for (let g = 0; g < 3; g++) {
    for (let j = 0; j < r; j++) {
      reportHtml += `<th>${rName(j)}</th>`;
    }
  }

  reportHtml += `</tr></thead><tbody>`;

  for (let i = 0; i < p; i++) {
    reportHtml += `<tr><td class="fw-bold text-start ps-2">${pName(i)}</td>`;
    for (let j = 0; j < r; j++) reportHtml += `<td>${state.allocation[i][j]}</td>`;
    for (let j = 0; j < r; j++) reportHtml += `<td>${state.max[i][j]}</td>`;
    for (let j = 0; j < r; j++) reportHtml += `<td>${need[i][j]}</td>`;
    reportHtml += `</tr>`;
  }

  reportHtml += `<tr><td class="fw-bold text-start ps-2">Available</td>`;
  for (let j = 0; j < r; j++) reportHtml += `<td class="fw-bold text-success">${avail[j]}</td>`;
  reportHtml += `<td colspan="${r * 2}" class="text-secondary text-start ps-2">Free units available</td></tr>`;

  if (state.availMode === 'total') {
    reportHtml += `<tr><td class="fw-bold text-start ps-2">Total Instances</td>`;
    for (let j = 0; j < r; j++) reportHtml += `<td class="fw-bold">${state.total[j]}</td>`;
    reportHtml += `<td colspan="${r * 2}" class="text-secondary text-start ps-2">Total system physical units</td></tr>`;
  }

  reportHtml += `</tbody></table>`;

  reportHtml += `<h5 class="fw-bold mb-2">3. Banker's Safety Verification Trace</h5>`;
  if (safeRes && safeRes.safe) {
    reportHtml += `
      <div class="alert alert-success py-2 mb-3 small">
        <i class="bi bi-check-circle-fill me-1"></i>
        A complete safe sequence exists: <strong>${formatProcessNamesList(safeRes.sequence)}</strong>.
        Total valid safe sequence permutations discovered: <strong>${safeRes.allSequences.length}</strong>.
      </div>
      <table class="report-matrix-table mb-4">
        <thead>
          <tr>
            <th>Step</th>
            <th>Candidate Process</th>
            <th>Condition Check (Need ≤ Work)</th>
            <th>Allocation Released</th>
            <th>New Work Vector (Work + Alloc)</th>
          </tr>
        </thead>
        <tbody>
    `;

    safeRes.steps.forEach((s, idx) => {
      reportHtml += `
        <tr>
          <td><strong>${idx + 1}</strong></td>
          <td><strong>${pName(s.process)}</strong></td>
          <td><code>${vectorText(s.need)} ≤ ${vectorText(s.before)}</code> (Satisfied)</td>
          <td><code>${vectorText(s.allocation)}</code></td>
          <td><code>${vectorText(s.after)}</code></td>
        </tr>
      `;
    });

    reportHtml += `</tbody></table>`;

    if (safeRes.allSequences.length > 1) {
      reportHtml += `
        <div class="mb-4">
          <div class="fw-bold small mb-1">All Valid Safe Sequences (${safeRes.allSequences.length}):</div>
          <ol class="small text-secondary mb-0">
            ${safeRes.allSequences.map(seq => `<li><code>${formatProcessNamesList(seq)}</code></li>`).join('')}
          </ol>
        </div>
      `;
    }
  } else {
    reportHtml += `
      <div class="alert alert-danger py-2 mb-3 small">
        <i class="bi bi-x-circle-fill me-1"></i>
        <strong>UNSAFE STATE:</strong> No complete safe sequence could be found. The system cannot guarantee deadlock avoidance.
      </div>
    `;
  }

  reportHtml += `
      <h5 class="fw-bold mb-2">4. Conclusion</h5>
      <p class="small text-secondary">
        ${safeRes && safeRes.safe
          ? `The system is currently in a <strong>Safe State</strong>. At least one execution order allows all processes to finish without deadlock.`
          : `The system is in an <strong>Unsafe State</strong>. Deadlock may occur if processes demand their declared maximum resources simultaneously.`}
      </p>
    </div>
  `;

  $('reportContent').innerHTML = reportHtml;
}

// Event Listeners Setup (Null-safe)
function on(id, evt, fn) {
  const el = $(id);
  if (el) el.addEventListener(evt, fn);
}

function initEventListeners() {
  // Dimension Controls
  on('applyDimensionsBtn', 'click', applyDimensions);
  on('saveNamesBtn', 'click', saveCustomNames);
  on('resetDefaultsBtn', 'click', () => {
    state = createEmptyState(5, 3);
    if ($('processesInput')) $('processesInput').value = 5;
    if ($('resourcesInput')) $('resourcesInput').value = 3;
    renderMatrix();
    populateRequestInputs();
    renderChart();
    invalidateResult();
    logAction('Reset to 5x3 blank setup.');
  });
  on('zeroAllBtn', 'click', zeroAll);
  on('quickFillZerosBtn', 'click', zeroAll);
  on('randomizeBtn', 'click', generateRandomProblem);

  // Mode Switches
  on('availModeDirect', 'change', () => {
    state.availMode = 'direct';
    renderMatrix();
    renderChart();
    invalidateResult();
    if ($('modeExplanationText')) $('modeExplanationText').textContent = 'Direct Mode: Enter Available resource instances directly.';
    logAction('Availability mode set to: Direct Available Vector.');
  });

  on('availModeTotal', 'change', () => {
    state.availMode = 'total';
    // Calculate total from available + allocated if currently 0
    state.total = Array.from({ length: state.resources }, (_, j) =>
      Math.max(state.total[j], state.available[j] + sumColumn(state.allocation, j))
    );
    renderMatrix();
    renderChart();
    invalidateResult();
    if ($('modeExplanationText')) $('modeExplanationText').textContent = 'Total Mode: Enter Total instances. Available is computed automatically as Total − Allocated.';
    logAction('Availability mode set to: Total Resources (Auto-Available).');
  });

  on('matrixModeMax', 'change', () => {
    state.matrixMode = 'max';
    renderMatrix();
    invalidateResult();
    logAction('Matrix mode set to: Allocation + Max Claim.');
  });

  on('matrixModeNeed', 'change', () => {
    state.matrixMode = 'need';
    state.need = getNeedMatrix();
    renderMatrix();
    invalidateResult();
    logAction('Matrix mode set to: Allocation + Remaining Need.');
  });

  // Safety & Trace Controls
  on('checkSafetyBtn', 'click', checkSafety);
  on('stepResetBtn', 'click', () => {
    traceIndex = 0;
    pauseAutoPlay();
    renderTrace();
    highlightActiveTableRow();
  });
  on('stepNextBtn', 'click', () => {
    if (safetyResult && traceIndex < safetyResult.steps.length - 1) {
      traceIndex++;
      renderTrace();
      highlightActiveTableRow();
    }
  });
  on('stepBackBtn', 'click', () => {
    if (traceIndex > 0) {
      traceIndex--;
      renderTrace();
      highlightActiveTableRow();
    }
  });
  on('autoPlayBtn', 'click', toggleAutoPlay);

  // Request Simulation
  on('simulateRequestBtn', 'click', simulateRequest);
  on('commitRequestBtn', 'click', commitRequest);
  on('clearRequestBtn', 'click', clearRequest);
  on('requestProcess', 'change', () => {
    clearRequest();
    updateRequestProcessInfo();
  });

  // Deadlock Detection
  on('runDeadlockCheckBtn', 'click', runDeadlockDetection);
  on('useCustomDeadlockRequests', 'change', (e) => {
    if (e.target.checked) {
      if ($('customRequestMatrixSection')) $('customRequestMatrixSection').classList.remove('d-none');
      renderDeadlockRequestTable();
    } else {
      if ($('customRequestMatrixSection')) $('customRequestMatrixSection').classList.add('d-none');
    }
  });

  // Presets Dropdown
  const presetMenu = $('presetMenu');
  if (presetMenu) {
    presetMenu.querySelectorAll('[data-preset]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        loadPreset(item.dataset.preset);
      });
    });
  }
  on('clearAllPresetBtn', 'click', (e) => {
    e.preventDefault();
    zeroAll();
  });

  // Import / Export
  on('importExportBtn', 'click', updateJsonExportArea);
  on('copyJsonBtn', 'click', copyJsonToClipboard);
  on('downloadJsonBtn', 'click', downloadJsonFile);
  on('applyImportJsonBtn', 'click', applyJsonImport);
  on('uploadJsonInput', 'change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if ($('jsonProblemArea')) $('jsonProblemArea').value = evt.target.result;
    };
    reader.readAsText(file);
  });

  // Report Modal
  on('reportBtn', 'click', generateSolutionReport);
  on('printReportBtn', 'click', () => window.print());

  // Activity Log
  on('clearLogBtn', 'click', () => {
    activity = [];
    renderLog();
  });
}

// Bootstrap Tooltip Initialization
function initTooltips() {
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
}

// Initialization on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderMatrix();
  populateRequestInputs();
  renderChart();
  updateMetrics();
  initTooltips();
  logAction('Simulator ready. Type your problem values or choose a preset.');
});
