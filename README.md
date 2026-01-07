# 🤖 Podcast Language Tutor

## Overview

Podcast Language Tutor is an agentic AI assistant for language learners.
It lets users listen to podcasts while simultaneously receiving explanations, summaries, and primers in English and chatting with AI in language.

## Features ✨

- 💬 Interactive chat interface with AI for podcast questions
- 🎧 Audio-context actions: explain, summarize, translate, and replay podcast segments with a "primer sandwich" (intro → original audio → explanation/summary/outro)
- 🌐 Multi-language chat support: explanations in user’s native language, target language or English
- 🛠️ Agentic tool system: AI chooses the best action based on learner state and context
- 🔄 Stateful learning experience: chat history accessed through session cookie
- ⚡ Real-time streaming responses from the AI
- 🌓 Dark/Light theme support for the UI

Roadmap:

- Mobile UI
- Podcast discovery via Podwise integration
- Adaptive explanations for learners: track learner profile and comprehension signals
- Multi-podcast session aggregation for long-form learning
- Enhanced evaluation feedback (“Do you like this podcast? Why/why not?”)

## Demo

https://cf-ai-podcast-language-tutor.astrals.workers.dev

## Use cases

- You want to evaluate if you will enjoy a foreign language podcast.
- Read the transcript of a podcast and ask questions about its content in real-time.
- Learn a langauge by listening a podcast more effortlessly.
- Focus on the content of a podcast in a foreign language that you understand at a lower level (A2-B1/2)  

## Run locally

### Prerequisites

- Cloudflare account

### Quick Start

1. Install dependencies:

```bash
npm install
```

2. Run locally:

```bash
npm start
```

3. Deploy:

```bash
npm run deploy
```

### Notes

- If whisper transcription fails, run this ffmpeg command to strip all metadata `ffmpeg -i input.mp3 -vn -sn -dn -map_metadata -1 -c:a copy out.mp3` on the audio to enusre whisper reads it properly. You can also use this [ffmpeg web app](https://ffmpeg-online.vercel.app/?inputOptions=-i&output=output.mp3&outputOptions=-vn%20-sn%20-dn%20-map_metadata%20-1%20-c%3Aa%20copy)

## Project Structure

```
src/
├── components/            # Reusable UI components
│   └── ChatView.tsx       # Main chat interface
├── hooks/                 # React hooks
├── lib/                   # React utils
├── providers/             # React context providers
├── stores/                # Client-side state (Zustand)
├── types/                 # Shared TypeScript types
├── worker/                # Cloudflare Worker handlers / Durable Objects / Agents
│   ├── agents/
│   │   ├── chat.ts        # Chat agent
│   │   └── transcriber.ts # Podcast audio → transcript → inserts agent
│   └── api/
│       ├── episodes/      # Episode metadata, search, fetch
│       └── r2/            # Audio storage / retrieval
├── app.tsx                # React app entrypoint
├── client.tsx             # React shell (providers, routing)
├── server.ts              # Server-side AI entrypoint
├── tools.ts               # Agent tool definitions
└── utils.ts               # Helpers
```

## License

MIT

## References 

[Vercel AI SDK v5](https://ai-sdk.dev/docs/introduction)

[Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)
