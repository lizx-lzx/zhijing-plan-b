/* eslint-disable @next/next/no-img-element */
import { ArrowRight } from "lucide-react";
import StaggeredText from "./react-bits/staggered-text";
import { base } from "./learning-ui";

export function Welcome({
  onStart,
  onContinue,
  returning = false,
}: {
  onStart: () => void;
  onContinue?: () => void;
  returning?: boolean;
}) {
  return (
    <main className="z-container z-welcome-visual">
      <section className="z-welcome-intro">
        <div className="z-welcome-copy">
          <StaggeredText
            as="h1"
            text={"给好奇心，\n留一个小角落。"}
            segmentBy="lines"
            blur={false}
            delay={140}
            duration={0.65}
            easing={[0.22, 1, 0.36, 1]}
            from={{ opacity: 1, y: 20 }}
            to={{ opacity: 1, y: 0 }}
            respectReducedMotion
          />
          <p>把一篇长文，变成你愿意读下去的样子。</p>
          <button
            className="button button-primary button-large"
            onClick={onStart}
          >
            找到我的学法 <ArrowRight size={18} />
          </button>
          <span className="z-welcome-meta">8 题 · 约 2 分钟</span>
          {returning && onContinue && (
            <button
              className="z-text-link z-welcome-return"
              onClick={onContinue}
            >
              继续学习 <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="z-reading-nook" aria-hidden="true">
          <img
            src={`${base}/images/reading-nook-v1.webp`}
            width={1200}
            height={900}
            alt=""
            fetchPriority="high"
          />
        </div>
      </section>
    </main>
  );
}
