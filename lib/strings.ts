/** UI 文案（与 AI 输出语言 locale 独立，由界面语言切换控制） */
export type UiLocale = "zh" | "en";

export const UI_LOCALE_STORAGE_KEY = "bouldering-ui-locale";

type CopyBlock = {
  brand: string;
  title: string;
  subtitle: string;
  expectTitle: string;
  expectBody: string;
  disclaimer: string;
  uploadIdle: string;
  uploadCompress: string;
  uploadHint: string;
  tipTitle: string;
  tipBody: string;
  startAnalysis: string;
  historyTitle: string;
  historyEmpty: string;
  historyEmptyHint: string;
  historyNoMatch: string;
  historyNoMatchHint: string;
  historyDbError: string;
  historyDbHint: string;
  historySearch: string;
  historyDateAll: string;
  historyDate7: string;
  historyDate30: string;
  historyScoreMin: string;
  historyScoreMax: string;
  historyClearFilters: string;
  videoTooBig: string;
  videoTooBigHint: string;
  pickVideo: string;
  needVideo: string;
  stillLarge: string;
  canceled: string;
  canceledHint: string;
  cancelAnalysis: string;
  retrySameVideo: string;
  rechooseFile: string;
  rateLimitWait: (sec: number) => string;
  depthLabel: string;
  depthLight: string;
  depthLightDesc: string;
  depthDeep: string;
  depthDeepDesc: string;
  uiLangLabel: string;
  uiLangZh: string;
  uiLangEn: string;
  analysisOutputLang: string;
  analysisOutputZh: string;
  analysisOutputEn: string;
  analysisTimeline: string;
  analysisSummary: string;
  analysisFullText: string;
  showFullText: string;
  hideFullText: string;
  exportMarkdown: string;
  printOrSavePdf: string;
  pinSegment: string;
  unpinSegment: string;
  detailLoading: string;
  detailNotFound: string;
  detailBack: string;
  metaPromptVer: string;
  metaDepth: string;
  metaAiLang: string;
  steps: [string, string, string, string];
};

