import { useState } from "react";

export function useTextareaAutoResize() {
  const [height, setHeight] = useState("auto");

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
    setHeight(`${e.target.scrollHeight}px`);
  };

  const reset = () => setHeight("auto");

  return { height, onChange, reset };
}
