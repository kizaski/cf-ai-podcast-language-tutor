import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(input: Date | number): string {
  if (input instanceof Date) {
    return input.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    const mins = Math.floor(input / 60);
    const secs = Math.floor(input % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}

export const getInsertColor = (type: string): string => {
  const colors: Record<string, string> = {
    primer_intro: "#3b82f6", // blue
    primer_outro: "#8b5cf6", // purple
    ad: "#10b981", // green
    transition: "#f59e0b" // amber
  };
  return colors[type] || "#6b7280"; // default gray
};
