/**
 * HR Analytics App - Backend Source Code (v1.6.0)
 * Added: double-login prevention (SESSION_TOKEN), answer-time cheat detection (POSTTIMESEC)
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const VERSION = "1.6.0";

const SHEETS = {
    EMPLOYEES: SS.getSheetByName('EMPLOYEES'),
    TRAININGS: SS.getSheetByName('TRAININGS'),
    QUESTIONS: SS.getSheetByName('QUESTIONS'),
    RESULTS: SS.getSheetByName('RESULTS'),
    HR_ANALYSES: SS.getSheetByName('HR_ANALYSES'),
    ANNOUNCEMENTS: SS.getSheetByName('ANNOUNCEMENTS'),
    ANNUAL_SUMMARIES: SS.getSheetByName('ANNUAL_SUMMARIES') || SS.insertSheet('ANNUAL_SUMMARIES'),
    PSYCH_APPLICATIONS: SS.getSheetByName('PSYCH_APPLICATIONS') || SS.insertSheet('PSYCH_APPLICATIONS')
};

// Initialize ANNUAL_SUMMARIES headers if new
if (SHEETS.ANNUAL_SUMMARIES.getLastRow() === 0) {
    SHEETS.ANNUAL_SUMMARIES.appendRow(['KEY', 'ID', 'NAME', 'REQUIRED_TOTAL', 'REQUIRED_DONE', 'OPTIONAL_DONE', 'PENALTY', 'BONUS', 'FISCAL_YEAR', 'PSYCHOLOGY_ANALYSIS']);
}

// Initialize PSYCH_APPLICATIONS headers if new
if (SHEETS.PSYCH_APPLICATIONS.getLastRow() === 0) {
    SHEETS.PSYCH_APPLICATIONS.appendRow(['EMPLOYEE_ID', 'EMPLOYEE_NAME', 'APPLIED_AT']);
}

// Auto-migrate: add SESSION_TOKEN to EMPLOYEES (col 11) and POSTTIMESEC to RESULTS (col 13)
(function migrateColumns() {
    const p = PropertiesService.getScriptProperties();
    if (p.getProperty('cols_v16')) return;
    try {
        if (SHEETS.EMPLOYEES && SHEETS.EMPLOYEES.getLastColumn() < 11) {
            SHEETS.EMPLOYEES.getRange(1, 11).setValue('SESSION_TOKEN');
        }
        if (SHEETS.RESULTS && SHEETS.RESULTS.getLastColumn() < 13) {
            SHEETS.RESULTS.getRange(1, 13).setValue('POSTTIMESEC');
        }
    } catch(e) {}
    p.setProperty('cols_v16', '1');
})();

function doGet(e) {
    const type = e.parameter.type;
    if (type === 'GET_VERSION') return res({ version: VERSION });

    const sheet = SHEETS[type.replace('GET_', '')];
    if (!sheet) return res([]);

    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const result = data.map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            const key = h.toString().toLowerCase().replace(/[\s_]/g, '');
            obj[key] = row[i];
        });
        return obj;
    }).filter(row => Object.values(row).some(v => v !== ""));
    return res(result);
}

function doPost(e) {
    const payload = JSON.parse(e.postData.contents);
    const type = payload.type;

    if (type === 'ADD_EMPLOYEE') {
        const emp = payload.employee;
        const secret = emp.otpSecret || emp.otpsecret || "";
        const required = emp.requiredTrainings || "[]";
        const challenge = emp.challengeTrainings || "[]";
        const dept = emp.department || "";
        const pos = emp.position || "";
        upsertRow(SHEETS.EMPLOYEES, 0, emp.id, [emp.id, emp.name, emp.role, emp.password, secret, new Date().toISOString(), required, challenge, dept, pos]);
    } else if (type === 'UPDATE_EMPLOYEE') {
        const emp = payload.employee;
        const data = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            if (data[i][0] == emp.id) {
                const row = i + 1;
                SHEETS.EMPLOYEES.getRange(row, 2).setValue(emp.name);
                SHEETS.EMPLOYEES.getRange(row, 3).setValue(emp.role);
                if (emp.password) SHEETS.EMPLOYEES.getRange(row, 4).setValue(emp.password);
                if (emp.otpSecret) SHEETS.EMPLOYEES.getRange(row, 5).setValue(emp.otpSecret);
                SHEETS.EMPLOYEES.getRange(row, 7).setValue(emp.requiredTrainings || "[]");
                SHEETS.EMPLOYEES.getRange(row, 8).setValue(emp.challengeTrainings || "[]");
                SHEETS.EMPLOYEES.getRange(row, 9).setValue(emp.department || "");
                SHEETS.EMPLOYEES.getRange(row, 10).setValue(emp.position || "");
                break;
            }
        }
    } else if (type === 'DELETE_EMPLOYEE') {
        const data = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = data.length - 1; i >= 1; i--) {
            if (data[i][0] == payload.employeeId) {
                SHEETS.EMPLOYEES.deleteRow(i + 1);
                break;
            }
        }
    } else if (type === 'UPDATE_EMPLOYEE_ROLE') {
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 2, payload.role);
    } else if (type === 'UPDATE_LAST_ACTIVE') {
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 5, new Date().toISOString());
    } else if (type === 'SET_SESSION_TOKEN') {
        // Set session token on login — overwrites any previous session (2重ログイン防止)
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 5, new Date().toISOString());
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 10, payload.sessionId);
        return res({ success: true });
    } else if (type === 'HEARTBEAT') {
        // Validate session and update last-active
        const empData = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = 1; i < empData.length; i++) {
            if (String(empData[i][0]).toUpperCase() === String(payload.employeeId).toUpperCase()) {
                const storedToken = String(empData[i][10] || '');
                // If no token stored yet (old user), accept and let SET_SESSION_TOKEN populate it
                if (storedToken === '' || storedToken === String(payload.sessionId)) {
                    SHEETS.EMPLOYEES.getRange(i + 1, 6).setValue(new Date().toISOString());
                    return res({ valid: true });
                } else {
                    return res({ valid: false }); // 別端末からログイン済み
                }
            }
        }
        return res({ valid: false });
    } else if (type === 'SAVE_HR_ANALYSIS') {
        const h = payload.record;
        SHEETS.HR_ANALYSES.appendRow([Utilities.getUuid(), h.employeeId, h.employeeName, h.date, h.content, h.instructionUsed]);
    } else if (type === 'AUTO_SYNC_RESULT') {
        const d = payload.data;
        SHEETS.RESULTS.appendRow([d.trainingid, d.trainingtitle, d.employeeid, d.employeename, d.prescore, d.postscore, d.useranswers, d.analysis, d.advice, d.date, d.traits, d.competencies, d.postanswertime || ""]);
    } else if (type === 'SAVE_TRAINING_V2') {
        const t = payload.training;
        const qs = payload.questions;
        const targetEmps = t.targetEmployees ? JSON.stringify(t.targetEmployees) : "[]";
        const targetDepts = t.targetDepartments ? JSON.stringify(t.targetDepartments) : "[]";
        const targetPos = t.targetPositions ? JSON.stringify(t.targetPositions) : "[]";
        const studyLinksJson = t.studyLinks ? JSON.stringify(t.studyLinks) : "[]";
        const isRequiredForAll = t.isRequiredForAll ? "TRUE" : "FALSE";
        const fiscalYear = t.fiscalYear || "";

        upsertRow(SHEETS.TRAININGS, 0, t.id, [t.id, t.title, t.date, t.description, t.materials_json, targetEmps, targetDepts, targetPos, studyLinksJson, isRequiredForAll, fiscalYear]);

        // Clear and rewrite questions for this training
        const qData = SHEETS.QUESTIONS.getDataRange().getValues();
        for (let i = qData.length - 1; i >= 1; i--) {
            if (qData[i][1] == t.id) SHEETS.QUESTIONS.deleteRow(i + 1);
        }
        qs.forEach(q => SHEETS.QUESTIONS.appendRow([q.id, t.id, q.question, q.options_json, q.correctAnswer, q.explanation]));
    } else if (type === 'SAVE_ANNUAL_SUMMARY') {
        const s = payload.summary;
        upsertRow(SHEETS.ANNUAL_SUMMARIES, 0, s.id + "_" + s.fiscalYear, [s.id + "_" + s.fiscalYear, s.id, s.name, s.requiredTotal, s.requiredDone, s.optionalDone, s.penalty, s.bonus, s.fiscalYear, s.psychologyAnalysis]);
    } else if (type === 'SAVE_ANNOUNCEMENT') {
        const a = payload.announcement;
        SHEETS.ANNOUNCEMENTS.appendRow([a.id, a.title, a.content, a.createdAt, a.createdBy, a.priority, a.active]);
    } else if (type === 'TOGGLE_ANNOUNCEMENT') {
        updateRow(SHEETS.ANNOUNCEMENTS, 0, payload.id, 6, payload.active);
    } else if (type === 'SAVE_PSYCH_APPLICATION') {
        const a = payload.application;
        upsertRow(SHEETS.PSYCH_APPLICATIONS, 0, a.employeeId, [a.employeeId, a.employeeName, a.appliedAt]);
    } else if (type === 'DELETE_PSYCH_APPLICATION') {
        const data = SHEETS.PSYCH_APPLICATIONS.getDataRange().getValues();
        for (let i = data.length - 1; i >= 1; i--) {
            if (data[i][0] == payload.employeeId) {
                SHEETS.PSYCH_APPLICATIONS.deleteRow(i + 1);
                break;
            }
        }
    }

    return res({ success: true });
}

function res(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function updateRow(sheet, keyCol, keyVal, targetCol, newVal) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][keyCol] == keyVal) {
            sheet.getRange(i + 1, targetCol + 1).setValue(newVal);
            return true;
        }
    }
    return false;
}

function upsertRow(sheet, keyCol, keyVal, newRow) {
    if (!updateRow(sheet, keyCol, keyVal, 0, newRow[0])) {
        sheet.appendRow(newRow);
    } else {
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            if (data[i][keyCol] == keyVal) {
                sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
                break;
            }
        }
    }
}
