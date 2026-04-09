
import { GoogleGenAI, Type } from "@google/genai";
import { Question, TrainingMaterial, TestResult } from "../types";

const getAIClient = () => {
  const manualKey = localStorage.getItem('sb_manual_api_key');
  const apiKey = manualKey || process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is not defined (checked localStorage and process.env)");
  }
  return new GoogleGenAI({ apiKey: apiKey || "" });
};

/**
 * Handle API errors, specifically looking for common error types
 */
const handleApiError = async (error: any) => {
  console.error("=== Gemini API Error Details ===");
  console.error("Error object:", error);
  console.error("Error message:", error?.message);
  console.error("Error status:", error?.status);
  console.error("================================");

  const errorMsg = error?.message || "";
  const errorStatus = error?.status;

  // Check for specific error types
  if (errorMsg.includes("API key not valid") || errorMsg.includes("API_KEY_INVALID")) {
    alert("❌ APIキーが無効です。\n\n正しいAPIキーを設定してください。\n\nGoogle AI Studioで新しいキーを作成できます:\nhttps://aistudio.google.com/apikey");
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
    }
  } else if (errorMsg.includes("Requested entity was not found") || errorStatus === 404) {
    alert("❌ 指定されたモデルが見つかりません。\n\nモデル名を確認するか、別のモデルを選択してください。\n\nAPIキーの権限も確認してください。");
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
    }
  } else if (errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorStatus === 429) {
    alert("❌ APIの使用量制限に達しました。\n\n・しばらく待ってから再試行してください\n・Google AI Studioでクォータを確認してください\n・別のAPIキーを使用してください");
  } else if (errorMsg.includes("PERMISSION_DENIED") || errorStatus === 403) {
    alert("❌ APIキーに必要な権限がありません。\n\nGoogle AI Studioで新しいキーを作成してください。");
  } else if (errorMsg.includes("network") || errorMsg.includes("fetch")) {
    alert("❌ ネットワークエラーが発生しました。\n\nインターネット接続を確認してください。");
  } else {
    alert(`❌ AI分析中にエラーが発生しました。\n\nエラー: ${errorMsg}\n\nブラウザのコンソール(F12)で詳細を確認してください。\n\n対処方法:\n1. APIキーを再設定\n2. ネットワーク接続を確認\n3. 資料のサイズを減らす`);
  }

  throw error;
};

