// // Not yet used.

type LearnerProfile = {
  nativeLanguage: string;
  targetLanguage: string;
  estimatedLevel: null | "A1" | "A2" | "B1" | "B2" | "C1";
  explanationPreference: "simple" | "detailed";
  comprehensionSignals: {
    confusedCount: number;
    replayCount: number;
  };
};
