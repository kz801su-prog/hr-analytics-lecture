/**
 * HR Analytics App - Reconstructed Backend for Google Apps Script
 * Version: 1.1.0
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const VERSION = "1.1.0";

const SHEETS = {
  EMPLOYEES: SS.getSheetByName('EMPLOYEES'), // Columns: ID, Name, Role, Password, OTP_SECRET
  TRAININGS: SS.getSheetByName('TRAININGS'), // Columns: id, title, date, description, materials_json
  QUESTIONS: SS.getSheetByName('QUESTIONS'), // Columns: id, trainingId, question, options_json, correctAnswer, explanation
  RESULTS: SS.getSheetByName('RESULTS'),     // Columns: trainingId, trainingTitle, EmployeeID, employeeName, preScore, postScore, UserAnswers, analysis, advice, date, traits, competencies
  HR_ANALYSES: SS.getSheetByName('HR_ANALYSES') // Columns: ID, EmployeeID, EmployeeName, Date, Content, InstructionUsed
};

function doGet(e) {
  const type = e.parameter.type;
  let data = [];
  
  switch(type) {
    case 'GET_VERSION':
      return ContentService.createTextOutput(JSON.stringify({ version: VERSION }))
        .setMimeType(ContentService.MimeType.JSON);
    case 'GET_EMPLOYEES':
      data = getSheetData(SHEETS.EMPLOYEES);
      break;
    case 'GET_TRAININGS':
      data = getSheetData(SHEETS.TRAININGS);
      break;
    case 'GET_QUESTIONS':
      data = getSheetData(SHEETS.QUESTIONS);
      break;
    case 'GET_RESULTS':
      data = getSheetData(SHEETS.RESULTS);
      break;
    case 'GET_HR_ANALYSES':
      data = getSheetData(SHEETS.HR_ANALYSES);
      break;
  }
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const postData = JSON.parse(e.postData.contents);
  const type = postData.type;
  
  switch(type) {
    case 'ADD_EMPLOYEE':
      addEmployee(postData.employee);
      break;
    case 'UPDATE_EMPLOYEE_ROLE':
      updateEmployeeRole(postData.employeeId, postData.role);
      break;
    case 'UPDATE_EMPLOYEE_OTP':
      updateEmployeeOTP(postData.employeeId, postData.secret);
      break;
    case 'SAVE_TRAINING_V2':
      saveTrainingV2(postData.training, postData.questions);
      break;
    case 'AUTO_SYNC_RESULT':
      autoSyncResult(postData.data);
      break;
    case 'SAVE_HR_ANALYSIS':
      saveHRAnalysis(postData.record);
      break;
    case 'UPDATE_LAST_ACTIVE':
      updateLastActive(postData.employeeId);
      break;
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Helper Functions ---

function getSheetData(sheet) {
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j];
    }
    data.push(obj);
  }
  return data;
}

function addEmployee(emp) {
  const sheet = SHEETS.EMPLOYEES;
  // ID, Name, Role, Password, OTP_SECRET
  sheet.appendRow([emp.id, emp.name, emp.role, emp.password, emp.otpSecret || ""]);
}

function updateEmployeeRole(empId, role) {
  const sheet = SHEETS.EMPLOYEES;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(empId).toUpperCase()) {
      sheet.getRange(i + 1, 3).setValue(role);
      break;
    }
  }
}

function updateEmployeeOTP(empId, secret) {
  const sheet = SHEETS.EMPLOYEES;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(empId).toUpperCase()) {
      sheet.getRange(i + 1, 5).setValue(secret);
      break;
    }
  }
}

function saveTrainingV2(training, questions) {
  const tSheet = SHEETS.TRAININGS;
  let tRow = -1;
  const tData = tSheet.getDataRange().getValues();
  for (let i = 1; i < tData.length; i++) {
    if (tData[i][0] === training.id) { tRow = i + 1; break; }
  }
  // id, title, date, description, materials_json, targetEmployees, targetDepartments, targetPositions, studyLinks, isRequiredForAll
  const targetEmps = training.targetEmployees ? JSON.stringify(training.targetEmployees) : "[]";
  const targetDepts = training.targetDepartments ? JSON.stringify(training.targetDepartments) : "[]";
  const targetPos = training.targetPositions ? JSON.stringify(training.targetPositions) : "[]";
  const studyLinksJson = training.studyLinks ? JSON.stringify(training.studyLinks) : "[]";
  const isRequiredForAll = training.isRequiredForAll ? "TRUE" : "FALSE";
  const tVals = [training.id, training.title, training.date, training.description, training.materials_json, targetEmps, targetDepts, targetPos, studyLinksJson, isRequiredForAll];
  if (tRow !== -1) tSheet.getRange(tRow, 1, 1, tVals.length).setValues([tVals]);
  else tSheet.appendRow(tVals);
  
  const qSheet = SHEETS.QUESTIONS;
  const qData = qSheet.getDataRange().getValues();
  for (let i = qData.length - 1; i >= 1; i--) {
    if (qData[i][1] === training.id) qSheet.deleteRow(i + 1);
  }
  questions.forEach(q => {
    // id, trainingId, question, options_json, correctAnswer, explanation
    qSheet.appendRow([q.id, training.id, q.question, q.options_json, q.correctAnswer, q.explanation]);
  });
}

function autoSyncResult(data) {
  const sheet = SHEETS.RESULTS;
  const rows = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.trainingid && rows[i][2] === data.employeeid) {
      rowIdx = i + 1;
      break;
    }
  }
  // trainingId, trainingTitle, EmployeeID, employeeName, preScore, postScore, UserAnswers, analysis, advice, date, traits, competencies
  const vals = [
    data.trainingid, data.trainingtitle, data.employeeid, data.employeename,
    data.prescore, data.postscore, data.useranswers, data.analysis || "", data.advice || "", 
    data.date, data.traits || "[]", data.competencies || "[]"
  ];
  if (rowIdx !== -1) sheet.getRange(rowIdx, 1, 1, vals.length).setValues([vals]);
  else sheet.appendRow(vals);
}

function saveHRAnalysis(record) {
  const sheet = SHEETS.HR_ANALYSES;
  const id = record.id || Utilities.getUuid();
  // ID, EmployeeID, EmployeeName, Date, Content, InstructionUsed
  sheet.appendRow([id, record.employeeId, record.employeeName, record.date, record.content, record.instructionUsed]);
}

function updateLastActive(empId) {
  const sheet = SHEETS.EMPLOYEES;
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(empId).toUpperCase()) {
      sheet.getRange(i + 1, 6).setValue(now); // Column 6: LAST_ACTIVE
      break;
    }
  }
}
