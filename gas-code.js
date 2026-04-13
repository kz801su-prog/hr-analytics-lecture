/**
 * HR Analytics App - Backend Source Code (v1.7.0)
 * v1.7.0: 社員拡張カラム(EMPLOYEE_NO/HIRE_DATE/EMAIL/PHONE/MANAGER_ID/GRADE/EMPLOYMENT_TYPE)
 *         POSITION_PERMISSIONS シート追加
 *         BULK_UPDATE_EMPLOYEES (CSV マージ) ハンドラ追加
 *         SAVE_HR_ANALYSIS に fiscalYear / psychMods 対応
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const VERSION = "1.7.0";

const SHEETS = {
    EMPLOYEES:            SS.getSheetByName('EMPLOYEES'),
    TRAININGS:            SS.getSheetByName('TRAININGS'),
    QUESTIONS:            SS.getSheetByName('QUESTIONS'),
    RESULTS:              SS.getSheetByName('RESULTS'),
    HR_ANALYSES:          SS.getSheetByName('HR_ANALYSES'),
    ANNOUNCEMENTS:        SS.getSheetByName('ANNOUNCEMENTS'),
    ANNUAL_SUMMARIES:     SS.getSheetByName('ANNUAL_SUMMARIES')     || SS.insertSheet('ANNUAL_SUMMARIES'),
    PSYCH_APPLICATIONS:   SS.getSheetByName('PSYCH_APPLICATIONS')   || SS.insertSheet('PSYCH_APPLICATIONS'),
    POSITION_PERMISSIONS: SS.getSheetByName('POSITION_PERMISSIONS') || SS.insertSheet('POSITION_PERMISSIONS'),
};

// ── シート初期化 ────────────────────────────────────────────────────────────

if (SHEETS.ANNUAL_SUMMARIES.getLastRow() === 0) {
    SHEETS.ANNUAL_SUMMARIES.appendRow(['KEY','ID','NAME','REQUIRED_TOTAL','REQUIRED_DONE','OPTIONAL_DONE','PENALTY','BONUS','FISCAL_YEAR','PSYCHOLOGY_ANALYSIS']);
}
if (SHEETS.PSYCH_APPLICATIONS.getLastRow() === 0) {
    SHEETS.PSYCH_APPLICATIONS.appendRow(['EMPLOYEE_ID','EMPLOYEE_NAME','APPLIED_AT']);
}
if (SHEETS.POSITION_PERMISSIONS.getLastRow() === 0) {
    SHEETS.POSITION_PERMISSIONS.appendRow(['POSITION','VIEWABLE_FIELDS_JSON','CAN_VIEW_ALL_DEPT','CAN_VIEW_SUBORDINATES','CAN_VIEW_OWN_ONLY']);
}

// ── 自動マイグレーション ────────────────────────────────────────────────────
(function migrateColumns() {
    const p = PropertiesService.getScriptProperties();

    // v1.6 migration: SESSION_TOKEN(col 11), POSTTIMESEC(col 13)
    if (!p.getProperty('cols_v16')) {
        try {
            if (SHEETS.EMPLOYEES && SHEETS.EMPLOYEES.getLastColumn() < 11)
                SHEETS.EMPLOYEES.getRange(1, 11).setValue('SESSION_TOKEN');
            if (SHEETS.RESULTS && SHEETS.RESULTS.getLastColumn() < 13)
                SHEETS.RESULTS.getRange(1, 13).setValue('POSTTIMESEC');
        } catch(e) {}
        p.setProperty('cols_v16', '1');
    }

    // v1.7 migration: 拡張社員カラム (col 12-18), HR_ANALYSES fiscal_year/psych_mods (col 7-8)
    if (!p.getProperty('cols_v17')) {
        try {
            const empSheet = SHEETS.EMPLOYEES;
            const empHeaders = empSheet.getRange(1, 1, 1, empSheet.getLastColumn()).getValues()[0];
            const addEmpCol = (idx, name) => {
                if (empHeaders.length < idx || !empHeaders[idx - 1]) {
                    empSheet.getRange(1, idx).setValue(name);
                }
            };
            addEmpCol(12, 'EMPLOYEE_NO');
            addEmpCol(13, 'HIRE_DATE');
            addEmpCol(14, 'EMAIL');
            addEmpCol(15, 'PHONE');
            addEmpCol(16, 'MANAGER_ID');
            addEmpCol(17, 'GRADE');
            addEmpCol(18, 'EMPLOYMENT_TYPE');

            const hrSheet = SHEETS.HR_ANALYSES;
            const hrHeaders = hrSheet.getRange(1, 1, 1, Math.max(hrSheet.getLastColumn(), 8)).getValues()[0];
            if (!hrHeaders[6]) hrSheet.getRange(1, 7).setValue('FISCAL_YEAR');
            if (!hrHeaders[7]) hrSheet.getRange(1, 8).setValue('PSYCH_MODS');
        } catch(e) {}
        p.setProperty('cols_v17', '1');
    }
})();

// ── GET ────────────────────────────────────────────────────────────────────

function doGet(e) {
    const type = e.parameter.type;
    if (type === 'GET_VERSION') return res({ version: VERSION });

    if (type === 'GET_POSITION_PERMISSIONS') {
        const sheet = SHEETS.POSITION_PERMISSIONS;
        const data = sheet.getDataRange().getValues();
        const headers = data.shift();
        const result = data.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h.toString().toLowerCase().replace(/[\s_]/g,'')] = row[i]; });
            return obj;
        }).filter(r => r.position);
        return res(result);
    }

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

// ── POST ───────────────────────────────────────────────────────────────────

function doPost(e) {
    const payload = JSON.parse(e.postData.contents);
    const type = payload.type;

    // ── 社員操作 ──────────────────────────────────────────────

    if (type === 'ADD_EMPLOYEE') {
        const emp = payload.employee;
        upsertRow(SHEETS.EMPLOYEES, 0, emp.id, buildEmpRow(emp));

    } else if (type === 'UPDATE_EMPLOYEE') {
        const emp = payload.employee;
        const data = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            if (String(data[i][0]).toUpperCase() === String(emp.id).toUpperCase()) {
                const row = i + 1;
                const sh = SHEETS.EMPLOYEES;
                sh.getRange(row, 2).setValue(emp.name);
                sh.getRange(row, 3).setValue(emp.role);
                if (emp.password)   sh.getRange(row, 4).setValue(emp.password);
                if (emp.otpSecret)  sh.getRange(row, 5).setValue(emp.otpSecret);
                sh.getRange(row, 7).setValue(emp.requiredTrainings || '[]');
                sh.getRange(row, 8).setValue(emp.challengeTrainings || '[]');
                sh.getRange(row, 9).setValue(emp.department || '');
                sh.getRange(row, 10).setValue(emp.position  || '');
                // 拡張フィールド
                sh.getRange(row, 12).setValue(emp.employeeNo      || '');
                sh.getRange(row, 13).setValue(emp.hireDate         || '');
                sh.getRange(row, 14).setValue(emp.email            || '');
                sh.getRange(row, 15).setValue(emp.phone            || '');
                sh.getRange(row, 16).setValue(emp.managerId        || '');
                sh.getRange(row, 17).setValue(emp.grade            || '');
                sh.getRange(row, 18).setValue(emp.employmentType   || '');
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
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 5, new Date().toISOString());
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 10, payload.sessionId);
        return res({ success: true });

    } else if (type === 'HEARTBEAT') {
        const empData = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = 1; i < empData.length; i++) {
            if (String(empData[i][0]).toUpperCase() === String(payload.employeeId).toUpperCase()) {
                const storedToken = String(empData[i][10] || '');
                if (storedToken === '' || storedToken === String(payload.sessionId)) {
                    SHEETS.EMPLOYEES.getRange(i + 1, 6).setValue(new Date().toISOString());
                    return res({ valid: true });
                } else {
                    return res({ valid: false });
                }
            }
        }
        return res({ valid: false });

    // ─────────────────────────────────────────────────────────────
    // BULK_UPDATE_EMPLOYEES — CSV からのマージ一括更新
    // payload.employees: [{id, name, department, position, employeeNo,
    //                      hireDate, email, phone, managerId, grade, employmentType, ...}]
    // 既存レコードは保持し、マッチした列のみ上書き。新規IDは追加。
    // ─────────────────────────────────────────────────────────────
    } else if (type === 'BULK_UPDATE_EMPLOYEES') {
        const incoming = payload.employees || [];
        const sh = SHEETS.EMPLOYEES;
        const data = sh.getDataRange().getValues();

        incoming.forEach(emp => {
            let found = false;
            for (let i = 1; i < data.length; i++) {
                if (String(data[i][0]).toUpperCase() === String(emp.id).toUpperCase()) {
                    const row = i + 1;
                    // 名前・部署・役職（空でない場合のみ上書き）
                    if (emp.name)           sh.getRange(row, 2).setValue(emp.name);
                    if (emp.role)           sh.getRange(row, 3).setValue(emp.role);
                    if (emp.department)     sh.getRange(row, 9).setValue(emp.department);
                    if (emp.position)       sh.getRange(row, 10).setValue(emp.position);
                    // 拡張フィールド（空でない場合のみ上書き）
                    if (emp.employeeNo)     sh.getRange(row, 12).setValue(emp.employeeNo);
                    if (emp.hireDate)       sh.getRange(row, 13).setValue(emp.hireDate);
                    if (emp.email)          sh.getRange(row, 14).setValue(emp.email);
                    if (emp.phone)          sh.getRange(row, 15).setValue(emp.phone);
                    if (emp.managerId)      sh.getRange(row, 16).setValue(emp.managerId);
                    if (emp.grade)          sh.getRange(row, 17).setValue(emp.grade);
                    if (emp.employmentType) sh.getRange(row, 18).setValue(emp.employmentType);
                    found = true;
                    break;
                }
            }
            // 新規社員は追加（パスワード・OTPは空で登録）
            if (!found) {
                sh.appendRow(buildEmpRow(emp));
            }
        });

    // ─────────────────────────────────────────────────────────────
    // 役職別アクセス権限
    // ─────────────────────────────────────────────────────────────
    } else if (type === 'SAVE_POSITION_PERMISSION') {
        const p = payload.permission;
        upsertRow(SHEETS.POSITION_PERMISSIONS, 0, p.position, [
            p.position,
            JSON.stringify(p.viewableFields || []),
            p.canViewAllDept     ? 'TRUE' : 'FALSE',
            p.canViewSubordinates ? 'TRUE' : 'FALSE',
            p.canViewOwnOnly     ? 'TRUE' : 'FALSE',
        ]);

    } else if (type === 'DELETE_POSITION_PERMISSION') {
        const data = SHEETS.POSITION_PERMISSIONS.getDataRange().getValues();
        for (let i = data.length - 1; i >= 1; i--) {
            if (data[i][0] === payload.position) {
                SHEETS.POSITION_PERMISSIONS.deleteRow(i + 1);
                break;
            }
        }

    // ─────────────────────────────────────────────────────────────
    // HR 深層心理分析（fiscalYear / psychMods 対応）
    // ─────────────────────────────────────────────────────────────
    } else if (type === 'SAVE_HR_ANALYSIS') {
        const h = payload.record;
        const fiscalYear    = h.fiscalYear   != null ? h.fiscalYear   : '';
        const psychModsJson = h.psychMods    ? JSON.stringify(h.psychMods) : '';
        SHEETS.HR_ANALYSES.appendRow([
            Utilities.getUuid(),
            h.employeeId,
            h.employeeName,
            h.date,
            h.content,
            h.instructionUsed || '',
            fiscalYear,
            psychModsJson,
        ]);

    // ─────────────────────────────────────────────────────────────
    // その他の既存ハンドラ
    // ─────────────────────────────────────────────────────────────
    } else if (type === 'AUTO_SYNC_RESULT') {
        const d = payload.data;
        SHEETS.RESULTS.appendRow([d.trainingid, d.trainingtitle, d.employeeid, d.employeename, d.prescore, d.postscore, d.useranswers, d.analysis, d.advice, d.date, d.traits, d.competencies, d.postanswertime || '']);

    } else if (type === 'SAVE_TRAINING_V2') {
        const t = payload.training;
        const qs = payload.questions;
        const targetEmps  = t.targetEmployees   ? JSON.stringify(t.targetEmployees)   : '[]';
        const targetDepts = t.targetDepartments ? JSON.stringify(t.targetDepartments) : '[]';
        const targetPos   = t.targetPositions   ? JSON.stringify(t.targetPositions)   : '[]';
        const studyLinksJson = t.studyLinks ? JSON.stringify(t.studyLinks) : '[]';
        const isRequiredForAll = t.isRequiredForAll ? 'TRUE' : 'FALSE';
        const fiscalYear = t.fiscalYear || '';
        upsertRow(SHEETS.TRAININGS, 0, t.id, [t.id, t.title, t.date, t.description, t.materials_json, targetEmps, targetDepts, targetPos, studyLinksJson, isRequiredForAll, fiscalYear]);
        const qData = SHEETS.QUESTIONS.getDataRange().getValues();
        for (let i = qData.length - 1; i >= 1; i--) {
            if (qData[i][1] == t.id) SHEETS.QUESTIONS.deleteRow(i + 1);
        }
        qs.forEach(q => SHEETS.QUESTIONS.appendRow([q.id, t.id, q.question, q.options_json, q.correctAnswer, q.explanation]));

    } else if (type === 'SAVE_ANNUAL_SUMMARY') {
        const s = payload.summary;
        upsertRow(SHEETS.ANNUAL_SUMMARIES, 0, s.id + '_' + s.fiscalYear, [s.id + '_' + s.fiscalYear, s.id, s.name, s.requiredTotal, s.requiredDone, s.optionalDone, s.penalty, s.bonus, s.fiscalYear, s.psychologyAnalysis]);

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

// ── ヘルパー ────────────────────────────────────────────────────────────────

/** 社員行配列を生成（ADD/NEW 用） */
function buildEmpRow(emp) {
    return [
        emp.id,
        emp.name            || '',
        emp.role            || 'TRAINEE',
        emp.password        || '',
        emp.otpSecret       || '',
        new Date().toISOString(),          // LAST_ACTIVE
        JSON.stringify(emp.requiredTrainings  || []),
        JSON.stringify(emp.challengeTrainings || []),
        emp.department      || '',
        emp.position        || '',
        '',                                // SESSION_TOKEN (空)
        emp.employeeNo      || '',
        emp.hireDate        || '',
        emp.email           || '',
        emp.phone           || '',
        emp.managerId       || '',
        emp.grade           || '',
        emp.employmentType  || '',
    ];
}

function res(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function updateRow(sheet, keyCol, keyVal, targetCol, newVal) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][keyCol]).toUpperCase() === String(keyVal).toUpperCase()) {
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
            if (String(data[i][keyCol]).toUpperCase() === String(keyVal).toUpperCase()) {
                sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
                break;
            }
        }
    }
}
