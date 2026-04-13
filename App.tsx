import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Layout } from "./components/Layout";
import { TrainingCreator } from "./components/Admin/TrainingCreator";
import { TestView } from "./components/Trainee/TestView";
import { ReportingDashboard } from "./components/HR/ReportingDashboard";
import { ProgressOverview } from "./components/Trainee/ProgressOverview";
import { AnnouncementBanner } from "./components/Trainee/AnnouncementBanner";
import { AnnouncementManager } from "./components/Admin/AnnouncementManager";
import { EmployeeManager } from "./components/Admin/EmployeeManager";
import {
  Role,
  Training,
  TestResult,
  AuthSession,
  Employee,
  Question,
  DeepAnalysisRecord,
  WrongAnswerAnalysis,
  Announcement,
  PsychApplication,
} from "./types";
import { analyzeIndividualPerformance } from "./services/geminiService";
import gasCodeRaw from "./gas-code.js?raw";

const MASTER_PASSCODE = "wisteria1";
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbygCknSWS3TVHdgTMcEYPRe4cfUG7aEyDrtvpf5I3HL0b29I-fNRPAeehMmt6-CoEuD/exec";

const normalizeId = (id: any) =>
  String(id || "")
    .trim()
    .toUpperCase();

const getFlexibleVal = (obj: any, keys: string[]) => {
  if (!obj) return undefined;
  const normalizedTargetKeys = keys.map((k) =>
    k.toLowerCase().replace(/[\s_]/g, ""),
  );
  const foundKey = Object.keys(obj).find((k) =>
    normalizedTargetKeys.includes(k.toLowerCase().replace(/[\s_]/g, "")),
  );
  return foundKey ? obj[foundKey] : undefined;
};

type AuthFlowStep =
  | "ID_INPUT"
  | "PASSWORD_INPUT"
  | "OTP_INPUT"
  | "REGISTER"
  | "OTP_REGISTER"
  | "SETUP";

