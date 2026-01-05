## TODO -- misc / fixes

### Inserts / Playback Issues
- IMP: newly enabled (during playback) Inserts dont play (no matter where in playback)  
- Fix playback seeking

### Episodes / UI Fixes
- Remove emptystate card when in /episodes view  
- Rename /episodes to /episode
- Loading & Error indicator in Transcript and Inserts
- Follow transcript
- Expand / Retract Inserts & Transcript
- Add volume control; Remove playback speed control (as it may introduce bugs)

### Transcriber / Backend
- Move runPipeline in Transciber from onConnect to method, call it conditionally  
- In Transcriber onClose - stop all jobs  

### Fixes

- Fix playback seeking
- Fix need to double click to play insert

---

## TODO -- enhance  

### Security / Access
- Add password protection for access to dynamic generation (excluding samples)  

### Inserts / Transcript Enhancements
- IMP: Add loading indicator for inserts and transcript generation (connection.send type: transcript-status) <-- 
- Resume insert and transcript generation  
- Add transcript of inserts in UI  
- Sort takeaway/summary insert before primer  
- Option to pin transcript  
- IMP: On error or client disconect, stop transcription and inserts generation  
- Add button for restart with first insert  
- Add option how to generate inserts:  
  - Option A: check box to generate the inserts faster but with static windows of time  
  - Option B: generate them based on full or bigger window of the transcript  
- Add option to blur the transcript - let the LLM control this setting if needed or chosen  

### Episodes / UI / Navigation
- Customize UI  
- Add prompt suggestions in /episodes  
- Add anonymous user session recovery (in empty state) in UI - Burger menu in top bar for mobile UI  
- Add session's chat and podcast list in UI  
- Add checkboxes for generating inserts and transcript on upload (checked by default)  
- Reset useEpisode on navigate  
- Add mobile UI  

### Chat / Assistant Features
- Add tool for adding additional assitant message for correcting user's message IF in target language (german, french, japanese etc.)  
- IMP: Add assistant message (and conditionally showing it in frontend) as "system" prompt  
- Add automatic prompt write + send by clicking a word (or hover, button explain appears)  
- Add rewind to word agentically initiated if many messages are sent (increase learner profile's level) 
- Enhance system prompt with optional explanations IF user is not writing in English/native lang (with the help of an llm or API) 

### Samples / Generation / Tools
- IMP: Add samples - cached: set up, non-cached TODO 
- Add optional podcast search tool using the Podwise API  
- Add tool or similar for getting the whole podcast transcript and asking a question on it (Summarize the whole podcast -> tool call)  

### Agent behaviour

- Add proactive response
