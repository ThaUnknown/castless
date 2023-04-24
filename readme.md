# Castless

## Create custom ChromeCast Apps without paying for the developer console.

Install with
```bash
pnpm i @thaunknown/castless
```

Castless allows you to create custom ChromeCast Apps without the need for using the official Cast API. This is done via Presentation API which streams a local invisible tab to the cast as a video. Mobile is unsupported.

See `/showcase/` for an implementation example.

Notably the cast tab has a connection established via internal WebRTC, which allows the developer to send video streams directly from the casting browser, rather than creating a remote URL for the media.