const App: React.FC = () => {
  const [role, setRole] = useState<Role>(Role.TRAINEE);
  const [auth, setAuth] = useState<AuthSession | null>(() => {
    try {
      const cached = localStorage.getItem("sb_auth_session");
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const [authStep, setAuthStep] = useState<AuthFlowStep>("ID_INPUT");
  const [tempId, setTempId] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [tempOTP, setTempOTP] = useState("");
  const [tempName, setTempName] = useState("");
  const [identifiedEmployee, setIdentifiedEmployee] = useState<Employee | null>(
    null,
  );
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [inputPasscode, setInputPasscode] = useState("");
  const [traineeViewMode, setTraineeViewMode] = useState<
    "courses" | "progress"
  >("courses");
  const [adminViewMode, setAdminViewMode] = useState<
    "trainings" | "announcements" | "employees"
  >("trainings");
  const [traineeSortBy, setTraineeSortBy] = useState<
    "date" | "incomplete" | "completed"
  >("date");
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number | "all">(
    () => {
      const now = new Date();
      return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    },
  );
  const [gasUrl, setGasUrl] = useState(
    () => localStorage.getItem("sb_gas_url") || DEFAULT_GAS_URL || "",
  );
  const [gasVersion, setGasVersion] = useState("Checking...");
  const [clliqUrl, setClliqUrl] = useState(
    () => localStorage.getItem("sb_clliq_url") || "",
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [hrAnalyses, setHrAnalyses] = useState<DeepAnalysisRecord[]>([]);
  const [annualSummaries, setAnnualSummaries] = useState<any[]>([]);
  const [wrongAnswerAnalyses, setWrongAnswerAnalyses] = useState<
    WrongAnswerAnalysis[]
  >([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [psychApplications, setPsychApplications] = useState<
    PsychApplication[]
  >([]);
  const [activeTraining, setActiveTraining] = useState<{
    t: Training;
    mode: "intro" | "pre" | "post" | "review";
  } | null>(null);
  const [showPsychWarning, setShowPsychWarning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("読み込み中...");
  const [impersonatedEmpId, setImpersonatedEmpId] = useState<string | null>(
    null,
  );
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem("sb_session_id"),
  );
  const sessionIdRef = useRef<string | null>(null);

  // Keep sessionIdRef in sync (avoids stale closure in interval)
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Heartbeat effect — validates session every 90 seconds for double-login prevention
  useEffect(() => {
    if (!auth || !gasUrl) return;
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            type: "HEARTBEAT",
            employeeId: auth.employeeId,
            sessionId: sessionIdRef.current,
          }),
        });
        const data = await resp.json();
        if (data.valid === false) {
          alert(
            "⚠️ 別の端末またはブラウザからログインされたため、このセッションを終了します。",
          );
          handleLogout();
        }
      } catch (e) {
        /* ネットワークエラーはセッション継続 */
      }
    }, 90 * 1000); // 90秒ごとにチェック
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, gasUrl]);

  const activateSession = async (employeeId: string) => {
    const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setSessionId(newId);
    sessionIdRef.current = newId;
    localStorage.setItem("sb_session_id", newId);
    if (gasUrl) {
      fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "SET_SESSION_TOKEN",
          employeeId,
          sessionId: newId,
        }),
      }).catch(() => {});
    }
  };

  const safeSave = (key: string, data: any) => {
    try {
      const stringified =
        typeof data === "string" ? data : JSON.stringify(data);
      localStorage.setItem(key, stringified);
    } catch (e) {
      localStorage.removeItem("sb_trainings");
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {}
    }
  };

  const handleOpenSelectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
    } else {
      const manualKey = prompt(
        "Gemini APIキーを入力してください（AI Studioのブリッジが見つかりません）:",
      );
      if (manualKey) {
        localStorage.setItem("sb_manual_api_key", manualKey.trim());
        alert("APIキーを保存しました。");
        window.location.reload(); // Reload to apply to service
      }
    }
  };

  const fetchFromGAS = useCallback(
    async (forcedUrl?: string, silent = false) => {
      const url = forcedUrl || gasUrl;
      if (!url || !url.startsWith("http")) return [];

      if (!silent) {
        setIsLoading(true);
        setLoadingMsg("最新データを同期中...");
      }

      try {
        fetch(`${url}${url.includes("?") ? "&" : "?"}type=GET_VERSION`)
          .then((r) => r.json())
          .then((d) => setGasVersion(d.version || "Unknown"))
          .catch(() => setGasVersion("Legacy / Unknown"));

        const sep = url.includes("?") ? "&" : "?";
        const endpoints = [
          "GET_TRAININGS",
          "GET_EMPLOYEES",
          "GET_RESULTS",
          "GET_QUESTIONS",
          "GET_HR_ANALYSES",
          "GET_ANNOUNCEMENTS",
          "GET_ANNUAL_SUMMARIES",
          "GET_PSYCH_APPLICATIONS",
        ];

        const responses = await Promise.all(
          endpoints.map((type) =>
            fetch(`${url}${sep}type=${type}`, { cache: "no-store" })
              .then((r) => r.json())
              .catch(() => []),
          ),
        );

        const [tRaw, eRaw, rRaw, qRaw, hrRaw, annRaw, asRaw, paRaw] = responses;

        if (Array.isArray(eRaw)) {
          const parseJSON = (val: any) => {
            if (!val || val === "" || val === "null") return [];
            try {
              const parsed = typeof val === "string" ? JSON.parse(val) : val;
              return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              return [];
            }
          };

          const empsRaw = eRaw
            .map((e: any) => ({
              id: normalizeId(getFlexibleVal(e, ["id", "empId", "employeeId"])),
              name: String(
                getFlexibleVal(e, ["name", "userName", "employeeName"]) || "",
              ).trim(),
              role: (getFlexibleVal(e, ["role", "userRole"]) ||
                Role.TRAINEE) as Role,
              password: String(
                getFlexibleVal(e, ["password", "pw"]) || "",
              ).trim(),
              otpSecret: String(
                getFlexibleVal(e, ["otpsecret", "secret"]) || "",
              ).trim(),
              lastActive: String(
                getFlexibleVal(e, ["lastactive", "active", "timestamp"]) || "",
              ).trim(),
              department: String(
                getFlexibleVal(e, ["department", "dept"]) || "",
              ).trim(),
              position: String(
                getFlexibleVal(e, ["position", "title"]) || "",
              ).trim(),
              requiredTrainings: parseJSON(
                getFlexibleVal(e, ["requiredtrainings", "required"]),
              ),
              challengeTrainings: parseJSON(
                getFlexibleVal(e, ["challengetrainings", "challenge"]),
              ),
              employeeNo: String(
                getFlexibleVal(e, ["employeeno", "employee_no", "employeeNo"]) || "",
              ).trim() || undefined,
              hireDate: String(
                getFlexibleVal(e, ["hiredate", "hire_date", "hireDate"]) || "",
              ).trim() || undefined,
              email: String(
                getFlexibleVal(e, ["email", "mail"]) || "",
              ).trim() || undefined,
              phone: String(
                getFlexibleVal(e, ["phone", "tel"]) || "",
              ).trim() || undefined,
              managerId: String(
                getFlexibleVal(e, ["managerid", "manager_id", "managerId"]) || "",
              ).trim() || undefined,
              grade: String(
                getFlexibleVal(e, ["grade"]) || "",
              ).trim() || undefined,
              employmentType: String(
                getFlexibleVal(e, ["employmenttype", "employment_type", "employmentType"]) || "",
              ).trim() || undefined,
            }))
            .filter((e) => e.id && e.name);
          // 重複除去（IDベース、後のレコード優先でマージ）
          const empMap = new Map<string, Employee>();
          empsRaw.forEach((e) => {
            const existing = empMap.get(e.id);
            if (existing) {
              // マージ: 名前やパスワード等は後のレコードで上書き（空文字でなければ）
              empMap.set(e.id, {
                ...existing,
                ...e,
                name: e.name || existing.name,
                password: e.password || existing.password,
                requiredTrainings: [
                  ...new Set([
                    ...(existing.requiredTrainings || []),
                    ...(e.requiredTrainings || []),
                  ]),
                ],
                challengeTrainings: [
                  ...new Set([
                    ...(existing.challengeTrainings || []),
                    ...(e.challengeTrainings || []),
                  ]),
                ],
              });
            } else {
              empMap.set(e.id, e);
            }
          });
          const emps = Array.from(empMap.values());
          setEmployees(emps);
          safeSave("sb_employees", emps);
        }

        const qMap: Record<string, Question[]> = {};
        if (Array.isArray(qRaw)) {
          qRaw.forEach((q: any) => {
            const tId = normalizeId(getFlexibleVal(q, ["trainingid", "tId"]));
            if (!tId) return;
            if (!qMap[tId]) qMap[tId] = [];
            let options = [];
            try {
              options = JSON.parse(
                String(getFlexibleVal(q, ["optionsjson", "options"]) || "[]"),
              );
            } catch (e) {
              options = ["A", "B", "C", "D"];
            }
            qMap[tId].push({
              id: String(getFlexibleVal(q, ["id"]) || Math.random()),
              question: String(getFlexibleVal(q, ["question"]) || ""),
              options,
              correctAnswer: parseInt(
                String(getFlexibleVal(q, ["correctanswer", "answer"]) || "0"),
              ),
              explanation: String(getFlexibleVal(q, ["explanation"]) || ""),
            });
          });
        }

        if (Array.isArray(tRaw)) {
          const parsed = tRaw
            .map((t: any, idx: number) => {
              if (idx === 0) {
                console.log("📋 GAS Training data keys:", Object.keys(t));
                console.log(
                  "📋 GAS Training data sample:",
                  JSON.stringify(t).substring(0, 500),
                );
              }
              const tId = normalizeId(getFlexibleVal(t, ["id"]));
              let materials = [];
              try {
                materials = JSON.parse(
                  String(
                    getFlexibleVal(t, ["materialsjson", "materials"]) || "[]",
                  ),
                );
              } catch (e) {}
              let studyLinks = [];
              const rawStudyLinks = getFlexibleVal(t, [
                "studylinksjson",
                "studylinks",
                "studylink",
                "links",
                "studymaterials",
              ]);
              if (rawStudyLinks) {
                try {
                  const parsed =
                    typeof rawStudyLinks === "string"
                      ? JSON.parse(rawStudyLinks)
                      : rawStudyLinks;
                  studyLinks = Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                  console.warn(
                    "⚠️ studyLinks parse error for training:",
                    tId,
                    "raw:",
                    rawStudyLinks,
                  );
                }
              }
              const rawFiscalYear = getFlexibleVal(t, [
                "fiscalyear",
                "fiscalYear",
                "fy",
              ]);
              const fiscalYear =
                rawFiscalYear !== undefined && rawFiscalYear !== ""
                  ? Number(rawFiscalYear)
                  : undefined;
              // isRequiredForAll をGASデータから読み取る（TRUE/FALSE/true/false対応）
              const rawRequired = getFlexibleVal(t, [
                "isrequiredforall",
                "requiredforall",
              ]);
              const isRequiredFromGAS =
                rawRequired === true ||
                rawRequired === "TRUE" ||
                rawRequired === "true" ||
                rawRequired === true;
              return {
                id: tId,
                title: String(getFlexibleVal(t, ["title"]) || "無題の研修"),
                date: String(getFlexibleVal(t, ["date"]) || ""),
                description: String(
                  getFlexibleVal(t, ["description", "summary"]) || "",
                ),
                patterns: [
                  {
                    id: "PT-DEFAULT",
                    name: "標準テスト",
                    questions: qMap[tId] || [],
                    createdAt: new Date().toISOString(),
                  },
                ],
                activePatternId: "PT-DEFAULT",
                materials,
                studyLinks,
                isRequiredForAll: isRequiredFromGAS,
                fiscalYear,
              };
            })
            .filter((t) => t.id) as Training[];
          const flags: Record<string, any> = JSON.parse(
            localStorage.getItem("sb_training_flags") || "{}",
          );
          const parsedWithFlags = parsed.map((t) => ({
            ...t,
            // GASの値を優先、GASにない場合のみlocalStorageからフォールバック
            isRequiredForAll:
              t.isRequiredForAll || (flags[t.id]?.isRequiredForAll ?? false),
            studyLinks:
              t.studyLinks && t.studyLinks.length > 0
                ? t.studyLinks
                : flags[t.id]?.studyLinks || [],
            fiscalYear:
              typeof t.fiscalYear === "number"
                ? t.fiscalYear
                : flags[t.id]?.fiscalYear,
          }));
          // ローカルフラグもGASの値で同期更新
          const updatedFlags = { ...flags };
          parsedWithFlags.forEach((t) => {
            updatedFlags[t.id] = {
              ...(updatedFlags[t.id] || {}),
              isRequiredForAll: t.isRequiredForAll,
              studyLinks: t.studyLinks,
              fiscalYear: t.fiscalYear,
            };
          });
          localStorage.setItem(
            "sb_training_flags",
            JSON.stringify(updatedFlags),
          );
          setTrainings(parsedWithFlags);
          const slimTrainings = parsedWithFlags.map((t) => ({
            ...t,
            materials: t.materials?.map((m: any) => ({ ...m, data: "" })),
          }));
          safeSave("sb_trainings", slimTrainings);
        }

        if (Array.isArray(rRaw)) {
          const mergedMap: Record<string, TestResult> = {};
          rRaw.forEach((r: any) => {
            const tId = normalizeId(getFlexibleVal(r, ["trainingid"]));
            const eId = normalizeId(getFlexibleVal(r, ["employeeid"]));
            if (!tId || !eId) return;
            const key = `${eId}_${tId}`;

            const parseJSON = (val: any) => {
              if (!val || val === "" || val === "null") return [];
              try {
                const parsed = typeof val === "string" ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : [];
              } catch (e) {
                return [];
              }
            };

            const traits = parseJSON(getFlexibleVal(r, ["traits"]));
            const comps = parseJSON(getFlexibleVal(r, ["competencies"]));
            const userAns = parseJSON(
              getFlexibleVal(r, ["useranswers", "answers"]),
            );

            // Debug logging for userAnswers
            if (userAns.length > 0) {
              console.log("📊 UserAnswers loaded from GAS:", {
                employeeId: eId,
                trainingId: tId,
                userAnswers: userAns,
                rawValue: getFlexibleVal(r, ["useranswers", "answers"]),
              });
            }

            const pScoreRaw = getFlexibleVal(r, ["postscore"]);
            const pScore =
              pScoreRaw === undefined || pScoreRaw === "" || pScoreRaw === null
                ? -1
                : parseInt(String(pScoreRaw));
            const preScore = parseInt(
              String(getFlexibleVal(r, ["prescore"]) || "0"),
            );
            const completedAt = String(
              getFlexibleVal(r, ["date", "completedat"]) || "",
            );
            const postTimeSecRaw = getFlexibleVal(r, [
              "posttimesec",
              "postanswertime",
              "postAnswerTimeSec",
            ]);
            const postAnswerTimeSec =
              postTimeSecRaw && postTimeSecRaw !== ""
                ? parseInt(String(postTimeSecRaw))
                : undefined;

            if (!mergedMap[key]) {
              mergedMap[key] = {
                trainingId: tId,
                trainingTitle: String(
                  getFlexibleVal(r, ["trainingtitle"]) || "不明",
                ),
                employeeId: eId,
                employeeName: String(
                  getFlexibleVal(r, ["employeename"]) || "不明",
                ),
                preScore,
                postScore: pScore,
                userAnswers: userAns,
                analysis: String(getFlexibleVal(r, ["analysis"]) || "").trim(),
                advice: String(getFlexibleVal(r, ["advice"]) || ""),
                traits,
                competencies: comps,
                completedAt,
                postAnswerTimeSec,
              };
            } else {
              const existing = mergedMap[key];
              // マージロジック: 既存のデータより「情報量が多い」方を優先
              if (pScore !== -1) existing.postScore = pScore;
              if (userAns.length > 0) {
                existing.userAnswers = userAns;
                console.log("🔄 Merging userAnswers:", {
                  key,
                  userAnswers: userAns,
                });
              }
              if (traits.length > 0) existing.traits = traits;
              if (comps.length > 0) existing.competencies = comps;
              if (!existing.analysis && getFlexibleVal(r, ["analysis"])) {
                existing.analysis = String(
                  getFlexibleVal(r, ["analysis"]),
                ).trim();
              }
              if (!existing.advice && getFlexibleVal(r, ["advice"])) {
                existing.advice = String(getFlexibleVal(r, ["advice"]));
              }
              if (
                new Date(completedAt).getTime() >
                new Date(existing.completedAt).getTime()
              ) {
                existing.completedAt = completedAt;
              }
            }
          });
          const parsedResults = Object.values(mergedMap);

          // Final debug log
          console.log("✅ Total results loaded:", parsedResults.length);
          parsedResults.forEach((r) => {
            if (r.userAnswers && r.userAnswers.length > 0) {
              console.log(
                `✓ Result with userAnswers: ${r.employeeName} - ${r.trainingTitle}`,
                r.userAnswers,
              );
            }
          });

          setResults(parsedResults);
          safeSave("sb_results", parsedResults);
        }

        if (Array.isArray(hrRaw)) {
          const parsedHR = hrRaw
            .map((h: any) => {
              const rawFY = getFlexibleVal(h, ["fiscalyear", "fiscalYear", "fy"]);
              const fiscalYear = rawFY !== undefined && rawFY !== "" && rawFY !== null
                ? Number(rawFY)
                : 48; // 既存データは48期として扱う
              let psychMods: Record<string, number> | undefined;
              const rawPsychMods = getFlexibleVal(h, ["psychmods", "psychMods"]);
              if (rawPsychMods) {
                try {
                  psychMods = typeof rawPsychMods === "string"
                    ? JSON.parse(rawPsychMods)
                    : rawPsychMods;
                } catch {}
              }
              return {
                id: String(getFlexibleVal(h, ["id"]) || ""),
                employeeId: normalizeId(getFlexibleVal(h, ["employeeid", "empId"])),
                employeeName: String(getFlexibleVal(h, ["employeename", "userName"]) || ""),
                date: String(getFlexibleVal(h, ["date"]) || ""),
                content: String(getFlexibleVal(h, ["content"]) || ""),
                instructionUsed: String(getFlexibleVal(h, ["instructionused"]) || ""),
                fiscalYear,
                psychMods,
              };
            })
            .filter((h) => h.employeeId && h.content);
          setHrAnalyses(parsedHR);
        }

        if (Array.isArray(annRaw)) {
          const parsedAnn = annRaw
            .map((a: any) => ({
              id: String(getFlexibleVal(a, ["id"]) || ""),
              title: String(getFlexibleVal(a, ["title"]) || ""),
              content: String(getFlexibleVal(a, ["content"]) || ""),
              createdAt: String(getFlexibleVal(a, ["createdat", "date"]) || ""),
              createdBy: String(
                getFlexibleVal(a, ["createdby", "author"]) || "",
              ),
              priority: (getFlexibleVal(a, ["priority"]) || "normal") as
                | "high"
                | "normal"
                | "low",
              active:
                getFlexibleVal(a, ["active"]) !== false &&
                getFlexibleVal(a, ["active"]) !== "false",
            }))
            .filter((a) => a.id && a.title);
          setAnnouncements(parsedAnn);
          safeSave("sb_announcements", parsedAnn);
        }

        if (Array.isArray(asRaw)) {
          setAnnualSummaries(asRaw);
        }

        if (Array.isArray(paRaw)) {
          const parsedPA = paRaw
            .map((a: any) => ({
              employeeId: normalizeId(
                getFlexibleVal(a, ["employeeid", "employeeId"]),
              ),
              employeeName: String(
                getFlexibleVal(a, ["employeename", "employeeName"]) || "",
              ),
              appliedAt: String(
                getFlexibleVal(a, ["appliedat", "appliedAt"]) || "",
              ),
            }))
            .filter((a: PsychApplication) => a.employeeId);
          setPsychApplications(parsedPA);
        }

        return eRaw || [];
      } catch (e) {
        console.error("GAS Sync Error:", e);
        return [];
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [gasUrl],
  );

  useEffect(() => {
    const cachedEmps = localStorage.getItem("sb_employees");
    if (cachedEmps) {
      try {
        setEmployees(JSON.parse(cachedEmps));
      } catch (e) {}
    }
    const cachedTrainings = localStorage.getItem("sb_trainings");
    if (cachedTrainings) {
      try {
        const parsed = JSON.parse(cachedTrainings);
        const flags: Record<string, any> = JSON.parse(
          localStorage.getItem("sb_training_flags") || "{}",
        );
        setTrainings(
          parsed.map((t: Training) => ({
            ...t,
            isRequiredForAll:
              flags[t.id]?.isRequiredForAll ?? t.isRequiredForAll ?? false,
            studyLinks:
              t.studyLinks && t.studyLinks.length > 0
                ? t.studyLinks
                : flags[t.id]?.studyLinks || [],
          })),
        );
      } catch (e) {}
    }
    const cachedResults = localStorage.getItem("sb_results");
    if (cachedResults) {
      try {
        setResults(JSON.parse(cachedResults));
      } catch (e) {}
    }
    const cachedWrongAnswers = localStorage.getItem("sb_wrong_answer_analyses");
    if (cachedWrongAnswers) {
      try {
        setWrongAnswerAnalyses(JSON.parse(cachedWrongAnswers));
      } catch (e) {}
    }
    if (gasUrl) fetchFromGAS(undefined, true);
  }, [fetchFromGAS, gasUrl]);

  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = normalizeId(tempId);
    if (!id) return;
    setIsLoading(true);
    setLoadingMsg("社員情報を確認中...");
    await fetchFromGAS();
    const updatedEmpsString = localStorage.getItem("sb_employees") || "[]";
    let updatedEmps: Employee[] = [];
    try {
      updatedEmps = JSON.parse(updatedEmpsString);
    } catch (e) {}
    const emp = updatedEmps.find((x) => normalizeId(x.id) === id);
    if (emp) {
      setIdentifiedEmployee(emp);
      setAuthStep("PASSWORD_INPUT");
    } else {
      setAuthStep("REGISTER");
    }
    setIsLoading(false);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiedEmployee) return;
    const inputClean = tempPassword.trim();
    if (inputClean === identifiedEmployee.password) {
      if (identifiedEmployee.otpSecret) {
        setAuthStep("OTP_INPUT");
      } else {
        // 2段階認証が未設定の既存ユーザーの場合、その場で生成して登録フローへ誘導
        import("./services/otpService").then((m) => {
          const secret = m.generateSecret();
          setIdentifiedEmployee({ ...identifiedEmployee, otpSecret: secret });
          setAuthStep("OTP_REGISTER");
          alert(
            "2段階認証が未設定です。セキュリティ設定を開始します。表示されるQRコードをスキャンしてください。",
          );
        });
      }
    } else {
      alert("パスワードが違います。");
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiedEmployee) return;
    const { verifyTOTP } = await import("./services/otpService");
    const isOk = await verifyTOTP(identifiedEmployee.otpSecret || "", tempOTP);
    if (isOk) {
      const empId = normalizeId(identifiedEmployee.id);
      const session = {
        name: identifiedEmployee.name,
        employeeId: empId,
        role: identifiedEmployee.role,
      };
      setAuth(session);
      safeSave("sb_auth_session", session);
      setRole(identifiedEmployee.role);
      setAuthStep("ID_INPUT");
      setTempId("");
      setTempPassword("");
      setTempOTP("");
      await activateSession(empId);
      fetchFromGAS();
    } else {
      alert("認証コードが違います。");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPw = tempPassword.trim();
    if (cleanPw.length !== 6) return alert("6桁の数字を入力してください。");
    const { generateSecret } = await import("./services/otpService");
    const secret = generateSecret();
    const newEmp = {
      id: normalizeId(tempId),
      name: tempName.trim(),
      role: Role.TRAINEE,
      password: cleanPw,
      otpSecret: secret,
    };
    setIdentifiedEmployee(newEmp);
    setAuthStep("OTP_REGISTER");
  };

  const handleRegisterConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiedEmployee) return;
    const { verifyTOTP } = await import("./services/otpService");
    const isOk = await verifyTOTP(identifiedEmployee.otpSecret || "", tempOTP);
    if (!isOk) return alert("認証失敗: 正しい6桁を入力してください。");

    setIsLoading(true);
    console.log("Sending registration to GAS:", {
      type: "ADD_EMPLOYEE",
      employee: identifiedEmployee,
    });
    try {
      const resp = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "ADD_EMPLOYEE",
          employee: identifiedEmployee,
        }),
      });
      console.log("GAS Response received.");
      await fetchFromGAS();

      const updatedEmpsString = localStorage.getItem("sb_employees") || "[]";
      const updatedEmps: Employee[] = JSON.parse(updatedEmpsString);
      const savedEmp = updatedEmps.find(
        (x) => normalizeId(x.id) === normalizeId(identifiedEmployee.id),
      );

      if (!savedEmp || !savedEmp.otpSecret) {
        console.warn(
          "Spreadsheet lookup failed to retrieve secret. Checking if local fallback is needed.",
        );
      }

      const empId = identifiedEmployee.id;
      const session = {
        name: identifiedEmployee.name,
        employeeId: empId,
        role: identifiedEmployee.role,
      };
      setAuth(session);
      safeSave("sb_auth_session", session);
      setRole(identifiedEmployee.role);
      setAuthStep("ID_INPUT");
      setTempId("");
      setTempPassword("");
      setTempOTP("");
      await activateSession(empId);
      alert(
        "登録と2段階認証の設定が完了しました。最新情報はスプレッドシートに同期されています。",
      );
    } catch (err) {
      console.error(err);
      alert(
        "登録エラーが発生しました。インターネット接続やGASのURLを確認してください。",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateEmployeeRole = async (
    employeeId: string,
    newRole: Role,
  ) => {
    const targetId = normalizeId(employeeId);
    if (!gasUrl) return;
    setIsLoading(true);
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "UPDATE_EMPLOYEE_ROLE",
          employeeId: targetId,
          role: newRole,
        }),
      });
      await fetchFromGAS();
    } catch (err) {}
    setIsLoading(false);
  };

  const handleSaveHRAnalysis = async (
    record: Omit<DeepAnalysisRecord, "id">,
  ) => {
    if (!gasUrl) return;
    setIsLoading(true);
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "SAVE_HR_ANALYSIS", record }),
      });
      await fetchFromGAS();
    } catch (err) {}
    setIsLoading(false);
  };

  const handleApplyPsychReport = async (
    employeeId: string,
    employeeName: string,
  ) => {
    const application: PsychApplication = {
      employeeId,
      employeeName,
      appliedAt: new Date().toISOString(),
    };
    setPsychApplications((prev) => [
      ...prev.filter((a) => a.employeeId !== employeeId),
      application,
    ]);
    if (!gasUrl) return;
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "SAVE_PSYCH_APPLICATION", application }),
      });
      await fetchFromGAS();
    } catch (err) {
      console.error("深層心理申請の保存に失敗しました", err);
    }
  };

  const handleDeletePsychApplication = async (employeeId: string) => {
    setPsychApplications((prev) =>
      prev.filter((a) => a.employeeId !== employeeId),
    );
    if (!gasUrl) return;
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "DELETE_PSYCH_APPLICATION", employeeId }),
      });
      await fetchFromGAS();
    } catch (err) {
      console.error("深層心理申請の削除に失敗しました", err);
    }
  };

  const handleLogout = () => {
    setAuth(null);
    setSessionId(null);
    sessionIdRef.current = null;
    localStorage.removeItem("sb_auth_session");
    localStorage.removeItem("sb_session_id");
    setAuthStep("ID_INPUT");
    setAdminUnlocked(false);
    setActiveTraining(null);
  };

  const handleUpdateGasUrl = (url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    setGasUrl(cleanUrl);
    safeSave("sb_gas_url", cleanUrl);
    fetchFromGAS(cleanUrl);
    setAuthStep("ID_INPUT");
  };

  const handleUpdateClliqUrl = (url: string) => {
    const cleanUrl = url.trim();
    setClliqUrl(cleanUrl);
    safeSave("sb_clliq_url", cleanUrl);
  };

  const handleUpdateTraining = async (updated: Training) => {
    const savedTraining = {
      ...updated,
      materials: updated.materials?.map((m) => ({ ...m, data: "" })) || [],
      studyLinks: updated.studyLinks || [],
      isRequiredForAll: updated.isRequiredForAll || false,
    };

    const nextTrainings = (prev: Training[]) => {
      const exists = prev.some(
        (t) => normalizeId(t.id) === normalizeId(savedTraining.id),
      );
      if (exists) {
        return prev.map((t) =>
          normalizeId(t.id) === normalizeId(savedTraining.id)
            ? savedTraining
            : t,
        );
      }
      return [...prev, savedTraining];
    };

    setTrainings((prev) => {
      const next = nextTrainings(prev);
      safeSave(
        "sb_trainings",
        next.map((t) => ({
          ...t,
          materials: t.materials?.map((m) => ({ ...m, data: "" })) || [],
        })),
      );
      return next;
    });

    if (!gasUrl) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const activePattern =
        updated.patterns.find((p) => p.id === updated.activePatternId) ||
        updated.patterns[0];
      const questions =
        activePattern?.questions.map((q) => ({
          ...q,
          options_json: JSON.stringify(q.options),
        })) || [];
      const trainingToSave = {
        ...updated,
        materials_json: JSON.stringify(
          updated.materials?.map((m) => ({ ...m, data: "" })) || [],
        ),
        studyLinks: updated.studyLinks || [],
        isRequiredForAll: updated.isRequiredForAll || false,
      };
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "SAVE_TRAINING_V2",
          training: trainingToSave,
          questions,
        }),
      });
      await fetchFromGAS();
    } catch (err) {
      console.error("講義保存に失敗しました:", err);
    }
    setIsLoading(false);
  };

  const handleCompleteTest = async (result: TestResult) => {
    if (!gasUrl) return;
    setIsLoading(true);

    console.log("🚀 ========== SAVING TEST RESULT ==========");
    console.log("Employee:", result.employeeName);
    console.log("Training:", result.trainingTitle);
    console.log("result.userAnswers:", result.userAnswers);
    console.log("result.userAnswers type:", typeof result.userAnswers);
    console.log(
      "result.userAnswers isArray:",
      Array.isArray(result.userAnswers),
    );
    console.log("result.userAnswers length:", result.userAnswers?.length);

    try {
      const postData = {
        trainingid: normalizeId(result.trainingId),
        trainingtitle: result.trainingTitle,
        employeeid: normalizeId(result.employeeId),
        employeename: result.employeeName,
        prescore: result.preScore,
        postscore: result.postScore,
        useranswers: JSON.stringify(result.userAnswers),
        analysis: result.analysis,
        advice: result.advice,
        date: result.completedAt || new Date().toISOString(),
        traits: JSON.stringify(result.traits),
        competencies: JSON.stringify(result.competencies),
        postanswertime: result.postAnswerTimeSec ?? "",
      };

      console.log("📤 Sending to GAS:");
      console.log("  useranswers (stringified):", postData.useranswers);

      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "AUTO_SYNC_RESULT", data: postData }),
      });

      console.log("✅ Sent to GAS successfully. Now fetching...");
      await fetchFromGAS();
      console.log("✅ Fetch completed");
    } catch (err) {
      console.error("❌ Error saving test result:", err);
    }
    setIsLoading(false);
    console.log("==========================================");
  };

  const handleSaveAnnouncement = async (announcement: Announcement) => {
    // ローカルに即座に反映（GAS完了を待たない）
    setAnnouncements((prev) => [...prev, announcement]);
    safeSave("sb_announcements", [...announcements, announcement]);

    if (!gasUrl) return;
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "SAVE_ANNOUNCEMENT", announcement }),
        redirect: "follow",
        mode: "no-cors",
        signal: controller.signal,
      }).catch(() => {});
      clearTimeout(timeoutId);
    } catch (err) {
      console.error("Error saving announcement:", err);
    }
    setIsLoading(false);
  };

  const handleToggleAnnouncementActive = async (
    id: string,
    active: boolean,
  ) => {
    // ローカルに即座に反映
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active } : a)),
    );
    const updatedAnns = announcements.map((a) =>
      a.id === id ? { ...a, active } : a,
    );
    safeSave("sb_announcements", updatedAnns);

    if (!gasUrl) return;
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "TOGGLE_ANNOUNCEMENT", id, active }),
        redirect: "follow",
        mode: "no-cors",
        signal: controller.signal,
      }).catch(() => {});
      clearTimeout(timeoutId);
    } catch (err) {
      console.error("Error toggling announcement:", err);
    }
    setIsLoading(false);
  };

  const handleManualAnalysis = async (res: TestResult) => {
    setIsLoading(true);
    setLoadingMsg("AI分析を開始...");
    try {
      const { analysis, advice, traits, competencies } =
        await analyzeIndividualPerformance(
          res.employeeName,
          res.trainingTitle || "講義",
          res.preScore,
          res.postScore,
        );
      await handleCompleteTest({
        ...res,
        analysis,
        advice,
        traits,
        competencies,
      });
    } catch (e) {
      alert("分析エラー");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmployee = async (employee: Employee) => {
    if (!gasUrl) return;
    setIsLoading(true);
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "ADD_EMPLOYEE",
          employee: {
            ...employee,
            requiredTrainings: JSON.stringify(employee.requiredTrainings || []),
            challengeTrainings: JSON.stringify(
              employee.challengeTrainings || [],
            ),
          },
        }),
      });
      await fetchFromGAS();
    } catch (err) {
      console.error("Error adding employee:", err);
    }
    setIsLoading(false);
  };

  const handleUpdateEmployee = async (employee: Employee) => {
    if (!gasUrl) return;
    setIsLoading(true);
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "UPDATE_EMPLOYEE",
          employee: {
            ...employee,
            requiredTrainings: JSON.stringify(employee.requiredTrainings || []),
            challengeTrainings: JSON.stringify(
              employee.challengeTrainings || [],
            ),
          },
        }),
      });
      await fetchFromGAS();
    } catch (err) {
      console.error("Error updating employee:", err);
    }
    setIsLoading(false);
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!gasUrl) return;
    setIsLoading(true);
    try {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "DELETE_EMPLOYEE", employeeId }),
      });
      await fetchFromGAS();
    } catch (err) {
      console.error("Error deleting employee:", err);
    }
    setIsLoading(false);
  };

  const sortedTrainings = useMemo(() => {
    const list = [...trainings];
    if (traineeSortBy === "date")
      return list.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    return list;
  }, [trainings, traineeSortBy]);

  const getTrainingFiscalYear = (training: Training) => {
    if (typeof training.fiscalYear === "number" && training.fiscalYear > 0)
      return training.fiscalYear;
    const parsed = new Date(training.date);
    if (!Number.isNaN(parsed.getTime())) {
      const month = parsed.getMonth();
      const year = parsed.getFullYear();
      return month >= 3 ? year : year - 1;
    }
    return undefined;
  };

  const effectiveRole = impersonatedEmpId ? Role.TRAINEE : role;
  const targetEmployee = impersonatedEmpId
    ? employees.find((e) => e.id === impersonatedEmpId)
    : null;
  const effectiveAuth = impersonatedEmpId
    ? targetEmployee
      ? {
          name: targetEmployee.name,
          employeeId: targetEmployee.id,
          role: Role.TRAINEE,
        }
      : null
    : auth;

  const nowFY = (() => {
    const n = new Date();
    return n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  })();
  const filteredResults =
    selectedFiscalYear === "all"
      ? results
      : results.filter((r) => {
          const training = trainings.find(
            (tr) => normalizeId(tr.id) === normalizeId(r.trainingId),
          );
          const trainingFY = training
            ? getTrainingFiscalYear(training)
            : undefined;
          return training && trainingFY === selectedFiscalYear;
        });

  return (
    <Layout
      activeRole={effectiveRole}
      setRole={setRole}
      userName={effectiveAuth?.name || "ゲスト"}
      onLogout={auth ? handleLogout : undefined}
    >
      {impersonatedEmpId && (
        <div className="bg-amber-500 text-white text-center py-2 text-xs font-black fixed top-0 left-0 right-0 z-[1001] shadow-lg">
          代理受講中: {effectiveAuth?.name} -{" "}
          <button
            onClick={() => setImpersonatedEmpId(null)}
            className="underline ml-2"
          >
            HRに戻る
          </button>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[300] flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center gap-6 max-w-xs w-full">
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black text-slate-800 text-lg">{loadingMsg}</p>
          </div>
        </div>
      )}

      {!auth ? (
        <div className="max-w-md mx-auto mt-10 p-10 bg-white rounded-3xl border shadow-xl relative animate-fadeIn">
          {authStep === "ID_INPUT" && (
            <form onSubmit={handleIdSubmit} className="space-y-6">
              <h2 className="text-2xl font-black text-center mb-6">
                社員ログイン
              </h2>
              <input
                type="text"
                placeholder="社員ID"
                className="w-full px-6 py-4 rounded-xl border-2 text-center text-xl font-bold uppercase"
                value={tempId}
                onChange={(e) => setTempId(e.target.value)}
              />
              <button className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black text-lg">
                次へ
              </button>
              <div className="pt-4 border-t flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthStep("SETUP")}
                  className="text-xs text-slate-400 font-bold"
                >
                  システム設定
                </button>
                <div className="text-[10px] text-slate-300 font-mono">
                  GAS: {gasVersion}
                </div>
              </div>
            </form>
          )}
          {authStep === "PASSWORD_INPUT" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="text-center font-black text-indigo-700">
                {identifiedEmployee?.name} さん
              </div>
              <input
                type="password"
                maxLength={6}
                placeholder="数字6桁"
                className="w-full px-6 py-4 rounded-xl border-2 text-center text-2xl font-black"
                value={tempPassword}
                onChange={(e) =>
                  setTempPassword(e.target.value.replace(/[^0-9]/g, ""))
                }
              />
              <button className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black text-lg">
                ログイン
              </button>
              <button
                type="button"
                onClick={() => setAuthStep("ID_INPUT")}
                className="w-full text-xs text-slate-400 font-bold"
              >
                戻る
              </button>
            </form>
          )}
          {authStep === "OTP_INPUT" && (
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div className="text-center">
                <div className="font-black text-indigo-700 text-lg mb-2">
                  {identifiedEmployee?.name} さん
                </div>
                <div className="text-sm text-slate-600 font-bold mb-1">
                  🔐 2段階認証
                </div>
                <div className="text-xs text-slate-500">
                  Authenticatorアプリで生成された6桁のコードを入力してください
                </div>
              </div>
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                className="w-full px-6 py-4 rounded-xl border-2 text-center text-3xl font-black"
                value={tempOTP}
                onChange={(e) => setTempOTP(e.target.value)}
              />
              <button className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black text-lg">
                認証
              </button>
              <button
                type="button"
                onClick={() => setAuthStep("PASSWORD_INPUT")}
                className="w-full text-xs text-slate-400 font-bold"
              >
                戻る
              </button>
            </form>
          )}
          {authStep === "REGISTER" && (
            <form onSubmit={handleRegister} className="space-y-6">
              <h2 className="text-xl font-black text-center">新規登録</h2>
              <input
                type="text"
                placeholder="お名前"
                className="w-full px-4 py-4 rounded-xl border-2 font-bold"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                required
              />
              <input
                type="password"
                maxLength={6}
                placeholder="数字6桁"
                className="w-full px-4 py-4 rounded-xl border-2 font-bold"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                required
              />
              <button className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black">
                2段階認証の設定へ
              </button>
              <button
                type="button"
                onClick={() => setAuthStep("ID_INPUT")}
                className="w-full text-xs text-slate-400 font-bold"
              >
                戻る
              </button>
            </form>
          )}
          {authStep === "OTP_REGISTER" && identifiedEmployee && (
            <form
              onSubmit={handleRegisterConfirm}
              className="space-y-6 text-center"
            >
              <h2 className="text-xl font-black">2段階認証の登録</h2>
              <p className="text-[10px] font-bold text-slate-400">
                アプリでQRをスキャンしてください
              </p>
              <div className="flex justify-center p-4 bg-white border-2 border-slate-50 rounded-2xl mx-auto w-48 h-48">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`otpauth://totp/HR-Analytics:${identifiedEmployee.name || ""}?secret=${identifiedEmployee.otpSecret || ""}&issuer=HR-Analytics`)}`}
                  alt="QR Code"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    alert(
                      "QRコードの読み込みに失敗しました。シークレットキーを直接入力してください。",
                    );
                  }}
                />
              </div>
              <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-2 rounded select-all">
                Secret key: {identifiedEmployee.otpSecret || "未生成"}
              </div>
              <input
                type="text"
                maxLength={6}
                placeholder="6桁のコードを入力"
                className="w-full px-6 py-4 rounded-xl border-2 text-center text-3xl font-black"
                value={tempOTP}
                onChange={(e) =>
                  setTempOTP(e.target.value.replace(/[^0-9]/g, ""))
                }
                required
              />
              <button className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg">
                設定を完了してログイン
              </button>
              <button
                type="button"
                onClick={() => setAuthStep("REGISTER")}
                className="w-full text-xs text-slate-400 font-bold"
              >
                戻る
              </button>
            </form>
          )}
          {authStep === "SETUP" && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-center">システム設定</h2>
              <input
                type="text"
                placeholder="URL"
                className="w-full px-4 py-3 rounded-xl border-2 text-xs"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
              />
              <button
                onClick={() => handleUpdateGasUrl(gasUrl)}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black"
              >
                保存
              </button>

              {/* GAS コード表示 */}
              <div className="border-t pt-6 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-700">
                    📋 GAS コード（v
                    {gasCodeRaw.match(/VERSION\s*=\s*"([^"]+)"/)?.[1] || "?"}）
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(gasCodeRaw)
                        .then(() =>
                          alert(
                            "GASコードをクリップボードにコピーしました！\nGoogle Apps Scriptエディタに貼り付けてデプロイしてください。",
                          ),
                        );
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-black text-xs hover:bg-indigo-700 transition-all"
                  >
                    コピー
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 font-bold">
                  このコードをGoogle Apps
                  Scriptに貼り付けて新しいデプロイメントを作成してください。
                </p>
                <textarea
                  readOnly
                  value={gasCodeRaw}
                  className="w-full h-48 px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-600 resize-y focus:outline-none"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </div>

              <button
                type="button"
                onClick={() => setAuthStep("ID_INPUT")}
                className="w-full text-xs text-slate-400 font-bold"
              >
                戻る
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="pb-16 md:pb-24">
          {effectiveRole === Role.TRAINEE ? (
            activeTraining ? (
              <TestView
                training={activeTraining.t}
                userName={effectiveAuth?.name || ""}
                employeeId={normalizeId(effectiveAuth?.employeeId || "")}
                allResults={results}
                initialPhase={activeTraining.mode as any}
                onComplete={handleCompleteTest}
                onClose={() => setActiveTraining(null)}
              />
            ) : (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                    受講 ポータル
                  </h2>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setTraineeViewMode("courses")}
                      className={`px-6 py-2 text-xs font-black rounded-lg transition-all ${traineeViewMode === "courses" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                    >
                      講義一覧
                    </button>
                    <button
                      onClick={() => setTraineeViewMode("progress")}
                      className={`px-6 py-2 text-xs font-black rounded-lg transition-all ${traineeViewMode === "progress" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                    >
                      成長分析
                    </button>
                  </div>
                </div>

                <AnnouncementBanner
                  announcements={announcements}
                  employeeId={normalizeId(effectiveAuth?.employeeId || "")}
                />

                {/* ログインユーザーの評価スコアカード */}
                {(() => {
                  const currentEmp = employees.find(
                    (e) =>
                      normalizeId(e.id) ===
                      normalizeId(effectiveAuth?.employeeId),
                  );
                  if (!currentEmp) return null;

                  const isCompletedCheck = (
                    result: TestResult | undefined,
                  ): boolean => {
                    if (!result) return false;
                    const pre = result.preScore;
                    const post = result.postScore;
                    return (
                      pre !== null &&
                      pre !== undefined &&
                      typeof pre === "number" &&
                      pre !== -1 &&
                      post !== null &&
                      post !== undefined &&
                      typeof post === "number" &&
                      post !== -1
                    );
                  };

                  // 現在の期
                  const now = new Date();
                  const currentFY =
                    now.getMonth() >= 3
                      ? now.getFullYear()
                      : now.getFullYear() - 1;
                  const currentTerm = currentFY - 1977;
                  const prevFY = currentFY - 1;
                  const prevTerm = prevFY - 1977;

                  const empId = normalizeId(currentEmp.id);
                  const hasReport = hrAnalyses.some(
                    (a) => normalizeId(a.employeeId) === empId,
                  );
                  const hasApplied = psychApplications.some(
                    (a) => normalizeId(a.employeeId) === empId,
                  );

                  // 当期の必須講義のみ対象
                  const globalRequired = trainings
                    .filter((t) => {
                      const tFY = getTrainingFiscalYear(t);
                      return t.isRequiredForAll && tFY === currentFY;
                    })
                    .map((t) => t.id);
                  const personalRequired = (
                    currentEmp.requiredTrainings || []
                  ).filter((tId) => {
                    const t = trainings.find(
                      (tr) => normalizeId(tr.id) === normalizeId(tId),
                    );
                    const tFY = t ? getTrainingFiscalYear(t) : undefined;
                    return !t || tFY === currentFY;
                  });
                  const effectiveRequired = [
                    ...new Set([...globalRequired, ...personalRequired]),
                  ];

                  const completedReq = effectiveRequired.filter((tId) => {
                    const r = results.find(
                      (res) =>
                        normalizeId(res.trainingId) === normalizeId(tId) &&
                        normalizeId(res.employeeId) === empId,
                    );
                    return isCompletedCheck(r);
                  }).length;
                  const incompleteReq = effectiveRequired.length - completedReq;
                  const penalty = incompleteReq * -5;

                  // 当期の任意加点のみ
                  let bonus = 0;
                  results.forEach((r) => {
                    if (normalizeId(r.employeeId) !== empId) return;
                    if (
                      effectiveRequired.some(
                        (tId) => normalizeId(tId) === normalizeId(r.trainingId),
                      )
                    )
                      return;
                    if (!isCompletedCheck(r)) return;
                    const training = trainings.find(
                      (t) => normalizeId(t.id) === normalizeId(r.trainingId),
                    );
                    const trainingFY = training
                      ? getTrainingFiscalYear(training)
                      : undefined;
                    if (!training || trainingFY !== currentFY) return;
                    const activePattern =
                      training?.patterns?.find(
                        (p) => p.id === training.activePatternId,
                      ) || training?.patterns?.[0];
                    const totalQ = activePattern?.questions?.length || 0;
                    if (totalQ === 0) return;
                    const pct = ((r.postScore as number) / totalQ) * 100;
                    if (pct >= 90) bonus += 5;
                    else if (pct >= 80) bonus += 3;
                  });

                  const total = penalty + bonus;
                  const currentFYTrainings = trainings.filter((t) => {
                    const tFY = getTrainingFiscalYear(t);
                    return tFY === currentFY;
                  });
                  const optionalCount =
                    currentFYTrainings.length - effectiveRequired.length;

                  // 前期スコア（annualSummaries から取得、なければ計算）
                  const prevSummary = annualSummaries.find(
                    (s: any) =>
                      normalizeId(String(s.employeeId || s.id || "")) ===
                        empId && Number(s.fiscalYear) === prevFY,
                  );
                  const prevTotal = prevSummary
                    ? Number(prevSummary.bonus || 0) +
                      Number(prevSummary.penalty || 0)
                    : (() => {
                        const prevGlobalReq = trainings
                          .filter(
                            (t) =>
                              t.isRequiredForAll &&
                              (t.fiscalYear || currentFY) === prevFY,
                          )
                          .map((t) => t.id);
                        const prevPersonalReq = (
                          currentEmp.requiredTrainings || []
                        ).filter((tId) => {
                          const t = trainings.find(
                            (tr) => normalizeId(tr.id) === normalizeId(tId),
                          );
                          return t && getTrainingFiscalYear(t) === prevFY;
                        });
                        const prevRequired = [
                          ...new Set([...prevGlobalReq, ...prevPersonalReq]),
                        ];
                        const prevIncomplete = prevRequired.filter((tId) => {
                          const r = results.find(
                            (res) =>
                              normalizeId(res.trainingId) ===
                                normalizeId(tId) &&
                              normalizeId(res.employeeId) === empId,
                          );
                          return !isCompletedCheck(r);
                        }).length;
                        const prevPenalty = prevIncomplete * -5;
                        let prevBonus = 0;
                        results.forEach((r) => {
                          if (normalizeId(r.employeeId) !== empId) return;
                          if (
                            prevRequired.some(
                              (tId) =>
                                normalizeId(tId) === normalizeId(r.trainingId),
                            )
                          )
                            return;
                          if (!isCompletedCheck(r)) return;
                          const t = trainings.find(
                            (tr) =>
                              normalizeId(tr.id) === normalizeId(r.trainingId),
                          );
                          const tFY = t ? getTrainingFiscalYear(t) : undefined;
                          if (!t || tFY !== prevFY) return;
                          const pat =
                            t.patterns?.find(
                              (p) => p.id === t.activePatternId,
                            ) || t.patterns?.[0];
                          const totalQ = pat?.questions?.length || 0;
                          if (totalQ === 0) return;
                          const pct = ((r.postScore as number) / totalQ) * 100;
                          if (pct >= 90) prevBonus += 5;
                          else if (pct >= 80) prevBonus += 3;
                        });
                        return prevPenalty + prevBonus;
                      })();

                  // 復習受講（過去期の講義を受けた件数）
                  const reviewCount = results.filter((r) => {
                    if (normalizeId(r.employeeId) !== empId) return false;
                    if (!isCompletedCheck(r)) return false;
                    const t = trainings.find(
                      (tr) => normalizeId(tr.id) === normalizeId(r.trainingId),
                    );
                    return (
                      t &&
                      ((): boolean => {
                        const tFY = getTrainingFiscalYear(t);
                        return tFY !== undefined && tFY < currentFY;
                      })()
                    );
                  }).length;

                  const openPsychReport = () => {
                    const report = hrAnalyses.find(
                      (a) => normalizeId(a.employeeId) === empId,
                    );
                    const content = report
                      ? report.content
                      : "深層心理分析レポートはまだ作成されていません。\n\nHR担当者にお問い合わせください。";
                    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>深層心理分析レポート</title><style>
                      *{box-sizing:border-box;margin:0;padding:0}
                      body{font-family:'Hiragino Kaku Gothic ProN',sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;line-height:1.8;-webkit-user-select:none;user-select:none}
                      .header{background:linear-gradient(135deg,#1e293b,#334155);border:1px solid #475569;border-radius:1rem;padding:1.5rem 2rem;margin-bottom:2rem;display:flex;align-items:center;gap:1rem}
                      .header h1{font-size:1.1rem;font-weight:900;color:#f1f5f9}
                      .header p{font-size:.75rem;color:#94a3b8;margin-top:.25rem}
                      .badge{background:#6366f1;color:white;font-size:.7rem;font-weight:900;padding:.25rem .75rem;border-radius:9999px;white-space:nowrap}
                      .content{background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:2rem;white-space:pre-wrap;font-size:.9rem;color:#cbd5e1}
                      .content h1,.content h2,.content h3{color:#f8fafc;margin:1rem 0 .5rem;font-weight:900}
                      .content h2{font-size:1rem;border-bottom:1px solid #334155;padding-bottom:.5rem}
                      .content strong,.content b{color:#fbbf24}
                      .content ul,.content ol{padding-left:1.5rem;margin:.5rem 0}
                      .footer{margin-top:1.5rem;text-align:center;font-size:.7rem;color:#475569}
                      @media print{body{display:none}}
                    </style></head><body oncontextmenu="return false">
                    <div class="header">
                      <div>
                        <h1>🧠 深層心理分析レポート</h1>
                        <p>${currentEmp.name} さん　／　${report ? report.date : "—"}</p>
                      </div>
                      <div style="margin-left:auto"><span class="badge">CONFIDENTIAL</span></div>
                    </div>
                    <div class="content">${content
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
                      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
                      .replace(/^# (.+)$/gm, "<h1>$1</h1>")}</div>
                    <div class="footer">このページの内容は本人専用です。無断転載・共有を禁じます。</div>
                    <script>document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&['s','p','u'].includes(e.key.toLowerCase()))e.preventDefault();});</script>
                    </body></html>`;
                    const blob = new Blob([html], {
                      type: "text/html;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank", "noopener");
                    setShowPsychWarning(false);
                  };

                  return (
                    <>
                      {showPsychWarning && (
                        <div
                          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                          onClick={() => setShowPsychWarning(false)}
                        >
                          <div
                            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6 max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="font-black text-slate-900 text-sm leading-relaxed">
                              深層心理学に基づいた分析レポートは、「自分はこういう人間である」という理想の張りぼてを、無慈悲に引き剥がす作業に他なりません。
                              <br />
                              <br />
                              例えば、分析の結果、あなたを「冷酷」「怠慢」「偽善者」といった言葉が襲うと思います。
                              <br />
                              <br />
                              それを「罵倒」と受け取るか、「処方箋」と受け取るかで、成長や人生の行方に影響をあたえることになります。
                              <br />
                              <br />
                              感情的に反論したくなる時、そこにあなたの「核心」が隠れています。
                              <br />
                              <br />
                              深層心理学の最新研究でトップを走る、私、AI心理学者からアドバイスは、「指摘を素直に受け止められない人は、決して結果を見ないでください。」
                            </p>
                            <p className="font-black text-indigo-700 text-sm leading-relaxed border-2 border-indigo-100 bg-indigo-50 rounded-2xl p-4">
                              「深く理解しました。私は、書かれている内容に偏見を持たず、又、批判せず、素直に受け止めて成長に活かすことを約束します。」
                            </p>
                            <div className="flex gap-3">
                              <button
                                onClick={() => setShowPsychWarning(false)}
                                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-500 text-sm font-bold hover:bg-slate-50 transition-all"
                              >
                                キャンセル
                              </button>
                              <button
                                onClick={openPsychReport}
                                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black transition-all shadow-lg"
                              >
                                深く理解しました
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm p-6 md:p-8">
                        <div className="flex items-center gap-3 mb-5">
                          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm">
                            📊
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-800">
                              {currentEmp.name} さんの評価状況
                            </h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              {currentTerm}期 SCORE STATUS
                            </p>
                          </div>
                          {hasReport && (
                            <button
                              onClick={() => setShowPsychWarning(true)}
                              className="ml-auto px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center gap-1 whitespace-nowrap"
                            >
                              🧠 深層心理分析レポートを見る
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="p-3 bg-slate-50 rounded-xl text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
                              必須研修
                            </p>
                            <p className="text-lg font-black text-slate-800">
                              {completedReq}/{effectiveRequired.length}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold">
                              完了
                            </p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
                              任意研修
                            </p>
                            <p className="text-lg font-black text-slate-800">
                              {optionalCount}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold">
                              件
                            </p>
                          </div>
                          {penalty !== 0 && (
                            <div className="p-3 bg-rose-50 rounded-xl text-center border border-rose-100">
                              <p className="text-[9px] font-black text-rose-500 uppercase mb-1">
                                評価マイナス
                              </p>
                              <p className="text-lg font-black text-rose-700">
                                {penalty}点
                              </p>
                              <p className="text-[9px] text-rose-400 font-bold">
                                未完了 {incompleteReq}件
                              </p>
                            </div>
                          )}
                          {bonus > 0 && (
                            <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                              <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">
                                数量UP加点
                              </p>
                              <p className="text-lg font-black text-emerald-700">
                                +{bonus}点
                              </p>
                              <p className="text-[9px] text-emerald-400 font-bold">
                                任意高得点
                              </p>
                            </div>
                          )}
                        </div>

                        <div
                          className={`p-4 rounded-xl flex items-center justify-between mb-3 ${
                            incompleteReq === 0 && effectiveRequired.length > 0
                              ? "bg-emerald-50 border border-emerald-100"
                              : total < 0
                                ? "bg-rose-50 border border-rose-100"
                                : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="text-xs font-black text-slate-600">
                            {currentTerm}期 合計スコア
                          </span>
                          <div className="flex items-center gap-3">
                            {incompleteReq === 0 &&
                              effectiveRequired.length > 0 && (
                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-lg">
                                  ✓ 必須全完了
                                </span>
                              )}
                            <span
                              className={`text-xl font-black ${total > 0 ? "text-emerald-700" : total < 0 ? "text-rose-700" : "text-slate-600"}`}
                            >
                              {total > 0 ? "+" : ""}
                              {total}点
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <div className="flex-1 p-3 bg-slate-100 rounded-xl flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-500">
                              {prevTerm}期 確定スコア
                            </span>
                            <span
                              className={`text-sm font-black ${prevTotal > 0 ? "text-emerald-700" : prevTotal < 0 ? "text-rose-700" : "text-slate-500"}`}
                            >
                              {prevTotal > 0 ? "+" : ""}
                              {prevTotal}点
                            </span>
                          </div>
                          {reviewCount > 0 && (
                            <div className="flex-1 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
                              <span className="text-[10px] font-black text-amber-600">
                                復習受講
                              </span>
                              <span className="text-sm font-black text-amber-700">
                                {reviewCount}件
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 深層心理レポート申し込みセクション */}
                        {!hasReport && (
                          <div className="mt-5 pt-5 border-t border-slate-100">
                            {hasApplied ? (
                              <div className="flex items-center justify-between p-4 bg-violet-50 rounded-2xl border border-violet-100">
                                <div>
                                  <p className="text-xs font-black text-violet-700">
                                    🧠 深層心理レポート申し込み受付済み
                                  </p>
                                  <p className="text-[10px] text-violet-400 font-bold mt-0.5">
                                    HR担当者が分析中です。しばらくお待ちください。
                                  </p>
                                </div>
                                <span className="text-[10px] font-black text-violet-400 bg-violet-100 px-3 py-1 rounded-full">
                                  審査中
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-xs leading-relaxed text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 font-medium">
                                  学術的にも実践的にも信頼性高い、世界の深層心理分析の第一人者を集めたチームが貴方の学び方から、貴方がどういう状態かオブラートに包むことなく、レポートを作成します。
                                </p>
                                <button
                                  onClick={() =>
                                    handleApplyPsychReport(
                                      empId,
                                      currentEmp.name,
                                    )
                                  }
                                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-black rounded-xl transition-all shadow-md shadow-violet-100"
                                >
                                  🧠 深層心理レポートを申し込む
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {traineeViewMode === "progress" ? (
                  <ProgressOverview
                    results={filteredResults.filter(
                      (r) =>
                        normalizeId(r.employeeId) ===
                        normalizeId(effectiveAuth?.employeeId),
                    )}
                    trainings={trainings}
                    userName={effectiveAuth?.name || ""}
                  />
                ) : (
                  (() => {
                    const selectedTermLabel =
                      selectedFiscalYear === "all"
                        ? "通年"
                        : `${selectedFiscalYear - 1977}期`;
                    const currentEmployee = employees.find(
                      (e) =>
                        normalizeId(e.id) ===
                        normalizeId(effectiveAuth?.employeeId),
                    );
                    const availableYears = Array.from(
                      new Set(
                        sortedTrainings
                          .map((t) => getTrainingFiscalYear(t))
                          .filter((fy): fy is number => typeof fy === "number"),
                      ),
                    )
                      .sort((a, b) => b - a)
                      .filter((y) => y > 0);
                    if (!availableYears.includes(nowFY)) {
                      availableYears.unshift(nowFY);
                    }
                    const visibleTrainings =
                      selectedFiscalYear === "all"
                        ? sortedTrainings
                        : sortedTrainings.filter((t) => {
                            const tFY = getTrainingFiscalYear(t);
                            return tFY === selectedFiscalYear;
                          });
                    const renderCard = (t: Training, isPast: boolean) => {
                      const res = results.find(
                        (r) =>
                          normalizeId(r.trainingId) === normalizeId(t.id) &&
                          normalizeId(r.employeeId) ===
                            normalizeId(effectiveAuth?.employeeId),
                      );
                      const isFin = res && res.postScore !== -1;
                      const isPre = res !== undefined;
                      const isRequired =
                        !isPast &&
                        (t.isRequiredForAll ||
                          (currentEmployee?.requiredTrainings || []).includes(
                            t.id,
                          ));
                      const links = t.studyLinks || [];
                      const trainingTerm =
                        (getTrainingFiscalYear(t) || nowFY) - 1977;

                      if (isPast) {
                        return (
                          <div
                            key={t.id}
                            className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-200 hover:border-amber-300 transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-200 px-2 py-0.5 rounded">
                                    {t.date}
                                  </span>
                                  <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                    {trainingTerm}期
                                  </span>
                                </div>
                                {isFin && (
                                  <span className="text-[10px] font-black text-slate-500 bg-white border px-2 py-0.5 rounded">
                                    復習スコア: {res.postScore}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-base font-bold mb-1 line-clamp-2 text-slate-700">
                                {t.title}
                              </h3>
                              <p className="text-xs text-slate-400 line-clamp-2">
                                {t.description}
                              </p>
                              {links.length > 0 && (
                                <div className="mt-2 space-y-0.5">
                                  {links.map((link, idx) => (
                                    <a
                                      key={idx}
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block text-xs text-indigo-500 hover:underline truncate"
                                    >
                                      🔗 {link.label || link.url}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setActiveTraining({ t, mode: "intro" })
                              }
                              className="w-full py-3 mt-4 rounded-xl font-black text-xs bg-amber-500 hover:bg-amber-600 text-white transition-all"
                            >
                              📖 復習テストを受ける
                            </button>
                          </div>
                        );
                      }

                      const cardBorderColor = isFin
                        ? "border-blue-200"
                        : isPre
                          ? "border-amber-200"
                          : "border-orange-200";
                      const btnClass = isFin
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : isPre
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "bg-orange-500 text-white hover:bg-orange-600";
                      const btnText = isFin
                        ? "分析結果を見る"
                        : isPre
                          ? "2回目テスト開始"
                          : "テスト開始";
                      return (
                        <div
                          key={t.id}
                          className={`bg-white p-8 rounded-3xl border-2 ${cardBorderColor} shadow-sm hover:shadow-md transition-all flex flex-col justify-between group`}
                        >
                          <div>
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-indigo-500 uppercase bg-indigo-50 px-3 py-1 rounded-lg">
                                  {t.date}
                                </span>
                                {isRequired && (
                                  <span className="text-[10px] font-black text-white bg-rose-600 px-3 py-1 rounded-lg">
                                    必須
                                  </span>
                                )}
                                {!isRequired && (
                                  <span className="text-[10px] font-black text-white bg-blue-600 px-3 py-1 rounded-lg">
                                    任意
                                  </span>
                                )}
                              </div>
                              {isFin && (
                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                                  Score: {res.postScore}
                                </span>
                              )}
                            </div>
                            <h3 className="text-xl font-bold mb-2 line-clamp-1">
                              {t.title}
                            </h3>
                            <p className="text-sm text-slate-400 line-clamp-2 h-10">
                              {t.description}
                            </p>
                            {links.length > 0 && (
                              <div className="mt-3 space-y-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase">
                                  📚 勉強資料
                                </p>
                                {links.map((link, idx) => (
                                  <a
                                    key={idx}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-xs text-indigo-600 hover:text-indigo-800 font-bold truncate hover:underline"
                                  >
                                    🔗 {link.label || link.url}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (isFin) setTraineeViewMode("progress");
                              else
                                setActiveTraining({
                                  t,
                                  mode: isPre ? "post" : "intro",
                                });
                            }}
                            className={`w-full py-4 mt-6 rounded-xl font-black text-sm transition-all ${btnClass}`}
                          >
                            {btnText}
                          </button>
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedFiscalYear(nowFY)}
                              className={`px-4 py-2 rounded-xl font-black text-xs transition-all ${selectedFiscalYear === nowFY ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                            >
                              今期
                            </button>
                            <button
                              onClick={() => setSelectedFiscalYear("all")}
                              className={`px-4 py-2 rounded-xl font-black text-xs transition-all ${selectedFiscalYear === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                            >
                              通年
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                              年度
                            </span>
                            <select
                              value={selectedFiscalYear}
                              onChange={(e) =>
                                setSelectedFiscalYear(
                                  e.target.value === "all"
                                    ? "all"
                                    : Number(e.target.value),
                                )
                              }
                              className="px-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-sm font-black outline-none"
                            >
                              <option value="all">通年表示</option>
                              {availableYears.map((year) => (
                                <option key={year} value={year}>
                                  {year}年度
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                            {selectedTermLabel} 講義一覧
                          </h3>
                          {visibleTrainings.length === 0 ? (
                            <div className="p-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center text-slate-500 font-bold">
                              選択中の年度の講義はまだありません。
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {visibleTrainings.map((t) =>
                                renderCard(t, (t.fiscalYear || nowFY) < nowFY),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )
          ) : effectiveRole === Role.TRAINER ? (
            !adminUnlocked ? (
              <div className="max-w-md mx-auto mt-20 p-10 bg-white rounded-3xl border shadow-xl text-center">
                <h3 className="text-xl font-bold mb-6">講義作成 認証</h3>
                <input
                  type="password"
                  placeholder="Passcode"
                  className="w-full px-6 py-4 rounded-xl border text-center font-bold mb-6"
                  value={inputPasscode}
                  onChange={(e) => setInputPasscode(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (inputPasscode === MASTER_PASSCODE)
                      setAdminUnlocked(true);
                    else alert("不可");
                  }}
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold"
                >
                  認証
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setAdminViewMode("trainings")}
                    className={`flex-1 px-6 py-3 text-sm font-black rounded-lg transition-all ${adminViewMode === "trainings" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                  >
                    講義管理
                  </button>
                  <button
                    onClick={() => setAdminViewMode("announcements")}
                    className={`flex-1 px-6 py-3 text-sm font-black rounded-lg transition-all ${adminViewMode === "announcements" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                  >
                    お知らせ
                  </button>
                  <button
                    onClick={() => setAdminViewMode("employees")}
                    className={`flex-1 px-6 py-3 text-sm font-black rounded-lg transition-all ${adminViewMode === "employees" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                  >
                    社員管理
                  </button>
                </div>
                {adminViewMode === "trainings" ? (
                  <TrainingCreator
                    trainings={trainings}
                    results={results}
                    wrongAnswerAnalyses={wrongAnswerAnalyses}
                    onUpdateTraining={handleUpdateTraining}
                    onSaveWrongAnswerAnalysis={(analysis) => {
                      setWrongAnswerAnalyses((prev) => [
                        ...prev.filter((a) => a.id !== analysis.id),
                        analysis,
                      ]);
                      safeSave("sb_wrong_answer_analyses", [
                        ...wrongAnswerAnalyses.filter(
                          (a) => a.id !== analysis.id,
                        ),
                        analysis,
                      ]);
                    }}
                    onOpenSelectKey={handleOpenSelectKey}
                    employees={employees}
                  />
                ) : adminViewMode === "announcements" ? (
                  <AnnouncementManager
                    announcements={announcements}
                    userName={effectiveAuth?.name || ""}
                    onSave={handleSaveAnnouncement}
                    onToggleActive={handleToggleAnnouncementActive}
                  />
                ) : (
                  <EmployeeManager
                    employees={employees}
                    trainings={trainings}
                    results={results}
                    onAddEmployee={handleAddEmployee}
                    onUpdateEmployee={handleUpdateEmployee}
                    onDeleteEmployee={handleDeleteEmployee}
                    gasUrl={gasUrl}
                  />
                )}
              </div>
            )
          ) : !adminUnlocked ? (
            <div className="max-w-md mx-auto mt-20 p-10 bg-white rounded-3xl border shadow-xl text-center">
              <h3 className="text-xl font-bold mb-6 text-rose-800">
                HR分析 認証
              </h3>
              <input
                type="password"
                placeholder="Passcode"
                className="w-full px-6 py-4 rounded-xl border text-center font-bold mb-6"
                value={inputPasscode}
                onChange={(e) => setInputPasscode(e.target.value)}
              />
              <button
                onClick={() => {
                  if (inputPasscode === MASTER_PASSCODE) setAdminUnlocked(true);
                  else alert("不可");
                }}
                className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold"
              >
                認証
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setTraineeViewMode("courses")}
                  className={`flex-1 px-6 py-3 text-sm font-black rounded-lg transition-all ${traineeViewMode === "courses" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"}`}
                >
                  HR分析
                </button>
                <button
                  onClick={() => setTraineeViewMode("progress")}
                  className={`flex-1 px-6 py-3 text-sm font-black rounded-lg transition-all ${traineeViewMode === "progress" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"}`}
                >
                  お知らせ
                </button>
              </div>
              {traineeViewMode === "courses" ? (
                <ReportingDashboard
                  trainings={trainings}
                  results={results}
                  employees={employees}
                  hrAnalyses={hrAnalyses}
                  wrongAnswerAnalyses={wrongAnswerAnalyses}
                  onUpdateEmployeeRole={handleUpdateEmployeeRole}
                  onRefresh={() => fetchFromGAS()}
                  gasUrl={gasUrl}
                  onUpdateGasUrl={handleUpdateGasUrl}
                  clliqUrl={clliqUrl}
                  onUpdateClliqUrl={handleUpdateClliqUrl}
                  onSaveHRAnalysis={handleSaveHRAnalysis}
                  onRunManualAnalysis={handleManualAnalysis}
                  onImpersonate={setImpersonatedEmpId}
                  onOpenSelectKey={handleOpenSelectKey}
                  annualSummaries={annualSummaries}
                  psychApplications={psychApplications}
                  onDeletePsychApplication={handleDeletePsychApplication}
                  currentEmployeeId={normalizeId(effectiveAuth?.employeeId || "")}
                  isHRRole={effectiveAuth?.role === Role.HR}
                />
              ) : (
                <AnnouncementManager
                  announcements={announcements}
                  userName={effectiveAuth?.name || ""}
                  onSave={handleSaveAnnouncement}
                  onToggleActive={handleToggleAnnouncementActive}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

export default App;
