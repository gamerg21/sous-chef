"use client";

import { useId, useState } from "react";
import styles from "./landing.module.css";

export function FaqAccordion({
  questions,
}: {
  questions: ReadonlyArray<{ question: string; answer: string }>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const id = useId();

  return (
    <div className={styles.questions}>
      {questions.map(({ question, answer }, index) => {
        const open = openIndex === index;
        const triggerId = `${id}-question-${index}`;
        const panelId = `${id}-answer-${index}`;

        return (
          <div className={styles.faqItem} key={question}>
            <h3 className={styles.faqQuestion}>
              <button
                id={triggerId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                {question}
                <span aria-hidden="true">+</span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              aria-hidden={!open}
              inert={!open}
              data-open={open}
              className={styles.faqAnswer}
            >
              <div className={styles.faqAnswerInner}>
                <p>{answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
