import { describe, it, expect, vi, beforeEach } from "vitest";

const {
	mockAIRun,
	mockR2Get,
	mockR2Put,
} = vi.hoisted(() => ({
	mockAIRun: vi.fn<(...args: any[]) => Promise<any>>(),
	mockR2Get: vi.fn<(...args: any[]) => Promise<any>>(),
	mockR2Put: vi.fn<(...args: any[]) => Promise<any>>(),
}));

vi.mock("cloudflare:workers", () => ({
	env: {
		AI: { run: mockAIRun },
		R2_AUDIO_BUCKET: { get: mockR2Get, put: mockR2Put },
		Transcriber: {} as any,
		Chat: {} as any,
		ASSETS: {} as any,
		VITE_SAMPLE_EP_1_ID: "ep1",
		VITE_SAMPLE_EP_1_TITLE: "Episode 1",
		VITE_SAMPLE_EP_2_ID: "ep2",
		VITE_SAMPLE_EP_2_TITLE: "Episode 2",
		VITE_SAMPLE_EP_3_ID: "ep3",
		VITE_SAMPLE_EP_3_TITLE: "Episode 3",
	},
	RpcTarget: class {},
	EmailMessage: class {},
}));

vi.mock("agents", () => {
	return {
		Agent: class MockAgent {
			ctx: any;
			env: any;
			state: any = {};

			constructor(ctx: any, env: any) {
				this.ctx = ctx;
				this.env = env;
				Object.defineProperty(this, "sql", {
					get() {
						return this.ctx.storage.sql;
					},
					configurable: true,
				});
			}

			setState(s: any) {
				Object.assign(this.state, s);
			}
		},
	};
});

vi.mock("@/utils", async (importOriginal) => {
	const actual = await importOriginal<
		typeof import("@/utils")
	>();
	return {
		...actual,
		setupDatabase: vi.fn(),
		base64ToArrayBuffer: vi.fn(),
		getAudioDuration: vi.fn(),
	};
});

import type {
	Phrase,
	TranscriptSegment,
	Insert,
	Word,
} from "../src/types/audio-types";
import { Transcriber } from "../src/worker/agents/transcriber";
import * as utils from "@/utils";

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

function createMockSqlStorage(returnData: unknown[] = []) {
	const execMock = vi.fn();
	const queryMock = vi.fn().mockReturnValue(returnData);
	const sql: any = Object.assign(queryMock, { exec: execMock });
	return { sql, execMock, queryMock };
}

function createMockConnection(url?: string) {
	const listeners: Record<string, Function[]> = {};
	return {
		url,
		send: vi.fn(),
		close: vi.fn(),
		addEventListener: vi.fn((event: string, fn: Function) => {
			(listeners[event] ??= []).push(fn);
		}),
		_trigger(event: string) {
			(listeners[event] || []).forEach((fn) => fn());
		},
	};
}

