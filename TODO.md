## TODO -- To-fix 

- inserts play in sequence after seeking main audio
- Duplicate main audios on seek
- Insert doesnt play on seek always after seeking, only on seek-pause-play
- On inserts on and off and play-pause the first insert (and next ones) get played instead of the one at the playhead 
- IMPORTANT: Make Chat unique by Episode
- IMPORTANT: newly enabled (during playback) Inserts dont play (no matter where in playback)
- Remove emptystate card when in /episodes view
- Rename /episodes to /episode
- Fix inserts caching
- Move runPipeline in Transciber from onConnect to method, call it conditionally
- In Transcriber onClose - stop all jobs

## TODO -- enhance

- IMPORTANT: Add loading indicator for inserts and transcript generation (connection.send type: transcript-status)
- Customize UI
- Add prompt suggestions in /episodes
- Add anonymous user session recovery (in empty state) in UI - Burger menu in top bar for mobile UI
- Add session's chat and podcast list in UI 
- Add "landing page" instructions and explanation of features; - Add checkboxes for generating inserts and transcript on upload (checked by default)
- Resume insert and transcript generation
- IMPORTANT: Add tool for adding additional assitant message for correcting user's message IF in target language (german, french, japanese etc.)
- IMPORTANT: Add assistant message (and conditionally showing it in frontend) as "system" prompt
- Add transcript of inserts in UI
- IMP: crypto UUID in URL
- IMPORTANT: Add samples
- For samples: one which generates them and hasnt cached inserts and transcript - to show generation
- Option to pin transcript
- Follow transcript
- On error or client disconect, stop transcription and inserts generation
- Add button for restart with first insert
- Sort takeaway/summary insert before primer 
- Add optional podcast search tool using the Podwise API
- Add mobile UI
- Add automatic prompt write + send by clicking a word (or hover, button explain appears)
- Add tool or similar for getting the whole podcast transcript and asking a question on it (Summarize the whole podcast -> tool call)
- Reset useEpisode on navigate
- Add rewind to word agentically initiated if many messages are sent (increase learner profile's level) 
- Add option to blur the transcript - let the LLM control this setting if needed or chosen 