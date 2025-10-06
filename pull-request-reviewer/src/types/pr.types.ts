import * as http from 'http';
import * as https from 'https';

export interface PRComment {
  parentCommentId: number;
  content: string;
  commentType: number;
}

export interface PRCommentBody {
  comments: PRComment[];
  status: number;
  threadContext?: {
    filePath: string;
  };
}

export interface PRThread {
  id: string;
  threadContext: any;
}

export interface PRCommentResponse {
  value: any[];
}

export interface ReviewOptions {
  fileName: string;
  comment: string;
  agent: http.Agent | https.Agent;
}

export interface ReviewParams {
  gitDiff: string;
  fileName: string;
  agent: http.Agent | https.Agent;
  apiKey: string;
  aoiEndpoint: string;
  tokenMax?: string;
  temperature?: string;
  prompt?: string;
  additionalPrompts?: string[];
}