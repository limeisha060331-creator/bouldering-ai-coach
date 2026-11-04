import { z } from "zod";
import type { ErasedTool } from "./types";

/**
 * 工具白名单就是注册表本身：没注册的名字一律不可调用。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ErasedTool>();

  constructor(tools: ErasedTool[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: ErasedTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`重复注册工具: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ErasedTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  describe(): string {
    return [...this.tools.values()]
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");
  }

  /**
   * 给模型看的工具目录。zod 4 自带 JSON Schema 转换；
   * 转换失败时退回空 schema，工具仍可被调用，只是参数提示变弱。
   */
  catalog(): Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }> {
    return [...this.tools.values()].map((tool) => {
      let inputSchema: unknown = {};
      try {
        inputSchema = z.toJSONSchema(tool.input);
      } catch {
        inputSchema = {};
      }
      return {
        name: tool.name,
        description: tool.description,
        inputSchema,
      };
    });
  }
}
