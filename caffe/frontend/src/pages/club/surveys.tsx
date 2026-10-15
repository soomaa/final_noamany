import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uiStatic } from '@/lib/ui-static';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';

interface SurveyQuestionObject {
  q?: string;
  question?: string;
  text?: string;
  type?: string;
  scale?: number;
}

type SurveyQuestion = string | SurveyQuestionObject;

interface SurveyRow {
  id: number;
  title: string;
  status: string;
  responses_count: number;
  questions_json?: SurveyQuestion[] | string | null;
}

function parseSurveyQuestions(raw: SurveyRow['questions_json']): SurveyQuestion[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof value === 'string') {
    const rawString = value;
    try {
      value = JSON.parse(rawString) as unknown;
    } catch {
      return rawString.trim() ? [rawString] : [];
    }
  }
  if (typeof value === 'object' && value != null && !Array.isArray(value) && 'questions' in value) {
    value = (value as { questions: unknown }).questions;
  }
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SurveyQuestion =>
      item != null && (typeof item === 'string' || typeof item === 'object'),
  );
}

function surveyQuestionLabel(question: SurveyQuestion): string {
  if (typeof question === 'string') return question;
  const text = question.q ?? question.question ?? question.text;
  if (typeof text === 'string' && text.trim()) return text;
  if (text != null && typeof text !== 'object') return String(text);
  return JSON.stringify(question);
}

function surveyQuestionMeta(question: SurveyQuestion): string | null {
  if (typeof question !== 'object' || question == null || question.type == null) return null;
  if (question.type === 'rating' && question.scale != null) {
    return `${uiStatic('تقييم')} / ${question.scale}`;
  }
  return typeof question.type === 'string' ? question.type : String(question.type);
}

export function ClubSurveysPage() {
  const ct = useClubT();
  const { data: surveys, refetch } = useArrayResource<SurveyRow>('club-surveys');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState('');

  const save = async () => {
    if (!title.trim()) return;
    try {
      const qList = questions
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean);
      await api.post('/club-surveys', { title, questions: qList });
      toast.success(ct('common.success'));
      setOpen(false);
      setTitle('');
      setQuestions('');
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const activate = async (id: number) => {
    try {
      await api.put(`/club-surveys/${id}`, { status: 'active' });
      toast.success(ct('common.success'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (id: number) => {
    const ok = await confirm({ title: ct('common.confirmDelete'), variant: 'destructive' });
    if (!ok) return;
    try {
      await api.delete(`/club-surveys/${id}`);
      toast.success(ct('common.success'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('members.surveysTitle')}
        description={ct('members.surveysDesc')}
        actions={
          <Button variant="brand" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            {ct('common.add')}
          </Button>
        }
      />
      <div className="grid gap-4">
        {(surveys ?? []).map((s) => {
          const questionItems = parseSurveyQuestions(s.questions_json);
          return (
          <div key={s.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{s.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={s.status === 'active' ? 'active' : 'pending'} />
                  <span className="text-xs text-muted-foreground nums">
                    {toArabicDigits(s.responses_count ?? 0)} {ct('members.surveyResponses')}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                {s.status !== 'active' && (
                  <Button variant="outline" size="sm" onClick={() => void activate(s.id)}>
                    {ct('common.activate')}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(s.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {questionItems.length > 0 && (
              <ul className="mt-3 list-inside list-decimal space-y-1 text-sm text-muted-foreground dark:text-white/85">
                {questionItems.map((q, i) => {
                  const meta = surveyQuestionMeta(q);
                  return (
                    <li key={i}>
                      <span>{surveyQuestionLabel(q)}</span>
                      {meta && <span className="ms-2 text-xs text-muted-foreground dark:text-white/60">({meta})</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          );
        })}
        {(surveys ?? []).length === 0 && (
          <p className="text-center text-sm text-muted-foreground">{ct('common.noData')}</p>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{ct('members.name')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{ct('members.surveyQuestions')}</Label>
              <Textarea
                rows={5}
                placeholder={ct('members.surveyQuestionsHint')}
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void save()}>
              {ct('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
