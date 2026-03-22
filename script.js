/**
 * ATTENDANCE PRO - FINAL CONSOLIDATED LOGIC
 */

let allStudents = [];      
window.currentSession = null; // Ginawa nating 'window' para makita ng auth.js
let sessionData = {};      
let currentPage = 1;
const rowsPerPage = 10;
let filteredStudents = [];

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebaseListeners();
    const subHeader = document.getElementById('subHeader');
    if (subHeader) {
        subHeader.innerText = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
    }
});

function initFirebaseListeners() {
    // 1. MAESTRO LIST: Para sa lahat ng students (Walang bago dito)
    db.ref('master_students').on('value', (snapshot) => {
        const data = snapshot.val();
        allStudents = data ? Object.values(data) : [];
        filteredStudents = [...allStudents];
        if (typeof updateMasterUI === "function") updateMasterUI();
        if (currentSession) updateAttendanceTable();
    });

    // 2. SESSION PICKER: Para lang sa drop-down list (Huwag dito kukuha ng Attendance!)
    db.ref('sessions').on('value', (snapshot) => {
        const sessions = snapshot.val();
        const picker = document.getElementById('eventPicker');
        if (!picker) return;
        
        // Save current selection to restore it later
        const currentVal = picker.value;
        picker.innerHTML = '<option value="" disabled>Select a session...</option>';
        
        if (sessions) {
            Object.keys(sessions).forEach(sessionId => {
                // Skip placeholder names if any
                const displayTitle = sessions[sessionId].name || sessionId;
                let opt = document.createElement('option');
                opt.value = sessionId; 
                opt.innerText = displayTitle;
                picker.appendChild(opt);
            });
            if (currentVal) picker.value = currentVal;
        }
    });
}

// 3. 🆕 NEW FUNCTION: Dito lang tayo makikinig sa ATTENDANCE ng piniling session
function loadAttendanceData(sessionId) {
    // Patayin ang lumang listener para hindi mag-conflict sa bago
    db.ref(`sessions/${currentSession}`).off(); 

    // Makinig lang sa SPECIFIC session folder
    db.ref(`sessions/${sessionId}`).on('value', (snapshot) => {
        const sessionFullData = snapshot.val();
        
        // Ang attendance records ay nasa loob ng session (halimbawa, sa 'records' or direct keys)
        // Kung ang structure mo ay sessions/ID/STUDENT_ID, kailangan nating i-filter ang 'name'
        if (sessionFullData) {
            // I-clone ang data pero alisin ang 'name' property ng session para hindi mag-error ang .map()
            const { name, ...attendanceRecords } = sessionFullData;
            sessionData = attendanceRecords || {};
        } else {
            sessionData = {};
        }

        updateAttendanceTable();
        updateStats();
    });
}

// FIX: Siguradong may clearing at toast!
function createNewEvent() {
    const input = document.getElementById('newEventName');
    const btn = document.getElementById('createEventBtn');
    
    if (!input || !btn) return;
    const eventName = input.value.trim();

    if (!eventName) return showToast("⚠️ Please enter an Event Name!");

    btn.innerText = "⏳ Creating...";
    btn.disabled = true;

    const newSessionRef = db.ref('sessions').push();
    
    newSessionRef.set({
        name: eventName,
        createdAt: Date.now(),
        status: "active"
    })
    .then(() => {
        showToast(`✅ "${eventName}" Created Successfully!`);
        input.value = ""; // Clear box
        input.blur();     // Hide keyboard
    })
    .catch(err => {
        showToast("❌ Error: " + err.message);
    })
    .finally(() => {
        btn.innerText = "CREATE SESSION";
        btn.disabled = false;
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const message = document.getElementById('toastMessage');
    const iconContainer = toast.querySelector('.toast-icon'); // Hanapin ang icon span
    
    if (!toast || !message) return;

    // 1. Tukuyin kung ano ang tamang icon base sa message
    let icon = "✅"; // Default success
    if (msg.includes("⚠️") || msg.includes("Error") || msg.includes("required")) {
        icon = "⚠️";
    }
    if (msg.includes("🗑️") || msg.includes("Deleted")) {
        icon = "🗑️";
    }

    // 2. Linisin ang message mula sa mga emoji para hindi double emoji
    const cleanMsg = msg.replace(/[✅⚠️🗑️📊❌⏳]/g, '').trim();

    // 3. I-update ang UI
    iconContainer.innerText = icon;
    message.innerText = cleanMsg;
    
    // 4. Animation logic
    toast.style.display = 'block';
    setTimeout(() => toast.classList.add('show'), 10);

    // 5. Auto-hide
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.style.display = 'none'; }, 500);
    }, 3000);
}

