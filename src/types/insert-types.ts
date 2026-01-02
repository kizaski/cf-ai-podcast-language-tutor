// // Not yet used.

// import type { Insert } from "./audio-types";

// export type InsertGenerationState = {
//   episodeId: string;

//   status:
//     | "idle"
//     | "waiting_for_transcript"
//     | "generating"
//     | "complete"
//     | "error";

//   currentChunkIndex: number;
//   totalChunks: number;

//   processedChunkIds: string[]; // or hashes

//   startedAt: number;
//   lastUpdatedAt: number;
// };

// export type TranscriptCheckpoint = {
//   transcriptStatus: "pending" | "complete" | "error";
//   transcriptVersion?: string;
// };

// export type InFlightInsert = {
//   insertId: string;
//   chunkIndex: number;
//   insert: Insert;
// };