export const STRINGS: Record<UiLocale, CopyBlock> = {
  zh: {
    brand: "Bouldering · AI Coach",
    title: "抱石分析",
    subtitle: "上传攀爬片段，获得克制、专业的动作反馈",
    expectTitle: "分析前说明",
    expectBody:
      "单次分析通常约 1～3 分钟，取决于视频长度与 Gemini 排队情况。异步模式下请保持本页打开直至跳转结果页。若失败，常见原因为网络波动、API 限流（429）或视频处理超时——可稍后再试或换更短片段。",
    disclaimer:
      "本服务仅供训练参考，不构成医疗、康复或现场保护建议；请在安全环境下攀爬并自行承担风险。",
    uploadIdle: "点击或拖拽上传",
    uploadCompress: "正在处理视频",
    uploadHint: "最大 {maxMb}MB · 自动压缩至 {analyzeMb}MB",
    tipTitle: "剪辑建议",
    tipBody:
      "建议只保留关键的一挂或一跃，4MB 以内、90 秒内的片段分析更精准（适配线上服务器上传限制）。",
    startAnalysis: "开始分析",
    historyTitle: "分析历史",
    historyEmpty: "暂无记录",
    historyEmptyHint: "上传一段攀爬视频，开始第一次分析。",
    historyNoMatch: "没有符合筛选条件的记录",
    historyNoMatchHint: "尝试放宽日期或分数筛选，或清空搜索。",
    historyDbError: "无法使用本地历史（浏览器可能禁用了存储）",
    historyDbHint:
      "你仍可进行分析与查看本次结果；如需历史，请在浏览器设置中允许本站数据存储。",
    historySearch: "搜索文件名",
    historyDateAll: "全部时间",
    historyDate7: "最近 7 天",
    historyDate30: "最近 30 天",
    historyScoreMin: "最低分",
    historyScoreMax: "最高分",
    historyClearFilters: "清除筛选",
    videoTooBig: "视频超过 {maxMb}MB",
    videoTooBigHint: "请先用剪辑软件裁短再上传。",
    pickVideo: "请选择视频文件（如 mp4、webm、mov）",
    needVideo: "请先选择视频",
    stillLarge: "视频仍超过 {analyzeMb}MB，请重新选择或等待压缩完成",
    canceled: "已取消分析",
    canceledHint: "你可使用当前视频再次开始，或重新选择文件。",
    cancelAnalysis: "取消分析",
    retrySameVideo: "使用当前视频再试",
    rechooseFile: "清除并重新选择",
    rateLimitWait: (sec) => `限流冷却中，约 ${sec} 秒后自动重试`,
    depthLabel: "分析深度",
    depthLight: "轻量",
    depthLightDesc: "更短、更快",
    depthDeep: "深度",
    depthDeepDesc: "更细、更长",
    uiLangLabel: "界面语言",
    uiLangZh: "中文",
    uiLangEn: "English",
    analysisOutputLang: "AI 输出语言",
    analysisOutputZh: "中文",
    analysisOutputEn: "English",
    analysisTimeline: "时间轴",
    analysisSummary: "总结",
    analysisFullText: "全文",
    showFullText: "展开全文",
    hideFullText: "收起全文",
    exportMarkdown: "导出 Markdown",
    printOrSavePdf: "打印为 PDF（系统对话框）",
    pinSegment: "标记",
    unpinSegment: "取消标记",
    detailLoading: "加载中",
    detailNotFound: "找不到这条分析记录",
    detailBack: "返回首页",
    metaPromptVer: "提示词版本",
    metaDepth: "深度",
    metaAiLang: "AI 语言",
    steps: ["本地处理", "上传云端", "Gemini 处理", "生成分析"],
  },
  en: {
    brand: "Bouldering · AI Coach",
    title: "Boulder analysis",
    subtitle: "Upload a short climb clip for structured, professional feedback.",
    expectTitle: "Before you start",
    expectBody:
      "One run usually takes about 1–3 minutes depending on length and API queue. Keep this tab open until you are redirected. Failures are often network blips, Gemini rate limits (429), or processing timeouts—retry later or use a shorter clip.",
    disclaimer:
      "For training reference only; not medical, rehab, or on-the-spot safety advice. Climb responsibly and at your own risk.",
    uploadIdle: "Click or drag to upload",
    uploadCompress: "Processing video",
    uploadHint: "Up to {maxMb}MB · auto-compress to {analyzeMb}MB",
    tipTitle: "Editing tip",
    tipBody:
      "Keep only the crux move; clips under 4MB and ~90s work best on production hosting.",
    startAnalysis: "Start analysis",
    historyTitle: "History",
    historyEmpty: "No records yet",
    historyEmptyHint: "Upload a clip to create your first analysis.",
    historyNoMatch: "No records match your filters",
    historyNoMatchHint: "Widen date or score filters, or clear search.",
    historyDbError: "Local history unavailable (storage may be blocked)",
    historyDbHint:
      "You can still analyze and view this session; enable site data for history.",
    historySearch: "Search file name",
    historyDateAll: "Any time",
    historyDate7: "Last 7 days",
    historyDate30: "Last 30 days",
    historyScoreMin: "Min score",
    historyScoreMax: "Max score",
    historyClearFilters: "Clear filters",
    videoTooBig: "Video exceeds {maxMb}MB",
    videoTooBigHint: "Trim in an editor, then upload again.",
    pickVideo: "Please choose a video file (e.g. mp4, webm, mov)",
    needVideo: "Select a video first",
    stillLarge: "Still over {analyzeMb}MB—wait for compression or pick another file",
    canceled: "Analysis canceled",
    canceledHint: "Start again with the same clip or choose a new file.",
    cancelAnalysis: "Cancel",
    retrySameVideo: "Retry with current video",
    rechooseFile: "Clear and pick another file",
    rateLimitWait: (sec) => `Rate limited—retry in ~${sec}s`,
    depthLabel: "Depth",
    depthLight: "Light",
    depthLightDesc: "Shorter, faster",
    depthDeep: "Deep",
    depthDeepDesc: "Richer, longer",
    uiLangLabel: "UI language",
    uiLangZh: "中文",
    uiLangEn: "English",
    analysisOutputLang: "AI output language",
    analysisOutputZh: "中文",
    analysisOutputEn: "English",
    analysisTimeline: "Timeline",
    analysisSummary: "Summary",
    analysisFullText: "Full text",
    showFullText: "Show full text",
    hideFullText: "Hide full text",
    exportMarkdown: "Export Markdown",
    printOrSavePdf: "Print / Save as PDF",
    pinSegment: "Pin",
    unpinSegment: "Unpin",
    detailLoading: "Loading",
    detailNotFound: "This analysis was not found",
    detailBack: "Back to home",
    metaPromptVer: "Prompt version",
    metaDepth: "Depth",
    metaAiLang: "AI language",
    steps: ["Local prep", "Upload", "Gemini", "Analysis"],
  },
};

export function formatStr(
  template: string,
  vars: Record<string, string | number>
): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