// --- Registration Logic ---
function addStudent() {
    const name = document.getElementById('nameIn').value.trim();
    let id = document.getElementById('idIn').value.trim();
    const section = document.getElementById('classIn').value.trim();
    const year = document.getElementById('yearIn').value.trim();

    if (!name) return showToast("⚠️ Name is required!");
    if (!id || id === "-") id = "TEMP-" + Math.random().toString(36).substr(2, 5).toUpperCase();

    db.ref('master_students').push({
        name, id, section: section || 'N/A', year: year || 'N/A', timestamp: Date.now()
    }).then(() => {
        ['nameIn', 'idIn', 'classIn', 'yearIn'].forEach(i => document.getElementById(i).value = '');
        showToast("✅ Student Registered!");
    }).catch(err => showToast("❌ Error: " + err.message));
}

function handleFileSelect() {
    const fileInput = document.getElementById('csvFile');
    const statusText = document.getElementById('fileStatus');
    if (fileInput.files && fileInput.files[0]) {
        statusText.innerText = `READY: ${fileInput.files[0].name}`;
        statusText.style.color = "#4f46e5";
    }
}

function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const statusText = document.getElementById('fileStatus');
    const bulkBtn = document.getElementById('bulkBtn'); // FIXED: Defined it here
    const file = fileInput.files[0];
    
    if (!file) return showToast("⚠️ Select a CSV file.");
    
    bulkBtn.innerText = "⏳ Processing...";
    bulkBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = function(e) {
        const lines = e.target.result.split(/\r?\n/).filter(line => line.trim() !== "");
        const batchUpdates = {};

        lines.forEach((line, index) => {
            if (index === 0) return;
            const cols = line.split(',').map(c => c.trim());
            if (cols.length >= 1 && cols[0] !== "") {
                const newRef = db.ref('master_students').push();
                batchUpdates[newRef.key] = {
                    name: cols[0], id: cols[1] || "-", section: cols[2] || "N/A", year: cols[3] || "N/A", timestamp: Date.now()
                };
            }
        });

        db.ref('master_students').update(batchUpdates).then(() => {
            showToast("📊 Upload Success!");
            fileInput.value = '';
            bulkBtn.innerText = "Process information of Students";
            bulkBtn.disabled = false;
        }).catch(err => showToast("❌ Error: " + err.message));
    };
    reader.readAsText(file);
}

// --- Session & Attendance ---
function renderSheet() {
    const picker = document.getElementById('eventPicker');
    
    // 🔑 PINAKA-IMPORTANTENG LINE:
    // Ginawa nating 'window.currentSession' para mabasa ng sync logic sa auth.js
    window.currentSession = picker.value; 

    if (!window.currentSession || window.currentSession.includes("Select")) {
        return showToast("⚠️ Select a session");
    }

    document.getElementById('activeEventTitle').innerText = picker.options[picker.selectedIndex].text;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('sheet').style.display = 'block';

    // Nakikinig tayo sa tamang path sa Firebase
    db.ref(`sessions/${window.currentSession}`).on('value', (snapshot) => {
        sessionData = snapshot.val() || {};
        updateAttendanceTable();
    });
}

