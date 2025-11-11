// 数据库模型和类型定义
// 这个文件定义了 API 文档的数据结构

export interface ApiDoc {
  id: string;
  url: string;
  method: string;
  domain: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  statusCode?: number;
  docMarkdown?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiCaptureRequest {
  captures: {
    url: string;
    method: string;
    domain: string;
    requestHeaders: Record<string, string>;
    requestBody?: any;
    responseBody?: any;
    statusCode?: number;
    timestamp: number;
    duration?: number;
  }[];
}

