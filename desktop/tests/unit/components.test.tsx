import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HistoryList } from "@/components/history-list";
import { StructuredReportView } from "@/components/structured-report";
import { PulseButton } from "@/components/pulse-button";
import { parseStructuredReport } from "@lib/parse-structured-report";
import type { AnalysisRecord } from "@lib/types";

function record(patch: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: "r1",
    createdAt: "2026-02-14T10:00:00.000Z",
    fileName: "crux-session.mp4",
    thumbnail: "",
    analysis: "",
    score: 82,
    highlight: "起步重心偏后",
    segments: [],
    grade: "V4",
    ...patch,
  };
}

describe("HistoryList", () => {
  it("无记录时展示空状态", () => {
    render(
      <MemoryRouter>
        <HistoryList
          records={[]}
          emptyTitle="暂无记录"
          emptyHint="上传一段攀爬视频"
        />
      </MemoryRouter>
    );
    expect(screen.getByText("暂无记录")).toBeInTheDocument();
    expect(screen.getByText("上传一段攀爬视频")).toBeInTheDocument();
  });

  it("渲染记录标题、评分与跳转链接", () => {
    render(
      <MemoryRouter>
        <HistoryList
          records={[record({ sessionNote: "周三抱石" })]}
          emptyTitle="暂无记录"
          emptyHint="提示"
        />
      </MemoryRouter>
    );
    expect(screen.getByText("周三抱石")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/analysis/r1");
  });
});

describe("StructuredReportView", () => {
  const structured = parseStructuredReport(
    [
      "核心维度评估",
      "1. 重心与身体位置：胯部贴墙不够",
      "最终改进方案",
      "1. **折膝专项**：顶膝后保持 3 秒",
      "整体建议",
      "下次热身先做折膝激活。",
    ].join("\n")
  );

  it("渲染三个结构化板块", () => {
    render(<StructuredReportView structured={structured} uiLocale="zh" />);
    expect(screen.getByText("核心维度评估")).toBeInTheDocument();
    expect(screen.getByText("改进方案")).toBeInTheDocument();
    expect(screen.getByText("整体建议")).toBeInTheDocument();
    expect(screen.getByText("折膝专项")).toBeInTheDocument();
  });

  it("英文界面使用英文标签", () => {
    render(<StructuredReportView structured={structured} uiLocale="en" />);
    expect(screen.getByText("Core assessment")).toBeInTheDocument();
    expect(screen.getByText("Improvement plan")).toBeInTheDocument();
  });

  it("没有结构化内容时返回空", () => {
    const { container } = render(
      <StructuredReportView
        structured={parseStructuredReport("00:03 普通点评")}
        uiLocale="zh"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PulseButton", () => {
  it("loading 时禁用并显示等待文案", () => {
    render(<PulseButton loading>开始分析</PulseButton>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("分析中，请稍候");
  });

  it("可透传 data-testid", () => {
    render(<PulseButton data-testid="start-button">开始分析</PulseButton>);
    expect(screen.getByTestId("start-button")).toHaveTextContent("开始分析");
  });
});