function updateAttendanceTable() {
    const body = document.getElementById('studentTableBody');
    if (!body) return;
    const start = (currentPage - 1) * rowsPerPage;
    const paginated = filteredStudents.slice(start, start + rowsPerPage);

    body.innerHTML = paginated.map(s => {
        // 🔑 DITO ANG MAGIC: Gagawa tayo ng unique "lookupKey"
        // Kung ang ID ay "-", ang gagamitin nating folder name ay yung Name nila
        const lookupKey = (s.id && s.id !== "-") ? s.id : s.name.replace(/\s+/g, '_').toLowerCase();

        // 1. Kuhanin ang specific record base sa lookupKey
        const sRecord = sessionData[lookupKey] || { status: 'absent', timeIn: '--:--', timeOut: '--:--' };
        
        // 2. I-define ang status na unique para sa student na ito
        const currentStudentStatus = sRecord.status || 'absent';

        return `
            <tr>
                <td style="padding: 8px 4px; width: 20%;">
                    <div style="font-weight:800; font-size:0.6rem; color:#1e293b; text-transform:uppercase; line-height:1.2;">${s.name}</div>
                </td>

                <td align="center" style="width: 12%;">
                    <code style="font-size:0.55rem; color:#4f46e5; background:#f1f5f9; padding:2px 4px; border-radius:4px;">${s.id}</code>
                </td>

                <td align="center" style="width: 12%; font-size:0.55rem; color:#475569; line-height:1.1;">
                    <b>${s.section}</b><br>YR ${s.year}
                </td>

                <td align="center" style="width: 16%;">
                    <button class="status-btn" onclick="toggleStatus('${s.id}', '${currentStudentStatus}', '${s.name}')" 
                        style="background: ${getStatusColor(currentStudentStatus)}; color:white; border:none; width:65px; height:26px; border-radius:6px; font-size:0.5rem; font-weight:900; cursor:pointer;">
                        ${currentStudentStatus === 'present' ? 'TIME-IN' : (currentStudentStatus === 'time-out' ? 'TIME-OUT' : 'ABSENT')}
                    </button>
                </td>

                <td align="center" style="width: 20%;">
                    <div style="font-family:monospace; font-size:0.6rem; font-weight:700; color:#059669; background:#ecfdf5; padding:3px 5px; border-radius:5px; border:1px solid #d1fae5;">
                        ${sRecord.timeIn || '--:--'}
                    </div>
                </td>

                <td align="center" style="width: 20%;">
                    <div style="font-family:monospace; font-size:0.6rem; font-weight:700; color:#dc2626; background:#fef2f2; padding:3px 5px; border-radius:5px; border:1px solid #fee2e2;">
                        ${sRecord.timeOut || '--:--'}
                    </div>
                </td>
            </tr>`;
    }).join('');

    updateStats();
    if(document.getElementById('pageIndicator')) {
        document.getElementById('pageIndicator').innerText = `Page ${currentPage} / ${Math.ceil(filteredStudents.length/rowsPerPage) || 1}`;
    }
}

function toggleStatus(studentId, statusFromButton, studentName) {
    // 🔑 MAGIC STEP: Kung ang ID ay dash, gamitin ang Pangalan bilang ID
    // Ginagawa nating lowercase at tinatanggal ang spaces para malinis sa Firebase
    let uniqueKey = (studentId && studentId !== "-") ? studentId : studentName.replace(/\s+/g, '_').toLowerCase();

    const statuses = ['absent', 'present', 'time-out'];
    let nextStatus = statuses[(statuses.indexOf(statusFromButton) + 1) % statuses.length];
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 🛡️ Gamitin ang uniqueKey imbes na studentId
    let oldRecord = { ...sessionData[uniqueKey] } || { status: 'absent', timeIn: '--:--', timeOut: '--:--' };
    
    let attendanceRecord = {
        status: nextStatus,
        timeIn: oldRecord.timeIn || '--:--',
        timeOut: oldRecord.timeOut || '--:--'
    };

    if (nextStatus === 'present') { 
        attendanceRecord.timeIn = timeString;
        attendanceRecord.timeOut = '--:--';
    } else if (nextStatus === 'time-out') { 
        attendanceRecord.timeOut = timeString;
    } else { 
        attendanceRecord.timeIn = '--:--';
        attendanceRecord.timeOut = '--:--';
    }

    // 1. I-save gamit ang uniqueKey
    sessionData[uniqueKey] = attendanceRecord;
    updateAttendanceTable();

    // 2. Firebase Update gamit ang uniqueKey
    if (navigator.onLine && window.currentSession) {
        db.ref(`sessions/${window.currentSession}/${uniqueKey}`).set(attendanceRecord)
            .catch(err => console.error("Firebase Sync Error:", err));
    } else {
        if (typeof window.saveAttendanceOffline === "function") {
            window.saveAttendanceOffline(uniqueKey, nextStatus, attendanceRecord.timeIn, attendanceRecord.timeOut);
        }
    }
}


function getStatusColor(s) {
    if (s === 'present') return '#3b82f6';  // 🔵 ETO YUNG BLUE (TIME-IN)
    if (s === 'time-out') return '#10b981'; // 🟢 ETO YUNG GREEN (TIME-OUT)
    if (s === 'excused') return '#f59e0b';  // 🟠 ORANGE (KUNG GAGAMITIN MO)
    return '#94a3b8'; // ⚪ GREY (ABSENT)
}


