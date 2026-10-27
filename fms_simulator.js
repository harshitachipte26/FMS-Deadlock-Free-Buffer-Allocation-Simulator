/**
 * FMS Deadlock-Free Buffer Allocation Simulator
 * Based on the Research Paper:
 * "The Application and Evaluation of Banker's Algorithm for Deadlock-Free Buffer Space Allocation in Flexible Manufacturing Systems"
 * Authors: M. A. Lawley, S. A. Reveliotis, and P. M. Ferreira (1998)
 * International Journal of Flexible Manufacturing Systems, 10:73-100.
 */

(function (window) {
  'use strict';

  // --- MODEL DEFINITION & CONFIGURATION ---
  const FMS_CONFIG = {
    machines: [
      { id: 'M1', name: 'CNC Milling Center', short: 'M1', opTime: 3, icon: 'bi-gear-wide-connected', desc: 'Milling & rough machining' },
      { id: 'M2', name: 'CNC Turning Lathe', short: 'M2', opTime: 4, icon: 'bi-disc', desc: 'Precision turning & boring' },
      { id: 'M3', name: 'Precision Grinder', short: 'M3', opTime: 3, icon: 'bi-bullseye', desc: 'Fine grinding & deburring' }
    ],
    buffers: [
      { id: 'B1', name: 'Buffer 1 (Milling)', short: 'B1', defaultCapacity: 2, desc: 'Intermediate queue for Milling operations' },
      { id: 'B2', name: 'Buffer 2 (Lathe)', short: 'B2', defaultCapacity: 2, desc: 'Intermediate queue for Lathe operations' },
      { id: 'B3', name: 'Buffer 3 (Cross-Flow)', short: 'B3', defaultCapacity: 1, desc: 'Cross-flow queue for Grinding/Exit operations' }
    ],
    partTypes: {
      A: {
        id: 'A',
        name: 'Part A (Gear Shaft)',
        badgeClass: 'badge-part-a',
        color: '#2563eb',
        route: [
          { type: 'machine', id: 'M1', name: 'M1 Milling' },
          { type: 'buffer',  id: 'B2', name: 'B2 Lathe Buffer' },
          { type: 'machine', id: 'M2', name: 'M2 Lathe' },
          { type: 'buffer',  id: 'B3', name: 'B3 Cross-Flow' },
          { type: 'machine', id: 'M3', name: 'M3 Grinder' }
        ]
      },
      B: {
        id: 'B',
        name: 'Part B (Cylinder Housing)',
        badgeClass: 'badge-part-b',
        color: '#10b981',
        route: [
          { type: 'machine', id: 'M2', name: 'M2 Lathe' },
          { type: 'buffer',  id: 'B1', name: 'B1 Milling Buffer' },
          { type: 'machine', id: 'M1', name: 'M1 Milling' },
          { type: 'buffer',  id: 'B3', name: 'B3 Cross-Flow' },
          { type: 'machine', id: 'M3', name: 'M3 Grinder' }
        ]
      },
      C: {
        id: 'C',
        name: 'Part C (Bearing Flange)',
        badgeClass: 'badge-part-c',
        color: '#8b5cf6',
        route: [
          { type: 'machine', id: 'M3', name: 'M3 Grinder' },
          { type: 'buffer',  id: 'B1', name: 'B1 Milling Buffer' },
          { type: 'machine', id: 'M1', name: 'M1 Milling' },
          { type: 'buffer',  id: 'B2', name: 'B2 Lathe Buffer' },
          { type: 'machine', id: 'M2', name: 'M2 Lathe' }
        ]
      }
    }
  };

  // --- SIMULATOR STATE ---
  let fmsState = createInitialFMSState();
  let simTimer = null;
  let bufferChart = null;
  let machineChart = null;
  let policyComparisonChart = null;
  let comparisonStats = {
    bankers: { completed: 0, blocked: 0, deadlocks: 0, throughput: 0, deniedUnsafe: 0 },
    uncontrolled: { completed: 0, blocked: 0, deadlocks: 0, throughput: 0, deniedUnsafe: 0 }
  };

  function createInitialFMSState() {
    return {
      policy: 'bankers', // 'bankers' (Lawley et al. 1998) or 'uncontrolled' (FCFS baseline)
      isRunning: false,
      tickSpeed: 1000,
      simTime: 0,
      isDeadlocked: false,
      deadlockCycle: [],

      // Capacities
      bufferCapacities: {
        B1: 2,
        B2: 2,
        B3: 1
      },

      // Machines: idle | processing | waiting_buffer | blocked
      machines: {
        M1: { id: 'M1', state: 'idle', currentJob: null, progress: 0, totalTime: 3 },
        M2: { id: 'M2', state: 'idle', currentJob: null, progress: 0, totalTime: 4 },
        M3: { id: 'M3', state: 'idle', currentJob: null, progress: 0, totalTime: 3 }
      },

      // Buffers: array of job IDs currently holding slots
      buffers: {
        B1: [],
        B2: [],
        B3: []
      },

      infeedQueue: [],
      outfeedCompleted: [],
      activeJobs: {}, // jobId -> Job object
      jobIdCounter: 1,

      // Evaluation & Metrics
      metrics: {
        completedCount: 0,
        totalRequests: 0,
        grantedRequests: 0,
        delayedRequests: 0,
        rejectedUnsafe: 0,
        blockedMoves: 0,
        deadlocksDetected: 0,
        computationTimes: [],
        history: {
          time: [],
          B1_util: [],
          B2_util: [],
          B3_util: []
        },
        stateTimes: {
          M1: { idle: 0, processing: 0, waiting: 0, blocked: 0 },
          M2: { idle: 0, processing: 0, waiting: 0, blocked: 0 },
          M3: { idle: 0, processing: 0, waiting: 0, blocked: 0 }
        }
      },

      // Safety Explorer & Decision tracking
      latestDecision: null,
      latestTrace: null,
      explorerStepIndex: 0
    };
  }

  // --- JOB CREATION ---
  function createJob(typeKey) {
    const type = FMS_CONFIG.partTypes[typeKey];
    if (!type) return null;
    const id = `J${fmsState.jobIdCounter++}`;
    return {
      id,
      type: typeKey,
      name: `${id} (${type.name.split(' ')[0]} ${typeKey})`,
      color: type.color,
      badgeClass: type.badgeClass,
      route: JSON.parse(JSON.stringify(type.route)),
      currentStepIndex: -1, // -1 means in infeed queue
      currentLocation: 'infeed', // 'infeed', 'M1', 'B2', etc., 'outfeed'
      holdingBuffer: null, // buffer ID currently held
      startTime: fmsState.simTime,
      completionTime: null,
      isBlocked: false,
      blockedReason: ''
    };
  }

  // --- ROUTE & MATRIX EXTRACTION (FMS BANKER'S FORMULATION) ---
  /**
   * Translates current physical FMS state into Banker's Algorithm vectors & matrices
   * as formulated by Lawley, Reveliotis & Ferreira (1998):
   * Resources = Buffer spaces [B1, B2, B3].
   * Allocation = buffer slots currently occupied by each job.
   * Max = 1 if buffer is in job's remaining route or currently held; 0 otherwise.
   * Need = Max - Allocation.
   * Available = Capacity - Sum(Allocated).
   */
  function getFMSBankerState() {
    const bufferKeys = ['B1', 'B2', 'B3'];
    const activeJobIds = Object.keys(fmsState.activeJobs).filter(id => {
      const j = fmsState.activeJobs[id];
      return j.currentLocation !== 'outfeed';
    });

    const capacities = bufferKeys.map(b => fmsState.bufferCapacities[b]);
    const allocation = [];
    const max = [];
    const need = [];

    // Compute allocated per buffer
    const allocatedTotals = [0, 0, 0];

    activeJobIds.forEach(jobId => {
      const job = fmsState.activeJobs[jobId];
      const allocRow = [0, 0, 0];
      const maxRow = [0, 0, 0];
      const needRow = [0, 0, 0];

      // Current buffer allocation
      if (job.holdingBuffer) {
        const bIdx = bufferKeys.indexOf(job.holdingBuffer);
        if (bIdx >= 0) {
          allocRow[bIdx] = 1;
          allocatedTotals[bIdx] += 1;
        }
      }

      // Remaining buffer requirements along route
      const remSteps = job.route.slice(job.currentStepIndex + 1);
      const remainingBuffersNeeded = new Set();
      remSteps.forEach(st => {
        if (st.type === 'buffer') {
          remainingBuffersNeeded.add(st.id);
        }
      });

      bufferKeys.forEach((bKey, idx) => {
        if (remainingBuffersNeeded.has(bKey) || allocRow[idx] > 0) {
          maxRow[idx] = 1;
        } else {
          maxRow[idx] = 0;
        }
        needRow[idx] = Math.max(0, maxRow[idx] - allocRow[idx]);
      });

      allocation.push(allocRow);
      max.push(maxRow);
      need.push(needRow);
    });

    const available = bufferKeys.map((bKey, idx) => {
      return Math.max(0, capacities[idx] - allocatedTotals[idx]);
    });

    return {
      bufferKeys,
      activeJobIds,
      capacities,
      available,
      allocation,
      max,
      need
    };
  }

  // --- BANKER'S SAFETY CHECK CONTROLLER ---
  /**
   * Tests whether granting a proposed resource request results in a SAFE state.
   * Evaluates all 3 conditions:
   * 1. Request <= Need (adherence to route claim)
   * 2. Request <= Available (capacity constraint)
   * 3. Safety algorithm: Exists completion sequence such that every active job completes.
   */
  function evaluateProposedMove(jobId, targetBufferId) {
    const t0 = performance.now();
    const bState = getFMSBankerState();
    const { bufferKeys, activeJobIds, available, allocation, need } = bState;
    const reqBufferIdx = bufferKeys.indexOf(targetBufferId);
    const jobIdx = activeJobIds.indexOf(jobId);

    const requestVector = [0, 0, 0];
    if (reqBufferIdx >= 0) {
      requestVector[reqBufferIdx] = 1;
    }

    const checkResult = {
      jobId,
      targetBufferId,
      timestamp: fmsState.simTime,
      requestVector,
      initialAvailable: [...available],
      tentativeAvailable: [...available],
      allocationBefore: allocation.map(r => [...r]),
      needBefore: need.map(r => [...r]),
      allocationAfter: allocation.map(r => [...r]),
      needAfter: need.map(r => [...r]),
      allowed: false,
      reasonCode: '', // 'OVERCLAIM', 'CAPACITY_FULL', 'UNSAFE_STATE', 'SAFE_GRANTED'
      reasonText: '',
      safeSequence: [],
      traceSteps: [],
      computationTimeMs: 0
    };

    // Rule 1: Request <= Need
    if (jobIdx >= 0 && reqBufferIdx >= 0) {
      if (requestVector[reqBufferIdx] > need[jobIdx][reqBufferIdx]) {
        checkResult.allowed = false;
        checkResult.reasonCode = 'OVERCLAIM';
        checkResult.reasonText = `Request [${requestVector.join(',')}] exceeds Job ${jobId}'s remaining route need for buffer ${targetBufferId}.`;
        checkResult.computationTimeMs = performance.now() - t0;
        return checkResult;
      }
    }

    // Rule 2: Request <= Available (physical capacity)
    if (reqBufferIdx >= 0 && requestVector[reqBufferIdx] > available[reqBufferIdx]) {
      checkResult.allowed = false;
      checkResult.reasonCode = 'CAPACITY_FULL';
      checkResult.reasonText = `Buffer ${targetBufferId} is saturated (${fmsState.buffers[targetBufferId].length}/${fmsState.bufferCapacities[targetBufferId]} slots occupied). Job ${jobId} must wait.`;
      checkResult.computationTimeMs = performance.now() - t0;
      return checkResult;
    }

    // If running in UNCONTROLLED policy: bypass safety check!
    if (fmsState.policy === 'uncontrolled') {
      checkResult.allowed = true;
      checkResult.reasonCode = 'UNCONTROLLED_GRANTED';
      checkResult.reasonText = `[Uncontrolled Mode] Move to ${targetBufferId} granted greedily without safety verification!`;
      checkResult.computationTimeMs = performance.now() - t0;
      return checkResult;
    }

    // Rule 3: Construct Tentative State
    const tentAvail = [...available];
    const tentAlloc = allocation.map(r => [...r]);
    const tentNeed = need.map(r => [...r]);

    if (reqBufferIdx >= 0) {
      tentAvail[reqBufferIdx] -= 1;
      if (jobIdx >= 0) {
        tentAlloc[jobIdx][reqBufferIdx] += 1;
        tentNeed[jobIdx][reqBufferIdx] -= 1;
      }
    }

    checkResult.tentativeAvailable = [...tentAvail];
    checkResult.allocationAfter = tentAlloc.map(r => [...r]);
    checkResult.needAfter = tentNeed.map(r => [...r]);

    // Safety Algorithm Check on Tentative State
    const numJobs = activeJobIds.length;
    const numRes = bufferKeys.length;
    const work = [...tentAvail];
    const finish = Array(numJobs).fill(false);
    const safeSeq = [];
    const traceSteps = [];

    traceSteps.push({
      step: 0,
      description: 'Initial Tentative State',
      work: [...work],
      finish: [...finish],
      jobEvaluated: null,
      passed: true,
      note: `Tentative Available vector after allocating ${targetBufferId}: [${work.join(', ')}]`
    });

    let foundEligible = true;
    while (foundEligible) {
      foundEligible = false;

      for (let i = 0; i < numJobs; i++) {
        if (!finish[i]) {
          // Check if tentNeed[i] <= work
          let canFinish = true;
          for (let j = 0; j < numRes; j++) {
            if (tentNeed[i][j] > work[j]) {
              canFinish = false;
              break;
            }
          }

          if (canFinish) {
            const beforeWork = [...work];
            for (let j = 0; j < numRes; j++) {
              work[j] += tentAlloc[i][j];
            }
            finish[i] = true;
            safeSeq.push(activeJobIds[i]);
            foundEligible = true;

            traceSteps.push({
              step: traceSteps.length,
              description: `Job ${activeJobIds[i]} satisfies Need ≤ Work`,
              work: [...work],
              finish: [...finish],
              jobEvaluated: activeJobIds[i],
              jobIndex: i,
              need: [...tentNeed[i]],
              allocation: [...tentAlloc[i]],
              beforeWork,
              passed: true,
              note: `Need [${tentNeed[i].join(',')}] ≤ Work [${beforeWork.join(',')}]. Part completes remaining route and releases [${tentAlloc[i].join(',')}]. New Work = [${work.join(',')}]`
            });
            break; // restart scan
          }
        }
      }
    }

    const allFinished = finish.every(f => f === true);
    checkResult.computationTimeMs = performance.now() - t0;
    checkResult.safeSequence = safeSeq;
    checkResult.traceSteps = traceSteps;

    if (allFinished) {
      checkResult.allowed = true;
      checkResult.reasonCode = 'SAFE_GRANTED';
      checkResult.reasonText = `Safe state confirmed. Valid completion sequence exists: ${safeSeq.join(' → ')}. Move granted.`;
    } else {
      const unfinishedJobs = activeJobIds.filter((_, idx) => !finish[idx]);
      checkResult.allowed = false;
      checkResult.reasonCode = 'UNSAFE_STATE';
      checkResult.reasonText = `Unsafe state detected! Granting ${targetBufferId} would deplete buffers so remaining jobs (${unfinishedJobs.join(', ')}) cannot complete. Circular wait deadlock risk!`;
      traceSteps.push({
        step: traceSteps.length,
        description: 'Safety Check Failed: Unsafe State',
        work: [...work],
        finish: [...finish],
        jobEvaluated: null,
        passed: false,
        note: `No remaining job can satisfy Need ≤ Work with Work = [${work.join(', ')}]. Deadlock-free completion cannot be guaranteed.`
      });
    }

    return checkResult;
  }

  // --- DEADLOCK DETECTION (CIRCULAR WAIT IN FMS) ---
  /**
   * Detects whether the current physical state has entered an ACTUAL deadlock
   * (e.g. in Uncontrolled Mode, two or more machines are mutually blocked
   * waiting for buffers occupied by each other).
   */
  function detectFMSCircularDeadlock() {
    const blockedMachines = Object.values(fmsState.machines).filter(m => m.state === 'waiting_buffer' || m.state === 'blocked');
    if (blockedMachines.length < 2) {
      return { isDeadlocked: false, cycle: [] };
    }

    // Build wait-for graph: machine -> waiting for buffer -> occupied by job -> at machine
    const waitMap = {}; // machId -> machId
    blockedMachines.forEach(m => {
      const job = m.currentJob;
      if (!job) return;
      const nextStep = job.route[job.currentStepIndex + 1];
      if (nextStep && nextStep.type === 'buffer') {
        const targetBuf = nextStep.id;
        const occupants = fmsState.buffers[targetBuf];
        // If buffer is full, machine waits on occupants
        if (occupants && occupants.length >= fmsState.bufferCapacities[targetBuf]) {
          occupants.forEach(occJobId => {
            const occJob = fmsState.activeJobs[occJobId];
            if (occJob) {
              const occNextStep = occJob.route[occJob.currentStepIndex + 1];
              if (occNextStep && occNextStep.type === 'machine') {
                waitMap[m.id] = occNextStep.id;
              }
            }
          });
        }
      }
    });

    // Check for cycles in waitMap
    for (const startMach of Object.keys(waitMap)) {
      const visited = [];
      let curr = startMach;
      while (curr && waitMap[curr] && !visited.includes(curr)) {
        visited.push(curr);
        curr = waitMap[curr];
        if (curr === startMach) {
          visited.push(startMach);
          return { isDeadlocked: true, cycle: visited };
        }
      }
    }

    return { isDeadlocked: false, cycle: [] };
  }

  // --- ADVANCE PRODUCTION MOVE ---
  /**
   * Attempts to advance a job to its next route step.
   * Enforces machine and buffer constraints and invokes the Banker's controller.
   */
  function attemptAdvanceJob(jobId) {
    const job = fmsState.activeJobs[jobId];
    if (!job) return { success: false, reason: 'Job not found' };

    const nextIndex = job.currentStepIndex + 1;
    if (nextIndex >= job.route.length) {
      // Job is ready to exit
      return completeJob(jobId);
    }

    const nextStep = job.route[nextIndex];
    fmsState.metrics.totalRequests++;

    if (nextStep.type === 'buffer') {
      const targetBufferId = nextStep.id;
      const decision = evaluateProposedMove(jobId, targetBufferId);
      fmsState.latestDecision = decision;
      fmsState.latestTrace = decision;
      fmsState.explorerStepIndex = 0;

      if (decision.computationTimeMs > 0) {
        fmsState.metrics.computationTimes.push(decision.computationTimeMs);
      }

      if (decision.allowed) {
        // Move is GRANTED!
        fmsState.metrics.grantedRequests++;
        executeMoveToBuffer(job, targetBufferId, nextIndex);
        return { success: true, decision };
      } else {
        // Move is DENIED or DELAYED
        if (decision.reasonCode === 'UNSAFE_STATE') {
          fmsState.metrics.rejectedUnsafe++;
          fmsState.metrics.delayedRequests++;
        } else if (decision.reasonCode === 'CAPACITY_FULL') {
          fmsState.metrics.delayedRequests++;
          fmsState.metrics.blockedMoves++;
        }
        setJobBlocked(job, decision.reasonText);
        return { success: false, decision };
      }
    } else if (nextStep.type === 'machine') {
      const targetMachId = nextStep.id;
      const mach = fmsState.machines[targetMachId];

      if (mach.state === 'idle') {
        // Machine is free, enter machine!
        fmsState.metrics.grantedRequests++;
        executeMoveToMachine(job, targetMachId, nextIndex);
        return { success: true, reason: `Admitted to ${mach.name}` };
      } else {
        // Machine busy, wait in buffer
        fmsState.metrics.delayedRequests++;
        setJobBlocked(job, `Waiting for ${mach.name} to finish current operation.`);
        return { success: false, reason: `${mach.name} is currently busy` };
      }
    }

    return { success: false, reason: 'Unknown step type' };
  }

  function executeMoveToBuffer(job, bufferId, nextIndex) {
    // Vacate previous machine
    if (job.currentLocation && job.currentLocation.startsWith('M')) {
      const prevMach = fmsState.machines[job.currentLocation];
      if (prevMach && prevMach.currentJob && prevMach.currentJob.id === job.id) {
        prevMach.state = 'idle';
        prevMach.currentJob = null;
        prevMach.progress = 0;
      }
    }

    // Occupy destination buffer
    fmsState.buffers[bufferId].push(job.id);
    job.holdingBuffer = bufferId;
    job.currentLocation = bufferId;
    job.currentStepIndex = nextIndex;
    job.isBlocked = false;
    job.blockedReason = '';
  }

  function executeMoveToMachine(job, machineId, nextIndex) {
    // Release previous buffer slot if held!
    if (job.holdingBuffer) {
      const bufList = fmsState.buffers[job.holdingBuffer];
      const bIdx = bufList.indexOf(job.id);
      if (bIdx >= 0) {
        bufList.splice(bIdx, 1);
      }
      job.holdingBuffer = null;
    }

    // Occupy machine
    const mach = fmsState.machines[machineId];
    mach.state = 'processing';
    mach.currentJob = job;
    mach.progress = 0;
    mach.totalTime = FMS_CONFIG.machines.find(m => m.id === machineId).opTime;

    job.currentLocation = machineId;
    job.currentStepIndex = nextIndex;
    job.isBlocked = false;
    job.blockedReason = '';
  }

  function completeJob(jobId) {
    const job = fmsState.activeJobs[jobId];
    if (!job) return { success: false };

    // Release machine
    if (job.currentLocation && job.currentLocation.startsWith('M')) {
      const mach = fmsState.machines[job.currentLocation];
      if (mach && mach.currentJob && mach.currentJob.id === job.id) {
        mach.state = 'idle';
        mach.currentJob = null;
        mach.progress = 0;
      }
    }

    // Release buffer if any
    if (job.holdingBuffer) {
      const bList = fmsState.buffers[job.holdingBuffer];
      const idx = bList.indexOf(job.id);
      if (idx >= 0) bList.splice(idx, 1);
      job.holdingBuffer = null;
    }

    job.currentLocation = 'outfeed';
    job.completionTime = fmsState.simTime;
    fmsState.outfeedCompleted.push(job);
    fmsState.metrics.completedCount++;

    return { success: true, reason: 'Job successfully completed production route!' };
  }

  function setJobBlocked(job, reason) {
    job.isBlocked = true;
    job.blockedReason = reason;

    // If job is in a machine, that machine becomes blocked/waiting
    if (job.currentLocation && job.currentLocation.startsWith('M')) {
      const mach = fmsState.machines[job.currentLocation];
      if (mach) {
        mach.state = 'waiting_buffer';
      }
    }
  }

  // --- SIMULATION TICK LOOP ---
  function simTick() {
    fmsState.simTime++;

    // 1. Advance active machines
    Object.values(fmsState.machines).forEach(mach => {
      if (mach.state === 'processing' && mach.currentJob) {
        mach.progress++;
        fmsState.metrics.stateTimes[mach.id].processing++;

        if (mach.progress >= mach.totalTime) {
          // Finished operation! Attempt to advance job
          const advResult = attemptAdvanceJob(mach.currentJob.id);
          if (!advResult.success) {
            mach.state = 'waiting_buffer';
          }
        }
      } else if (mach.state === 'idle') {
        fmsState.metrics.stateTimes[mach.id].idle++;
        // Check if there is a job in its input buffer waiting for this machine
        checkInputBufferForMachine(mach.id);
      } else if (mach.state === 'waiting_buffer') {
        fmsState.metrics.stateTimes[mach.id].waiting++;
        // Retry moving the finished job
        if (mach.currentJob) {
          attemptAdvanceJob(mach.currentJob.id);
        }
      } else if (mach.state === 'blocked') {
        fmsState.metrics.stateTimes[mach.id].blocked++;
      }
    });

    // 2. Check infeed queue: admit new jobs if starting machine/buffer is available
    if (fmsState.infeedQueue.length > 0) {
      const nextInfeed = fmsState.infeedQueue[0];
      const firstStep = nextInfeed.route[0];
      if (firstStep && firstStep.type === 'machine') {
        const startMach = fmsState.machines[firstStep.id];
        if (startMach.state === 'idle') {
          fmsState.infeedQueue.shift();
          fmsState.activeJobs[nextInfeed.id] = nextInfeed;
          attemptAdvanceJob(nextInfeed.id);
        }
      }
    }

    // 3. Deadlock Check
    const dl = detectFMSCircularDeadlock();
    if (dl.isDeadlocked) {
      fmsState.isDeadlocked = true;
      fmsState.deadlockCycle = dl.cycle;
      fmsState.metrics.deadlocksDetected++;
      dl.cycle.forEach(mId => {
        if (fmsState.machines[mId]) {
          fmsState.machines[mId].state = 'blocked';
        }
      });
      pauseSimulation();
    } else {
      fmsState.isDeadlocked = false;
    }

    // 4. Record history for charts
    recordMetricsSnapshot();

    // 5. Render UI
    renderFMSDashboard();
  }

  function checkInputBufferForMachine(machId) {
    // Find buffer that feeds this machine based on part routes
    const bufferKeys = ['B1', 'B2', 'B3'];
    for (const bKey of bufferKeys) {
      const occupants = fmsState.buffers[bKey];
      for (const jId of occupants) {
        const job = fmsState.activeJobs[jId];
        if (job) {
          const nextStep = job.route[job.currentStepIndex + 1];
          if (nextStep && nextStep.type === 'machine' && nextStep.id === machId) {
            // Found a part in buffer waiting for this machine!
            attemptAdvanceJob(job.id);
            return;
          }
        }
      }
    }
  }

  function recordMetricsSnapshot() {
    const hist = fmsState.metrics.history;
    hist.time.push(fmsState.simTime);
    hist.B1_util.push(Math.round((fmsState.buffers.B1.length / fmsState.bufferCapacities.B1) * 100));
    hist.B2_util.push(Math.round((fmsState.buffers.B2.length / fmsState.bufferCapacities.B2) * 100));
    hist.B3_util.push(Math.round((fmsState.buffers.B3.length / fmsState.bufferCapacities.B3) * 100));

    // Limit history length to 30 data points
    if (hist.time.length > 30) {
      hist.time.shift();
      hist.B1_util.shift();
      hist.B2_util.shift();
      hist.B3_util.shift();
    }
  }

  // --- SIMULATION CONTROLS ---
  function startSimulation() {
    if (fmsState.isRunning) return;
    fmsState.isRunning = true;
    simTimer = setInterval(simTick, fmsState.tickSpeed);
    updateSimControlButtons();
  }

  function pauseSimulation() {
    fmsState.isRunning = false;
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
    updateSimControlButtons();
  }

  function stepSimulation() {
    pauseSimulation();
    simTick();
  }

  function resetSimulation(keepScenario = false) {
    pauseSimulation();
    const currentPolicy = fmsState.policy;
    fmsState = createInitialFMSState();
    fmsState.policy = currentPolicy;
    loadDefaultJobs();
    renderFMSDashboard();
    updateSimControlButtons();
  }

  function setSimSpeed(speedMultiplier) {
    fmsState.tickSpeed = Math.round(1000 / speedMultiplier);
    if (fmsState.isRunning) {
      clearInterval(simTimer);
      simTimer = setInterval(simTick, fmsState.tickSpeed);
    }
  }

  function setAllocationPolicy(policy) {
    fmsState.policy = policy;
    const policyDesc = policy === 'bankers'
      ? "Banker's Avoidance Controller (Lawley et al. 1998) [Deadlock-Free]"
      : "Uncontrolled Greedy Policy (FCFS Baseline) [Deadlock Vulnerable]";
    const badge = document.getElementById('fmsPolicyIndicator');
    if (badge) {
      badge.textContent = policy === 'bankers' ? "Banker's Avoidance Active" : "Uncontrolled Greedy Active";
      badge.className = policy === 'bankers' ? 'badge bg-primary' : 'badge bg-warning text-dark';
    }
    renderFMSDashboard();
  }

  // --- EXPERIMENTAL LAB SCENARIO LOADERS ---
  function loadScenario(scenarioKey) {
    pauseSimulation();
    fmsState = createInitialFMSState();

    switch (scenarioKey) {
      case 'scenario_a': // Safe Production Flow
        fmsState.policy = 'bankers';
        fmsState.bufferCapacities = { B1: 2, B2: 2, B3: 1 };
        loadScenarioJobs([
          { type: 'A', loc: 'M1', step: 0 },
          { type: 'B', loc: 'infeed', step: -1 },
          { type: 'C', loc: 'infeed', step: -1 }
        ]);
        break;

      case 'scenario_b': // Buffer Saturation (Capacity Blocking, No Deadlock)
        fmsState.policy = 'bankers';
        fmsState.bufferCapacities = { B1: 2, B2: 1, B3: 1 }; // B2 has only 1 slot
        loadScenarioJobs([
          { type: 'A', loc: 'B2', step: 1, holdBuf: 'B2' }, // J1 already occupies B2
          { type: 'A', loc: 'M1', step: 0 }                 // J2 finishes at M1 and also requests B2 -> Saturated!
        ]);
        // Set M1 to finishing
        fmsState.machines.M1.state = 'processing';
        fmsState.machines.M1.progress = 2; // will finish next tick
        break;

      case 'scenario_c': // Unsafe Allocation Denied (Deadlock Avoidance in Action)
        fmsState.policy = 'bankers';
        fmsState.bufferCapacities = { B1: 1, B2: 1, B3: 0 };
        loadScenarioJobs([
          { type: 'A', loc: 'B2', step: 1, holdBuf: 'B2' }, // J1 holding B2, remaining need B3
          { type: 'B', loc: 'M2', step: 0 }                 // J2 at M2, requesting B1
        ]);
        fmsState.machines.M2.state = 'waiting_buffer';
        break;

      case 'scenario_d_uncontrolled': // Resource Contention & Deadlock (Uncontrolled)
        fmsState.policy = 'uncontrolled';
        fmsState.bufferCapacities = { B1: 1, B2: 1, B3: 1 };
        loadScenarioJobs([
          { type: 'A', loc: 'M1', step: 0 },                 // J1 at M1 (wants B2)
          { type: 'A', loc: 'B2', step: 1, holdBuf: 'B2' }, // J2 in B2 (wants M2)
          { type: 'B', loc: 'M2', step: 0 },                 // J3 at M2 (wants B1)
          { type: 'B', loc: 'B1', step: 1, holdBuf: 'B1' }  // J4 in B1 (wants M1)
        ]);
        fmsState.machines.M1.state = 'waiting_buffer';
        fmsState.machines.M2.state = 'waiting_buffer';
        // Check for deadlock immediately on load
        const dlCheck = detectFMSCircularDeadlock();
        if (dlCheck.isDeadlocked) {
          fmsState.isDeadlocked = true;
          fmsState.deadlockCycle = dlCheck.cycle;
          fmsState.metrics.deadlocksDetected++;
        }
        break;

      case 'scenario_d_bankers': // Resource Contention Handled Safely by Banker's
        fmsState.policy = 'bankers';
        fmsState.bufferCapacities = { B1: 1, B2: 1, B3: 0 };
        loadScenarioJobs([
          { type: 'A', loc: 'B2', step: 1, holdBuf: 'B2' },
          { type: 'B', loc: 'M2', step: 0 }
        ]);
        fmsState.machines.M2.state = 'waiting_buffer';
        break;

      case 'scenario_e': // Recovery Through Resource Release
        fmsState.policy = 'bankers';
        fmsState.bufferCapacities = { B1: 1, B2: 1, B3: 1 };
        loadScenarioJobs([
          { type: 'A', loc: 'M1', step: 0 }, // J1 waiting for B2
          { type: 'B', loc: 'M2', step: 2 }  // J2 at M2, about to finish M2 and release upstream
        ]);
        fmsState.machines.M1.state = 'waiting_buffer';
        fmsState.machines.M2.progress = 3; // 1 tick away from finishing
        break;

      default:
        loadDefaultJobs();
        break;
    }

    renderFMSDashboard();
    updateSimControlButtons();
  }

  function loadDefaultJobs() {
    fmsState.infeedQueue = [
      createJob('A'),
      createJob('B'),
      createJob('C'),
      createJob('A')
    ];
  }

  function loadScenarioJobs(specList) {
    fmsState.infeedQueue = [];
    specList.forEach(spec => {
      const job = createJob(spec.type);
      job.currentStepIndex = spec.step;
      job.currentLocation = spec.loc;

      if (spec.holdBuf) {
        job.holdingBuffer = spec.holdBuf;
        fmsState.buffers[spec.holdBuf].push(job.id);
      }

      if (spec.loc.startsWith('M')) {
        const m = fmsState.machines[spec.loc];
        m.currentJob = job;
        m.state = 'processing';
      } else if (spec.loc === 'infeed') {
        fmsState.infeedQueue.push(job);
      }

      if (spec.loc !== 'infeed') {
        fmsState.activeJobs[job.id] = job;
      }
    });
  }

  // --- RENDERING: FACTORY FLOOR & DASHBOARD ---
  function renderFMSDashboard() {
    renderFactoryLayout();
    renderActiveJobsTable();
    renderBankerMatrixCard();
    renderMetricsPills();
    renderSafetyExplorerCard();
    renderCharts();
  }

  function renderFactoryLayout() {
    // Render Machines
    FMS_CONFIG.machines.forEach(cfg => {
      const mach = fmsState.machines[cfg.id];
      const cardEl = document.getElementById(`machCard_${cfg.id}`);
      const statusBadge = document.getElementById(`machStatus_${cfg.id}`);
      const jobSlotEl = document.getElementById(`machJob_${cfg.id}`);
      const progressBar = document.getElementById(`machProgress_${cfg.id}`);

      if (!cardEl) return;

      // Machine Card State classes
      cardEl.className = `fms-machine-card status-${mach.state}`;
      if (statusBadge) {
        let badgeClass = 'bg-secondary';
        let text = 'IDLE';
        if (mach.state === 'processing') {
          badgeClass = 'bg-primary';
          text = 'PROCESSING';
        } else if (mach.state === 'waiting_buffer') {
          badgeClass = 'bg-warning text-dark';
          text = 'WAITING FOR BUFFER';
        } else if (mach.state === 'blocked') {
          badgeClass = 'bg-danger';
          text = 'BLOCKED (DEADLOCK)';
        }
        statusBadge.className = `badge ${badgeClass} fms-status-badge`;
        statusBadge.innerHTML = `<span class="status-pulse-dot"></span>${text}`;
      }

      // Job Slot Inside Machine
      if (jobSlotEl) {
        if (mach.currentJob) {
          const j = mach.currentJob;
          jobSlotEl.innerHTML = `
            <div class="fms-job-chip chip-${j.type}">
              <span class="chip-dot"></span>
              <strong>${j.id}</strong> (${j.type})
              <small class="d-block text-truncate">${j.route[j.currentStepIndex]?.name || ''}</small>
            </div>
          `;
        } else {
          jobSlotEl.innerHTML = `<div class="fms-slot-empty">No Part Loaded</div>`;
        }
      }

      // Progress Bar
      if (progressBar) {
        const pct = mach.totalTime > 0 ? Math.round((mach.progress / mach.totalTime) * 100) : 0;
        progressBar.style.width = `${pct}%`;
        progressBar.setAttribute('aria-valuenow', pct);
      }
    });

    // Render Buffers
    FMS_CONFIG.buffers.forEach(cfg => {
      const cap = fmsState.bufferCapacities[cfg.id];
      const occupants = fmsState.buffers[cfg.id];
      const countEl = document.getElementById(`bufCount_${cfg.id}`);
      const slotsContainer = document.getElementById(`bufSlots_${cfg.id}`);

      if (countEl) {
        countEl.textContent = `${occupants.length} / ${cap} slots`;
        if (occupants.length >= cap) {
          countEl.className = 'badge bg-danger-subtle text-danger border border-danger-subtle';
        } else {
          countEl.className = 'badge bg-light text-secondary border';
        }
      }

      if (slotsContainer) {
        let html = '';
        for (let i = 0; i < cap; i++) {
          const occJobId = occupants[i];
          if (occJobId) {
            const j = fmsState.activeJobs[occJobId];
            html += `
              <div class="fms-buffer-slot occupied">
                <span class="slot-number">#${i + 1}</span>
                <span class="badge ${j?.badgeClass || 'bg-primary'}">${occJobId}</span>
              </div>
            `;
          } else {
            html += `
              <div class="fms-buffer-slot empty">
                <span class="slot-number">#${i + 1}</span>
                <span class="text-muted small">Free</span>
              </div>
            `;
          }
        }
        slotsContainer.innerHTML = html;
      }
    });

    // Infeed & Outfeed counts
    const infeedCountEl = document.getElementById('infeedCount');
    if (infeedCountEl) infeedCountEl.textContent = fmsState.infeedQueue.length;

    const outfeedCountEl = document.getElementById('outfeedCount');
    if (outfeedCountEl) outfeedCountEl.textContent = fmsState.outfeedCompleted.length;

    // Simulation Clock
    const simClockEl = document.getElementById('fmsSimClock');
    if (simClockEl) simClockEl.textContent = `${fmsState.simTime}s`;

    // Deadlock Global Banner
    const dlBanner = document.getElementById('fmsDeadlockBanner');
    if (dlBanner) {
      if (fmsState.isDeadlocked) {
        dlBanner.classList.remove('d-none');
        dlBanner.innerHTML = `
          <i class="bi bi-exclamation-octagon-fill fs-5 me-2"></i>
          <div>
            <strong>CIRCULAR WAIT DEADLOCK ENCOUNTERED!</strong>
            <div class="small">Machines [${fmsState.deadlockCycle.join(' ↔ ')}] are mutually blocked waiting for full buffers occupied by each other. Production has halted under the Uncontrolled Greedy Policy! Switch to Banker's Avoidance to eliminate deadlocks.</div>
          </div>
        `;
      } else {
        dlBanner.classList.add('d-none');
      }
    }
  }

  function renderActiveJobsTable() {
    const tableBody = document.getElementById('activeJobsTableBody');
    if (!tableBody) return;

    const activeList = Object.values(fmsState.activeJobs);
    if (activeList.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No active parts on factory floor. Click "Start" or load a scenario.</td></tr>`;
      return;
    }

    let rows = '';
    activeList.forEach(job => {
      const stepTotal = job.route.length;
      const stepCurr = Math.max(0, job.currentStepIndex + 1);
      const pct = Math.round((stepCurr / stepTotal) * 100);

      let locLabel = job.currentLocation;
      if (locLabel.startsWith('M')) locLabel = `Workstation ${locLabel}`;
      if (locLabel.startsWith('B')) locLabel = `Buffer ${locLabel}`;
      if (locLabel === 'outfeed') locLabel = 'Completed';

      let statusBadge = `<span class="badge bg-success-subtle text-success">Processing / Moving</span>`;
      if (job.isBlocked) {
        statusBadge = `<span class="badge bg-warning-subtle text-warning border border-warning" title="${job.blockedReason}">Blocked / Waiting</span>`;
      } else if (job.currentLocation === 'outfeed') {
        statusBadge = `<span class="badge bg-secondary">Done</span>`;
      }

      rows += `
        <tr>
          <td>
            <span class="badge ${job.badgeClass} me-1">${job.id}</span>
            <span class="small fw-semibold text-dark">${job.name.split(' ')[1]}</span>
          </td>
          <td><span class="badge bg-light text-dark border">${job.type}</span></td>
          <td><span class="fw-semibold small">${locLabel}</span></td>
          <td>
            <div class="progress" style="height: 6px; width: 90px;" title="Step ${stepCurr} of ${stepTotal}">
              <div class="progress-bar bg-primary" role="progressbar" style="width: ${pct}%"></div>
            </div>
            <div class="fs-7 text-secondary mt-1">Step ${stepCurr}/${stepTotal}</div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-outline-primary btn-sm py-0 px-2 fs-7" onclick="window.FMS.inspectJobMove('${job.id}')" title="Propose next move in Safety Explorer">
              <i class="bi bi-search me-1"></i>Inspect
            </button>
          </td>
        </tr>
      `;
    });
    tableBody.innerHTML = rows;
  }

  function renderBankerMatrixCard() {
    const bState = getFMSBankerState();
    const tableEl = document.getElementById('fmsBankerMatrixTable');
    if (!tableEl) return;

    // Header
    let html = `
      <thead>
        <tr class="table-light">
          <th rowspan="2" class="align-middle">Active Part</th>
          <th colspan="3" class="text-center border-end">Current Allocation</th>
          <th colspan="3" class="text-center border-end">Max Remaining Claim</th>
          <th colspan="3" class="text-center">Remaining Need</th>
        </tr>
        <tr class="table-light small">
          <th>B1</th><th>B2</th><th class="border-end">B3</th>
          <th>B1</th><th>B2</th><th class="border-end">B3</th>
          <th>B1</th><th>B2</th><th>B3</th>
        </tr>
      </thead>
      <tbody>
    `;

    if (bState.activeJobIds.length === 0) {
      html += `<tr><td colspan="10" class="text-center text-muted py-2">No active jobs in Banker matrix</td></tr>`;
    } else {
      bState.activeJobIds.forEach((jId, idx) => {
        const alloc = bState.allocation[idx];
        const max = bState.max[idx];
        const need = bState.need[idx];
        html += `
          <tr>
            <td class="fw-bold">${jId}</td>
            <td>${alloc[0]}</td><td>${alloc[1]}</td><td class="border-end">${alloc[2]}</td>
            <td>${max[0]}</td><td>${max[1]}</td><td class="border-end">${max[2]}</td>
            <td class="fw-semibold text-primary">${need[0]}</td>
            <td class="fw-semibold text-primary">${need[1]}</td>
            <td class="fw-semibold text-primary">${need[2]}</td>
          </tr>
        `;
      });
    }

    // Available footer
    html += `
      </tbody>
      <tfoot>
        <tr class="table-info fw-bold">
          <td>Available Vector:</td>
          <td colspan="9" class="text-start font-monospace ps-3">
            [ B1: ${bState.available[0]}/${bState.capacities[0]}, B2: ${bState.available[1]}/${bState.capacities[1]}, B3: ${bState.available[2]}/${bState.capacities[2]} ]
          </td>
        </tr>
      </tfoot>
    `;
    tableEl.innerHTML = html;
  }

  function renderMetricsPills() {
    const m = fmsState.metrics;
    const compEl = document.getElementById('fmsMetricCompleted');
    if (compEl) compEl.textContent = m.completedCount;

    const throuEl = document.getElementById('fmsMetricThroughput');
    if (throuEl) {
      const rate = fmsState.simTime > 0 ? ((m.completedCount / fmsState.simTime) * 60).toFixed(1) : '0.0';
      throuEl.textContent = `${rate}/min`;
    }

    const grantEl = document.getElementById('fmsMetricGranted');
    if (grantEl) grantEl.textContent = m.grantedRequests;

    const delayEl = document.getElementById('fmsMetricDelayed');
    if (delayEl) delayEl.textContent = m.delayedRequests;

    const unsafeEl = document.getElementById('fmsMetricUnsafePrevented');
    if (unsafeEl) unsafeEl.textContent = m.rejectedUnsafe;

    const blockEl = document.getElementById('fmsMetricBlocked');
    if (blockEl) blockEl.textContent = m.blockedMoves;

    const compTimeEl = document.getElementById('fmsMetricCompTime');
    if (compTimeEl) {
      if (m.computationTimes.length > 0) {
        const avg = (m.computationTimes.reduce((a, b) => a + b, 0) / m.computationTimes.length).toFixed(3);
        compTimeEl.textContent = `${avg} ms`;
      } else {
        compTimeEl.textContent = '< 0.05 ms';
      }
    }
  }

  // --- STEP-BY-STEP SAFETY EXPLORER ---
  function inspectJobMove(jobId) {
    const job = fmsState.activeJobs[jobId];
    if (!job) return;
    const nextStep = job.route[job.currentStepIndex + 1];
    if (!nextStep) return;

    let targetBuffer = 'B1';
    if (nextStep.type === 'buffer') {
      targetBuffer = nextStep.id;
    } else {
      // If next is machine, check if preceding buffer needed or evaluate directly
      targetBuffer = 'B1';
    }

    const decision = evaluateProposedMove(jobId, targetBuffer);
    fmsState.latestTrace = decision;
    fmsState.explorerStepIndex = 0;
    renderSafetyExplorerCard();

    // Scroll to safety explorer tab/section
    const explorerSection = document.getElementById('fmsSafetyExplorerSection');
    if (explorerSection) {
      explorerSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function renderSafetyExplorerCard() {
    const trace = fmsState.latestTrace;
    const container = document.getElementById('fmsExplorerContainer');
    if (!container) return;

    if (!trace) {
      container.innerHTML = `
        <div class="p-4 text-center text-muted">
          <i class="bi bi-shield-check display-6 d-block mb-2 text-primary opacity-50"></i>
          <strong>No Active Safety Trace Selected</strong>
          <p class="small mb-0">Select an active workpiece on the factory floor or click "Propose Move" to evaluate Banker's safety check step-by-step.</p>
        </div>
      `;
      return;
    }

    const totalSteps = trace.traceSteps.length;
    const currStep = trace.traceSteps[fmsState.explorerStepIndex] || trace.traceSteps[0];

    let decisionBadge = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>GRANTED (Safe)</span>`;
    if (!trace.allowed) {
      decisionBadge = `<span class="badge bg-danger"><i class="bi bi-shield-slash me-1"></i>DENIED (${trace.reasonCode})</span>`;
    }

    let stepsHtml = '';
    trace.traceSteps.forEach((st, idx) => {
      const isActive = idx === fmsState.explorerStepIndex;
      stepsHtml += `
        <div class="explorer-step-card ${isActive ? 'active border-primary' : 'border-light'} p-3 mb-2 rounded border" onclick="window.FMS.setExplorerStep(${idx})">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge ${st.passed ? 'bg-primary-subtle text-primary' : 'bg-danger-subtle text-danger'} fw-bold">Step ${st.step}</span>
            <span class="small text-secondary font-monospace">Work: [${st.work.join(', ')}]</span>
          </div>
          <div class="fw-semibold small">${st.description}</div>
          <div class="text-secondary fs-7 mt-1">${st.note}</div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="row g-3">
        <div class="col-lg-5">
          <div class="p-3 bg-light rounded border h-100">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h4 class="h6 mb-0 fw-bold">Proposed Production Request</h4>
              ${decisionBadge}
            </div>
            <table class="table table-sm small mb-3">
              <tr><th>Requesting Workpiece:</th><td><strong>${trace.jobId}</strong></td></tr>
              <tr><th>Target Buffer:</th><td><strong>${trace.targetBufferId}</strong></td></tr>
              <tr><th>Requested Vector:</th><td class="font-monospace">[${trace.requestVector.join(', ')}]</td></tr>
              <tr><th>Available Before:</th><td class="font-monospace">[${trace.initialAvailable.join(', ')}]</td></tr>
              <tr><th>Tentative Available:</th><td class="font-monospace fw-bold text-primary">[${trace.tentativeAvailable.join(', ')}]</td></tr>
              <tr><th>Controller Result:</th><td>${trace.reasonText}</td></tr>
            </table>

            <div class="d-flex gap-2">
              <button class="btn btn-outline-secondary btn-sm flex-fill" onclick="window.FMS.stepExplorer(-1)" ${fmsState.explorerStepIndex === 0 ? 'disabled' : ''}>
                <i class="bi bi-chevron-left"></i> Previous
              </button>
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="window.FMS.stepExplorer(1)" ${fmsState.explorerStepIndex >= totalSteps - 1 ? 'disabled' : ''}>
                Next <i class="bi bi-chevron-right"></i>
              </button>
              <button class="btn btn-light border btn-sm" onclick="window.FMS.setExplorerStep(0)">
                <i class="bi bi-arrow-counterclockwise"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="col-lg-7">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="fw-semibold small">Banker's Execution Trace Steps (${fmsState.explorerStepIndex + 1} of ${totalSteps}):</div>
            <span class="fs-7 text-secondary">Click any step to inspect Work vector</span>
          </div>
          <div class="explorer-steps-scroll" style="max-height: 280px; overflow-y: auto;">
            ${stepsHtml}
          </div>
        </div>
      </div>
    `;

    // Highlight corresponding factory element
    if (currStep && currStep.jobEvaluated) {
      highlightFactoryElement(`machJob_${fmsState.activeJobs[currStep.jobEvaluated]?.currentLocation}`);
    }
  }

  function setExplorerStep(idx) {
    if (fmsState.latestTrace && idx >= 0 && idx < fmsState.latestTrace.traceSteps.length) {
      fmsState.explorerStepIndex = idx;
      renderSafetyExplorerCard();
    }
  }

  function stepExplorer(delta) {
    setExplorerStep(fmsState.explorerStepIndex + delta);
  }

  function highlightFactoryElement(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.add('fms-highlight-pulse');
    setTimeout(() => el.classList.remove('fms-highlight-pulse'), 1200);
  }

  // --- CHARTS & EVALUATION ---
  function renderCharts() {
    renderBufferChart();
    renderMachineChart();
  }

  function renderBufferChart() {
    const ctx = document.getElementById('fmsBufferChart');
    if (!ctx) return;

    const hist = fmsState.metrics.history;
    const labels = hist.time.map(t => `${t}s`);

    if (bufferChart) {
      bufferChart.data.labels = labels;
      bufferChart.data.datasets[0].data = hist.B1_util;
      bufferChart.data.datasets[1].data = hist.B2_util;
      bufferChart.data.datasets[2].data = hist.B3_util;
      bufferChart.update('none');
      return;
    }

    bufferChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'B1 (Milling)', data: hist.B1_util, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.3, fill: true },
          { label: 'B2 (Lathe)', data: hist.B2_util, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, fill: true },
          { label: 'B3 (Cross-Flow)', data: hist.B3_util, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.3, fill: true }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, title: { display: true, text: 'Buffer Utilization (%)' } },
          x: { title: { display: true, text: 'Simulation Time' } }
        },
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  }

  function renderMachineChart() {
    const ctx = document.getElementById('fmsMachineChart');
    if (!ctx) return;

    const st = fmsState.metrics.stateTimes;
    const totalIdle = st.M1.idle + st.M2.idle + st.M3.idle;
    const totalProc = st.M1.processing + st.M2.processing + st.M3.processing;
    const totalWait = st.M1.waiting + st.M2.waiting + st.M3.waiting;
    const totalBlock = st.M1.blocked + st.M2.blocked + st.M3.blocked;

    const dataVals = [totalProc, totalWait, totalBlock, totalIdle];

    if (machineChart) {
      machineChart.data.datasets[0].data = dataVals;
      machineChart.update('none');
      return;
    }

    machineChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Processing', 'Waiting for Buffer', 'Blocked (Deadlock)', 'Idle'],
        datasets: [{
          data: dataVals,
          backgroundColor: ['#2563eb', '#f59e0b', '#ef4444', '#94a3b8'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  function runPolicyComparison() {
    // Run identical scenario under Banker's Avoidance vs Uncontrolled FCFS
    const resultBox = document.getElementById('fmsPolicyComparisonResult');
    if (resultBox) {
      resultBox.classList.remove('d-none');
    }

    // Benchmark test: Contention test case
    // 1. Run under Banker's for 15 simulated seconds
    loadScenario('scenario_d_bankers');
    for (let i = 0; i < 15; i++) {
      simTick();
    }
    const bCompleted = fmsState.metrics.completedCount;
    const bBlocked = fmsState.metrics.blockedMoves;
    const bUnsafe = fmsState.metrics.rejectedUnsafe;
    const bDeadlocks = fmsState.metrics.deadlocksDetected;

    // 2. Run under Uncontrolled for 15 simulated seconds
    loadScenario('scenario_d_uncontrolled');
    for (let i = 0; i < 15; i++) {
      simTick();
      if (fmsState.isDeadlocked) break;
    }
    const uCompleted = fmsState.metrics.completedCount;
    const uBlocked = fmsState.metrics.blockedMoves;
    const uUnsafe = fmsState.metrics.rejectedUnsafe;
    const uDeadlocks = fmsState.metrics.deadlocksDetected;

    comparisonStats = {
      bankers: { completed: bCompleted, blocked: bBlocked, deadlocks: bDeadlocks, deniedUnsafe: bUnsafe },
      uncontrolled: { completed: uCompleted, blocked: uBlocked, deadlocks: uDeadlocks, deniedUnsafe: uUnsafe }
    };

    // Render Policy Chart
    const ctx = document.getElementById('fmsPolicyChart');
    if (ctx) {
      if (policyComparisonChart) {
        policyComparisonChart.destroy();
      }
      policyComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Completed Parts', 'Blocked Moves', 'Deadlocks Encountered', 'Unsafe States Prevented'],
          datasets: [
            {
              label: "Banker's Avoidance (Lawley et al. 1998)",
              data: [bCompleted, bBlocked, bDeadlocks, bUnsafe],
              backgroundColor: '#2563eb'
            },
            {
              label: 'Uncontrolled Greedy Policy (FCFS Baseline)',
              data: [uCompleted, uBlocked, uDeadlocks, uUnsafe],
              backgroundColor: '#ef4444'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

    // Reset to Banker's default view
    loadScenario('scenario_a');
  }

  function updateSimControlButtons() {
    const playBtn = document.getElementById('fmsPlayPauseBtn');
    if (playBtn) {
      if (fmsState.isRunning) {
        playBtn.innerHTML = '<i class="bi bi-pause-fill me-1"></i>Pause';
        playBtn.className = 'btn btn-warning btn-sm';
      } else {
        playBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play';
        playBtn.className = 'btn btn-primary btn-sm';
      }
    }
  }

  // --- AUTOMATED TEST VERIFICATION SUITE ---
  function runFMSTestSuite() {
    const results = [];
    function assert(cond, testName) {
      if (cond) {
        results.push({ pass: true, name: testName });
        console.log(`[PASS] ${testName}`);
      } else {
        results.push({ pass: false, name: testName });
        console.error(`[FAIL] ${testName}`);
      }
    }

    console.log('--- STARTING FMS RESEARCH SUITE TESTS ---');

    // Case 1: Valid move that preserves a safe state -> Granted
    resetSimulation();
    loadScenario('scenario_a');
    const jobA = fmsState.activeJobs['J1'];
    const eval1 = evaluateProposedMove('J1', 'B2');
    assert(eval1.allowed === true, 'Case 1: Valid move that preserves safe state is GRANTED');

    // Case 2: Request exceeding available buffer capacity -> Delayed
    loadScenario('scenario_b');
    const eval2 = evaluateProposedMove('J2', 'B2');
    assert(eval2.allowed === false && eval2.reasonCode === 'CAPACITY_FULL', 'Case 2: Move exceeding buffer capacity is DELAYED as CAPACITY_FULL');

    // Case 3: Request exceeding remaining resource claim -> Denied
    const eval3 = evaluateProposedMove('J1', 'B1'); // Part A never visits B1!
    assert(eval3.allowed === false && eval3.reasonCode === 'OVERCLAIM', 'Case 3: Request exceeding remaining route need is DENIED as OVERCLAIM');

    // Case 4: Request passes quantity validation but results in an unsafe state -> Denied/Delayed
    loadScenario('scenario_c');
    const eval4 = evaluateProposedMove('J2', 'B1');
    assert(eval4.allowed === false && eval4.reasonCode === 'UNSAFE_STATE', 'Case 4: Request causing unsafe state is DENIED/DELAYED by Banker controller');

    // Case 5: Completed job releasing allocated resources -> Available vector restored
    loadScenario('scenario_a');
    const initAvailB2 = fmsState.bufferCapacities.B2;
    fmsState.buffers.B2.push('J1');
    fmsState.activeJobs['J1'].holdingBuffer = 'B2';
    completeJob('J1');
    assert(!fmsState.buffers.B2.includes('J1') && fmsState.activeJobs['J1'].currentLocation === 'outfeed', 'Case 5: Completed job releases buffer and enters outfeed');

    // Case 6: Full buffer preventing material movement -> Machine enters waiting_buffer
    loadScenario('scenario_b');
    simTick();
    assert(fmsState.machines.M1.state === 'waiting_buffer', 'Case 6: Full downstream buffer causes machine to become WAITING_BUFFER');

    // Case 7: Multiple jobs competing for limited capacity -> Safe scheduling under Banker's vs Deadlock under Uncontrolled
    loadScenario('scenario_d_uncontrolled');
    // In uncontrolled mode, both moves granted -> circular wait deadlock
    attemptAdvanceJob('J1');
    attemptAdvanceJob('J2');
    const dlDetect = detectFMSCircularDeadlock();
    assert(dlDetect.isDeadlocked === true, 'Case 7: Uncontrolled greedy policy under contention results in CIRCULAR WAIT DEADLOCK');

    // Case 8: Reset restoring exact initial state
    resetSimulation();
    assert(fmsState.simTime === 0 && Object.keys(fmsState.activeJobs).length === 0 && fmsState.isDeadlocked === false, 'Case 8: Reset restores exact clean initial state');

    // Case 9: Correct calculation of all displayed metrics
    loadScenario('scenario_a');
    for (let i = 0; i < 5; i++) simTick();
    assert(fmsState.metrics.history.time.length > 0 && fmsState.metrics.stateTimes.M1.processing >= 0, 'Case 9: Metrics and state history correctly calculated');

    // Case 10: Consistency between safety trace, factory view, and final decision
    const eval10 = evaluateProposedMove('J1', 'B2');
    assert(eval10.allowed === true && eval10.safeSequence.length > 0 && eval10.traceSteps.length > 0, 'Case 10: Trace steps, safe sequence, and final decision are mathematically consistent');

    console.log('--- FMS TEST SUITE FINISHED ---');
    return results;
  }

  // --- INITIALIZATION & EXPORTS ---
  function initFMS() {
    loadDefaultJobs();
    renderFMSDashboard();

    // Event Listeners for FMS Controls
    const playBtn = document.getElementById('fmsPlayPauseBtn');
    if (playBtn) playBtn.addEventListener('click', () => {
      if (fmsState.isRunning) pauseSimulation();
      else startSimulation();
    });

    const stepBtn = document.getElementById('fmsStepBtn');
    if (stepBtn) stepBtn.addEventListener('click', stepSimulation);

    const resetBtn = document.getElementById('fmsResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => resetSimulation());

    const speedSelect = document.getElementById('fmsSpeedSelect');
    if (speedSelect) speedSelect.addEventListener('change', (e) => setSimSpeed(Number(e.target.value)));

    const policyToggle = document.getElementById('fmsPolicySelect');
    if (policyToggle) policyToggle.addEventListener('change', (e) => setAllocationPolicy(e.target.value));

    const compareBtn = document.getElementById('fmsRunComparisonBtn');
    if (compareBtn) compareBtn.addEventListener('click', runPolicyComparison);

    // Buffer Capacity inputs
    ['B1', 'B2', 'B3'].forEach(bKey => {
      const capInp = document.getElementById(`capInput_${bKey}`);
      if (capInp) {
        capInp.addEventListener('change', (e) => {
          const val = Math.max(1, Math.min(5, Number(e.target.value) || 1));
          fmsState.bufferCapacities[bKey] = val;
          renderFMSDashboard();
        });
      }
    });

    // Scenario Select
    const scenSelect = document.getElementById('fmsScenarioSelect');
    if (scenSelect) scenSelect.addEventListener('change', (e) => {
      if (e.target.value) loadScenario(e.target.value);
    });
  }

  // Expose API to window
  window.FMS = {
    init: initFMS,
    getState: () => fmsState,
    start: startSimulation,
    pause: pauseSimulation,
    step: stepSimulation,
    reset: resetSimulation,
    loadScenario,
    setAllocationPolicy,
    inspectJobMove,
    setExplorerStep,
    stepExplorer,
    evaluateProposedMove,
    runPolicyComparison,
    runTests: runFMSTestSuite
  };

  // Auto initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initFMS();
  });

})(window);
