export interface EvaluationCategory { id: number; name: string; jobTitleId: number; jobTitleName: string; }
export interface EvaluationItem { id: number; categoryId: number; categoryName?: string; name: string; maxScore: string; }
export interface EvaluationOption { id: number; name: string; code?: number | null; }
export interface EvaluationReportRow { id: number; evaluationDate: string; evaluationMonth: string; categoryName: string; employeeName: string; branchName: string; createdByName: string; createdAt: string; }
export interface EvaluationDetails { id: number; evaluationDate: string; evaluationMonth: string; categoryName: string; employeeName: string; createdByName: string; details: Array<{ id: number; itemId: number; itemName: string; maxScore: string; awardedScore: string }>; }
