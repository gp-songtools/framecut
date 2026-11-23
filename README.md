# framecut
video editing tool

## Lyrics

Select an audio clip and open **Import Lyrics**. Paste lyrics, open a text or LRC
file, or load the words from a Song Spec. Use **Transcribe** to draft timed
lyrics. Check **Align my lyrics to the editor** to keep your wording and line
breaks while Whisper estimates timestamps. Review the timestamps and choose
**Import Lyrics** to add editable text clips.

- **In-browser Whisper** runs the bundled Whisper Tiny model offline.
- **Whisper AI Cloud** sends the selected clip's trimmed audio to Groq or
  OpenAI using your API key. **Remember API key on this device** saves the
  selected provider's key in this browser. **Forget saved key** removes it.
  Other pages on the same origin can access saved keys.
- **Live Browser Listener** processes the clip in real time through the browser's
  speech service in Chrome 142 or later. With alignment enabled, it uses the
  bundled Whisper model for word timing.