function updateStats() {
    const records = Object.values(sessionData);
    
    // 🔍 Hinahanap natin ang status sa loob ng record object {status, time}
    // Pero nilagyan din natin ng backup para sa lumang string-only data (r === 'present')
    const p = records.filter(r => (typeof r === 'object' ? r.status : r) === 'present').length;
    const e = records.filter(r => (typeof r === 'object' ? r.status : r) === 'excused').length;
    
    // I-update ang UI Elements
    const pCountElem = document.getElementById('pCount');
    const eCountElem = document.getElementById('eCount');
    const aCountElem = document.getElementById('aCount');

    if (pCountElem) pCountElem.innerText = p;
    if (eCountElem) eCountElem.innerText = e;
    if (aCountElem) aCountElem.innerText = Math.max(0, allStudents.length - (p + e));
}

function handleSearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    filteredStudents = allStudents.filter(s => s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term));
    currentPage = 1;
    updateAttendanceTable();
}

function changePage(dir) {
    const max = Math.ceil(filteredStudents.length / rowsPerPage);
    if (currentPage + dir >= 1 && currentPage + dir <= max) {
        currentPage += dir;
        updateAttendanceTable();
    }
}

function goHome() {
    if (currentSession) db.ref(`sessions/${currentSession}`).off();
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('sheet').style.display = 'none';
}

function closeModal() {
    document.getElementById('customModal').style.display = 'none';
}

function deleteEvent() {
    const picker = document.getElementById('eventPicker');
    const sessionId = picker.value;
    if (!sessionId || sessionId.includes("Select")) return showToast("⚠️ Select a session!");

    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').innerText = "Delete Session";
    document.getElementById('modalBody').innerHTML = `Delete <strong>"${picker.options[picker.selectedIndex].text}"</strong>?`;
    modal.style.display = 'flex';

    document.getElementById('confirmBtn').onclick = function() {
        db.ref(`sessions/${sessionId}`).remove().then(() => {
            showToast("🗑️ Session Deleted!");
            closeModal();
            picker.value = "";
        });
    };
}

function clearAllStudents() {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').innerText = "Wipe Database";
    document.getElementById('modalBody').innerText = "This will delete ALL students. Are you sure?";
    modal.style.display = 'flex';

    document.getElementById('confirmBtn').onclick = function() {
        db.ref('master_students').remove().then(() => {
            showToast("⚠️ Database Cleared!");
            closeModal();
        });
    };
}

function updateMasterUI() {
    const body = document.getElementById('masterRosterBody');
    if (!body) return;
    body.innerHTML = [...allStudents].slice(-5).reverse().map(s => `
        <tr><td style="font-size:0.7rem;"><b>${s.name}</b></td><td align="right">ID: ${s.id}</td></tr>
    `).join('');
}

