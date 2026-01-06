## Code Generation

### React / Frontend
- Give me a React component and hook for a playback element which highlights sections where another audio is inserted inside the main audio file
  - -> Edit to use Tailwind CSS
  - -> Make it TypeScript-ready
- Explain and give examples of callback: keyof this.
- How do I make the chat agent directly send data to the React frontend via WebSockets (separate from chat)?
- Make this more React-like: `code`
- How to add additional data (e.g., start and end playback positions of small audio in big audio) in KV?
- How can I send an audio base64 variable through an API?
- How to implement the button now which scrolls to current transcript line and also auto scroll
    - -> disable on scroll automatically and reenable on pressing now

### React Component Refactoring
- Separate this React code into hooks and components
- Edit layout to put both ChatHeader and all siblings next to the audio player
  - -> Center them but give more width to the audio player `tsx-html`
- Add actual audio playback with real audio inserts from the same mock state using the Web Audio API `html-file-js`
- Transform mock data usage in a React hook into real data using the provided AI chat agent or Cloudflare Worker
React code: `code`
Worker code: `code`
- Merge into `react-component-name` code: `react-comp-1` `react-comp-2`
- Make this use Cloudflare KV for transcript storage and retrieval as a cache
  - -> Never re-do Whisper transcript generation if there are valid values in KV `server-code`
- Move `sorted = [...inserts].sort((a,b)=>a.startTime-b.startTime)` into a `useRef`
  - -> Update `insertIndexRef.current` based on playback time
- Evaluate logic -> rewrite
- Make React hook from generated HTML `plain-js-html`
  - -> Update old hook to use new logic
  - -> Use multiple Howls for sprites and lazy load

### Audio Playback & Inserts
- How can I achieve my goal (play podcast -> insert plays at matched time -> stop podcast -> play insert -> resume podcast) if possible in the same playback timeline with howlerjs?
  - -> Make a single HTML file for a prototype (a full working HTML prototype using this approach with inputs from file browser for main audio and inserts at specified from input box times again from file browser)
  - -> Convert to React hook
  - -> Make TypeScript-ready
  - -> Migrate component to current Howler.js implementation
  - -> Fetch audio file from `endpoint`
- Scaffold an html which uses howlerjs as the engine
  - -> audio insert plays twice and doesnt resume the main audio (podcast) fix `plain-js-html`
  - -> give me the full fixed version based on those fixes: `llm-resp` of this `plain-js-html`
  - -> transfer this code to react hook which NEEDS to have this state and params `code` WITHOUT changing ANYTHING of the code I provided. code I provide: `plain-js-html`
  - ->`hook` FIX Error loading insert x Decoding audio data failed.
  - -> how does that react hook snippet differ to the js code
  - -> currently this hook works well. however, I must make it play inserts IN A QUEUE IF they are on the SAME TIME (e.g. 2 inserts at 1:28) hook code: `hook`
- Fix audio toggle/seeking issues `logs` `tsx-code`
- Change React hook to also handle additional data of current playback segments
- Migrate playback state to Zustand
  - -> Only need currentTranscriptSegments, isPlaying, currentTime
  - -> How can I extract these from the podcast hook and manage separately
- Implement loadLearnerModel with default values as starter (no updates or storage yet)

### Vercel AI SDK / Cloudflare Agents
- How to implement sessions (new session on each connect, no login/register) `code`
  - -> What is a better, more secure solution for separate users without unnecessary login complexity
- How do I implement this: "`llm-resp`" in a Vercel AI SDK tool
- In a Cloudflare Agents SDK agent, with Vercel AI SDK:
  - -> Can an agent call other agents from inside its Durable Object (onMessage or custom functions)?
  - -> Or should this only be done through tools?
- Add transcript parts from frontend to DO SQL DB `code`
- Rewrite function to use min words constant, all KV helpers, and complete any missing logic
Code to be rewritten: `code`
Code to use: `code`
- Refactor all KV operations with Durable Object’s SQL-backed storage
Agent: `code`
Utils: `code`
- Add logic here based on this VTT output. Make it account for the timestamps:
Code to be changed: `code`
Example VTT: `vtt`
- Execute tools in onMessage to get current playback time, then continue with other tools
Tool: `code`
onMessage: `code`
- My current code works well but it's polluting my user's message history so when they switch to another podcast or another line in the same podcast the old data is still referenced. How do I avoid that and fix my code?
- Add caching for inserts `code`
- Fix logic to run transcript generation and inserts generation in parallel `code`
  - -> Make it work with cached transcripts
  - -> Clean up logic for readability while streaming inserts and transcripts in parallel
- Change logic to work for an array of strings -> shouldCallTools
- Make code Vercel AI SDK-friendly with proper TypeScript types
  - -> Construct logical sentence structures from keywords
`export const toolKeywordRules: Record<string, string[]> = {
  answerRegardingThePlayback: ["tell me", "podcast status", "what is"]
};`
- Fix table `sqlite-table` and cache inserts
  - -> Fix issue of insertsQueue not updating
- Handle multiple inserts at same timestamp (queue)
- Fix Whisper transcription mid-way timestamp reset and cache conflicts
- Implement generateSamples for RPC function in API handler

## Architecture Questions / Prompts
- Extend app to be agentic: chat with LLM + podcast with primer sandwich
  - -> Goal: language learning (main audio in foreign language)
- Handle annotations/metadata from external system or LLM chat agent
- UI/UX decisions:
  - -> Hide audio player until user provides audio link/file
  - -> Or show input field in audio player side panel
- Model JSON data type for audio with inserted clips (primer intros/outros)
  - -> Adjust React component accordingly `tsx-html`
- Make agent decide insert timing without hardcoded windows
  - -> Stream data without waiting for full audio
- Podcast tutor AI agent:
  - -> Chat with LLM for last 60s content
  - -> Primer sandwich (intro/outro + main audio) in user’s native language
  - -> Tech: Vercel AI SDK v5 + Cloudflare Agents SDK
- Decide where insert streaming logic should reside: fetch function vs AI agent
  - -> Determine state: what stays in agent, what in DO/SQL
  - -> How to interact with R2
- Audio-context actions without changing system prompt
  - -> Conditional explanation of tool capabilities
  - -> Trade-offs for Howler.js setups:
      - Single Howl
      - One Howl for main + one for inserts
      - One main + multiple Howls for inserts
