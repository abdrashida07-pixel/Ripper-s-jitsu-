# Genjutsu Studio

Independent web app for Higgsfield Genjutsu Motion Transfer / Object Swap.

## Render

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: empty
- Environment Variable: `HF_API_KEY` = the complete API key copied from Open Higgsfield.

The API key is server-side only and must not be committed to GitHub or exposed in browser code.

## Higgsfield API

The app uses `https://api.higgsfield.ai` and the Genjutsu endpoints documented by Higgsfield. Generation requests send `prompt`, `video_url`, `image_urls`, and `resolution` directly in the JSON body.