function exportToCSV() {
    if (!allStudents.length) return showToast("⚠️ No data to export!");
    
    // 1. Updated Headers para sa 6 columns
    let csvRows = ["Student Name,ID Number,Section,Year Level,Status,Time In,Time Out"];
    let p = 0, a = 0, to = 0;

    allStudents.forEach(s => {
        // 🔑 LOOKUP KEY: Match sa toggleStatus logic
        const lookupKey = (s.id && s.id !== "-") ? s.id : s.name.replace(/\s+/g, '_').toLowerCase();
        
        // Kuhanin ang record (Object)
        const record = sessionData[lookupKey] || { status: 'absent', timeIn: '--:--', timeOut: '--:--' };
        
        // Kunin ang status text
        const statusText = (typeof record === 'string' ? record : record.status || 'absent').toUpperCase();
        
        // Mag-count para sa summary sa baba
        if (statusText === 'PRESENT' || statusText === 'TIME-IN') p++; 
        else if (statusText === 'TIME-OUT') to++; 
        else a++;

        // 2. I-push ang data sa CSV rows
        csvRows.push(`"${s.name}","${s.id}","${s.section}","${s.year}","${statusText}","${record.timeIn || '--:--'}","${record.timeOut || '--:--'}"`);
    });

    // 3. Summary sa pinakababa ng CSV
    csvRows.push(`\n"TOTAL TIME-IN",,,,"${p}"`);
    csvRows.push(`"TOTAL TIME-OUT",,,,"${to}"`);
    csvRows.push(`"TOTAL ABSENT",,,,"${a}"`);
    
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Report_${document.getElementById('activeEventTitle').innerText}.csv`;
    link.click();
}


/* --- 📅 AUTOMATIC DATE UPDATER --- */
const updateCurrentDate = () => {
    const dateElement = document.getElementById('current-date');
    
    if (dateElement) {
        const today = new Date();
        
        // Format: "Sunday, March 22, 2026"
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        
        const formattedDate = today.toLocaleDateString('en-US', options);
        
        // Ilalagay na nito ang tamang petsa sa loob ng iyong "Elite Glass Pill"
        dateElement.textContent = formattedDate;
    }
};

async function sendFormalReport() {
    const eventName = document.getElementById('activeEventTitle')?.innerText || "General Event";
    const students = allStudents || [];
    const currentAttendance = sessionData || {}; 

    if (!students || students.length === 0) {
        return Swal.fire({ icon: 'error', title: 'Walang Data', text: 'Mag-upload muna ng students bago mag-send ng report.', confirmButtonColor: '#1e3a8a' });
    }

    // 🎨 ENGRANDE CUSTOM PROMPT (SweetAlert2)
    const { value: recipientEmail } = await Swal.fire({
        title: 'EXPORT OFFICIAL REPORT',
        input: 'email',
        inputLabel: 'Recipients Email Address',
        inputValue: 'davie.sialongo@csucc.edu.ph',
        inputPlaceholder: 'Enter email here...',
        showCancelButton: true,
        confirmButtonText: '🚀 Send Reports',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#1e3a8a', // CSU Blue
        cancelButtonColor: '#ef4444',
        background: '#ffffff',
        backdrop: `rgba(30, 58, 138, 0.4)`, // Semi-transparent blue background
        inputValidator: (value) => {
            if (!value) return 'No email address!';
        }
    });

    if (recipientEmail) {
        // 🏆 CHUNKING LOGIC: Hatiin sa tig-1,000
        const batchSize = 1000;
        const totalBatches = Math.ceil(students.length / batchSize);
        
        // Magpakita ng simplified alert habang nagsesend
Swal.fire({
    title: 'Sending Reports...',
    html: `Splitting <b>${students.length}</b> students into <b>${totalBatches}</b> batches.`,
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
});

        const GAS_URL = "https://script.google.com/macros/s/AKfycbwHQVVHNI_bTFxXkrhmFipMzzAzSWR4RLcOP7x_oMYmTWphpurYL-cY3mlO-YqJ-RSJ/exec"; 

        for (let i = 0; i < totalBatches; i++) {
            const batchList = students.slice(i * batchSize, (i + 1) * batchSize);

            const attendanceData = batchList.map(s => {
                const lookupKey = (s.id && s.id !== "-") ? s.id : s.name.replace(/\s+/g, '_').toLowerCase();
                const record = currentAttendance[lookupKey] || { status: 'absent', timeIn: '--:--', timeOut: '--:--' };
                const statusText = (typeof record === 'string' ? record : record.status || 'absent').toUpperCase();

                return {
                    name: s.name || "N/A",
                    id: s.id || "-",
                    section: `${s.section || ''} ${s.year || ''}`.trim() || "-",
                    status: statusText,
                    timeIn: record.timeIn || "--:--",
                    timeOut: record.timeOut || "--:--"
                };
            });

            const payload = {
                eventName: `${eventName} (Batch ${i + 1} of ${totalBatches})`,
                attendance: attendanceData,
                recipientEmail: recipientEmail
            };

            await fetch(GAS_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(payload)
            });
            
            console.log(`Batch ${i+1} sent.`);
        }

        // 📊 SUCCESS MESSAGE (Engrande Style)
// 📊 SUCCESS MESSAGE (English Version)
Swal.fire({
    icon: 'success',
    title: 'Reports Sent Successfully!',
    html: `Successfully sent <b>${totalBatches} official emails</b> for a total of <b>${students.length}</b> students.<br><br>Please check the inbox of <i>${recipientEmail}</i>.`,
    confirmButtonColor: '#1e3a8a'
});

    }
}






// Tatakbo agad ang script kapag na-load na ang page
document.addEventListener('DOMContentLoaded', updateCurrentDate);

// Global scope exposures
window.createNewEvent = createNewEvent;
window.addStudent = addStudent;
window.handleFileSelect = handleFileSelect;
window.uploadCSV = uploadCSV;
window.renderSheet = renderSheet;
window.deleteEvent = deleteEvent;
window.toggleStatus = toggleStatus;
window.handleSearch = handleSearch;
window.changePage = changePage;
window.goHome = goHome;
window.clearAllStudents = clearAllStudents;
window.closeModal = closeModal;
window.exportToCSV = exportToCSV;


