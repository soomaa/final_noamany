import { exerciseLabel, exerciseInstructions } from '@/pages/club/fitness/training/exercise-label';
import { useLocale } from "@/store/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { MuscleMap } from "./muscle-map";
import { MuscleLegend } from "./muscle-overview";
import type { Exercise, Muscle } from "@/pages/club/fitness/training/model";

export function ExercisePreview({
  exercise,
  muscles,
  onClose,
  onEdit,
}: {
  exercise: Exercise;
  muscles: Muscle[];
  onClose: () => void;
  onEdit?: () => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const backTargets = new Set(["glutes", "hamstrings", "lower_back", "upper_back", "lats", "traps"]);
  const backCount = exercise.primary.filter(id => backTargets.has(id)).length;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="training-dialog max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exerciseLabel(exercise, locale)}</DialogTitle>
        </DialogHeader>
        <div className="grid items-start gap-6 sm:grid-cols-2">
          <MuscleMap
            muscles={muscles}
            initialSide={backCount > exercise.primary.length - backCount ? "back" : "front"}
            primary={exercise.primary}
            secondary={exercise.secondary}
          />
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {ar
                ? "الأحمر للعضلات الأساسية، والأحمر الفاتح للمساعدة."
                : "Red marks primary muscles; lighter red marks assisting muscles."}
            </p>
            <MuscleLegend exercise={exercise} muscles={muscles} />
            {onEdit && <Button permissionAction={null} variant="outline" onClick={onEdit}>{ar ? 'تعديل العضلات المستهدفة' : 'Edit target muscles'}</Button>}
            <div>
              <h3 className="font-medium">
                {ar ? "طريقة الأداء" : "Instructions"}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {exerciseInstructions(exercise, locale) ||
                  (ar
                    ? "لم يُضف شرح لهذا التمرين بعد."
                    : "No instructions added for this exercise yet.")}
              </p>
            </div>
            {exercise.videoUrl?.startsWith('https://') && <Button asChild permissionAction={null} variant="outline"><a href={exercise.videoUrl} target="_blank" rel="noopener noreferrer">{ar ? 'مشاهدة فيديو الشرح' : 'Watch instruction video'}</a></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
