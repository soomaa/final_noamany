import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export enum CustomerServiceQuestionType { stars = 'stars', yes_no = 'yes_no', multiple_choice = 'multiple_choice', text = 'text' }
export enum CustomerServiceCallStatus { answered = 'answered', no_answer = 'no_answer', call_later = 'call_later' }

export class UpsertCustomerServiceQuestionDto {
  @IsString() questionText!: string;
  @IsEnum(CustomerServiceQuestionType) questionType: CustomerServiceQuestionType = CustomerServiceQuestionType.text;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
}

export class CustomerServiceListDto {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() subscriptionStatus?: 'active' | 'expired';
  @Type(() => Number) @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsString() category?: 'women' | 'men';
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
  @IsOptional() @IsString() contactStatus?: 'contacted' | 'not_contacted';
  @IsOptional() @IsString() contactFromDate?: string;
  @IsOptional() @IsString() contactToDate?: string;
}

export class CustomerServiceAnswerDto {
  @Type(() => Number) @IsInt() questionId!: number;
  @ValidateIf((o) => o.answerText != null) @IsString() answerText?: string;
}

export class CreateCustomerServiceFeedbackDto {
  @Type(() => Number) @IsInt() clientId!: number;
  @Type(() => Number) @IsInt() subscriptionId!: number;
  @IsEnum(CustomerServiceCallStatus) callStatus: CustomerServiceCallStatus = CustomerServiceCallStatus.answered;
  @IsArray() @ValidateIf((o) => o.callStatus === CustomerServiceCallStatus.answered) @ArrayMinSize(1) answers: CustomerServiceAnswerDto[] = [];
}