export const generateQuestionsFromMaterials = async (
  title: string,
  content: string,
  materials: TrainingMaterial[],
  count: number = 20,
  difficulty: 'Standard' | 'Difficult' | 'MAX' = 'Standard',
  modelName: string = 'gemini-2.0-flash-exp'
): Promise<Question[]> => {
  console.log('=== AI問題生成を開始 ===');
  console.log('モデル:', modelName);
  console.log('問題数:', count);
  console.log('難易度:', difficulty);
  console.log('資料数:', materials.length);

  const ai = getAIClient();

  // Check if API key is available
  const manualKey = localStorage.getItem('sb_manual_api_key');
  const apiKey = manualKey || process.env.API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ APIキーが設定されていません');
    throw new Error('APIキーが設定されていません。キー設定ボタンからAPIキーを入力してください。');
  }

  console.log('✓ APIキー確認完了 (長さ:', apiKey.length, '文字)');

  const difficultyInstruction = {
    'Standard': '一般常識や基礎知識を問う、標準的な難易度にしてください。',
    'Difficult': '応用力や深い理解を問う、やや難しい難易度にしてください。',
    'MAX': '専門家レベルの高度な洞察や、ひっかけ等も含んだ、極めて難しい難易度にしてください。'
  }[difficulty];

  const parts: any[] = [
    {
      text: `
研修タイトル: ${title}
研修のメイン内容: ${content}
難易度設定: ${difficulty} (${difficultyInstruction})

上記の内容および添付された資料から、受講者の理解度を深く測定するための試験問題を作成してください。
指定された問題数: ${count}問
` }
  ];

  // Process materials with validation - skip invalid ones
  let validMaterialCount = 0;
  let skippedMaterialCount = 0;

  materials.forEach((m, index) => {
    try {
      // Validate material data
      if (!m.data) {
        console.warn(`資料 ${index + 1} (${m.name}): データが空です。スキップします。`);
        skippedMaterialCount++;
        return;
      }

      if (!m.data.includes(',')) {
        console.warn(`資料 ${index + 1} (${m.name}): データ形式が不正です(カンマが見つかりません)。スキップします。`);
        skippedMaterialCount++;
        return;
      }

      const dataParts = m.data.split(',');
      if (dataParts.length < 2 || !dataParts[1]) {
        console.warn(`資料 ${index + 1} (${m.name}): Base64データが見つかりません。スキップします。`);
        skippedMaterialCount++;
        return;
      }

      // Validate MIME type
      if (!m.mimeType || m.mimeType.trim() === '') {
        console.warn(`資料 ${index + 1} (${m.name}): MIMEタイプが不正です。スキップします。`);
        skippedMaterialCount++;
        return;
      }

      // Add valid material to parts
      parts.push({
        inlineData: {
          mimeType: m.mimeType,
          data: dataParts[1]
        }
      });
      validMaterialCount++;
      console.log(`✓ 資料 ${index + 1} (${m.name}): 正常に追加されました。`);

    } catch (error) {
      console.error(`❌ 資料 ${index + 1} (${m.name}): 処理中にエラーが発生しました。スキップします。`, error);
      skippedMaterialCount++;
    }
  });

  // Log summary
  console.log(`\n📊 資料の処理完了: ${validMaterialCount}件が有効、${skippedMaterialCount}件をスキップしました。`);

  if (validMaterialCount === 0 && materials.length > 0) {
    console.warn('⚠️ 警告: すべての資料が不適格でした。テキストコンテンツのみで問題を生成します。');
  }

  console.log('\n🚀 Gemini APIを呼び出し中...');

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: `あなたはプロの教育設計者です。
与えられた資料を分析し、指定された難易度（${difficulty}）に合わせて、以下のルールを「絶対」に守ってJSON配列を出力してください。

1. 問題数は「必ず正確に${count}問」作成すること。
2. すべて「4択形式」とし、意味のある選択肢を4つ用意すること。
3. correctAnswerは 0, 1, 2, 3 のいずれかの数値（インデックス）にすること。
4. 専門用語の解説(explanation)を全問に含めること。
5. 出力は純粋なJSON配列のみとし、マークダウンの装飾（\`\`\`json 等）は含めないこと。`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                minItems: 4,
                maxItems: 4
              },
              correctAnswer: { type: Type.INTEGER },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "options", "correctAnswer", "explanation"]
          }
        }
      }
    });

    console.log('✓ API応答を受信しました');

    const rawText = response.text;
    if (!rawText) {
      console.error('❌ AIからの応答が空です');
      throw new Error("AIからの応答が空です。");
    }

    console.log('✓ 応答テキストの長さ:', rawText.length, '文字');

    const questions = JSON.parse(rawText.trim());
    console.log('✓ 問題の解析完了:', questions.length, '問');
    console.log('=== AI問題生成が正常に完了しました ===\n');

    return questions;

  } catch (e: any) {
    console.error('❌ API呼び出しエラー:', e);
    console.error('エラーの詳細:', {
      message: e?.message,
      status: e?.status,
      statusText: e?.statusText,
      name: e?.name
    });
    return handleApiError(e);
  }
};