function createTranscriber(returnData: unknown[] = []) {
	vi.spyOn(crypto, "randomUUID").mockReturnValue(FAKE_UUID);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});

	const { sql, execMock, queryMock } =
		createMockSqlStorage(returnData);

	const mockDOState = {
		storage: { sql },
		blockConcurrencyWhile: vi.fn(),
		waitUntil: vi.fn(),
		id: { toString: () => "test-id" },
	};

	const mockEnv = {
		AI: { run: mockAIRun },
		R2_AUDIO_BUCKET: { get: mockR2Get, put: mockR2Put },
		Transcriber: {},
		Chat: {},
		ASSETS: {} as any,
		VITE_SAMPLE_EP_1_ID: "ep1",
		VITE_SAMPLE_EP_1_TITLE: "Episode 1",
		VITE_SAMPLE_EP_2_ID: "ep2",
		VITE_SAMPLE_EP_2_TITLE: "Episode 2",
		VITE_SAMPLE_EP_3_ID: "ep3",
		VITE_SAMPLE_EP_3_TITLE: "Episode 3",
	};

	const transcriber = new Transcriber(mockDOState as any, mockEnv as any);

	return {
		transcriber,
		sql,
		execMock,
		queryMock,
		mockDOState,
		mockEnv,
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

const phrase: Phrase = {
	id: "p_1000_2000",
	text: "Hello world.",
	start: 10,
	end: 20,
	wordCount: 2,
	words: [
		{ word: "Hello", start: 10, end: 11 },
		{ word: "world.", start: 11, end: 20 },
	],
};

const segment: TranscriptSegment = {
	id: "seg-1",
	startTime: 10,
	endTime: 20,
	text: "Hello world.",
	speaker: "",
};

const insertFixture: Insert = {
	id: "insert-1",
	type: "primer_intro",
	title: "Introduction",
	audioUrl: "audio-key.mp3",
	duration: 5,
	startTime: 0,
	endTime: 5,
	text: "This is an intro",
	enabled: true,
	metadata: {},
};

describe("Transcriber", () => {
	describe("constructor", () => {
		it("calls setupDatabase on ctx.storage.sql", () => {
			const setupDbMock = utils.setupDatabase as any;
			const { mockDOState } = createTranscriber();

			expect(setupDbMock).toHaveBeenCalledWith(
				mockDOState.storage.sql,
			);
		});

		it("initializes activeInsertTasks and connections as empty Sets", () => {
			const { transcriber } = createTranscriber();

			expect(
				(transcriber as any).activeInsertTasks,
			).toBeInstanceOf(Set);
			expect((transcriber as any).activeInsertTasks.size).toBe(0);
			expect((transcriber as any).connections).toBeInstanceOf(Set);
			expect((transcriber as any).connections.size).toBe(0);
		});
	});

	describe("mapPhraseToSegment", () => {
		it("maps a Phrase to a TranscriptSegment", () => {
			const { transcriber } = createTranscriber();

			const result = (transcriber as any).mapPhraseToSegment(phrase);

			expect(result).toEqual({
				text: "Hello world.",
				startTime: 10,
				endTime: 20,
				id: "p_1000_2000",
				speaker: "",
			});
		});

		it("always sets speaker to empty string", () => {
			const { transcriber } = createTranscriber();

			const result = (transcriber as any).mapPhraseToSegment({
				...phrase,
				text: "Testing 123.",
			});

			expect(result.speaker).toBe("");
		});
	});

	describe("broadcastMsg", () => {
		it("sends JSON-stringified message to all connections", () => {
			const { transcriber } = createTranscriber();
			const conn1 = createMockConnection();
			const conn2 = createMockConnection();

			(transcriber as any).connections.add(conn1);
			(transcriber as any).connections.add(conn2);

			(transcriber as any).broadcastMsg({ type: "test", data: 42 });

			expect(conn1.send).toHaveBeenCalledWith(
				'{"type":"test","data":42}',
			);
			expect(conn2.send).toHaveBeenCalledWith(
				'{"type":"test","data":42}',
			);
		});

		it("removes a connection that throws on send", () => {
			const { transcriber } = createTranscriber();
			const goodConn = createMockConnection();
			const badConn = createMockConnection();
			(badConn.send as any).mockImplementation(() => {
				throw new Error("send failed");
			});

			(transcriber as any).connections.add(goodConn);
			(transcriber as any).connections.add(badConn);

			(transcriber as any).broadcastMsg({ type: "test" });

			expect(
				(transcriber as any).connections.has(badConn),
			).toBe(false);
			expect(
				(transcriber as any).connections.has(goodConn),
			).toBe(true);
		});

		it("handles empty connections set without throwing", () => {
			const { transcriber } = createTranscriber();

			expect(() => {
				(transcriber as any).broadcastMsg({ type: "test" });
			}).not.toThrow();
		});
	});

	describe("sendError", () => {
		it("broadcasts error with type, message, and details", () => {
			const { transcriber } = createTranscriber();
			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			(transcriber as any).sendError(
				conn,
				"Something broke",
				"details",
			);

			const call = JSON.parse(conn.send.mock.calls[0][0]);
			expect(call.type).toBe("error");
			expect(call.message).toBe("Something broke");
			expect(call.details).toBe("details");
		});

		it("broadcasts error without details when not provided", () => {
			const { transcriber } = createTranscriber();
			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			(transcriber as any).sendError(conn, "Something broke");

			const call = JSON.parse(conn.send.mock.calls[0][0]);
			expect(call.message).toBe("Something broke");
			expect(call.details).toBeUndefined();
		});
	});

	describe("getCachedInserts", () => {
		it("returns empty array when no inserts cached", () => {
			const { transcriber } = createTranscriber([]);

			const chunk: TranscriptSegment = {
				id: "chunk-1",
				startTime: 10,
				endTime: 20,
				text: "test text",
				speaker: "",
			};

			const result = (transcriber as any).getCachedInserts(
				"audio-123",
				chunk,
			);

			expect(result).toEqual([]);
		});

		it("returns cached inserts when found", () => {
			const cachedInserts = [insertFixture];
			const { transcriber } = createTranscriber(cachedInserts);

			const chunk: TranscriptSegment = {
				id: "chunk-1",
				startTime: 10,
				endTime: 20,
				text: "test text",
				speaker: "",
			};

			const result = (transcriber as any).getCachedInserts(
				"audio-123",
				chunk,
			);

			expect(result).toEqual(cachedInserts);
		});
	});

	describe("saveSegment", () => {
		it("inserts a segment with a unique id into the DB", () => {
			const { transcriber, execMock } = createTranscriber();

			(transcriber as any).saveSegment("audio-123", segment);

			expect(execMock).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO segments"),
				expect.stringContaining(`${segment.id}_${FAKE_UUID}`),
				"audio-123",
				segment.text,
				segment.startTime,
				segment.endTime,
				segment.speaker,
			);
		});

		it("does not throw on DB insert error", () => {
			const { transcriber, execMock } = createTranscriber();
			execMock.mockImplementation(() => {
				throw new Error("DB error");
			});

			expect(() => {
				(transcriber as any).saveSegment("audio-123", segment);
			}).not.toThrow();
		});
	});

	describe("streamCachedData", () => {
		it("sends all segments to the connection in order", () => {
			const segments = [
				{ ...segment, id: "seg-1", text: "First segment." },
				{ ...segment, id: "seg-2", text: "Second segment." },
			];
			const { transcriber, queryMock } = createTranscriber();

			queryMock
				.mockReturnValueOnce(segments)
				.mockReturnValueOnce([]);

			const conn = createMockConnection();

			(transcriber as any).streamCachedData(conn, "audio-123");

			const firstCall = JSON.parse(conn.send.mock.calls[0][0]);
			expect(firstCall.type).toBe("transcript");
			expect(firstCall.transcript.text).toBe("First segment.");

			const secondCall = JSON.parse(conn.send.mock.calls[1][0]);
			expect(secondCall.type).toBe("transcript");
			expect(secondCall.transcript.text).toBe("Second segment.");
		});

		it("sends inserts followed by insert-complete", () => {
			const inserts = [insertFixture];
			const { transcriber, queryMock } = createTranscriber();

			queryMock
				.mockReturnValueOnce([])
				.mockReturnValueOnce(inserts);

			const conn = createMockConnection();

			(transcriber as any).streamCachedData(conn, "audio-123");

			const insertCall = conn.send.mock.calls.find(
				([msg]: [string]) => msg.includes('"type":"insert"'),
			);
			expect(insertCall).toBeDefined();

			expect(JSON.parse(insertCall![0]).insert).toEqual(
				insertFixture,
			);

			const lastMsg = JSON.parse(
				conn.send.mock.calls[conn.send.mock.calls.length - 1][0],
			);
			expect(lastMsg.type).toBe("insert-complete");
		});

		it("sends only insert-complete when no segments or inserts", () => {
			const { transcriber, queryMock } = createTranscriber();
			queryMock.mockReturnValue([]);

			const conn = createMockConnection();

			(transcriber as any).streamCachedData(conn, "audio-123");

			expect(conn.send).toHaveBeenCalledTimes(1);
			expect(JSON.parse(conn.send.mock.calls[0][0]).type).toBe(
				"insert-complete",
			);
		});
	});

	describe("onConnect", () => {
		it("closes connection with 1008 when audioKey is missing from URL", () => {
			const { transcriber } = createTranscriber();
			const conn = createMockConnection(
				"ws://localhost/?other=param",
			);

			(transcriber as any).onConnect(conn, { request: null });

			expect(conn.close).toHaveBeenCalledWith(
				1008,
				"audioKey required",
			);
		});

		it("closes connection with 1008 when no URL is provided", () => {
			const { transcriber } = createTranscriber();
			const conn = createMockConnection("http://localhost/");

			(transcriber as any).onConnect(conn, { request: null });

			expect(conn.close).toHaveBeenCalledWith(
				1008,
				"audioKey required",
			);
		});

		it("sets state and broadcasts connected when audioKey is present", () => {
			const { transcriber, queryMock } = createTranscriber();
			queryMock.mockReturnValue([]);

			const conn = createMockConnection(
				"ws://localhost/?audioKey=audio-123",
			);
			(transcriber as any).connections.add(conn);

			(transcriber as any).onConnect(conn, { request: null });

			expect((transcriber as any).state.audioKey).toBe("audio-123");
			expect(conn.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"connected"'),
			);
			expect(conn.close).not.toHaveBeenCalled();
		});

		it("adds connection to the connections set", () => {
			const { transcriber, queryMock } = createTranscriber();
			queryMock.mockReturnValue([]);

			const conn = createMockConnection(
				"ws://localhost/?audioKey=audio-123",
			);

			(transcriber as any).onConnect(conn, { request: null });

			expect(
				(transcriber as any).connections.has(conn),
			).toBe(true);
		});

		it("removes connection from set on close event", () => {
			const { transcriber, queryMock } = createTranscriber();
			queryMock.mockReturnValue([]);

			const conn = createMockConnection(
				"ws://localhost/?audioKey=audio-123",
			);

			(transcriber as any).onConnect(conn, { request: null });
			expect(
				(transcriber as any).connections.has(conn),
			).toBe(true);

			conn._trigger("close");
			expect(
				(transcriber as any).connections.has(conn),
			).toBe(false);
		});

		it("removes connection from set on error event", () => {
			const { transcriber, queryMock } = createTranscriber();
			queryMock.mockReturnValue([]);

			const conn = createMockConnection(
				"ws://localhost/?audioKey=audio-123",
			);

			(transcriber as any).onConnect(conn, { request: null });
			expect(
				(transcriber as any).connections.has(conn),
			).toBe(true);

			conn._trigger("error");
			expect(
				(transcriber as any).connections.has(conn),
			).toBe(false);
		});
	});

	describe("maybeRunPipeline", () => {
		it("streams cached data when transcript status is 'complete'", () => {
			const { transcriber, queryMock } = createTranscriber();

			queryMock.mockReturnValueOnce([
				{ status: "complete" },
			]);
			queryMock.mockReturnValue([]);

			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			(transcriber as any).maybeRunPipeline(conn, "audio-123");

			expect(conn.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"insert-complete"'),
			);
		});

		it("streams cached data when transcript status is 'in_progress'", () => {
			const { transcriber, queryMock } = createTranscriber();

			queryMock.mockReturnValueOnce([
				{ status: "in_progress" },
			]);
			queryMock.mockReturnValue([]);

			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			(transcriber as any).maybeRunPipeline(conn, "audio-123");

			expect(conn.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"insert-complete"'),
			);
		});

		it("inserts in_progress status and starts pipeline when no status row exists", () => {
			const { transcriber, execMock } = createTranscriber([]);

			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			(transcriber as any).maybeRunPipeline(conn, "audio-123");

			expect(execMock).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO transcripts"),
				"audio-123",
			);
		});

		it("handles query error gracefully by starting new pipeline", () => {
			const { transcriber, queryMock, execMock } = createTranscriber();
			queryMock.mockImplementation(() => {
				throw new Error("DB read error");
			});

			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			(transcriber as any).maybeRunPipeline(conn, "audio-123");

			expect(execMock).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO transcripts"),
				"audio-123",
			);
		});
	});

	describe("getTranscriptWindowText", () => {
		it("returns fallback when audioKey is not set", async () => {
			const { transcriber } = createTranscriber();

			const result = await (transcriber as any).getTranscriptWindowText(
				10,
			);

			expect(result).toBe("No transcript available.");
		});

		it("returns fallback for negative targetTime", async () => {
			const { transcriber } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			const result = await (transcriber as any).getTranscriptWindowText(
				-1,
			);

			expect(result).toBe("No transcript available.");
		});

		it("returns fallback when no segments found in window", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";
			execMock.mockReturnValue({ toArray: () => [] });

			const result = await (transcriber as any).getTranscriptWindowText(
				30,
			);

			expect(result).toBe("No transcript available.");
		});

		it("queries segments within the computed time window", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			execMock.mockReturnValue({
				toArray: () => [
					{ text: "Hello", startTime: 25 },
					{ text: "World", startTime: 30 },
				],
			});

			await (transcriber as any).getTranscriptWindowText(30, 10);

			expect(execMock).toHaveBeenCalledWith(
				expect.stringContaining("WHERE audioKey = ?"),
				"audio-123",
				20,
				40,
			);
		});

		it("formats segments as '[timestamp]: text' lines", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			execMock.mockReturnValue({
				toArray: () => [
					{ text: "Hello there", startTime: 25.123 },
					{ text: "World", startTime: 30.0 },
				],
			});

			const result = await (transcriber as any).getTranscriptWindowText(
				30,
				10,
			);

			expect(result).toBe("[25.1s]: Hello there\n[30.0s]: World");
		});

		it("uses default window of 10 seconds", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";
			execMock.mockReturnValue({
				toArray: () => [{ text: "Test", startTime: 10 }],
			});

			await (transcriber as any).getTranscriptWindowText(20);

			expect(execMock).toHaveBeenCalledWith(
				expect.anything(),
				"audio-123",
				10,
				30,
			);
		});
	});

	describe("transcribe", () => {
		it("yields transcription results for audio chunks", async () => {
			const { transcriber } = createTranscriber();

			const mockObject = {
				arrayBuffer: vi
					.fn()
					.mockResolvedValue(new ArrayBuffer(100)),
			};
			mockR2Get.mockResolvedValue(mockObject);

			const mockResult = { text: "Hello world" };
			mockAIRun.mockResolvedValue(mockResult);

			const generator = (transcriber as any).transcribe("audio-123");
			const results: any[] = [];

			for await (const r of generator) {
				results.push(r);
			}

			expect(results.length).toBe(1);
			expect(results[0]).toBeDefined();
		});

		it("yields error objects when chunk transcription fails", async () => {
			const { transcriber } = createTranscriber();

			const mockObject = {
				arrayBuffer: vi
					.fn()
					.mockResolvedValue(new ArrayBuffer(100)),
			};
			mockR2Get.mockResolvedValue(mockObject);

			mockAIRun.mockRejectedValue(new Error("AI failure"));

			const generator = (transcriber as any).transcribe("audio-123");
			const results: any[] = [];

			for await (const r of generator) {
				results.push(r);
			}

			expect(results.length).toBe(1);
			expect(results[0]).toEqual({ error: expect.any(Error) });
		});

		it("throws when audio is not found in R2", async () => {
			const { transcriber } = createTranscriber();
			mockR2Get.mockResolvedValue(null);

			const generator = (transcriber as any).transcribe("audio-123");

			await expect(async () => {
				for await (const _ of generator) {
					/* iterate */
				}
			}).rejects.toThrow("Audio not found in R2");
		});
	});

	describe("transcribeChunk", () => {
		it("returns placeholder for empty audio buffer", async () => {
			const { transcriber } = createTranscriber();

			const result = await (transcriber as any).transcribeChunk(
				new ArrayBuffer(0),
			);

			expect(result).toEqual({ text: "[Empty chunk]" });
		});

		it("calls env.AI.run with whisper model and transcribe task", async () => {
			const { transcriber } = createTranscriber();

			const buffer = new Uint8Array([1, 2, 3]).buffer;
			mockAIRun.mockResolvedValue({
				text: "transcribed text",
			});

			const result = await (transcriber as any).transcribeChunk(
				buffer,
			);

			expect(mockAIRun).toHaveBeenCalledWith(
				"@cf/openai/whisper",
				expect.objectContaining({
					task: "transcribe",
				}),
			);
			expect(result).toEqual({ text: "transcribed text" });
		});
	});

	describe("getAudioChunks", () => {
		it("throws when audio not found in R2", async () => {
			const { transcriber } = createTranscriber();
			mockR2Get.mockResolvedValue(null);

			await expect(
				(transcriber as any).getAudioChunks("missing-key"),
			).rejects.toThrow("Audio not found in R2");
		});

		it("splits audio into 1MB chunks", async () => {
			const { transcriber } = createTranscriber();

			const audioSize = 2.5 * 1024 * 1024;
			const arrayBuffer = new ArrayBuffer(audioSize);
			mockR2Get.mockResolvedValue({
				arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
			});

			const { chunks } = await (transcriber as any).getAudioChunks(
				"audio-123",
			);

			expect(chunks.length).toBe(3);
			expect(chunks[0].byteLength).toBe(1024 * 1024);
			expect(chunks[1].byteLength).toBe(1024 * 1024);
			expect(chunks[2].byteLength).toBe(0.5 * 1024 * 1024);
		});

		it("returns single chunk for audio smaller than 1MB", async () => {
			const { transcriber } = createTranscriber();

			const audioSize = 512 * 1024;
			const arrayBuffer = new ArrayBuffer(audioSize);
			mockR2Get.mockResolvedValue({
				arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
			});

			const { chunks } = await (transcriber as any).getAudioChunks(
				"audio-123",
			);

			expect(chunks.length).toBe(1);
			expect(chunks[0].byteLength).toBe(audioSize);
		});
	});

		it("splits audio into 1MB chunks", async () => {
			const { transcriber } = createTranscriber();

			const audioSize = 2.5 * 1024 * 1024;
			const arrayBuffer = new ArrayBuffer(audioSize);
			mockR2Get.mockResolvedValue({
				arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
			});

			const { chunks } = await (transcriber as any).getAudioChunks(
				"audio-123",
			);

			expect(chunks.length).toBe(3);
			expect(chunks[0].byteLength).toBe(1024 * 1024);
			expect(chunks[1].byteLength).toBe(1024 * 1024);
			expect(chunks[2].byteLength).toBe(0.5 * 1024 * 1024);
		});

		it("returns single chunk for audio smaller than 1MB", async () => {
			const { transcriber } = createTranscriber();

			const audioSize = 512 * 1024;
			const arrayBuffer = new ArrayBuffer(audioSize);
			mockR2Get.mockResolvedValue({
				arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
			});

			const { chunks } = await (transcriber as any).getAudioChunks(
				"audio-123",
			);

			expect(chunks.length).toBe(1);
			expect(chunks[0].byteLength).toBe(audioSize);
		});
	describe("Timestamp accuracy and alignment (golden fixtures)", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		const chunk1Words: Word[] = [
			{ word: "Hello", start: 0.5, end: 1.0 },
			{ word: "world.", start: 1.2, end: 1.8 },
			{ word: "This", start: 2.7, end: 3.1 },
			{ word: "is", start: 3.2, end: 3.5 },
			{ word: "chunk.", start: 3.6, end: 4.1 },
		];

		const chunk2Words: Word[] = [
			{ word: "Now", start: 0.3, end: 0.7 },
			{ word: "listen.", start: 0.9, end: 1.4 },
			{ word: "More", start: 2.2, end: 2.6 },
			{ word: "content.", start: 2.8, end: 3.4 },
		];

		const expectedPhrases: {
			text: string;
			start: number;
			end: number;
		}[] = [
			{ text: "Hello world.", start: 0.5, end: 1.8 },
			{ text: "This is chunk.", start: 2.7, end: 4.1 },
			{ text: "Now listen.", start: 30.3, end: 31.4 },
			{ text: "More content.", start: 32.2, end: 33.4 },
		];

		function expectSegment(
			seg: TranscriptSegment,
			idx: number,
		) {
			expect(seg.text).toBe(expectedPhrases[idx].text);
			expect(seg.startTime).toBeCloseTo(
				expectedPhrases[idx].start,
				2,
			);
			expect(seg.endTime).toBeCloseTo(
				expectedPhrases[idx].end,
				2,
			);
			expect(seg.speaker).toBe("");
		}

		it("accumulates timeOffset correctly across chunks", async () => {
			const { transcriber } = createTranscriber();

			vi.spyOn(transcriber as any, "getAudioChunks").mockResolvedValue({
				chunks: [new ArrayBuffer(100), new ArrayBuffer(100)],
				totalDuration: 60,
			});

			mockAIRun
				.mockResolvedValueOnce({ words: chunk1Words })
				.mockResolvedValueOnce({ words: chunk2Words });

			const results: any[] = [];
			for await (const r of (transcriber as any).transcribe(
				"audio-123",
			)) {
				results.push(r);
			}

			expect(results).toHaveLength(2);

			const r1Words: Word[] = results[0].words;
			expect(r1Words[0].start).toBeCloseTo(0.5, 2);
			expect(r1Words[r1Words.length - 1].end).toBeCloseTo(
				4.1,
				2,
			);

			const r2Words: Word[] = results[1].words;
			expect(r2Words[0].start).toBeCloseTo(30.3, 2);
			expect(r2Words[2].start).toBeCloseTo(32.2, 2);
			expect(r2Words[r2Words.length - 1].end).toBeCloseTo(
				33.4,
				2,
			);
		});

		it("skips bad words but position-based offset stays correct", async () => {
			const { transcriber } = createTranscriber();

			vi.spyOn(transcriber as any, "getAudioChunks").mockResolvedValue({
				chunks: [new ArrayBuffer(100), new ArrayBuffer(100)],
				totalDuration: 60,
			});

			mockAIRun
				.mockResolvedValueOnce({
					words: [
						{ start: 0.1, end: 0.3 },
						{ word: "valid.", start: 0.5, end: 1.0 },
					],
				})
				.mockResolvedValueOnce({
					words: [
						{ word: "next.", start: 0.2, end: 0.8 },
					],
				});

			const results: any[] = [];
			for await (const r of (transcriber as any).transcribe(
				"audio-123",
			)) {
				results.push(r);
			}

			expect(results[0].words).toHaveLength(1);
			expect(results[0].words[0].end).toBeCloseTo(1.0, 2);

			expect(results[1].words[0].start).toBeCloseTo(30.2, 2);
			expect(results[1].words[0].end).toBeCloseTo(30.8, 2);
		});

		it("produces segments with correct timestamps through the full pipeline", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			vi.spyOn(transcriber as any, "getAudioChunks").mockResolvedValue({
				chunks: [new ArrayBuffer(100), new ArrayBuffer(100)],
				totalDuration: 60,
			});

			mockAIRun
				.mockResolvedValueOnce({ words: chunk1Words })
				.mockResolvedValueOnce({ words: chunk2Words });

			await (transcriber as any).processNewTranscription(
				conn,
				"audio-123",
			);

			const calls = execMock.mock.calls.filter((c: any[]) =>
				c[0].includes("INSERT INTO segments"),
			);
			expect(calls).toHaveLength(4);

			for (let i = 0; i < 4; i++) {
				expect(calls[i][3]).toBe(expectedPhrases[i].text);
				expect(calls[i][4]).toBeCloseTo(
					expectedPhrases[i].start,
					2,
				);
				expect(calls[i][5]).toBeCloseTo(
					expectedPhrases[i].end,
					2,
				);
			}
		});

		it("broadcasts transcript messages with correct timestamps", async () => {
			const { transcriber } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			const conn = createMockConnection();
			(transcriber as any).connections.add(conn);

			vi.spyOn(transcriber as any, "getAudioChunks").mockResolvedValue({
				chunks: [new ArrayBuffer(100), new ArrayBuffer(100)],
				totalDuration: 60,
			});

			mockAIRun
				.mockResolvedValueOnce({ words: chunk1Words })
				.mockResolvedValueOnce({ words: chunk2Words });

			await (transcriber as any).processNewTranscription(
				conn,
				"audio-123",
			);

			const transcriptMsgs = conn.send.mock.calls
				.map((c: any) => JSON.parse(c[0]))
				.filter((m: any) => m.type === "transcript");

			expect(transcriptMsgs).toHaveLength(4);

			for (let i = 0; i < 4; i++) {
				expectSegment(transcriptMsgs[i].transcript, i);
			}
		});

		it("streamCachedData returns segments ordered by startTime ASC", async () => {
			const { transcriber, queryMock } = createTranscriber();

			const savedSegments: TranscriptSegment[] = [
				{
					id: "s0",
					text: expectedPhrases[0].text,
					startTime: expectedPhrases[0].start,
					endTime: expectedPhrases[0].end,
					speaker: "",
				},
				{
					id: "s1",
					text: expectedPhrases[1].text,
					startTime: expectedPhrases[1].start,
					endTime: expectedPhrases[1].end,
					speaker: "",
				},
				{
					id: "s2",
					text: expectedPhrases[2].text,
					startTime: expectedPhrases[2].start,
					endTime: expectedPhrases[2].end,
					speaker: "",
				},
				{
					id: "s3",
					text: expectedPhrases[3].text,
					startTime: expectedPhrases[3].start,
					endTime: expectedPhrases[3].end,
					speaker: "",
				},
			];

			queryMock
				.mockReturnValueOnce(savedSegments)
				.mockReturnValueOnce([]);

			const conn = createMockConnection();

			(transcriber as any).streamCachedData(conn, "audio-123");

			const transcriptMsgs = conn.send.mock.calls
				.map((c: any) => JSON.parse(c[0]))
				.filter((m: any) => m.type === "transcript");

			expect(transcriptMsgs).toHaveLength(4);
			expect(transcriptMsgs[0].transcript.id).toBe("s0");
			expect(transcriptMsgs[1].transcript.id).toBe("s1");
			expect(transcriptMsgs[2].transcript.id).toBe("s2");
			expect(transcriptMsgs[3].transcript.id).toBe("s3");
		});

		it("getTranscriptWindowText queries the correct time window boundaries", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			execMock.mockReturnValue({
				toArray: () => [],
			});

			await (transcriber as any).getTranscriptWindowText(2, 1);

			expect(execMock).toHaveBeenCalledWith(
				expect.stringContaining("WHERE audioKey = ?"),
				"audio-123",
				1,
				3,
			);
		});

		it("getTranscriptWindowText formats segments with correct timestamps", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			execMock.mockReturnValue({
				toArray: () => [
					{ text: expectedPhrases[0].text, startTime: expectedPhrases[0].start },
					{ text: expectedPhrases[1].text, startTime: expectedPhrases[1].start },
				],
			});

			const result = await (transcriber as any).getTranscriptWindowText(3, 5);

			expect(result).toBe(
				`[${expectedPhrases[0].start.toFixed(1)}s]: ${expectedPhrases[0].text}\n` +
				`[${expectedPhrases[1].start.toFixed(1)}s]: ${expectedPhrases[1].text}`,
			);
		});

		it("window query with negative start is handled", async () => {
			const { transcriber, execMock } = createTranscriber();
			(transcriber as any).state.audioKey = "audio-123";

			execMock.mockReturnValue({
				toArray: () => [
					{ text: expectedPhrases[0].text, startTime: expectedPhrases[0].start },
				],
			});

			await (transcriber as any).getTranscriptWindowText(1, 2);

			expect(execMock).toHaveBeenCalledWith(
				expect.anything(),
				"audio-123",
				-1,
				3,
			);
		});

		it("filtering skips bad words; position-based offset is unaffected", async () => {
			const { transcriber } = createTranscriber();

			vi.spyOn(transcriber as any, "getAudioChunks").mockResolvedValue({
				chunks: [new ArrayBuffer(100), new ArrayBuffer(100)],
				totalDuration: 60,
			});

			mockAIRun
				.mockResolvedValueOnce({
					words: [
						{ word: "good1.", start: 0.5, end: 1.0 },
						{ start: 1.1, end: 1.5 },
						{ word: "good2.", start: 1.7, end: 2.2 },
					],
				})
				.mockResolvedValueOnce({
					words: [
						{ word: "next.", start: 0.3, end: 0.9 },
					],
				});

			const results: any[] = [];
			for await (const r of (transcriber as any).transcribe(
				"audio-123",
			)) {
				results.push(r);
			}

			expect(results[0].words).toHaveLength(2);
			expect(results[0].words[1].end).toBeCloseTo(2.2, 2);

			expect(results[1].words[0].start).toBeCloseTo(30.3, 2);
			expect(results[1].words[0].end).toBeCloseTo(30.9, 2);
		});
	});
});
