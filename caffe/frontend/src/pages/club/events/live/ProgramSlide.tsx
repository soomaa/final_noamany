import { useEffect, useState } from "react";
import { ProgramSegment, getYouTubeId } from "./useProgramSegments";
import { Sparkles } from "lucide-react";
import { useLocale } from '@/store/locale';

/** Hero slide that renders one program segment (text/image/gallery/video). */
export const ProgramSlide = ({ segment }: { segment: ProgramSegment }) => {
  const { ui } = useLocale();
  const [galleryIdx, setGalleryIdx] = useState(0);

  useEffect(() => {
    if (segment.kind !== "gallery" || segment.media_urls.length < 2) return;
    const each = Math.max(2000, (segment.duration_seconds * 1000) / segment.media_urls.length);
    const t = setInterval(() => setGalleryIdx((i) => (i + 1) % segment.media_urls.length), each);
    return () => clearInterval(t);
  }, [segment]);

  const ytId = segment.kind === "video" && segment.video_url ? getYouTubeId(segment.video_url) : null;

  return (
    <div className="space-y-4 sm:space-y-6 w-full animate-in fade-in zoom-in-95 duration-700">
      <div className="flex items-center justify-center gap-3 mt-4 sm:mt-6">
        <span className="h-px w-10 sm:w-16 bg-gradient-to-l from-[#D4A229] to-transparent" />
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border-2 border-[#D4A229] shadow-md">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-[#D4A229]" />
          <p className="text-sm sm:text-base font-extrabold text-[#7B5E15] tracking-wide">{ui('فقرات الحفل')}</p>
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-[#D4A229]" />
        </span>
        <span className="h-px w-10 sm:w-16 bg-gradient-to-r from-[#D4A229] to-transparent" />
      </div>

      <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold leading-tight bg-gradient-to-l from-[#558B2F] via-[#7CB342] to-[#D4A229] bg-clip-text text-transparent">
        {segment.title}
      </h2>

      {segment.kind === "image" && segment.media_urls[0] && (
        <div className="mx-auto max-w-3xl rounded-2xl overflow-hidden border-4 border-[#7CB342]/30 shadow-xl">
          <img src={segment.media_urls[0]} alt={segment.title} className="w-full max-h-[50vh] sm:max-h-[55vh] object-cover" />
        </div>
      )}

      {segment.kind === "gallery" && segment.media_urls.length > 0 && (
        <div className="mx-auto max-w-3xl rounded-2xl overflow-hidden border-4 border-[#7CB342]/30 shadow-xl relative">
          <img
            key={galleryIdx}
            src={segment.media_urls[galleryIdx]}
            alt=""
            className="w-full max-h-[50vh] sm:max-h-[55vh] object-cover animate-in fade-in duration-700"
          />
          <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5">
            {segment.media_urls.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === galleryIdx ? "w-6 bg-[#D4A229]" : "w-1.5 bg-white/70"}`}
              />
            ))}
          </div>
        </div>
      )}

      {segment.kind === "video" && segment.video_url && (
        <div className="mx-auto max-w-3xl rounded-2xl overflow-hidden border-4 border-[#D4A229]/40 shadow-xl bg-black">
          <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
            {ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&rel=0`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={segment.title}
              />
            ) : (
              <video
                src={segment.video_url}
                className="absolute inset-0 w-full h-full object-contain"
                autoPlay muted loop playsInline
              />
            )}
          </div>
        </div>
      )}

      {segment.description && (
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-[#7CB342]/5 to-[#D4A229]/5 rounded-2xl p-3 sm:p-5 border-2 border-[#7CB342]/20">
          <p className="text-sm sm:text-lg text-[#2E4D1F] leading-relaxed font-medium">
            {segment.description}
          </p>
        </div>
      )}
    </div>
  );
};