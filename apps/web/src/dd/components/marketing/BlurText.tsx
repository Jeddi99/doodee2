"use client";

import { m as motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const blurIn = {
  opacity: 0,
  y: 10,
};

const visible = {
  opacity: 1,
  y: 0,
};

export function BlurText({
  text,
  className = "",
  wordClassName = "",
  delay = 0,
  step = 0.045,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  step?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);
  const shouldReduce = useReducedMotion() === true;
  const words = useMemo(() => text.trim().split(/\s+/), [text]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (shouldReduce || !("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }

    setArmed(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldReduce]);

  const animateTo = !armed || shown ? visible : blurIn;
  const prepareAnimation = armed && !shown && !shouldReduce;

  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          aria-hidden="true"
          className={`inline-block ${prepareAnimation ? "will-change-[opacity,transform]" : ""} ${wordClassName}`}
          initial={false}
          animate={animateTo}
          transition={{
            duration: shouldReduce ? 0 : 0.58,
            delay: shouldReduce ? 0 : delay + index * step,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {word}
          {index < words.length - 1 ? "\u00a0" : ""}
        </motion.span>
      ))}
    </span>
  );
}
