import { saveSignalFeedbackAction } from "@/app/actions";
import type { SignalFeedback } from "@/db/repository";

const ratings = [
  { value: "useful", label: "Useful" },
  { value: "noise", label: "Noise" },
  { value: "not_relevant", label: "Not relevant" }
] as const;

export function FeedbackControls({
  signalScoreId,
  feedback
}: {
  signalScoreId: string;
  feedback: SignalFeedback | null;
}) {
  return (
    <section className="mt-5 glass-card rounded-[30px] p-5">
      <p className="text-sm font-black">Tune future signals</p>
      <p className="mt-1 text-xs leading-5 text-ink/55">
        This feedback is stored now and will be used by the next ranking-tuning pass.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {ratings.map((rating) => (
          <form key={rating.value} action={saveSignalFeedbackAction}>
            <input type="hidden" name="signalScoreId" value={signalScoreId} />
            <input type="hidden" name="rating" value={rating.value} />
            <button
              className={`w-full rounded-2xl px-3 py-3 text-xs font-black ${
                feedback?.rating === rating.value ? "bg-ink text-white" : "bg-white/75 text-ink/65"
              }`}
            >
              {rating.label}
            </button>
          </form>
        ))}
      </div>
      {feedback ? <p className="mt-3 text-xs text-forest/65">Current rating: {feedback.rating.replace("_", " ")}</p> : null}
    </section>
  );
}