export const analyzeIndividualPerformance = async (
  name: string,
  trainingTitle: string,
  pre: number,
  post: number,
  totalQuestions: number = 20
): Promise<{ analysis: string, advice: string, traits: string[], competencies: string[] }> => {
  const ai = getAIClient();
  try {
    const prompt = `社員「${name}」の研修結果を心理学的・教育学的観点から分析してください。
研修名: ${trainingTitle}
事前テスト得点: ${pre} / ${totalQuestions}
事後テスト得点: ${post} / ${totalQuestions}

以下の4点を含むJSONを返してください。
1. analysis: 人事向けの客観的分析。
2. advice: 本人へのアドバイス。
3. traits: その人物の性質や特徴を示すキーワードを3つ（配列）。
4. competencies: この研修を通じて見えた能力の強みや改善点を2つ（配列）。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt, // Simplified string format
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            advice: { type: Type.STRING },
            traits: { type: Type.ARRAY, items: { type: Type.STRING } },
            competencies: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["analysis", "advice", "traits", "competencies"]
        }
      }
    });

    const text = response.text;
    return JSON.parse(text || '{}');
  } catch (e) {
    console.error("Individual Analysis Error:", e);
    return {
      analysis: "理解度の変化を記録しました。",
      advice: "復習を継続してください。",
      traits: ["継続力", "向上心", "着実性"],
      competencies: ["基礎知識の習得", "自己学習への意欲"]
    };
  }
};

export const analyzeHRCompetency = async (
  name: string,
  results: TestResult[],
  customInstruction: string = ""
): Promise<string> => {
  const ai = getAIClient();

  // チート検知分析
  const cheatingFlags = results.map(r => {
    const flags: string[] = [];
    const totalQ = r.totalQuestions || 20;
    const secPerQ = r.postAnswerTimeSec ? r.postAnswerTimeSec / totalQ : null;

    if (r.postAnswerTimeSec !== undefined && r.postAnswerTimeSec > 0) {
      const mins = Math.floor(r.postAnswerTimeSec / 60);
      const secs = r.postAnswerTimeSec % 60;
      const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
      if (secPerQ !== null && secPerQ < 5) {
        flags.push(`⚠️ 回答速度が異常に速い（${totalQ}問を${timeStr}で回答、平均${secPerQ.toFixed(1)}秒/問）。答え合わせ参照・カンニングの可能性が高い`);
      } else if (secPerQ !== null && secPerQ < 10) {
        flags.push(`⚠️ 回答速度がやや速い（${totalQ}問を${timeStr}で回答、平均${secPerQ.toFixed(1)}秒/問）。外部資料参照の可能性がある`);
      }
    }
    if (r.preScore !== undefined && r.postScore !== undefined && r.postScore !== -1) {
      const pre = r.preScore;
      const post = r.postScore;
      const totalQ2 = r.totalQuestions || Math.max(pre, post, 20);
      if (pre >= totalQ2 * 0.9 && post >= totalQ2 * 0.9) {
        flags.push(`⚠️ 事前・事後ともに満点近い高得点（事前${pre}点→事後${post}点/${totalQ2}問）。事前知識ではなく答え参照の可能性がある`);
      }
    }
    return flags.length > 0
      ? `【${r.trainingTitle}】\n${flags.map(f => `  ${f}`).join('\n')}`
      : null;
  }).filter(Boolean);

  const historyText = results.map(r => {
    const totalQ = r.totalQuestions || 20;
    const timeTxt = r.postAnswerTimeSec
      ? `（事後テスト回答時間: ${Math.floor(r.postAnswerTimeSec / 60)}分${r.postAnswerTimeSec % 60}秒 / ${totalQ}問）`
      : '';
    return `・研修: ${r.trainingTitle}, 事前: ${r.preScore}点, 事後: ${r.postScore}点 ${timeTxt}, AI個別評価: ${r.analysis}`;
  }).join('\n');

  const cheatingSection = cheatingFlags.length > 0
    ? `\n【⚠️ 不正行為の疑い — 重要】\n以下の研修で、統計的に不自然な回答パターンが検出されました。深層心理学の観点から、なぜこのような「ズル」をしてしまうのか、その行動動機・認知的歪み・自己欺瞞のメカニズムを徹底的に分析してください：\n${cheatingFlags.join('\n')}\n`
    : '';

  const prompt = `
あなたはプロの行動分析学者かつHRコンサルタントです。対象社員「${name}」の過去の学習履歴に基づき、深層的な能力管理レポートを作成してください。

【分析データ】
${historyText}
${cheatingSection}
【最優先分析指示】
この社員が「どのような状況」で、「どういう思考の癖（誤解・錯覚）」を持ち、「なぜ結果に繋がらない行動をとってしまうのか」を、論理的に解明してください。
単なる励ましではなく、認知バイアスや行動パターンの歪みを鋭く指摘してください。
${cheatingFlags.length > 0 ? '\n不正行為の疑いがある場合は、それを人格・動機・自己保存本能の観点から深層心理学的に分析し、独立したセクションとして必ず記載してください。' : ''}

${customInstruction ? `【追加指示】\n${customInstruction}` : ""}

出力は論理的で構造的な日本語のレポート（Markdown形式）でお願いします。
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    return response.text || "分析を生成できませんでした。";
  } catch (e) {
    console.error("HR Competency Analysis Error:", e);
    return "AI分析の実行中にエラーが発生しました。履歴データは保存されています。";
  }
};
