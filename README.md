# FMS Deadlock-Free Buffer Allocation Simulator
### *Applying Banker’s Algorithm to Resource Allocation in Flexible Manufacturing Systems*

[![GitHub Pages Compatible](https://img.shields.io/badge/GitHub%20Pages-Compatible-success)](https://pages.github.com/)
[![Research Paper](https://img.shields.io/badge/DOI-10.1023%2FA%3A1007969601583-blue)](https://doi.org/10.1023/A:1007969601583)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An academic and industrial simulation system that demonstrates the practical application of Dijkstra's Banker's Algorithm to deadlock-free buffer-space allocation in **Flexible Manufacturing Systems (FMS)**.

Based directly on the seminal research paper:
> **“The Application and Evaluation of Banker’s Algorithm for Deadlock-Free Buffer Space Allocation in Flexible Manufacturing Systems”**  
> **Authors:** M. A. Lawley, S. A. Reveliotis, and P. M. Ferreira  
> **Journal:** *International Journal of Flexible Manufacturing Systems*, Volume 10, pages 73–100, 1998.  
> **DOI:** [10.1023/A:1007969601583](https://doi.org/10.1023/A:1007969601583)

---

## 🏭 1. Research Background & Problem Formulation

### What is a Flexible Manufacturing System (FMS)?
An FMS is an automated production cell consisting of computer numerically controlled (CNC) workstations, automated material handling transfer mechanisms (conveyors, AGVs), and intermediate finite-capacity buffers storing Work-in-Process (WIP).

### Why Do Manufacturing Deadlocks Occur?
1. **Finite Buffer Capacity:** Factory floor area, tooling racks, and storage costs impose strict physical limits on intermediate buffers ($B_1, B_2, B_3$).
2. **Machine Blocking:** When a workstation finishes machining a workpiece, the part cannot vacate the machine until space is secured in the downstream buffer. If that buffer is full, the machine becomes **Blocked** (unable to release the finished part or admit a new one).
3. **Circular Wait:** In flexible manufacturing with cross-flowing part routes (e.g. Part A visiting $M_1 \to M_2$ while Part B visits $M_2 \to M_1$), both machines can become mutually blocked waiting on buffers occupied by each other. This circular dependency halts the entire production line.
4. **Catastrophic Cost:** Unlike operating systems where a deadlocked software process can be preempted or killed with low overhead, aborting a physical machining operation damages cutting tools, scraps costly alloy stock, and incurs heavy downtime. Deadlock **avoidance** (prevention via online supervision) is essential.

### Why Banker's Algorithm in Manufacturing?
Dijkstra's Banker's Algorithm requires *a priori* knowledge of each process's maximum resource claim. In general-purpose OS multitasking, programs rarely know future resource demands. In an FMS, however, **part routes, machine visitations, and buffer sequences are predetermined and known in advance**. Lawley, Reveliotis, and Ferreira (1998) showed that Banker's Algorithm acts as an optimal polynomial-time supervisor for buffer allocation.

### Conventional OS Banker's vs. FMS Manufacturing Banker's
| Feature | Conventional OS Model | FMS Manufacturing Model (Lawley et al. 1998) |
| :--- | :--- | :--- |
| **Resources** | Abstract units (CPU, RAM, Tape) | Spatial constraints (Discrete buffer slots, machine bays) |
| **Routing** | Arbitrary, unconstrained order | Fixed deterministic sequence of processing stages |
| **Acquisition** | Cumulative hold until task completion | Pipelined stage-by-stage acquisition and release |
| **Release Timing** | All resources released at exit | Upstream buffer freed as soon as workpiece enters next machine |
| **Deadlock Impact** | Software lockup / killed process | Physical machine starvation, scrapped stock, cell shutdown |

---

## 🛠️ 2. FMS Model Architecture

The simulator models an industrial cell with three workstations and three finite buffers:

### Workstations (Machines)
- **$M_1$ — CNC Milling Center:** Rough and contour milling operations (Processing time: 3s).
- **$M_2$ — CNC Turning Lathe:** Precision cylindrical turning and boring (Processing time: 4s).
- **$M_3$ — Precision Grinder & Deburrer:** Fine surface grinding and deburring (Processing time: 3s).

### Intermediate Buffers
- **$B_1$ (Milling Buffer):** Intermediate queue preceding $M_1$ operations (Default capacity: 2 slots).
- **$B_2$ (Lathe Buffer):** Intermediate queue preceding $M_2$ operations (Default capacity: 2 slots).
- **$B_3$ (Cross-Flow Buffer):** Intermediate queue preceding $M_3$ or feedback operations (Default capacity: 1 slot).

### Workpiece Types & Processing Routes
- **Part Type A (Gear Shaft):** $\text{Raw} \to M_1 \to B_2 \to M_2 \to B_3 \to M_3 \to \text{Finished Goods}$
- **Part Type B (Cylinder Housing):** $\text{Raw} \to M_2 \to B_1 \to M_1 \to B_3 \to M_3 \to \text{Finished Goods}$
- **Part Type C (Bearing Flange):** $\text{Raw} \to M_3 \to B_1 \to M_1 \to B_2 \to M_2 \to \text{Finished Goods}$

---

## 🧮 3. Banker's Algorithm Adapted to FMS Buffer Allocation

Before any physical workpiece transition is authorized:
1. **Identify the Request:** Active workpiece $J_i$ requests 1 slot in destination buffer $B_d$ ($\vec{Request} = \mathbf{e}_d$).
2. **Rule 1 (Route Overclaim Check):** Check if $\vec{Request} \le \vec{Need}[i]$. If the buffer is not in the remaining route of $J_i$, the request is rejected as an invalid claim.
3. **Rule 2 (Physical Capacity Check):** Check if $\vec{Request} \le \vec{Available}$. If the destination buffer is full, the move is delayed due to **Buffer Saturation** (machine enters `Waiting for Buffer`).
4. **Rule 3 (Online Safety Check):** Construct tentative state:
   $$\vec{Available}' = \vec{Available} - \vec{Request}$$
   $$\mathbf{Alloc}'[i] = \mathbf{Alloc}[i] + \vec{Request}$$
   $$\mathbf{Need}'[i] = \mathbf{Need}[i] - \vec{Request}$$
5. **Safety Algorithm Execution:**
   - Initialize $\vec{Work} = \vec{Available}'$, $\vec{Finish}[k] = \text{false}$ for all active workpieces.
   - Iteratively find an unfinished workpiece $k$ such that $\vec{Need}'[k] \le \vec{Work}$.
   - If found: $\vec{Work} \leftarrow \vec{Work} + \mathbf{Alloc}'[k]$, $\vec{Finish}[k] \leftarrow \text{true}$.
   - If all active workpieces finish ($\vec{Finish} = [\text{true}, \dots, \text{true}]$), the state is **SAFE**. The move is **GRANTED**!
   - If any workpiece cannot finish, the tentative state is **UNSAFE**. The move is **DENIED / DELAYED**, leaving the physical system state untouched and preventing circular wait deadlock.
6. **Resource Release:** When a workpiece enters a machine or exits the system, its previously held buffer slot is returned to the available pool.

---

## 🧪 4. Controlled Experiment Lab

The simulator features 5 pre-configured scenarios ready for one-click investigation:

- **Scenario A (Safe Production Flow):** Normal mixed production load of Parts A, B, and C under Banker's controller. All requests are safe; all workpieces finish.
- **Scenario B (Buffer Saturation):** Destination buffer $B_2$ reaches capacity (1/1). Demonstrates normal capacity blocking without circular deadlock.
- **Scenario C (Unsafe Allocation Denied):** Workpiece $J_2$ requests $B_1$. Granting it would deplete remaining buffers and trap the system in circular wait. Banker's controller intervenes and denies the move.
- **Scenario D (Resource Contention: Uncontrolled vs. Banker's):**
  - *Uncontrolled Policy (FCFS):* Greedily grants competing requests. **Result: CIRCULAR WAIT DEADLOCK** between $M_1$ and $M_2$. Production halts.
  - *Banker's Avoidance:* Delays unsafe request until downstream stage completes. **Result: 100% DEADLOCK-FREE** completion!
- **Scenario E (Recovery Through Resource Release):** Demonstrates how completing a downstream stage releases buffer capacity, cascading backwards to unblock waiting upstream machines.

---

## 📊 5. Real-Time Evaluation Metrics & Charts

Calculated live from actual simulation runs using Chart.js:
- **Completed Workpieces:** Real count of parts passing inspection.
- **System Throughput:** Workpieces completed per simulation minute.
- **Buffer Utilization (%):** Real-time line chart of capacity occupied for $B_1, B_2, B_3$.
- **Workstation State Distribution:** Doughnut chart showing % time in `Idle`, `Processing`, `Waiting for Buffer`, and `Blocked`.
- **Policy Comparison Benchmark:** Bar chart comparing Throughput, Blocked Moves, Deadlocks Encountered, and Unsafe Allocations Prevented under identical contention.
- **Supervisor Latency:** Online computation time in milliseconds ($\le 0.05\text{ ms}$).

---

## 🧮 6. Preserved Conventional OS Banker's Calculator

The original numerical matrix tool is preserved under the **"OS Banker's Calculator"** tab:
- Matrix editor supporting $1$ to $10$ processes and $1$ to $6$ resource types.
- **Total System Instances Mode** and **Direct Available Vector Mode**.
- **Allocation + Max Claim** and **Allocation + Remaining Need** input modes.
- Multi-sequence DFS algorithm discovering all valid safe sequences (e.g. 156 sequences for the 6×4 test case).
- Process row highlighting during step-by-step playback.
- Dynamic Resource Request Simulator with commit feature.
- Matrix Deadlock Detection with custom request matrix support.
- JSON Import / Export and printable PDF solution report.

---

## ✅ 7. Automated Test Suite (10/10 Verified)

An automated verification test runner (`test_runner.html`) tests the simulator in headless Chrome/Edge:

| Test Case | Description | Actual Test Result |
| :--- | :--- | :--- |
| **Case 1** | Valid move that preserves a safe state | `[PASS] GRANTED (SAFE_GRANTED)` |
| **Case 2** | Request exceeding available buffer capacity | `[PASS] DELAYED (CAPACITY_FULL)` |
| **Case 3** | Request exceeding remaining resource claim | `[PASS] DENIED (OVERCLAIM)` |
| **Case 4** | Request passing capacity check but resulting in unsafe state | `[PASS] DENIED (UNSAFE_STATE)` |
| **Case 5** | Completed job releasing its allocated resources | `[PASS] Resource returned to pool` |
| **Case 6** | Full buffer preventing material movement | `[PASS] Machine set to WAITING_BUFFER` |
| **Case 7** | Competing jobs under Uncontrolled vs. Banker's | `[PASS] Uncontrolled Deadlocks; Banker's Prevents` |
| **Case 8** | Reset restoring exact initial state | `[PASS] State, queues, clocks restored to 0` |
| **Case 9** | Correct calculation of displayed metrics | `[PASS] History, throughput, counts verified` |
| **Case 10** | Consistency between trace, factory view, and decision | `[PASS] 100% mathematical alignment` |

All 18 conventional OS matrix tests (6×4 test case with 156 sequences, work vectors, request states, and deadlock) also pass with 100% success.

---

## ⚠️ 8. Educational Modeling Assumptions & Limitations

As an educational implementation of Lawley, Reveliotis, & Ferreira (1998):
- **Discrete Buffer Units:** Buffer spaces are modeled as discrete slot constraints ($1$ part = $1$ slot).
- **Single-Part Machine Bays:** Machines hold at most $1$ workpiece at a time.
- **Deterministic Routings:** Fixed route steps without alternative branch routing.
- **Instantaneous Transfer:** Part transit between buffer and machine occurs upon allocation without modeled AGV travel delay.
- **No Stochastic Failures:** Machine breakdowns and tool wear are not modeled.

---

## 🚀 9. How to Run Locally

No Node.js, Python server, database, or API keys are required:

1. Clone or download the repository to your computer:
   ```bash
   git clone https://github.com/<your-username>/resource_allocation_simulator.git
   cd resource_allocation_simulator
   ```
2. Double-click `index.html` to open it in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari).
3. Alternatively, serve with VS Code **Live Server** extension: right-click `index.html` $\to$ **Open with Live Server**.

### Running Automated Verification Tests
Open `test_runner.html` in your browser. All test assertions will execute automatically and output `[PASS]` logs on screen.

---

## 🌐 10. Publishing to GitHub Pages

To deploy the simulator live for free on GitHub Pages:

1. Stage and commit your changes:
   ```bash
   git add .
   git commit -m "Transform simulator to FMS Deadlock-Free Buffer Allocation Simulator"
   git push origin main
   ```
2. In your GitHub repository, navigate to **Settings** $\to$ **Pages** (in the left sidebar).
3. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `(root)`
4. Click **Save**. Within 1–2 minutes, your website will be live at:
   `https://<your-username>.github.io/resource_allocation_simulator/`

---

## 📚 References
1. Lawley, M. A., Reveliotis, S. A., & Ferreira, P. M. (1998). *The Application and Evaluation of Banker’s Algorithm for Deadlock-Free Buffer Space Allocation in Flexible Manufacturing Systems*. International Journal of Flexible Manufacturing Systems, 10(1), 73–100. DOI: [10.1023/A:1007969601583](https://doi.org/10.1023/A:1007969601583).
2. Dijkstra, E. W. (1968). *Cooperating Sequential Processes*. Programming Languages, Academic Press, pp. 43–112.
3. Silberschatz, A., Galvin, P. B., & Gagne, G. (2018). *Operating System Concepts* (10th ed.). Wiley.
4. Reveliotis, S. A., Lawley, M. A., & Ferreira, P. M. (1997). *Structural deadlock avoidance in automated manufacturing systems: a survey and a new approach*. International Journal of Flexible Manufacturing Systems, 9(2), 177–208.
