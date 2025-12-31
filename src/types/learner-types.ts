// // Not yet used.

// type LearnerModel = {
//   speedSensitivity: "low" | "medium" | "high";
//   interruptionRate: number; // rolling average
//   commonConfusionTriggers: Array<
//     "fast_speech" | "dense_ideas" | "idioms" | "multi_speaker"
//   >;
// };

// export interface LearnerState {
//   learnerId: string;

//   profile: LearnerProfile;

//   //   listening: ListeningState;
//   //   vocabulary: VocabularyState;
//   //   grammar: GrammarState;
//   //   pronunciation: PronunciationState;

//   //   preferences: InteractionPreferences;

//   //   affect: AffectState;

//   //   history: SessionHistory;

//   //   meta: LearnerMeta;
// }

// export interface LearnerProfile {
//   targetLanguage: string;

//   estimatedLevel: CEFRLevel; // "A2" | "B1" | "B2" | ...

//   availability: {
//     typicalSessionMinutes: number;
//     context: "bed" | "commute" | "desk" | "mixed";
//   };
// }

// export interface LearningGoal {}

// export enum CEFRLevel {
//   A1,
//   A2,
//   B1,
//   B2,
//   C1
// }
